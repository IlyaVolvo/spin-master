import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { MemberRole, RatingChangeReason } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import nodemailer from 'nodemailer';
import { createHash, randomBytes } from 'crypto';
import { emitToAll } from '../services/socketService';
import {
  getBirthDateBounds,
  isValidBirthDate,
  isValidEmailFormat,
  isValidMemberName,
  isValidPhoneNumber,
  isValidRatingInput,
  normalizeMemberEmail,
  normalizeOptionalCsvEmailCell,
  parseBirthDateFromCsvValue,
} from '../utils/memberValidation';
import { looksLikePlayersCsvHeaderRow, playersCsvCanonicalHeadersForParse } from '../utils/playersCsvLayout';
import { stripSensitiveMemberFields } from '../utils/memberSerialization';

const router = express.Router();
const importUpload = multer({ storage: multer.memoryStorage() });

/** Snapshot row when a member is created with a numeric rating (not a delta). */
async function createInitialRatingHistoryEntry(memberId: number, rating: number | null): Promise<void> {
  if (rating == null) return;
  await prisma.ratingHistory.create({
    data: {
      memberId,
      rating,
      ratingChange: null,
      reason: RatingChangeReason.INITIAL_RATING,
      tournamentId: null,
      matchId: null,
    },
  });
}

/** Load tournament display names and parent links (follow chain for hierarchy-aware sorting). */
async function loadTournamentNamesAndParentMap(tournamentIds: number[]): Promise<{
  nameById: Map<number, string>;
  parentById: Map<number, number | null>;
}> {
  const nameById = new Map<number, string>();
  const parentById = new Map<number, number | null>();
  if (tournamentIds.length === 0) {
    return { nameById, parentById };
  }
  const seen = new Set<number>();
  let frontier = [...new Set(tournamentIds)];
  while (frontier.length > 0) {
    const rows = await prisma.tournament.findMany({
      where: { id: { in: frontier } },
      select: { id: true, name: true, parentTournamentId: true },
    });
    const next: number[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      nameById.set(row.id, row.name || 'Unknown Tournament');
      parentById.set(row.id, row.parentTournamentId ?? null);
      if (row.parentTournamentId != null && !seen.has(row.parentTournamentId)) {
        next.push(row.parentTournamentId);
      }
    }
    frontier = next;
  }
  return { nameById, parentById };
}

/** Steps up parentTournamentId to root; child groups under a compound tournament have higher depth. */
function tournamentDepthFromParentMap(
  tournamentId: number,
  parentByTournamentId: Map<number, number | null>,
  memo: Map<number, number>
): number {
  if (memo.has(tournamentId)) return memo.get(tournamentId)!;
  let steps = 0;
  let cur: number | null = tournamentId;
  const chain = new Set<number>();
  while (cur != null && !chain.has(cur)) {
    chain.add(cur);
    const p = parentByTournamentId.get(cur);
    if (p == null) break;
    steps++;
    cur = p;
  }
  memo.set(tournamentId, steps);
  return steps;
}

/** Prefer the match's tournament when present (rating_history.tournamentId can be stale vs matches.tournamentId). */
function effectiveTournamentIdForHistoryRow(
  record: { tournamentId: number | null; matchId: number | null },
  matchTournamentIdByMatchId: Map<number, number | null>
): number | null {
  if (record.matchId != null) {
    const tid = matchTournamentIdByMatchId.get(record.matchId);
    if (tid !== undefined && tid !== null) {
      return tid;
    }
  }
  return record.tournamentId;
}

/**
 * Same timestamp: process deeper (child) tournaments before ancestors so sequential
 * rating inference matches actual completion order (group RR before parent compound).
 */
function sortRatingHistoryRecordsChronologically(
  records: Array<{ id: number; timestamp: Date; tournamentId: number | null; matchId: number | null }>,
  parentByTournamentId: Map<number, number | null>,
  matchTournamentIdByMatchId: Map<number, number | null>
): void {
  const depthMemo = new Map<number, number>();
  records.sort((a, b) => {
    const ta = a.timestamp.getTime();
    const tb = b.timestamp.getTime();
    if (ta !== tb) return ta - tb;
    const aid = effectiveTournamentIdForHistoryRow(a, matchTournamentIdByMatchId);
    const bid = effectiveTournamentIdForHistoryRow(b, matchTournamentIdByMatchId);
    if (aid != null && bid != null && aid !== bid) {
      const da = tournamentDepthFromParentMap(aid, parentByTournamentId, depthMemo);
      const db = tournamentDepthFromParentMap(bid, parentByTournamentId, depthMemo);
      if (da !== db) return db - da;
    }
    return a.id - b.id;
  });
}

function replayRatingHistoryForDisplay(
  records: any[]
): { startingRating: number | null; points: Array<{ record: any; rating: number | null; ratingBefore: number | null; ratingChange: number | null }> } {
  let runningRating: number | null = null;
  const points: Array<{ record: any; rating: number | null; ratingBefore: number | null; ratingChange: number | null }> = [];

  const first = records[0];
  let startingRating: number | null = null;
  if (
    first &&
    first.reason !== 'INITIAL_RATING' &&
    first.rating != null &&
    first.ratingChange != null
  ) {
    startingRating = first.rating - first.ratingChange;
    runningRating = startingRating;
  }

  for (const record of records) {
    if (record.reason === 'INITIAL_RATING' && runningRating !== null) {
      continue;
    }

    const ratingChange = record.ratingChange ?? null;
    let ratingBefore: number | null = null;
    let ratingAfter = record.rating ?? null;

    if (record.reason === 'INITIAL_RATING') {
      runningRating = ratingAfter;
    } else if (ratingChange != null) {
      ratingBefore = runningRating ?? (ratingAfter != null ? ratingAfter - ratingChange : null);
      ratingAfter = ratingBefore != null ? Math.max(0, Math.round(ratingBefore + ratingChange)) : ratingAfter;
      runningRating = ratingAfter;
    } else if (ratingAfter != null) {
      runningRating = ratingAfter;
    }

    points.push({ record, rating: ratingAfter, ratingBefore, ratingChange });
  }

  return { startingRating, points };
}

interface ImportedPlayerPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  birthDate?: string;
  gender?: 'MALE' | 'FEMALE' | 'NOT_SPECIFIED';
  roles?: MemberRole[];
  phone?: string;
  address?: string;
  rating?: number;
  mustResetPassword?: boolean;
}

