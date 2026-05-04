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
}): Promise<void> {
  const user = process.env.SMTP_USER?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!from) {
    throw new Error('SMTP_FROM or SMTP_USER must be set. Unable to send email.');
  }

  const transporter = params.transporter ?? createSmtpTransporter();
  await transporter.verify();
  await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
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
  transporter?: nodemailer.Transporter;
}): Promise<void> {
  const subject = `Tournament invitation: ${params.tournamentName}`;
  const text = [
    `Hi ${params.firstName},`,
    '',
    `You are invited to register interest in ${params.tournamentName}.`,
    `Tournament date: ${formatDate(params.tournamentDate)}`,
    `Registration deadline: ${formatDate(params.registrationDeadline)}`,
    '',
    'Use this link to register:',
    params.registrationLink,
    '',
    ...(params.declineLink ? ['If you cannot play, use this link to decline:', params.declineLink] : []),
  ].join('\n');
  const html = `
    <p>Hi ${params.firstName},</p>
    <p>You are invited to register interest in <strong>${params.tournamentName}</strong>.</p>
    <p><strong>Tournament date:</strong> ${formatDate(params.tournamentDate)}<br>
    <strong>Registration deadline:</strong> ${formatDate(params.registrationDeadline)}</p>
    <p><a href="${params.registrationLink}">Register for this tournament</a></p>
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

