import nodemailer from 'nodemailer';

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

export function getClientBaseUrl(): string {
  return (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function buildTournamentRegistrationLink(code: string): string {
  return `${getClientBaseUrl()}/tournament-registration/${encodeURIComponent(code)}?action=register`;
}

export function buildTournamentRegistrationDeclineLink(code: string): string {
  return `${getClientBaseUrl()}/tournament-registration/${encodeURIComponent(code)}?action=decline`;
}

export const MEMBERSHIP_APPLICATION_TOKEN_TTL_DAYS = 7;

export function buildMembershipAcceptLink(token: string): string {
  return `${getClientBaseUrl()}/public/join/setup?token=${encodeURIComponent(token)}`;
}

export function buildMembershipDenyLink(token: string): string {
  return `${getClientBaseUrl()}/public/join/deny?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createSmtpTransporter(): nodemailer.Transporter {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseSmtpPort(process.env.SMTP_PORT, 587);
  const secure = process.env.SMTP_SECURE ? asBool(process.env.SMTP_SECURE) : port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host) {
    throw new Error('SMTP_HOST is not set. Unable to send email.');
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

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  transporter?: nodemailer.Transporter;
}): Promise<{ messageId?: string; response?: string }> {
  const user = process.env.SMTP_USER?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!from) {
    throw new Error('SMTP_FROM or SMTP_USER must be set. Unable to send email.');
  }

  const transporter = params.transporter ?? createSmtpTransporter();
  await transporter.verify();
  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
  return {
    messageId: typeof info.messageId === 'string' ? info.messageId : undefined,
    response: typeof info.response === 'string' ? info.response : undefined,
  };
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'Not specified';
  return new Date(date).toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export async function sendTournamentInvitationEmail(params: {
  toEmail: string;
  firstName: string;
  tournamentName: string;
  tournamentDate?: Date | string | null;
  registrationDeadline?: Date | string | null;
  registrationLink: string;
  declineLink?: string;
  isEvent?: boolean;
  eventPriceCents?: number | null;
  transporter?: nodemailer.Transporter;
}): Promise<void> {
  const isEvent = params.isEvent === true && params.eventPriceCents != null;
  const priceLabel =
    isEvent && params.eventPriceCents != null
      ? `$${(params.eventPriceCents / 100).toFixed(2)}`
      : null;
  const subject = isEvent
    ? `Event invitation: ${params.tournamentName}`
    : `Tournament invitation: ${params.tournamentName}`;
  const inviteLine = isEvent
    ? `You are invited to register and pay for the event ${params.tournamentName}${priceLabel ? ` (${priceLabel})` : ''}.`
    : `You are invited to register interest in ${params.tournamentName}.`;
  const ctaLabel = isEvent ? 'Register and pay for this event' : 'Register for this tournament';
  const text = [
    `Hi ${params.firstName},`,
    '',
    inviteLine,
    `Tournament date: ${formatDate(params.tournamentDate)}`,
    `Registration deadline: ${formatDate(params.registrationDeadline)}`,
    ...(priceLabel ? [`Event fee: ${priceLabel}`] : []),
    '',
    isEvent ? 'Use this link to register and pay:' : 'Use this link to register:',
    params.registrationLink,
    '',
    ...(params.declineLink ? ['If you cannot play, use this link to decline:', params.declineLink] : []),
  ].join('\n');
  const html = `
    <p>Hi ${params.firstName},</p>
    <p>${inviteLine.replace(params.tournamentName, `<strong>${params.tournamentName}</strong>`)}</p>
    <p><strong>Tournament date:</strong> ${formatDate(params.tournamentDate)}<br>
    <strong>Registration deadline:</strong> ${formatDate(params.registrationDeadline)}${
      priceLabel ? `<br><strong>Event fee:</strong> ${priceLabel}` : ''
    }</p>
    <p><a href="${params.registrationLink}">${ctaLabel}</a></p>
    ${params.declineLink ? `<p><a href="${params.declineLink}">Decline this invitation</a></p>` : ''}
  `;

  await sendMail({ to: params.toEmail, subject, text, html, transporter: params.transporter });
}

export async function sendTournamentRegistrationCancelledEmail(params: {
  toEmail: string;
  firstName: string;
  tournamentName: string;
  reason: string;
  transporter?: nodemailer.Transporter;
}): Promise<void> {
  const subject = `Tournament registration cancelled: ${params.tournamentName}`;
  const text = [
    `Hi ${params.firstName},`,
    '',
    `Registration for ${params.tournamentName} has been cancelled.`,
    `Reason: ${params.reason}`,
  ].join('\n');
  const html = `
    <p>Hi ${params.firstName},</p>
    <p>Registration for <strong>${params.tournamentName}</strong> has been cancelled.</p>
    <p><strong>Reason:</strong> ${params.reason}</p>
  `;

  await sendMail({ to: params.toEmail, subject, text, html, transporter: params.transporter });
}

export async function sendTournamentRegistrationClosedEmail(params: {
  toEmail: string;
  firstName: string;
  tournamentName: string;
  reason: string;
  transporter?: nodemailer.Transporter;
}): Promise<void> {
  const subject = `Tournament registration closed: ${params.tournamentName}`;
  const text = [
    `Hi ${params.firstName},`,
    '',
    `Registration for ${params.tournamentName} is now closed.`,
    `Reason: ${params.reason}`,
  ].join('\n');
  const html = `
    <p>Hi ${params.firstName},</p>
    <p>Registration for <strong>${params.tournamentName}</strong> is now closed.</p>
    <p><strong>Reason:</strong> ${params.reason}</p>
  `;

  await sendMail({ to: params.toEmail, subject, text, html, transporter: params.transporter });
}

export async function sendMembershipApplicationEmail(params: {
  toEmail: string;
  firstName: string;
  clubName: string;
  acceptLink: string;
  denyLink: string;
  expiresAt: Date;
  transporter?: nodemailer.Transporter;
}): Promise<{ messageId?: string; response?: string }> {
  const clubName = params.clubName.trim() || 'the club';
  const subject = `Confirm your ${clubName} membership`;
  const expiresLabel = params.expiresAt.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const text = [
    `Hi ${params.firstName},`,
    '',
    `You requested to become a member of ${clubName}.`,
    'Use the Accept link to set your password and PIN and activate your membership:',
    params.acceptLink,
    '',
    'If you did not request this, use the Deny link to cancel the application:',
    params.denyLink,
    '',
    `These links expire on ${expiresLabel}.`,
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(params.firstName)},</p>
    <p>You requested to become a member of <strong>${escapeHtml(clubName)}</strong>.</p>
    <p><a href="${params.acceptLink}">Accept — set your password and PIN</a></p>
    <p><a href="${params.denyLink}">Deny — cancel this application</a></p>
    <p>These links expire on <strong>${escapeHtml(expiresLabel)}</strong>.</p>
  `;
  return sendMail({ to: params.toEmail, subject, text, html, transporter: params.transporter });
}