type UploadedImportFile = {
  buffer: Buffer;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

type CsvImportParseReport = {
  fileErrors: string[];
  totalDataRows: number;
  validRows: number;
  rejectedRows: number;
  failedRows: Array<{ rowNumber: number; rawLine: string; messages: string[] }>;
};

type ParsePlayersCsvResult = {
  players: ImportedPlayerPayload[];
  errors: string[];
  parseReport?: CsvImportParseReport;
};

function parsePlayersCsv(text: string): ParsePlayersCsvResult {
  const { minDate, maxDate } = getBirthDateBounds();
  const minDateString = minDate.toISOString().split('T')[0];
  const maxDateString = maxDate.toISOString().split('T')[0];
  const lines = text.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });

  const emptyReport = (fileErrors: string[]): CsvImportParseReport => ({
    fileErrors,
    totalDataRows: 0,
    validRows: 0,
    rejectedRows: 0,
    failedRows: [],
  });

  if (lines.length === 0) {
    const msg = 'CSV file must contain at least one data row';
    return { players: [], errors: [msg], parseReport: emptyReport([msg]) };
  }

  const firstCells = parseCsvLine(lines[0]);
  const hasHeaderRow = looksLikePlayersCsvHeaderRow(firstCells);

  let headers: string[];
  let dataLines: string[];
  let dataRowNumberOffset: number;

  if (hasHeaderRow) {
    headers = firstCells.map(h => h.toLowerCase().trim());
    const requiredHeaders = ['firstname', 'lastname'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingHeaders.length > 0) {
      const msg = `Missing required columns: ${missingHeaders.join(', ')}`;
      return { players: [], errors: [msg], parseReport: emptyReport([msg]) };
    }

    dataLines = lines.slice(1);
    dataRowNumberOffset = 2;
  } else {
    headers = playersCsvCanonicalHeadersForParse();
    dataLines = lines;
    dataRowNumberOffset = 1;
  }

  if (dataLines.length === 0) {
    const msg = hasHeaderRow
      ? 'CSV file must contain at least one data row below the header'
      : 'CSV file must contain at least one data row';
    return { players: [], errors: [msg], parseReport: emptyReport([msg]) };
  }

  const players: ImportedPlayerPayload[] = [];
  const errors: string[] = [];
  const rowFailureByNumber = new Map<number, { rowNumber: number; rawLine: string; messages: string[] }>();

  const pushRowIssue = (rowNumber: number, rawLine: string, message: string) => {
    errors.push(message);
    let entry = rowFailureByNumber.get(rowNumber);
    if (!entry) {
      entry = { rowNumber, rawLine, messages: [] };
      rowFailureByNumber.set(rowNumber, entry);
    }
    if (!entry.messages.includes(message)) {
      entry.messages.push(message);
    }
  };

  dataLines.forEach((line, index) => {
    const values = parseCsvLine(line);
    const player: ImportedPlayerPayload = {};
    const rowNumber = index + dataRowNumberOffset;
    let rowRatingError = '';
    let birthDateCellHadProblem = false;
    let genderCellHadProblem = false;

    headers.forEach((header, i) => {
      const value = values[i]?.trim() || '';
      if (value === '') return;

      switch (header) {
        case 'firstname':
          player.firstName = value;
          break;
        case 'lastname':
          player.lastName = value;
          break;
        case 'email': {
          const normalized = normalizeOptionalCsvEmailCell(value);
          if (normalized !== undefined) {
            player.email = normalized;
          }
          break;
        }
        case 'date of birth':
        case 'birthdate': {
          const parsed = parseBirthDateFromCsvValue(value);
          if (parsed === null) {
            birthDateCellHadProblem = true;
            pushRowIssue(
              rowNumber,
              line,
              `Row ${rowNumber}: Birth date is not a valid calendar date. Use YYYY-MM-DD (e.g. 1999-12-24).`
            );
            break;
          }
          if (!isValidBirthDate(parsed)) {
            birthDateCellHadProblem = true;
            pushRowIssue(
              rowNumber,
              line,
              `Row ${rowNumber}: Birth date must be between ${minDateString} and ${maxDateString}`
            );
            break;
          }
          player.birthDate = parsed.toISOString().split('T')[0];
          break;
        }
        case 'gender': {
          const genderUpper = value.toUpperCase();
          if (genderUpper === 'OTHER') {
            genderCellHadProblem = true;
            pushRowIssue(
              rowNumber,
              line,
              `Row ${rowNumber}: Gender "OTHER" is not valid. Use NOT_SPECIFIED, MALE, or FEMALE.`
            );
            break;
          }
          if (['MALE', 'FEMALE', 'NOT_SPECIFIED'].includes(genderUpper)) {
            player.gender = genderUpper as 'MALE' | 'FEMALE' | 'NOT_SPECIFIED';
          }
          break;
        }
        case 'roles': {
          const roleLetters = value.split(',').map(r => r.trim().toUpperCase());
          const roleMap: Record<string, MemberRole> = {
            P: 'PLAYER',
            C: 'COACH',
            A: 'ADMIN',
            O: 'ORGANIZER',
          };
          const roles = roleLetters.map(letter => roleMap[letter]).filter((role): role is MemberRole => role !== undefined);
          if (roles.length > 0) {
            player.roles = roles;
          }
          break;
        }
        case 'phone':
          player.phone = value;
          break;
        case 'address':
          player.address = value;
          break;
        case 'rating':
          if (isValidRatingInput(value)) {
            player.rating = parseInt(value, 10);
          } else {
            rowRatingError = `Row ${rowNumber}: Rating must be an integer between 0 and 9999`;
          }
          break;
      }
    });

    if (birthDateCellHadProblem) {
      return;
    }

    if (genderCellHadProblem) {
      return;
    }

    const rowErrors: string[] = [];

    if (!player.firstName || !player.lastName) {
      rowErrors.push(`Row ${rowNumber}: Missing required fields (firstName, lastName)`);
    }

    if (player.email != null && String(player.email).trim()) {
      if (!isValidEmailFormat(String(player.email).trim())) {
        rowErrors.push(`Row ${rowNumber}: Invalid email format`);
      }
    }

    if (player.roles !== undefined && player.roles !== null && !Array.isArray(player.roles)) {
      rowErrors.push(`Row ${rowNumber}: Roles must be an array when provided`);
    }

    if (player.phone && !isValidPhoneNumber(player.phone.trim())) {
      rowErrors.push(`Row ${rowNumber}: Invalid phone number format. Please enter a valid US phone number`);
    }

    if (rowRatingError) {
      rowErrors.push(rowRatingError);
    }

    const emailPresent = !!(player.email && String(player.email).trim());
    if (!emailPresent && player.roles && player.roles.length > 0 && player.roles.some((r) => r !== 'PLAYER')) {
      rowErrors.push(`Row ${rowNumber}: Without an email, only the PLAYER role is allowed`);
    }

    if (rowErrors.length > 0) {
      rowErrors.forEach((msg) => pushRowIssue(rowNumber, line, msg));
      return;
    }

    players.push(player);
  });

  const failedRows = [...rowFailureByNumber.values()].sort((a, b) => a.rowNumber - b.rowNumber);
  const fileOnlyErrors = errors.filter((e) => !/^Row\s+\d+:/i.test(e));
  const parseReport: CsvImportParseReport = {
    fileErrors: fileOnlyErrors.length > 0 ? fileOnlyErrors : [],
    totalDataRows: dataLines.length,
    validRows: players.length,
    rejectedRows: failedRows.length,
    failedRows,
  };

  return { players, errors, parseReport };
}

function getImportedPlayers(req: AuthRequest & { file?: UploadedImportFile }): ParsePlayersCsvResult {
  if (Array.isArray(req.body?.players)) {
    return { players: req.body.players as ImportedPlayerPayload[], errors: [] };
  }

  if (!req.file) {
    const msg = 'CSV file is required';
    return {
      players: [],
      errors: [msg],
      parseReport: {
        fileErrors: [msg],
        totalDataRows: 0,
        validRows: 0,
        rejectedRows: 0,
        failedRows: [],
      },
    };
  }

  const csvText = req.file.buffer.toString('utf-8');
  return parsePlayersCsv(csvText);
}

function getBirthDateValidationMessage(): string {
  const { minDate, maxDate } = getBirthDateBounds();
  const minDateString = minDate.toISOString().split('T')[0];
  const maxDateString = maxDate.toISOString().split('T')[0];
  return `Birth date must be between ${minDateString} and ${maxDateString}`;
}

function asBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseSmtpPort(value: string | undefined, fallback = 587): number {
  if (!value) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SMTP_PORT: ${value}`);
  }
  return port;
}

function getClientBaseUrl(): string {
  return (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function generatePasswordResetToken(): string {
  return randomBytes(32).toString('hex');
}

function getPasswordResetExpiryDate(): Date {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 1);
  return expiry;
}

function buildResetLink(email: string, token: string): string {
  return `${getClientBaseUrl()}/login?reset=1&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

function createSmtpTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseSmtpPort(process.env.SMTP_PORT, 587);
  const secure = process.env.SMTP_SECURE ? asBool(process.env.SMTP_SECURE) : port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host) {
    throw new Error('SMTP_HOST is not set. Unable to send password reset email.');
  }
  if ((user && !pass) || (!user && pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must both be provided when using SMTP auth.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    requireTLS: asBool(process.env.SMTP_REQUIRE_TLS, false),
    ignoreTLS: asBool(process.env.SMTP_IGNORE_TLS, false),
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED
        ? asBool(process.env.SMTP_TLS_REJECT_UNAUTHORIZED)
        : true,
    },
  });
}

async function sendPasswordResetEmail(params: {
  toEmail: string;
  firstName: string;
  resetLink: string;
  expiresAt: Date;
  messageVariant?: 'reset' | 'invite';
  transporter?: nodemailer.Transporter;
}): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseSmtpPort(process.env.SMTP_PORT, 587);
  const secure = process.env.SMTP_SECURE ? asBool(process.env.SMTP_SECURE) : port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host) {
    throw new Error('SMTP_HOST is not set. Unable to send password reset email.');
  }
  if (!from) {
    throw new Error('SMTP_FROM or SMTP_USER must be set. Unable to send password reset email.');
  }
  if ((user && !pass) || (!user && pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must both be provided when using SMTP auth.');
  }

  const transporter = params.transporter ?? createSmtpTransporter();

  if (!params.transporter) {
    await transporter.verify();
  }

  const isInvite = params.messageVariant === 'invite';
  const subject = isInvite ? 'You are invited to Spin Master' : 'Spin Master Password Reset';
  const text = isInvite
    ? [
        `Hi ${params.firstName},`,
        '',
        'You are invited to Spin Master.',
        'Use the link below to set your password and activate your account:',
        params.resetLink,
        '',
        `This link expires at ${params.expiresAt.toISOString()}.`,
      ].join('\n')
    : [
        `Hi ${params.firstName},`,
        '',
        'A password reset was requested for your Spin Master account.',
        'Use the link below to reset your password:',
        params.resetLink,
        '',
        `This link expires at ${params.expiresAt.toISOString()}.`,
        'If you did not request this reset, please ignore this email.',
      ].join('\n');

  const html = isInvite
    ? `
    <p>Hi ${params.firstName},</p>
    <p>You are invited to Spin Master.</p>
    <p><a href="${params.resetLink}">Set your password and activate your account</a></p>
    <p>This link expires at <strong>${params.expiresAt.toISOString()}</strong>.</p>
  `
    : `
    <p>Hi ${params.firstName},</p>
    <p>A password reset was requested for your Spin Master account.</p>
    <p><a href="${params.resetLink}">Reset your password</a></p>
    <p>This link expires at <strong>${params.expiresAt.toISOString()}</strong>.</p>
    <p>If you did not request this reset, you can ignore this email.</p>
  `;

  await transporter.sendMail({
    from,
    to: params.toEmail,
    subject,
    text,
    html,
  });
}

