import { createHash, randomBytes } from 'crypto';
import type { Gender, MemberRole, Prisma, PrismaClient, TournamentType } from '@prisma/client';
import { RatingChangeReason } from '@prisma/client';
import { generateScorePin } from '../utils/scorePin';
import {
  CLUB_ARCHIVE_VERSION,
  type ClubArchiveBracketMatch,
  type ClubArchiveDocument,
  type ClubArchiveGender,
  type ClubArchiveImportResult,
  type ClubArchiveMatch,
  type ClubArchiveMember,
  type ClubArchiveMemberRole,
  type ClubArchiveStandaloneMatch,
  type ClubArchiveTournament,
  type ClubArchiveTournamentType,
} from './clubArchiveTypes';

function generateQrTokenHash(): string {
  return createHash('sha256')
    .update(`${randomBytes(32).toString('hex')}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

function toDateOnlyIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TOURNAMENT_TYPES = new Set<string>([
  'ROUND_ROBIN',
  'PLAYOFF',
  'SWISS',
  'MULTI_ROUND_ROBINS',
  'PRELIMINARY_WITH_FINAL_PLAYOFF',
  'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
]);

const MEMBER_ROLES = new Set<string>(['PLAYER', 'COACH', 'ADMIN', 'ORGANIZER']);
const GENDERS = new Set<string>(['MALE', 'FEMALE', 'NOT_SPECIFIED']);

type TournamentDumpRow = {
  id: number;
  name: string | null;
  type: TournamentType;
  status: string;
  cancelled: boolean;
  tournamentDate: Date | null;
  minRating: number | null;
  maxRating: number | null;
  maxParticipants: number | null;
  groupNumber: number | null;
  participants: Array<{ memberId: number; playerRatingAtTime: number | null }>;
  matches: Array<{
    id: number;
    member1Id: number;
    member2Id: number | null;
    player1Sets: number;
    player2Sets: number;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    notPlayed: boolean;
    round: number | null;
  }>;
  bracketMatches: Array<{
    id: number;
    round: number;
    position: number;
    member1Id: number | null;
    member2Id: number | null;
    nextMatchId: number | null;
    matchId: number | null;
  }>;
  swissData: {
    numberOfRounds: number;
    pairByRating: boolean;
    currentRound: number;
    isCompleted: boolean;
  } | null;
  preliminaryConfig: {
    finalSize: number;
    autoQualifiedCount: number;
    autoQualifiedMemberIds: number[];
  } | null;
  childTournaments: TournamentDumpRow[];
};

function archiveTournamentInclude() {
  return {
    participants: {
      select: { memberId: true, playerRatingAtTime: true },
      orderBy: { id: 'asc' as const },
    },
    matches: { orderBy: { id: 'asc' as const } },
    bracketMatches: { orderBy: [{ round: 'asc' as const }, { position: 'asc' as const }] },
    swissData: true,
    preliminaryConfig: true,
    childTournaments: {
      orderBy: [{ groupNumber: 'asc' as const }, { id: 'asc' as const }],
      include: {
        participants: {
          select: { memberId: true, playerRatingAtTime: true },
          orderBy: { id: 'asc' as const },
        },
        matches: { orderBy: { id: 'asc' as const } },
        bracketMatches: { orderBy: [{ round: 'asc' as const }, { position: 'asc' as const }] },
        swissData: true,
        preliminaryConfig: true,
        childTournaments: {
          orderBy: [{ groupNumber: 'asc' as const }, { id: 'asc' as const }],
          include: {
            participants: {
              select: { memberId: true, playerRatingAtTime: true },
              orderBy: { id: 'asc' as const },
            },
            matches: { orderBy: { id: 'asc' as const } },
            bracketMatches: {
              orderBy: [{ round: 'asc' as const }, { position: 'asc' as const }],
            },
            swissData: true,
            preliminaryConfig: true,
          },
        },
      },
    },
  };
}

function serializeMatch(m: TournamentDumpRow['matches'][number]): ClubArchiveMatch {
  return {
    id: m.id,
    member1Id: m.member1Id,
    member2Id: m.member2Id,
    player1Sets: m.player1Sets,
    player2Sets: m.player2Sets,
    player1Forfeit: m.player1Forfeit,
    player2Forfeit: m.player2Forfeit,
    notPlayed: m.notPlayed,
    round: m.round,
  };
}

function serializeBracket(b: TournamentDumpRow['bracketMatches'][number]): ClubArchiveBracketMatch {
  return {
    id: b.id,
    round: b.round,
    position: b.position,
    member1Id: b.member1Id,
    member2Id: b.member2Id,
    nextBracketMatchId: b.nextMatchId,
    matchId: b.matchId,
  };
}

function serializeTournament(t: TournamentDumpRow): ClubArchiveTournament {
  return {
    id: t.id,
    name: t.name,
    type: t.type as ClubArchiveTournamentType,
    status: 'COMPLETED',
    cancelled: Boolean(t.cancelled),
    tournamentDate: toIso(t.tournamentDate),
    minRating: t.minRating,
    maxRating: t.maxRating,
    maxParticipants: t.maxParticipants,
    groupNumber: t.groupNumber,
    participants: t.participants.map((p) => ({
      memberId: p.memberId,
      playerRatingAtTime: p.playerRatingAtTime,
    })),
    matches: t.matches.map(serializeMatch),
    bracketMatches: t.bracketMatches.map(serializeBracket),
    swissData: t.swissData
      ? {
          numberOfRounds: t.swissData.numberOfRounds,
          pairByRating: t.swissData.pairByRating,
          currentRound: t.swissData.currentRound,
          isCompleted: t.swissData.isCompleted,
        }
      : null,
    preliminaryConfig: t.preliminaryConfig
      ? {
          finalSize: t.preliminaryConfig.finalSize,
          autoQualifiedCount: t.preliminaryConfig.autoQualifiedCount,
          autoQualifiedMemberIds: [...t.preliminaryConfig.autoQualifiedMemberIds],
        }
      : null,
    children: (t.childTournaments || []).map(serializeTournament),
  };
}

function serializeMember(m: {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  gender: Gender;
  birthDate: Date | null;
  roles: MemberRole[];
  rating: number | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  tournamentNotificationsEnabled: boolean;
  autoRelinquishPrivileges: boolean | null;
}): ClubArchiveMember {
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    gender: m.gender as ClubArchiveGender,
    birthDate: toDateOnlyIso(m.birthDate),
    roles: m.roles as ClubArchiveMemberRole[],
    rating: m.rating,
    phone: m.phone,
    address: m.address,
    isActive: m.isActive,
    tournamentNotificationsEnabled: m.tournamentNotificationsEnabled,
    autoRelinquishPrivileges: m.autoRelinquishPrivileges,
  };
}

export async function buildClubArchive(prisma: PrismaClient): Promise<ClubArchiveDocument> {
  const members = await prisma.member.findMany({
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      gender: true,
      birthDate: true,
      roles: true,
      rating: true,
      phone: true,
      address: true,
      isActive: true,
      tournamentNotificationsEnabled: true,
      autoRelinquishPrivileges: true,
    },
  });

  const roots = (await prisma.tournament.findMany({
    where: {
      status: 'COMPLETED',
      parentTournamentId: null,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: archiveTournamentInclude(),
  })) as unknown as TournamentDumpRow[];

  const standaloneRows = await prisma.match.findMany({
    where: { tournamentId: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const standaloneMatches: ClubArchiveStandaloneMatch[] = standaloneRows.map((m) => ({
    id: m.id,
    member1Id: m.member1Id,
    member2Id: m.member2Id,
    player1Sets: m.player1Sets,
    player2Sets: m.player2Sets,
    player1Forfeit: m.player1Forfeit,
    player2Forfeit: m.player2Forfeit,
    notPlayed: m.notPlayed,
    createdAt: m.createdAt.toISOString(),
  }));

  return {
    version: CLUB_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    members: members.map(serializeMember),
    standaloneMatches,
    tournaments: roots.map(serializeTournament),
  };
}

export function parseClubArchive(raw: unknown): ClubArchiveDocument {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Archive must be a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  if (doc.version !== CLUB_ARCHIVE_VERSION) {
    throw new Error(`Unsupported archive version (expected ${CLUB_ARCHIVE_VERSION})`);
  }
  if (!Array.isArray(doc.members)) {
    throw new Error('Archive missing members array');
  }
  if (!Array.isArray(doc.tournaments)) {
    throw new Error('Archive missing tournaments array');
  }
  const standaloneMatches = Array.isArray(doc.standaloneMatches) ? doc.standaloneMatches : [];

  const members = doc.members.map((m, index) => validateMember(m, index));
  const tournaments = doc.tournaments.map((t, index) => validateTournament(t, `tournaments[${index}]`));
  const standalones = standaloneMatches.map((m, index) =>
    validateStandaloneMatch(m, `standaloneMatches[${index}]`),
  );

  return {
    version: CLUB_ARCHIVE_VERSION,
    exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : new Date().toISOString(),
    members,
    standaloneMatches: standalones,
    tournaments,
  };
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string, fallback?: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (fallback !== undefined && (value === undefined || value === null)) return fallback;
  throw new Error(`${label} must be a boolean`);
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Expected number or null');
  }
  return value;
}

function validateMember(raw: unknown, index: number): ClubArchiveMember {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`members[${index}] must be an object`);
  }
  const m = raw as Record<string, unknown>;
  const rolesRaw = m.roles;
  if (!Array.isArray(rolesRaw) || rolesRaw.some((r) => !MEMBER_ROLES.has(String(r)))) {
    throw new Error(`members[${index}].roles is invalid`);
  }
  const gender = String(m.gender || 'NOT_SPECIFIED');
  if (!GENDERS.has(gender)) {
    throw new Error(`members[${index}].gender is invalid`);
  }
  return {
    id: requireNumber(m.id, `members[${index}].id`),
    firstName: String(m.firstName || '').trim(),
    lastName: String(m.lastName || '').trim(),
    email: m.email === null || m.email === undefined || m.email === '' ? null : String(m.email).trim(),
    gender: gender as ClubArchiveGender,
    birthDate: m.birthDate === null || m.birthDate === undefined ? null : String(m.birthDate).slice(0, 10),
    roles: rolesRaw.map((r) => String(r) as ClubArchiveMemberRole),
    rating: optionalNumber(m.rating),
    phone: m.phone === null || m.phone === undefined || m.phone === '' ? null : String(m.phone),
    address: m.address === null || m.address === undefined || m.address === '' ? null : String(m.address),
    isActive: requireBoolean(m.isActive, `members[${index}].isActive`, true),
    tournamentNotificationsEnabled: requireBoolean(
      m.tournamentNotificationsEnabled,
      `members[${index}].tournamentNotificationsEnabled`,
      false,
    ),
    autoRelinquishPrivileges:
      m.autoRelinquishPrivileges === null || m.autoRelinquishPrivileges === undefined
        ? null
        : requireBoolean(m.autoRelinquishPrivileges, `members[${index}].autoRelinquishPrivileges`),
  };
}

function validateMatch(raw: unknown, label: string): ClubArchiveMatch {
  if (!raw || typeof raw !== 'object') throw new Error(`${label} must be an object`);
  const m = raw as Record<string, unknown>;
  return {
    id: requireNumber(m.id, `${label}.id`),
    member1Id: requireNumber(m.member1Id, `${label}.member1Id`),
    member2Id: m.member2Id === null || m.member2Id === undefined ? null : requireNumber(m.member2Id, `${label}.member2Id`),
    player1Sets: requireNumber(m.player1Sets, `${label}.player1Sets`),
    player2Sets: requireNumber(m.player2Sets, `${label}.player2Sets`),
    player1Forfeit: requireBoolean(m.player1Forfeit, `${label}.player1Forfeit`, false),
    player2Forfeit: requireBoolean(m.player2Forfeit, `${label}.player2Forfeit`, false),
    notPlayed: requireBoolean(m.notPlayed, `${label}.notPlayed`, false),
    round: m.round === null || m.round === undefined ? null : requireNumber(m.round, `${label}.round`),
  };
}

function validateStandaloneMatch(raw: unknown, label: string): ClubArchiveStandaloneMatch {
  const base = validateMatch(raw, label);
  const m = raw as Record<string, unknown>;
  return {
    ...base,
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
  };
}

function validateBracket(raw: unknown, label: string): ClubArchiveBracketMatch {
  if (!raw || typeof raw !== 'object') throw new Error(`${label} must be an object`);
  const b = raw as Record<string, unknown>;
  const memberId = (v: unknown, field: string): number | null => {
    if (v === null || v === undefined) return null;
    return requireNumber(v, `${label}.${field}`);
  };
  return {
    id: requireNumber(b.id, `${label}.id`),
    round: requireNumber(b.round, `${label}.round`),
    position: requireNumber(b.position, `${label}.position`),
    member1Id: memberId(b.member1Id, 'member1Id'),
    member2Id: memberId(b.member2Id, 'member2Id'),
    nextBracketMatchId:
      b.nextBracketMatchId === null || b.nextBracketMatchId === undefined
        ? null
        : requireNumber(b.nextBracketMatchId, `${label}.nextBracketMatchId`),
    matchId:
      b.matchId === null || b.matchId === undefined
        ? null
        : requireNumber(b.matchId, `${label}.matchId`),
  };
}

function validateTournament(raw: unknown, label: string): ClubArchiveTournament {
  if (!raw || typeof raw !== 'object') throw new Error(`${label} must be an object`);
  const t = raw as Record<string, unknown>;
  const type = String(t.type || '');
  if (!TOURNAMENT_TYPES.has(type)) {
    throw new Error(`${label}.type is invalid`);
  }
  if (t.status !== 'COMPLETED') {
    throw new Error(`${label}.status must be COMPLETED`);
  }
  const participants = Array.isArray(t.participants) ? t.participants : [];
  const matches = Array.isArray(t.matches) ? t.matches : [];
  const bracketMatches = Array.isArray(t.bracketMatches) ? t.bracketMatches : [];
  const children = Array.isArray(t.children) ? t.children : [];

  let swissData: ClubArchiveTournament['swissData'] = null;
  if (t.swissData && typeof t.swissData === 'object') {
    const s = t.swissData as Record<string, unknown>;
    swissData = {
      numberOfRounds: requireNumber(s.numberOfRounds, `${label}.swissData.numberOfRounds`),
      pairByRating: requireBoolean(s.pairByRating, `${label}.swissData.pairByRating`, true),
      currentRound: requireNumber(s.currentRound, `${label}.swissData.currentRound`),
      isCompleted: requireBoolean(s.isCompleted, `${label}.swissData.isCompleted`, true),
    };
  }

  let preliminaryConfig: ClubArchiveTournament['preliminaryConfig'] = null;
  if (t.preliminaryConfig && typeof t.preliminaryConfig === 'object') {
    const p = t.preliminaryConfig as Record<string, unknown>;
    const ids = Array.isArray(p.autoQualifiedMemberIds) ? p.autoQualifiedMemberIds : [];
    preliminaryConfig = {
      finalSize: requireNumber(p.finalSize, `${label}.preliminaryConfig.finalSize`),
      autoQualifiedCount: requireNumber(p.autoQualifiedCount, `${label}.preliminaryConfig.autoQualifiedCount`),
      autoQualifiedMemberIds: ids.map((id, i) =>
        requireNumber(id, `${label}.preliminaryConfig.autoQualifiedMemberIds[${i}]`),
      ),
    };
  }

  return {
    id: requireNumber(t.id, `${label}.id`),
    name: t.name === null || t.name === undefined ? null : String(t.name),
    type: type as ClubArchiveTournamentType,
    status: 'COMPLETED',
    cancelled: requireBoolean(t.cancelled, `${label}.cancelled`, false),
    tournamentDate: t.tournamentDate === null || t.tournamentDate === undefined ? null : String(t.tournamentDate),
    minRating: optionalNumber(t.minRating),
    maxRating: optionalNumber(t.maxRating),
    maxParticipants: optionalNumber(t.maxParticipants),
    groupNumber: optionalNumber(t.groupNumber),
    participants: participants.map((p, i) => {
      if (!p || typeof p !== 'object') throw new Error(`${label}.participants[${i}] invalid`);
      const row = p as Record<string, unknown>;
      return {
        memberId: requireNumber(row.memberId, `${label}.participants[${i}].memberId`),
        playerRatingAtTime: optionalNumber(row.playerRatingAtTime),
      };
    }),
    matches: matches.map((m, i) => validateMatch(m, `${label}.matches[${i}]`)),
    bracketMatches: bracketMatches.map((b, i) => validateBracket(b, `${label}.bracketMatches[${i}]`)),
    swissData,
    preliminaryConfig,
    children: children.map((c, i) => validateTournament(c, `${label}.children[${i}]`)),
  };
}

async function setTrustedRating(
  prisma: PrismaClient,
  memberId: number,
  rating: number | null,
  reason: RatingChangeReason,
): Promise<void> {
  await prisma.ratingHistory.deleteMany({ where: { memberId } });
  await prisma.member.update({
    where: { id: memberId },
    data: { rating },
  });
  if (rating != null) {
    await prisma.ratingHistory.create({
      data: {
        memberId,
        rating,
        ratingChange: null,
        reason,
        tournamentId: null,
        matchId: null,
      },
    });
  }
}

function mapMemberId(map: Map<number, number>, archiveId: number | null | undefined): number | null {
  if (archiveId === null || archiveId === undefined) return null;
  // Bracket BYE sentinel
  if (archiveId === 0) return 0;
  const mapped = map.get(archiveId);
  if (mapped === undefined) {
    throw new Error(`Unknown member id in archive: ${archiveId}`);
  }
  return mapped;
}

function requireMappedMember(map: Map<number, number>, archiveId: number): number {
  const mapped = mapMemberId(map, archiveId);
  if (mapped === null) {
    throw new Error(`Unknown member id in archive: ${archiveId}`);
  }
  return mapped;
}

async function importTournamentTree(
  prisma: PrismaClient,
  tournament: ClubArchiveTournament,
  memberMap: Map<number, number>,
  parentId: number | null,
  counters: { tournaments: number; matches: number },
): Promise<void> {
  const created = await prisma.tournament.create({
    data: {
      name: tournament.name,
      type: tournament.type as TournamentType,
      status: 'COMPLETED',
      cancelled: tournament.cancelled,
      tournamentDate: parseIsoDate(tournament.tournamentDate),
      minRating: tournament.minRating,
      maxRating: tournament.maxRating,
      maxParticipants: tournament.maxParticipants,
      groupNumber: tournament.groupNumber,
      parentTournamentId: parentId,
    },
  });
  counters.tournaments += 1;

  if (tournament.participants.length > 0) {
    await prisma.tournamentParticipant.createMany({
      data: tournament.participants.map((p) => ({
        tournamentId: created.id,
        memberId: requireMappedMember(memberMap, p.memberId),
        playerRatingAtTime: p.playerRatingAtTime,
      })),
    });
  }

  const matchIdMap = new Map<number, number>();
  for (const match of tournament.matches) {
    const row = await prisma.match.create({
      data: {
        tournamentId: created.id,
        member1Id: requireMappedMember(memberMap, match.member1Id),
        member2Id: mapMemberId(memberMap, match.member2Id),
        player1Sets: match.player1Sets,
        player2Sets: match.player2Sets,
        player1Forfeit: match.player1Forfeit,
        player2Forfeit: match.player2Forfeit,
        notPlayed: match.notPlayed,
        round: match.round,
      },
    });
    matchIdMap.set(match.id, row.id);
    counters.matches += 1;
  }

  if (tournament.swissData) {
    await prisma.swissTournamentData.create({
      data: {
        tournamentId: created.id,
        numberOfRounds: tournament.swissData.numberOfRounds,
        pairByRating: tournament.swissData.pairByRating,
        currentRound: tournament.swissData.currentRound,
        isCompleted: tournament.swissData.isCompleted,
      },
    });
  }

  if (tournament.preliminaryConfig) {
    await prisma.preliminaryConfig.create({
      data: {
        tournamentId: created.id,
        finalSize: tournament.preliminaryConfig.finalSize,
        autoQualifiedCount: tournament.preliminaryConfig.autoQualifiedCount,
        autoQualifiedMemberIds: tournament.preliminaryConfig.autoQualifiedMemberIds.map((id) =>
          requireMappedMember(memberMap, id),
        ),
      },
    });
  }

  const bracketIdMap = new Map<number, number>();
  for (const bracket of tournament.bracketMatches) {
    const row = await prisma.bracketMatch.create({
      data: {
        tournamentId: created.id,
        round: bracket.round,
        position: bracket.position,
        member1Id: mapMemberId(memberMap, bracket.member1Id),
        member2Id: mapMemberId(memberMap, bracket.member2Id),
        nextMatchId: null,
        matchId:
          bracket.matchId == null
            ? null
            : matchIdMap.get(bracket.matchId) ??
              (() => {
                throw new Error(`Unknown match id ${bracket.matchId} for bracket ${bracket.id}`);
              })(),
      },
    });
    bracketIdMap.set(bracket.id, row.id);
  }

  for (const bracket of tournament.bracketMatches) {
    if (bracket.nextBracketMatchId == null) continue;
    const newId = bracketIdMap.get(bracket.id);
    const nextId = bracketIdMap.get(bracket.nextBracketMatchId);
    if (newId == null || nextId == null) {
      throw new Error(`Failed to remap bracket next link for bracket ${bracket.id}`);
    }
    await prisma.bracketMatch.update({
      where: { id: newId },
      data: { nextMatchId: nextId },
    });
  }

  for (const child of tournament.children) {
    await importTournamentTree(prisma, child, memberMap, created.id, counters);
  }
}

/**
 * Import a club archive into a DB with no tournaments/matches.
 * Existing members are matched by email when present; otherwise created.
 * Ratings are set from the archive as trusted (no match/tournament rating history).
 */
export async function importClubArchive(
  prisma: PrismaClient,
  archive: ClubArchiveDocument,
): Promise<ClubArchiveImportResult> {
  const [tournamentCount, matchCount] = await Promise.all([
    prisma.tournament.count(),
    prisma.match.count(),
  ]);
  if (tournamentCount > 0 || matchCount > 0) {
    throw new Error(
      'Club archive import requires an empty tournament and match database. Remove existing tournaments/matches first.',
    );
  }

  const memberMap = new Map<number, number>();
  let membersCreated = 0;
  let membersUpdated = 0;

  const existingByEmail = new Map<string, number>();
  const existingMembers = await prisma.member.findMany({
    select: { id: true, email: true },
  });
  for (const m of existingMembers) {
    if (m.email) {
      existingByEmail.set(m.email.toLowerCase(), m.id);
    }
  }

  for (const member of archive.members) {
    if (!member.firstName || !member.lastName) {
      throw new Error(`Member ${member.id} is missing first or last name`);
    }

    const emailKey = member.email?.toLowerCase() ?? null;
    const existingId = emailKey ? existingByEmail.get(emailKey) : undefined;

    if (existingId != null) {
      await prisma.member.update({
        where: { id: existingId },
        data: {
          firstName: member.firstName,
          lastName: member.lastName,
          gender: member.gender as Gender,
          birthDate: parseDateOnly(member.birthDate),
          roles: member.roles as MemberRole[],
          phone: member.phone,
          address: member.address,
          isActive: member.isActive,
          tournamentNotificationsEnabled: member.tournamentNotificationsEnabled,
          autoRelinquishPrivileges: member.autoRelinquishPrivileges,
        },
      });
      await setTrustedRating(prisma, existingId, member.rating, RatingChangeReason.MANUAL_ADJUSTMENT);
      memberMap.set(member.id, existingId);
      membersUpdated += 1;
      continue;
    }

    const created = await prisma.member.create({
      data: {
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        gender: member.gender as Gender,
        birthDate: parseDateOnly(member.birthDate),
        password: '',
        roles: member.roles as MemberRole[],
        rating: member.rating,
        phone: member.phone,
        address: member.address,
        isActive: member.isActive,
        tournamentNotificationsEnabled: member.tournamentNotificationsEnabled,
        autoRelinquishPrivileges: member.autoRelinquishPrivileges,
        qrTokenHash: generateQrTokenHash(),
        scorePin: generateScorePin(),
        mustResetPassword: Boolean(member.email),
        passwordResetToken: null,
        passwordResetTokenExpiry: null,
        emailConfirmedAt: null,
      } as Prisma.MemberCreateInput,
    });
    await setTrustedRating(prisma, created.id, member.rating, RatingChangeReason.INITIAL_RATING);
    memberMap.set(member.id, created.id);
    if (created.email) {
      existingByEmail.set(created.email.toLowerCase(), created.id);
    }
    membersCreated += 1;
  }

  const counters = { tournaments: 0, matches: 0 };
  for (const tournament of archive.tournaments) {
    await importTournamentTree(prisma, tournament, memberMap, null, counters);
  }

  let standaloneMatchesCreated = 0;
  for (const match of archive.standaloneMatches) {
    await prisma.match.create({
      data: {
        tournamentId: null,
        member1Id: requireMappedMember(memberMap, match.member1Id),
        member2Id: mapMemberId(memberMap, match.member2Id),
        player1Sets: match.player1Sets,
        player2Sets: match.player2Sets,
        player1Forfeit: match.player1Forfeit,
        player2Forfeit: match.player2Forfeit,
        notPlayed: match.notPlayed,
        createdAt: parseIsoDate(match.createdAt) ?? undefined,
      },
    });
    standaloneMatchesCreated += 1;
  }

  return {
    membersCreated,
    membersUpdated,
    tournamentsCreated: counters.tournaments,
    matchesCreated: counters.matches,
    standaloneMatchesCreated,
  };
}