// Calculate Levenshtein distance between two strings
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

// Calculate similarity percentage (0-100)
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 100;
  return ((maxLength - distance) / maxLength) * 100;
}

type MemberDuplicateCheck = {
  duplicateName: boolean;
  duplicateEmail: boolean;
  similarNames: Array<{ name: string; similarity: number }>;
};

async function checkMemberDuplicates(params: {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  excludeMemberId?: number;
}): Promise<MemberDuplicateCheck> {
  const firstName = typeof params.firstName === 'string' ? params.firstName.trim() : '';
  const lastName = typeof params.lastName === 'string' ? params.lastName.trim() : '';
  const email = typeof params.email === 'string' ? normalizeMemberEmail(params.email) : '';
  const fullName = `${firstName} ${lastName}`.trim();

  const members = await prisma.member.findMany({
    where: params.excludeMemberId ? { id: { not: params.excludeMemberId } } : undefined,
    select: { firstName: true, lastName: true, email: true },
  });

  const duplicateName = !!(
    firstName &&
    lastName &&
    members.find(
      (p) =>
        p.firstName.toLowerCase() === firstName.toLowerCase() &&
        p.lastName.toLowerCase() === lastName.toLowerCase()
    )
  );

  const duplicateEmail = !!(
    email &&
    members.find((p) => p.email && normalizeMemberEmail(p.email) === email)
  );

  const similarNames =
    firstName && lastName
      ? members
          .map((p: { firstName: string; lastName: string }) => {
            const existingFullName = `${p.firstName} ${p.lastName}`;
            return {
              name: existingFullName,
              similarity: calculateSimilarity(fullName, existingFullName),
              distance: levenshteinDistance(fullName, existingFullName),
            };
          })
          .filter((p: { name: string; similarity: number; distance: number }) => {
            if (p.name.toLowerCase() === fullName.toLowerCase()) return false;
            return p.similarity >= 80 || p.distance <= 2;
          })
          .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
          .map((p: { name: string; similarity: number }) => ({
            name: p.name,
            similarity: Math.round(p.similarity),
          }))
      : [];

  return { duplicateName, duplicateEmail, similarNames };
}

function generateQrTokenHash(): string {
  return createHash('sha256')
    .update(`${randomBytes(32).toString('hex')}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

// All routes require authentication
router.use(authenticate);

// Helper function to check if current user is an admin
async function isAdmin(req: AuthRequest): Promise<boolean> {
  // Check if session has member with ADMIN role
  if (req.member && req.member.roles.includes('ADMIN')) {
    return true;
  }
  
  // Check if JWT token has memberId and member is admin
  if (req.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { roles: true },
    });
    return member?.roles.includes('ADMIN') || false;
  }
  
  return false;
}

async function isOrganizer(req: AuthRequest): Promise<boolean> {
  // Check if session has member with ORGANIZER role
  if (req.member && req.member.roles.includes('ORGANIZER')) {
    return true;
  }
  
  // Check if JWT token has memberId and member is organizer
  if (req.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { roles: true },
    });
    return member?.roles.includes('ORGANIZER') || false;
  }
  
  return false;
}

// Legacy function for backward compatibility
async function isAdminMember(memberId: number): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { roles: true },
  });
  return member?.roles.includes('ADMIN') || false;
}

// Helper function to get member ID from JWT token (for member authentication)
async function getMemberIdFromToken(req: AuthRequest): Promise<number | null> {
  // This will be used when we add member authentication
  // For now, we'll use the User system
  return null;
}

// Get all members with Member role (for backward compatibility, this endpoint shows only members)
router.get('/', async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      where: {
        roles: {
          has: 'PLAYER',
        },
      },
      orderBy: [
        { rating: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
    });

    // Exclude sensitive fields
    const membersWithoutPassword = members.map((member: any) => {
      return stripSensitiveMemberFields(member);
    });

    res.json(membersWithoutPassword);
  } catch (error) {
    logger.error('Error fetching members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all members (Admin only - includes all roles)
router.get('/all-members', async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    const hasAdminAccess = await isAdmin(req);
    if (!hasAdminAccess) {
      return res.status(403).json({ error: 'Only Admins can view all members' });
    }

    const members = await prisma.member.findMany({
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
    });

    const membersWithoutPassword = members.map((member: any) => {
      return stripSensitiveMemberFields(member);
    });

    res.json(membersWithoutPassword);
  } catch (error) {
    logger.error('Error fetching all members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active members with Member role only
router.get('/active', async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      where: { 
        isActive: true,
        roles: {
          has: 'PLAYER',
        },
      },
      orderBy: [
        { rating: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
    });

    // Exclude sensitive fields
    const membersWithoutPassword = members.map((member: any) => {
      return stripSensitiveMemberFields(member);
    });

    res.json(membersWithoutPassword);
  } catch (error) {
    logger.error('Error fetching active members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export players (must be registered before /:id so "export" is not parsed as an id)
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const members = await prisma.member.findMany({
      where: {
        roles: {
          has: 'PLAYER',
        },
      },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        gender: true,
        birthDate: true,
        rating: true,
        phone: true,
        address: true,
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    res.json(members);
  } catch (error) {
    logger.error('Error exporting members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check add/edit form duplicates without attempting to save.
router.get('/duplicate-check', async (req: AuthRequest, res: Response) => {
  try {
    const excludeMemberIdRaw = req.query.excludeMemberId;
    const excludeMemberId =
      typeof excludeMemberIdRaw === 'string' && excludeMemberIdRaw.trim()
        ? Number(excludeMemberIdRaw)
        : undefined;

    if (excludeMemberId !== undefined && (!Number.isInteger(excludeMemberId) || excludeMemberId <= 0)) {
      return res.status(400).json({ error: 'Invalid exclude member ID' });
    }

    const result = await checkMemberDuplicates({
      firstName: typeof req.query.firstName === 'string' ? req.query.firstName : '',
      lastName: typeof req.query.lastName === 'string' ? req.query.lastName : '',
      email: typeof req.query.email === 'string' ? req.query.email : '',
      excludeMemberId,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error checking member duplicates', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single member
router.get('/:id', async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }
    
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        ratingHistory: {
          orderBy: { timestamp: 'desc' },
          take: 50, // Last 50 rating changes
        },
      } as any,
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Exclude sensitive fields from response
    const memberWithoutPassword = stripSensitiveMemberFields(member);
    res.json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error fetching member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate email from first name and last name
function generateEmail(firstName: string, lastName: string): string {
  const firstLetter = firstName.charAt(0).toLowerCase();
  const lastNameLower = lastName.toLowerCase().replace(/\s+/g, '');
  return `${firstLetter}${lastNameLower}@example.com`;
}

// Validate roles array
function isValidRoles(roles: any): boolean {
  if (!roles) return true; // Optional field
  if (!Array.isArray(roles)) return false;
  
  const validRoles = ['PLAYER', 'COACH', 'ADMIN', 'ORGANIZER'];
  return roles.every(role => typeof role === 'string' && validRoles.includes(role));
}

/** MALE / FEMALE / NOT_SPECIFIED only. OTHER is invalid (DB stores NOT_SPECIFIED after migration). */
function isValidGenderBodyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  const s = String(value).trim().toUpperCase();
  return ['MALE', 'FEMALE', 'NOT_SPECIFIED'].includes(s);
}

function normalizeGenderFromBody(value: unknown): 'MALE' | 'FEMALE' | 'NOT_SPECIFIED' {
  if (value === undefined || value === null || value === '') return 'NOT_SPECIFIED';
  const s = String(value).trim().toUpperCase();
  if (s === 'MALE') return 'MALE';
  if (s === 'FEMALE') return 'FEMALE';
  if (s === 'NOT_SPECIFIED') return 'NOT_SPECIFIED';
  return 'NOT_SPECIFIED';
}

// Add new member
router.post('/', [
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('gender').optional().custom(isValidGenderBodyValue).withMessage('Gender must be MALE, FEMALE, or NOT_SPECIFIED (OTHER is not allowed)'),
  body('rating').optional().custom((value) => isValidRatingInput(value)),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('picture').optional().trim(),
  body('tournamentNotificationsEnabled').optional().isBoolean(),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email, gender, birthDate, rating, phone, address, picture, roles, skipSimilarityCheck, tournamentNotificationsEnabled } = req.body;
    const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : '';
    const trimmedEmailInput = typeof email === 'string' ? email.trim() : '';
    const hasEmail = trimmedEmailInput.length > 0;

    const validationErrors: string[] = [];

    if (!isValidMemberName(trimmedFirstName)) {
      validationErrors.push('First name must be 2-50 characters and contain only letters, spaces, apostrophes, or hyphens');
    }
    if (!isValidMemberName(trimmedLastName)) {
      validationErrors.push('Last name must be 2-50 characters and contain only letters, spaces, apostrophes, or hyphens');
    }

    if (hasEmail && !isValidEmailFormat(trimmedEmailInput)) {
      validationErrors.push('Invalid email format');
    }

    if (phone) {
      if (!isValidPhoneNumber(phone.trim())) {
        validationErrors.push('Invalid phone number format. Please enter a valid US phone number');
      }
    }

    let parsedBirthDate: Date | null = null;
    if (birthDate !== undefined && birthDate !== null && birthDate !== '') {
      if (!isValidBirthDate(birthDate)) {
        validationErrors.push(getBirthDateValidationMessage());
      } else {
        parsedBirthDate = new Date(birthDate);
      }
    }

    if (!isValidRatingInput(rating)) {
      validationErrors.push('Rating must be an integer between 0 and 9999');
    }

    if (!roles || !Array.isArray(roles)) {
      validationErrors.push('At least one role must be selected');
    } else if (!isValidRoles(roles)) {
      validationErrors.push('Invalid roles. Roles must be an array containing only: PLAYER, COACH, ADMIN, ORGANIZER');
    } else if (!hasEmail) {
      if (roles.length !== 1 || roles[0] !== 'PLAYER') {
        validationErrors.push('Without an email, only the PLAYER role is allowed');
      }
    } else if (roles.length === 0) {
      validationErrors.push('At least one role must be selected');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors.map(msg => ({ msg, param: 'validation' })) });
    }

    const duplicateCheck = await checkMemberDuplicates({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      email: hasEmail ? trimmedEmailInput : '',
    });

    if (duplicateCheck.duplicateName || duplicateCheck.duplicateEmail) {
      return res.status(409).json({
        error: 'Duplicate member fields',
        fieldErrors: {
          ...(duplicateCheck.duplicateName ? {
            firstName: 'A member with this name already exists',
            lastName: 'A member with this name already exists',
          } : {}),
          ...(duplicateCheck.duplicateEmail ? { email: 'A member with this email already exists' } : {}),
        },
      });
    }

    const proposedBirthIso = parsedBirthDate ? parsedBirthDate.toISOString() : null;

    if (!skipSimilarityCheck) {
      if (duplicateCheck.similarNames.length > 0) {
        return res.status(200).json({
          requiresConfirmation: true,
          message: 'Similar member names found',
          similarNames: duplicateCheck.similarNames,
          proposedFirstName: trimmedFirstName,
          proposedLastName: trimmedLastName,
          proposedMemberData: {
            firstName: trimmedFirstName,
            lastName: trimmedLastName,
            email: hasEmail ? normalizeMemberEmail(trimmedEmailInput) : null,
            gender: normalizeGenderFromBody(gender),
            birthDate: proposedBirthIso,
            rating: rating || null,
            phone: phone || null,
            address: address || null,
            picture: picture || null,
            roles,
            tournamentNotificationsEnabled: Boolean(hasEmail && tournamentNotificationsEnabled),
          },
        });
      }
    }

    const finalGender = normalizeGenderFromBody(gender);
    const ratingNum =
      rating !== null && rating !== undefined && rating !== '' ? parseInt(String(rating), 10) : null;

    if (!hasEmail) {
      const member = await prisma.member.create({
        data: {
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          email: null,
          gender: finalGender,
          password: '',
          roles: ['PLAYER'],
          birthDate: parsedBirthDate,
          rating: ratingNum,
          phone: phone ? phone.trim() : null,
          address: address ? address.trim() : null,
          picture: picture ? picture.trim() : null,
          qrTokenHash: generateQrTokenHash(),
          isActive: true,
          emailConfirmedAt: null,
          mustResetPassword: false,
          passwordResetToken: null,
          passwordResetTokenExpiry: null,
          tournamentNotificationsEnabled: false,
        } as any,
      });

      await createInitialRatingHistoryEntry(member.id, member.rating);

      const memberWithoutPassword = stripSensitiveMemberFields(member);

      emitToAll('player:created', {
        player: memberWithoutPassword,
        timestamp: Date.now(),
      });

      return res.status(201).json({
        ...memberWithoutPassword,
        passwordResetEmailSent: false,
      });
    }

    const finalEmail = normalizeMemberEmail(trimmedEmailInput);

    const finalRoles = roles as MemberRole[];
    const passwordResetToken = generatePasswordResetToken();
    const passwordResetExpiry = getPasswordResetExpiryDate();
    const resetLink = buildResetLink(finalEmail, passwordResetToken);

    const member = await prisma.member.create({
      data: {
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: finalEmail,
        gender: finalGender,
        password: '',
        roles: finalRoles,
        birthDate: parsedBirthDate,
        rating: ratingNum,
        phone: phone ? phone.trim() : null,
        address: address ? address.trim() : null,
        picture: picture ? picture.trim() : null,
        qrTokenHash: generateQrTokenHash(),
        isActive: false,
        emailConfirmedAt: null,
        mustResetPassword: true,
        passwordResetToken: passwordResetToken,
        passwordResetTokenExpiry: passwordResetExpiry,
        tournamentNotificationsEnabled: Boolean(tournamentNotificationsEnabled),
      } as any,
    });

    try {
      await sendPasswordResetEmail({
        toEmail: finalEmail,
        firstName: trimmedFirstName,
        resetLink,
        expiresAt: passwordResetExpiry,
        messageVariant: 'invite',
      });
      logger.info('Password reset email sent during member creation', {
        memberId: member.id,
        email: finalEmail,
        expiresAt: passwordResetExpiry.toISOString(),
      });
    } catch (emailError) {
      await prisma.member.delete({ where: { id: member.id } });
      logger.error('Password reset email failed during member creation; rolling back member', {
        memberId: member.id,
        email: finalEmail,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
      return res.status(500).json({
        error: 'Failed to send password setup email. Member was not created.',
      });
    }

    await createInitialRatingHistoryEntry(member.id, member.rating);

    const memberWithoutPassword = stripSensitiveMemberFields(member);

    emitToAll('player:created', {
      player: memberWithoutPassword,
      timestamp: Date.now(),
    });

    res.status(201).json({
      ...memberWithoutPassword,
      passwordResetEmailSent: true,
    });
  } catch (error) {
    logger.error('Error creating member', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate member
router.patch('/:id/deactivate', async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }
    
    const member = await prisma.member.update({
      where: { id: memberId },
      data: { isActive: false },
    });

    const memberWithoutPassword = stripSensitiveMemberFields(member);
    
    // Emit socket notification for player update
    emitToAll('player:updated', {
      player: memberWithoutPassword,
      timestamp: Date.now(),
    });
    
    res.json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error deactivating member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete member (Admin only) - only if not referenced in any matches
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    const hasAdminAccess = await isAdmin(req);
    if (!hasAdminAccess) {
      return res.status(403).json({ error: 'Only Admins can delete members' });
    }

    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // Check if member exists
    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if member is referenced in any matches (excluding BYE matches)
    // BYE matches have member2Id === null or member2Id === 0, and shouldn't prevent deletion
    const matchCount = await prisma.match.count({
      where: {
        AND: [
          {
            OR: [
              { member1Id: memberId },
              { member2Id: memberId },
            ],
          },
          {
            // Exclude BYE matches - these are not real games
            member1Id: { not: 0 },
            member2Id: { not: null },
            NOT: { member2Id: 0 },
          },
        ],
      },
    });

    if (matchCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete member. Member is referenced in matches and cannot be deleted.',
        matchCount 
      });
    }

    // Check if member has tournament participations (these have onDelete: Restrict)
    const tournamentParticipantCount = await prisma.tournamentParticipant.count({
      where: { memberId },
    });

    if (tournamentParticipantCount > 0) {
      // Delete tournament participations first
      await prisma.tournamentParticipant.deleteMany({
        where: { memberId },
      });
    }

    // Delete the member (rating history will cascade automatically)
    await prisma.member.delete({
      where: { id: memberId },
    });

    logger.info('Member deleted', { memberId, email: member.email ?? null });

    // Emit socket notification for player deletion
    emitToAll('player:deleted', {
      playerId: memberId,
      timestamp: Date.now(),
    });

    res.json({ message: 'Member deleted successfully', memberId });
  } catch (error) {
    logger.error('Error deleting member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if member can be deleted (not referenced in matches)
router.get('/:id/can-delete', async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    const hasAdminAccess = await isAdmin(req);
    if (!hasAdminAccess) {
      return res.status(403).json({ error: 'Only Admins can check delete eligibility' });
    }

    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // Check if member exists
    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if member is referenced in any matches (excluding BYE matches)
    // BYE matches have member2Id === null or member2Id === 0, and shouldn't prevent deletion
    const matchCount = await prisma.match.count({
      where: {
        AND: [
          {
            OR: [
              { member1Id: memberId },
              { member2Id: memberId },
            ],
          },
          {
            // Exclude BYE matches - these are not real games
            member1Id: { not: 0 },
            member2Id: { not: null },
            NOT: { member2Id: 0 },
          },
        ],
      },
    });

    // Check if member is a participant in any tournaments
    // Note: Tournament participants can be deleted (they are deleted before the member),
    // but we still report this information
    const tournamentParticipantCount = await prisma.tournamentParticipant.count({
      where: { memberId },
    });

    // Member can be deleted if they have no matches
    // Tournament participants will be automatically deleted when the member is deleted
    res.json({ 
      canDelete: matchCount === 0,
      matchCount,
      tournamentParticipantCount,
    });
  } catch (error) {
    logger.error('Error checking delete eligibility', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reactivate member
router.patch('/:id/activate', async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }
    
    const member = await prisma.member.update({
      where: { id: memberId },
      data: { isActive: true },
    });

    const memberWithoutPassword = stripSensitiveMemberFields(member);
    
    emitToAll('player:updated', {
      player: memberWithoutPassword,
      timestamp: Date.now(),
    });

    res.json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error reactivating member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update member information
router.patch('/:id', [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('email').optional({ nullable: true }),
  // Allow explicit null to clear DOB; omit field when unchanged (optional skips null/undefined per values option).
  body('birthDate').optional({ values: 'null' }).isISO8601().toDate(),
  body('rating').optional().custom((value) => isValidRatingInput(value))
    .withMessage('Rating must be an integer between 0 and 9999, or null'),
  body('isActive').optional().isBoolean(),
  body('gender').optional().custom(isValidGenderBodyValue).withMessage('Gender must be MALE, FEMALE, or NOT_SPECIFIED (OTHER is not allowed)'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('picture').optional().trim(),
  body('roles').optional().isArray(),
  body('tournamentNotificationsEnabled').optional().isBoolean(),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    // Get the member being updated (including current rating for history tracking)
    const existingMember = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roles: true,
        rating: true,
        birthDate: true,
        gender: true,
        isActive: true,
      },
    });

    if (!existingMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Store old rating for history tracking
    const oldRating = existingMember.rating;

    // Authorization check: Only Admins can modify member profiles, or members can modify their own (with restrictions)
    const isCurrentMember = req.memberId === memberId;
    const hasAdminAccess = await isAdmin(req);
    
    // Only Admins can modify other members' profiles
    if (!isCurrentMember && !hasAdminAccess) {
      return res.status(403).json({ error: 'Only Administrators can modify other members\' profiles.' });
    }

    const { firstName, lastName, email, gender, birthDate, rating, isActive, phone, address, picture, roles, tournamentNotificationsEnabled, ...rest } = req.body;

    // Birth date is optional on PATCH (may be omitted, set, or cleared to null); invalid values rejected below.

    // Explicitly prevent password updates through this endpoint
    // Password can only be changed through /auth/member/change-password or reset through /auth/member/:id/reset-password
    if (rest.password !== undefined) {
      return res.status(403).json({ error: 'Password cannot be updated through this endpoint. Use the change password endpoint instead.' });
    }

    // Build update data object (only include provided fields)
    const updateData: any = {};
    if (firstName !== undefined) {
      if (!isValidMemberName(firstName)) {
        return res.status(400).json({ error: 'First name must be 2-50 characters and contain only letters, spaces, apostrophes, or hyphens' });
      }
      updateData.firstName = firstName.trim();
    }
    if (lastName !== undefined) {
      if (!isValidMemberName(lastName)) {
        return res.status(400).json({ error: 'Last name must be 2-50 characters and contain only letters, spaces, apostrophes, or hyphens' });
      }
      updateData.lastName = lastName.trim();
    }
    
    // Email can only be changed by the member themselves or Admins
    if (email !== undefined) {
      const rawEmail = email as string | null;
      const requestedEmpty = rawEmail === null || rawEmail === '' || (typeof rawEmail === 'string' && rawEmail.trim() === '');
      const newEmailNormalized = requestedEmpty ? null : normalizeMemberEmail(String(rawEmail));
      const currentNormalized = existingMember.email ? normalizeMemberEmail(existingMember.email) : '';

      if ((newEmailNormalized ?? '') !== currentNormalized) {
        if (!isCurrentMember && !hasAdminAccess) {
          return res.status(403).json({ error: 'Only the member themselves or Admins can change email' });
        }

        if (requestedEmpty) {
          if (!hasAdminAccess) {
            return res.status(403).json({ error: 'Only an administrator can remove a member email' });
          }
          updateData.email = null;
        } else {
          if (!newEmailNormalized) {
            return res.status(400).json({ error: 'Invalid email format' });
          }
          if (!isValidEmailFormat(newEmailNormalized)) {
            return res.status(400).json({ error: 'Invalid email format' });
          }
          const emailExists = await prisma.member.findFirst({
            where: { email: newEmailNormalized, NOT: { id: memberId } },
          });
          if (emailExists) {
            return res.status(409).json({
              error: 'Duplicate member fields',
              fieldErrors: { email: 'A member with this email already exists' },
            });
          }
          updateData.email = newEmailNormalized;
        }
      }
    }
    
    if (birthDate !== undefined) {
      if (birthDate && !isValidBirthDate(birthDate)) {
        return res.status(400).json({ error: getBirthDateValidationMessage() });
      }
      updateData.birthDate = birthDate ? new Date(birthDate) : null;
    }
    if (rating !== undefined) {
      // Only Admins can change rating
      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Only Administrators can change rating.' });
      }
      // Allow setting rating to null to remove rating
      if (rating === null || rating === '' || rating === undefined) {
        updateData.rating = null;
      } else {
        const ratingNum = Number(rating);
        if (Number.isInteger(ratingNum) && ratingNum >= 0 && ratingNum <= 9999) {
          updateData.rating = ratingNum;
        } else {
          return res.status(400).json({ error: 'Rating must be between 0 and 9999' });
        }
      }
    }
    if (isActive !== undefined) {
      // Only Admins can change isActive status
      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Only Administrators can change active status.' });
      }
      updateData.isActive = isActive;
    }
    if (gender !== undefined) updateData.gender = normalizeGenderFromBody(gender);
    if (phone !== undefined) updateData.phone = phone || null;
    if (address !== undefined) updateData.address = address || null;
    if (picture !== undefined) updateData.picture = picture || null;
    if (tournamentNotificationsEnabled !== undefined) {
      if (!isCurrentMember && !hasAdminAccess) {
        return res.status(403).json({ error: 'Only the member themselves or Admins can change tournament notification settings' });
      }
      const finalEmail =
        Object.prototype.hasOwnProperty.call(updateData, 'email') ? updateData.email : existingMember.email;
      updateData.tournamentNotificationsEnabled = Boolean(tournamentNotificationsEnabled && finalEmail);
    } else if (Object.prototype.hasOwnProperty.call(updateData, 'email') && !updateData.email) {
      updateData.tournamentNotificationsEnabled = false;
    }
    
    // Roles can only be changed by Admins
    if (roles !== undefined && Array.isArray(roles)) {
      if (!hasAdminAccess) {
        return res.status(403).json({ error: 'Only Admins can change roles' });
      }
      updateData.roles = roles;
    }

    // Check for duplicate name if name is being changed
    if (firstName !== undefined || lastName !== undefined) {
      const newFirstName = firstName !== undefined ? firstName.trim() : existingMember.firstName;
      const newLastName = lastName !== undefined ? lastName.trim() : existingMember.lastName;

      // Check for exact duplicate (excluding current member)
      const duplicate = await prisma.member.findFirst({
        where: {
          id: { not: memberId },
          firstName: { equals: newFirstName, mode: 'insensitive' },
          lastName: { equals: newLastName, mode: 'insensitive' },
        },
      });

      if (duplicate) {
        return res.status(409).json({
          error: 'Duplicate member fields',
          fieldErrors: {
            firstName: 'A member with this name already exists',
            lastName: 'A member with this name already exists',
          },
        });
      }
    }

    // Update member
    const updatedMember = await prisma.member.update({
      where: { id: memberId },
      data: updateData,
    });

    // If rating was changed by an admin, create a RatingHistory entry
    if (rating !== undefined && hasAdminAccess) {
      const newRating = updatedMember.rating;
      
      logger.debug('Checking if rating history entry should be created', {
        memberId,
        oldRating,
        newRating,
        ratingChanged: oldRating !== newRating,
        hasAdminAccess,
      });
      
      // Only create history entry if rating actually changed
      if (oldRating !== newRating) {
        // Calculate rating change
        let ratingChange: number;
        if (oldRating !== null && newRating !== null) {
          // Both ratings exist: simple difference
          ratingChange = newRating - oldRating;
        } else if (oldRating === null && newRating !== null) {
          // Rating was set (from null to a value): change is the new rating
          ratingChange = newRating;
        } else if (oldRating !== null && newRating === null) {
          // Rating was removed (from a value to null): change is negative of old rating
          ratingChange = -oldRating;
        } else {
          // Both are null: no change (shouldn't happen, but handle it)
          ratingChange = 0;
        }
        
        try {
          const historyEntry = await (prisma as any).ratingHistory.create({
            data: {
              memberId: memberId,
              rating: newRating,
              ratingChange: ratingChange,
              reason: 'MANUAL_ADJUSTMENT',
              tournamentId: null,
              matchId: null,
            },
          });
          logger.info('Successfully created rating history entry for manual adjustment', {
            historyEntryId: historyEntry.id,
            memberId,
            oldRating,
            newRating,
            ratingChange,
          });
        } catch (historyError) {
          // Log error but don't fail the update
          logger.error('Failed to create rating history entry', {
            error: historyError instanceof Error ? historyError.message : String(historyError),
            errorStack: historyError instanceof Error ? historyError.stack : undefined,
            memberId,
            oldRating,
            newRating,
            ratingChange,
          });
        }
      } else {
        logger.debug('Skipping rating history entry creation - rating did not change', {
          memberId,
          oldRating,
          newRating,
        });
      }
    } else {
      logger.debug('Skipping rating history entry creation', {
        memberId,
        ratingProvided: rating !== undefined,
        hasAdminAccess,
      });
    }

    const memberWithoutPassword = stripSensitiveMemberFields(updatedMember);
    
    // Emit socket notification for player update
    emitToAll('player:updated', {
      player: memberWithoutPassword,
      timestamp: Date.now(),
    });
    
    res.json(memberWithoutPassword);
  } catch (error) {
    logger.error('Error updating member', { error: error instanceof Error ? error.message : String(error), memberId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get rating history for one or more members
router.post('/rating-history', [
  body('memberIds').isArray({ min: 1 }),
  body('memberIds.*').isInt({ min: 1 }),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { memberIds } = req.body;

    // Get all members
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
    });

    // Get rating history from RatingHistory table
    const ratingHistoryRecords = await (prisma as any).ratingHistory.findMany({
      where: {
        memberId: { in: memberIds },
      },
      select: {
        id: true,
        memberId: true,
        rating: true,
        ratingChange: true,
        timestamp: true,
        reason: true,
        tournamentId: true,
        matchId: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    const matchIdList: number[] = ratingHistoryRecords
      .map((r: any) => r.matchId as number | null | undefined)
      .filter((id: number | null | undefined): id is number => typeof id === 'number');
    const matchIdsForHistory: number[] = [...new Set(matchIdList)];
    const matchTournamentIdByMatchId = new Map<number, number | null>();
    if (matchIdsForHistory.length > 0) {
      const matchRows = await prisma.match.findMany({
        where: { id: { in: matchIdsForHistory } },
        select: { id: true, tournamentId: true },
      });
      for (const m of matchRows) {
        matchTournamentIdByMatchId.set(m.id, m.tournamentId);
      }
    }

    // Tournament names + parent chain (include ids from matches so labels match the actual match context)
    const tournamentIds = [
      ...new Set([
        ...ratingHistoryRecords.map((r: any) => r.tournamentId).filter((id: any): id is number => id !== null),
        ...[...matchTournamentIdByMatchId.values()].filter((id): id is number => id != null),
      ]),
    ];
    const { nameById: tournamentMap, parentById: tournamentParentById } =
      await loadTournamentNamesAndParentMap(tournamentIds as number[]);

    const recordsByMember = new Map<number, typeof ratingHistoryRecords>();
    for (const r of ratingHistoryRecords) {
      if (!recordsByMember.has(r.memberId)) recordsByMember.set(r.memberId, []);
      recordsByMember.get(r.memberId)!.push(r);
    }
    for (const list of recordsByMember.values()) {
      sortRatingHistoryRecordsChronologically(list as any, tournamentParentById, matchTournamentIdByMatchId);
    }

    const tournamentNameForRecord = (record: (typeof ratingHistoryRecords)[0]): string | null => {
      const tid = effectiveTournamentIdForHistoryRow(record, matchTournamentIdByMatchId);
      if (tid != null) {
        return tournamentMap.get(tid) || 'Unknown Tournament';
      }
      if (record.reason === 'MANUAL_ADJUSTMENT') return 'Manual Adjustment';
      if (record.reason === 'INITIAL_RATING') return 'Initial rating';
      return 'Completed Match';
    };

    type HistoryPointDto = {
      date: string;
      rating: number | null;
      ratingBefore: number | null;
      ratingChange: number | null;
      tournamentId: number | null;
      tournamentName: string | null;
      matchId: number | null;
      reason: string | null;
    };

    const ratingHistory: { [memberId: number]: HistoryPointDto[] } = {};
    members.forEach((m) => {
      ratingHistory[m.id] = [];
    });

    for (const member of members) {
      const records = recordsByMember.get(member.id) ?? [];
      const points: HistoryPointDto[] = [];

      const replayedHistory = replayRatingHistoryForDisplay(records);
      if (replayedHistory.startingRating != null) {
        points.push({
          date: member.createdAt.toISOString(),
          rating: replayedHistory.startingRating,
          ratingBefore: null,
          ratingChange: null,
          tournamentId: null,
          tournamentName: 'Starting rating',
          matchId: null,
          reason: null,
        });
      }

      for (const { record, rating, ratingBefore, ratingChange } of replayedHistory.points) {
        points.push({
          date: record.timestamp.toISOString(),
          rating,
          ratingBefore,
          ratingChange: ratingChange ?? null,
          tournamentId: effectiveTournamentIdForHistoryRow(record, matchTournamentIdByMatchId),
          tournamentName: tournamentNameForRecord(record),
          matchId: record.matchId,
          reason: record.reason,
        });
      }

      if (points.length === 0 && member.rating != null) {
        points.push({
          date: member.createdAt.toISOString(),
          rating: member.rating,
          ratingBefore: null,
          ratingChange: null,
          tournamentId: null,
          tournamentName: 'Initial rating',
          matchId: null,
          reason: null,
        });
      }

      const last = points[points.length - 1];
      if (last && member.rating != null && last.rating !== member.rating) {
        points.push({
          date: new Date().toISOString(),
          rating: member.rating,
          ratingBefore: last.rating,
          ratingChange: member.rating - (last.rating ?? 0),
          tournamentId: null,
          tournamentName: 'Current (live)',
          matchId: null,
          reason: null,
        });
      }

      ratingHistory[member.id] = points;
    }

    // Format response
    const result = members.map(member => ({
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      history: ratingHistory[member.id] || [],
    }));

    res.json(result);
  } catch (error) {
    logger.error('Error fetching rating history', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get match history between a member and selected opponents
router.post('/match-history', [
  body('memberId').isInt({ min: 1 }),
  body('opponentIds').isArray({ min: 1 }),
  body('opponentIds.*').isInt({ min: 1 }),
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { memberId, opponentIds } = req.body;

    // Get the member
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Get all matches where the member played against any of the opponents
    // Matches can have the member as member1 or member2
    // Exclude scheduled (unplayed) matches: must have a score or forfeit
    const matches = await prisma.match.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                member1Id: memberId,
                member2Id: { in: opponentIds },
              },
              {
                member1Id: { in: opponentIds },
                member2Id: memberId,
              },
            ],
          },
          {
            OR: [
              { player1Sets: { gt: 0 } },
              { player2Sets: { gt: 0 } },
              { player1Forfeit: true },
              { player2Forfeit: true },
            ],
          },
        ],
      },
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            status: true,
            type: true,
            createdAt: true,
            participants: {
              select: {
                memberId: true,
                playerRatingAtTime: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Most recent first
      },
    });

    // Get opponent details
    const opponents = await prisma.member.findMany({
      where: { id: { in: opponentIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    // Get rating history for all matches to find rating before and change for each member
    const matchIds = matches.map(m => m.id);
    const allMemberIds = [memberId, ...opponentIds];
    
    // Create a map of matchId -> match createdAt for proper chronological ordering
    const matchCreatedAtMap = new Map<number, Date>();
    matches.forEach(m => {
      matchCreatedAtMap.set(m.id, m.createdAt);
    });
    
    // Query rating history - filter by MATCH_COMPLETED reason to ensure we get the correct rating at match time
    const ratingHistory = await prisma.ratingHistory.findMany({
      where: {
        matchId: { in: matchIds },
        memberId: { in: allMemberIds },
        reason: 'MATCH_COMPLETED', // Only get rating changes from matches, not tournaments
      },
      select: {
        matchId: true,
        memberId: true,
        rating: true,
        ratingChange: true,
        timestamp: true,
      },
    });
    
    // Sort rating history by match creation time (more reliable than timestamp for backfilled matches)
    ratingHistory.sort((a, b) => {
      const timeA = matchCreatedAtMap.get(a.matchId || 0)?.getTime() || a.timestamp.getTime();
      const timeB = matchCreatedAtMap.get(b.matchId || 0)?.getTime() || b.timestamp.getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // If times are equal, use matchId as tiebreaker
      return (a.matchId || 0) - (b.matchId || 0);
    });

    // Create a map: matchId -> memberId -> { ratingBefore, ratingAfter, ratingChange }
    // We need to calculate the actual rating before each match by looking at previous matches
    const ratingMap = new Map<string, Map<number, { ratingBefore: number | null; ratingAfter: number | null; ratingChange: number | null }>>();
    
    // First, get all rating history for these members to track rating progression
    // We need ALL matches (not just the ones in our result set) to get correct progression
    const allMemberRatingHistory = await prisma.ratingHistory.findMany({
      where: {
        memberId: { in: allMemberIds },
        reason: 'MATCH_COMPLETED',
      },
      select: {
        matchId: true,
        memberId: true,
        rating: true,
        ratingChange: true,
        timestamp: true,
      },
    });
    
    // Get match creation times for all matches in the rating history
    const allMatchIds = [...new Set(allMemberRatingHistory.map(rh => rh.matchId).filter((id): id is number => id !== null))];
    const allMatches = await prisma.match.findMany({
      where: { id: { in: allMatchIds } },
      select: { id: true, createdAt: true },
    });
    const allMatchCreatedAtMap = new Map<number, Date>();
    allMatches.forEach(m => {
      allMatchCreatedAtMap.set(m.id, m.createdAt);
    });
    
    // Sort all rating history by match creation time (more reliable than timestamp)
    allMemberRatingHistory.sort((a, b) => {
      const timeA = allMatchCreatedAtMap.get(a.matchId || 0)?.getTime() || a.timestamp.getTime();
      const timeB = allMatchCreatedAtMap.get(b.matchId || 0)?.getTime() || b.timestamp.getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // If times are equal, use matchId as tiebreaker
      return (a.matchId || 0) - (b.matchId || 0);
    });
    
    // Create a map of memberId -> chronological list of rating changes
    const memberRatingProgression = new Map<number, Array<{ matchId: number | null; rating: number | null; ratingChange: number | null; timestamp: Date }>>();
    allMemberRatingHistory.forEach((rh: any) => {
      if (!memberRatingProgression.has(rh.memberId)) {
        memberRatingProgression.set(rh.memberId, []);
      }
      memberRatingProgression.get(rh.memberId)!.push({
        matchId: rh.matchId,
        rating: rh.rating,
        ratingChange: rh.ratingChange,
        timestamp: rh.timestamp,
      });
    });
    
    // Now process each match and calculate the correct rating before
    ratingHistory.forEach((rh: any) => {
      const matchKey = rh.matchId?.toString();
      if (!matchKey) return;
      
      if (!ratingMap.has(matchKey)) {
        ratingMap.set(matchKey, new Map());
      }
      const memberMap = ratingMap.get(matchKey)!;
      
      // Only set if we haven't already set a value for this member/match (to handle duplicates)
      if (!memberMap.has(rh.memberId)) {
        // Find the actual rating before this match by looking at previous matches
        const progression = memberRatingProgression.get(rh.memberId) || [];
        const currentMatchIndex = progression.findIndex(p => p.matchId === rh.matchId);
        
        let ratingBefore: number | null = null;
        
        if (currentMatchIndex > 0) {
          // There's a previous match - use the rating after the previous match
          const previousMatch = progression[currentMatchIndex - 1];
          ratingBefore = previousMatch.rating;
        } else if (currentMatchIndex === 0) {
          // This is the first match - calculate from the current record
          // rating is the NEW rating after the match, so ratingBefore = rating - ratingChange
          ratingBefore = rh.rating !== null && rh.ratingChange !== null 
            ? rh.rating - rh.ratingChange 
            : null;
        } else {
          // Match not found in progression (shouldn't happen, but fallback to calculation)
          ratingBefore = rh.rating !== null && rh.ratingChange !== null 
            ? rh.rating - rh.ratingChange 
            : null;
        }
        
        memberMap.set(rh.memberId, {
          ratingBefore,
          ratingAfter: rh.rating, // Rating after the match
          ratingChange: rh.ratingChange,
        });
      }
    });

    // Format the response
    const result = {
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
      },
      opponents: opponents.map(o => ({
        id: o.id,
        firstName: o.firstName,
        lastName: o.lastName,
      })),
      matches: matches.map(match => {
        const isMember1 = match.member1Id === memberId;
        const opponentId = isMember1 ? match.member2Id : match.member1Id;
        const opponent = opponents.find(o => o.id === opponentId);
        const isStandaloneMatch = !match.tournament;
        
        // Check if this match has per-match rating history entries
        const matchRatingMap = ratingMap.get(match.id.toString());
        const memberRatingInfo = matchRatingMap?.get(memberId);
        const opponentRatingInfo = matchRatingMap?.get(opponentId || 0);
        const hasPerMatchRatings = memberRatingInfo !== undefined || opponentRatingInfo !== undefined;
        
        let memberRatingAfter: number | null = null;
        let memberRatingChange: number | null = null;
        let opponentRatingAfter: number | null = null;
        let opponentRatingChange: number | null = null;
        
        if (hasPerMatchRatings || isStandaloneMatch) {
          // Use per-match rating history (for tournament types that recalculate per match, and standalone matches)
          memberRatingAfter = memberRatingInfo?.ratingAfter ?? null;
          memberRatingChange = memberRatingInfo?.ratingChange ?? null;
          opponentRatingAfter = opponentRatingInfo?.ratingAfter ?? null;
          opponentRatingChange = opponentRatingInfo?.ratingChange ?? null;
        } else if (match.tournament) {
          // No per-match rating history — use tournament participant data (rating at time of tournament)
          // ratingChange stays null since this tournament type doesn't change ratings per match
          const memberParticipant = match.tournament.participants.find(p => p.memberId === memberId);
          const opponentParticipant = match.tournament.participants.find(p => p.memberId === opponentId);
          memberRatingAfter = memberParticipant?.playerRatingAtTime ?? null;
          opponentRatingAfter = opponentParticipant?.playerRatingAtTime ?? null;
        }
        
        return {
          id: match.id,
          tournamentId: match.tournamentId,
          tournamentName: match.tournament?.name ?? null,
          tournamentStatus: match.tournament?.status ?? null,
          tournamentType: match.tournament?.type ?? null,
          tournamentDate: match.tournament?.createdAt?.toISOString() ?? match.createdAt.toISOString(),
          opponentId: opponentId,
          opponentName: opponent ? `${opponent.firstName} ${opponent.lastName}` : 'Unknown',
          memberSets: isMember1 ? match.player1Sets : match.player2Sets,
          opponentSets: isMember1 ? match.player2Sets : match.player1Sets,
          memberForfeit: isMember1 ? match.player1Forfeit : match.player2Forfeit,
          opponentForfeit: isMember1 ? match.player2Forfeit : match.player1Forfeit,
          matchDate: match.createdAt.toISOString(),
          // Rating information - show rating AFTER the match
          memberRatingAfter,
          memberRatingChange,
          opponentRatingAfter,
          opponentRatingChange,
        };
      }),
    };

    res.json(result);
  } catch (error) {
    logger.error('Error fetching match history', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk import players
router.post('/import', importUpload.single('file'), async (req: AuthRequest & { file?: UploadedImportFile }, res: Response) => {
  try {
    const imported = getImportedPlayers(req);
    if (imported.errors.length > 0) {
      return res.status(400).json({
        error: `Import validation errors:\n${imported.errors.join('\n')}`,
        importValidation: {
          errors: imported.errors,
          parseReport: imported.parseReport ?? null,
        },
      });
    }

    const { players } = imported;
    const sendEmail = req.body?.sendEmail !== 'false';

    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'No valid players to import. Please check your CSV file.' });
    }

    type ImportFailedRow = {
      firstName: string;
      lastName: string;
      email?: string;
      birthDate: string | null;
      error: string;
    };

    const annotateFailedImport = (
      player: ImportedPlayerPayload,
      row: { firstName: string; lastName: string; email?: string; error: string }
    ): ImportFailedRow => ({ ...row, birthDate: player.birthDate ?? null });

    const results = {
      successful: [] as Array<{ firstName: string; lastName: string; email: string | null }>,
      failed: [] as ImportFailedRow[],
      emailFailed: [] as Array<{ firstName: string; lastName: string; email: string; error: string }>,
    };

    let addedWithoutEmail = 0;

    // Get all existing members for duplicate checking
    const existingMembers = await prisma.member.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    // Create maps for quick lookup
    const emailMap = new Map<string, boolean>();
    const nameMap = new Map<string, boolean>();
    existingMembers.forEach(m => {
      if (m.email) {
        emailMap.set(m.email.toLowerCase(), true);
      }
      nameMap.set(`${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}`, true);
    });

    let importEmailTransporter: nodemailer.Transporter | null = null;

    // Process each player
    for (const player of players) {
      try {
        // Validate and clean input fields - ensure proper separation
        if (!player.firstName || typeof player.firstName !== 'string') {
          results.failed.push(
            annotateFailedImport(player, {
              firstName: player.firstName || 'Unknown',
              lastName: player.lastName || 'Unknown',
              error: 'First name is required and must be a string',
            })
          );
          continue;
        }

        if (!player.lastName || typeof player.lastName !== 'string') {
          results.failed.push(
            annotateFailedImport(player, {
              firstName: player.firstName || 'Unknown',
              lastName: player.lastName || 'Unknown',
              error: 'Last name is required and must be a string',
            })
          );
          continue;
        }
        
        const firstName = player.firstName.trim();
        const lastName = player.lastName.trim();

        if (!isValidMemberName(firstName)) {
          results.failed.push(
            annotateFailedImport(player, {
              firstName,
              lastName,
              error: 'First name must be 2-50 characters and contain only letters, spaces, apostrophes, or hyphens',
            })
          );
          continue;
        }

        if (!isValidMemberName(lastName)) {
          results.failed.push(
            annotateFailedImport(player, {
              firstName,
              lastName,
              error: 'Last name must be 2-50 characters and contain only letters, spaces, apostrophes, or hyphens',
            })
          );
          continue;
        }
        
        if (!firstName || !lastName) {
          results.failed.push(
            annotateFailedImport(player, {
              firstName,
              lastName,
              error: 'First name and last name cannot be empty after trimming',
            })
          );
          continue;
        }
        
        const hasRowEmail =
          player.email != null && typeof player.email === 'string' && player.email.trim().length > 0;

        let emailNorm: string | null = null;
        if (hasRowEmail) {
          emailNorm = normalizeMemberEmail(player.email as string);
          if (!isValidEmailFormat(emailNorm)) {
            results.failed.push(
              annotateFailedImport(player, {
                firstName,
                lastName,
                email: emailNorm,
                error: 'Invalid email format',
              })
            );
            continue;
          }
        }

        if (!isValidRatingInput(player.rating)) {
          results.failed.push(
            annotateFailedImport(player, {
              firstName,
              lastName,
              ...(emailNorm ? { email: emailNorm } : {}),
              error: 'Rating must be an integer between 0 and 9999',
            })
          );
          continue;
        }

        if (player.gender !== undefined && player.gender !== null && String(player.gender).trim() !== '') {
          const g = String(player.gender).trim().toUpperCase();
          if (g === 'OTHER') {
            results.failed.push(
              annotateFailedImport(player, {
                firstName,
                lastName,
                ...(emailNorm ? { email: emailNorm } : {}),
                error: 'Gender "OTHER" is not valid. Use NOT_SPECIFIED, MALE, or FEMALE.',
              })
            );
            continue;
          }
          if (!['MALE', 'FEMALE', 'NOT_SPECIFIED'].includes(g)) {
            results.failed.push(
              annotateFailedImport(player, {
                firstName,
                lastName,
                ...(emailNorm ? { email: emailNorm } : {}),
                error: 'Gender must be MALE, FEMALE, or NOT_SPECIFIED.',
              })
            );
            continue;
          }
        }

        // Validate phone if provided
        if (player.phone) {
          const phone = typeof player.phone === 'string' ? player.phone.trim() : String(player.phone).trim();
          if (phone && !isValidPhoneNumber(phone)) {
            results.failed.push(
              annotateFailedImport(player, {
                firstName,
                lastName,
                ...(emailNorm ? { email: emailNorm } : {}),
                error: 'Invalid phone number format. Please enter a valid US phone number',
              })
            );
            continue;
          }
        }

        if (!hasRowEmail) {
          const rolesForNoEmail: MemberRole[] =
            player.roles && Array.isArray(player.roles) && player.roles.length > 0 ? player.roles : ['PLAYER'];
          if (rolesForNoEmail.some((r) => r !== 'PLAYER')) {
            results.failed.push(
              annotateFailedImport(player, {
                firstName,
                lastName,
                error: 'Without an email, only the PLAYER role is allowed',
              })
            );
            continue;
          }
        } else if (player.roles !== undefined) {
          if (!isValidRoles(player.roles)) {
            results.failed.push(
              annotateFailedImport(player, {
                firstName,
                lastName,
                email: emailNorm!,
                error: 'Invalid roles. Roles must be an array containing only: PLAYER, COACH, ADMIN, ORGANIZER',
              })
            );
            continue;
          }
        }

        let birthDate: Date | null = null;
        if (player.birthDate) {
          birthDate = new Date(player.birthDate);
          if (isNaN(birthDate.getTime()) || !isValidBirthDate(birthDate)) {
            results.failed.push(
              annotateFailedImport(player, {
                firstName,
                lastName,
                ...(emailNorm ? { email: emailNorm } : {}),
                error: getBirthDateValidationMessage(),
              })
            );
            continue;
          }
        }

        const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;

        if (hasRowEmail && emailNorm) {
          const emailKey = emailNorm.toLowerCase();
          if (emailMap.has(emailKey)) {
            results.failed.push(
              annotateFailedImport(player, {
                firstName,
                lastName,
                email: emailNorm,
                error: 'Email already exists',
              })
            );
            continue;
          }
        }

        if (nameMap.has(nameKey)) {
          results.failed.push(
            annotateFailedImport(player, {
              firstName,
              lastName,
              ...(emailNorm ? { email: emailNorm } : {}),
              error: 'Name already exists',
            })
          );
          continue;
        }

        const finalGender = player.gender ?? 'NOT_SPECIFIED';

        if (!hasRowEmail) {
          const member = await prisma.member.create({
            data: {
              firstName,
              lastName,
              email: null,
              gender: finalGender,
              password: '',
              roles: ['PLAYER'],
              birthDate,
              rating:
                player.rating !== null && player.rating !== undefined
                  ? parseInt(String(player.rating), 10)
                  : null,
              phone: player.phone
                ? typeof player.phone === 'string'
                  ? player.phone.trim()
                  : String(player.phone).trim()
                : null,
              address: player.address
                ? typeof player.address === 'string'
                  ? player.address.trim()
                  : String(player.address).trim()
                : null,
              qrTokenHash: generateQrTokenHash(),
              isActive: true,
              emailConfirmedAt: null,
              mustResetPassword: false,
              passwordResetToken: null,
              passwordResetTokenExpiry: null,
            } as any,
          });

          await createInitialRatingHistoryEntry(member.id, member.rating);

          addedWithoutEmail += 1;
          nameMap.set(nameKey, true);

          results.successful.push({
            firstName: member.firstName,
            lastName: member.lastName,
            email: null,
          });

          const memberWithoutPasswordNoEmail = stripSensitiveMemberFields(member);
          emitToAll('player:created', {
            player: memberWithoutPasswordNoEmail,
            timestamp: Date.now(),
          });
          continue;
        }

        const finalEmail = emailNorm as string;

        const roles: MemberRole[] =
          player.roles && Array.isArray(player.roles) && player.roles.length > 0 ? player.roles : ['PLAYER'];

        const mustResetPassword =
          player.mustResetPassword !== undefined ? player.mustResetPassword : true;
        const passwordResetToken = generatePasswordResetToken();
        const passwordResetExpiry = getPasswordResetExpiryDate();
        const resetLink = buildResetLink(finalEmail, passwordResetToken);

        const member = await prisma.member.create({
          data: {
            firstName,
            lastName,
            email: finalEmail,
            gender: finalGender,
            password: '',
            roles,
            birthDate,
            rating:
              player.rating !== null && player.rating !== undefined
                ? parseInt(String(player.rating), 10)
                : null,
            phone: player.phone
              ? typeof player.phone === 'string'
                ? player.phone.trim()
                : String(player.phone).trim()
              : null,
            address: player.address
              ? typeof player.address === 'string'
                ? player.address.trim()
                : String(player.address).trim()
              : null,
            qrTokenHash: generateQrTokenHash(),
            isActive: false,
            emailConfirmedAt: null,
            mustResetPassword,
            passwordResetToken,
            passwordResetTokenExpiry: passwordResetExpiry,
          } as any,
        });

        await createInitialRatingHistoryEntry(member.id, member.rating);

        if (sendEmail) {
          try {
            if (!importEmailTransporter) {
              importEmailTransporter = createSmtpTransporter();
              await importEmailTransporter.verify();
            }

            await sendPasswordResetEmail({
              toEmail: finalEmail,
              firstName,
              resetLink,
              expiresAt: passwordResetExpiry,
              messageVariant: 'invite',
              transporter: importEmailTransporter,
            });
            logger.info('Password reset email sent during member import', {
              memberId: member.id,
              email: finalEmail,
              expiresAt: passwordResetExpiry.toISOString(),
            });
          } catch (emailError) {
            logger.error('Password reset email failed during member import; keeping imported member', {
              memberId: member.id,
              email: finalEmail,
              error: emailError instanceof Error ? emailError.message : String(emailError),
            });
            results.emailFailed.push({
              firstName,
              lastName,
              email: finalEmail,
              error: emailError instanceof Error ? emailError.message : String(emailError),
            });
          }
        } else {
          logger.info('Skipping invitation email during member import (sendEmail=false)', {
            memberId: member.id,
            email: finalEmail,
          });
        }

        emailMap.set(finalEmail.toLowerCase(), true);
        nameMap.set(nameKey, true);

        results.successful.push({
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
        });
        
        // Emit socket notification for each imported player
        const memberWithoutPassword = stripSensitiveMemberFields(member);
        emitToAll('player:created', {
          player: memberWithoutPassword,
          timestamp: Date.now(),
        });
      } catch (error: any) {
        results.failed.push(
          annotateFailedImport(player, {
            firstName: player.firstName || 'Unknown',
            lastName: player.lastName || 'Unknown',
            email: player.email,
            error: error.message || 'Unknown error',
          })
        );
      }
    }

    // Emit cache invalidation for players list refresh
    emitToAll('players:imported', {
      total: players.length,
      successful: results.successful.length,
      failed: results.failed.length,
      emailFailed: results.emailFailed.length,
      addedWithoutEmail,
      timestamp: Date.now(),
    });

    res.json({
      total: players.length,
      successful: results.successful.length,
      failed: results.failed.length,
      emailFailed: results.emailFailed.length,
      addedWithoutEmail,
      successfulPlayers: results.successful,
      failedPlayers: results.failed,
      emailFailedPlayers: results.emailFailed,
    });
  } catch (error) {
    logger.error('Error importing members', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

