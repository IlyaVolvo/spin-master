import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';

function asBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function maskSecret(secret: string | undefined): string {
  if (!secret) return '(not set)';
  if (secret.length <= 4) return '*'.repeat(secret.length);
  return `${secret.slice(0, 2)}${'*'.repeat(secret.length - 4)}${secret.slice(-2)}`;
}

async function main() {
  const startedAt = Date.now();

  const envPath = path.resolve(__dirname, '../.env');
  const envExists = fs.existsSync(envPath);
  const dotenvResult = dotenv.config({ path: envPath });

  console.log('=== SMTP Test Script ===');
  console.log(`[startup] cwd: ${process.cwd()}`);
  console.log(`[startup] script: ${__filename}`);
  console.log(`[startup] .env path: ${envPath}`);
  console.log(`[startup] .env exists: ${envExists}`);
  console.log(`[startup] .env loaded: ${!dotenvResult.error}`);
  if (dotenvResult.error) {
    console.error('[startup] .env load error:', dotenvResult.error.message);
  }

  const recipient = process.argv[2]?.trim();
  const extraArgs = process.argv.slice(3);

  if (!recipient || extraArgs.length > 0) {
    console.error('\nUsage: npm run test-email -- <recipient@example.com>');
    console.error('Expected exactly one argument: recipient email address.');
    process.exit(1);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    console.error(`Invalid recipient email format: ${recipient}`);
    process.exit(1);
  }

  const host = getRequiredEnv('SMTP_HOST');
  const portRaw = process.env.SMTP_PORT?.trim() || '587';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SMTP_PORT: ${portRaw}`);
  }

  const secure = process.env.SMTP_SECURE
    ? asBool(process.env.SMTP_SECURE)
    : port === 465;

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!from) {
    throw new Error('Set SMTP_FROM or SMTP_USER in .env for sender address.');
  }

  const requireTLS = asBool(process.env.SMTP_REQUIRE_TLS, false);
  const ignoreTLS = asBool(process.env.SMTP_IGNORE_TLS, false);
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED
    ? asBool(process.env.SMTP_TLS_REJECT_UNAUTHORIZED)
    : true;

  console.log('\n=== Effective SMTP Configuration ===');
  console.log(`host: ${host}`);
  console.log(`port: ${port}`);
  console.log(`secure: ${secure}`);
  console.log(`requireTLS: ${requireTLS}`);
  console.log(`ignoreTLS: ${ignoreTLS}`);
  console.log(`tls.rejectUnauthorized: ${rejectUnauthorized}`);
  console.log(`auth user: ${user || '(not set)'}`);
  console.log(`auth pass: ${maskSecret(pass)}`);
  console.log(`from: ${from}`);
  console.log(`to: ${recipient}`);

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user || pass ? { user, pass } : undefined,
    requireTLS,
    ignoreTLS,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      rejectUnauthorized,
    },
    logger: true,
    debug: true,
  });

  console.log('\n[step] Verifying SMTP connection/auth...');
  await transport.verify();
  console.log('[ok] SMTP verification passed.');

  const now = new Date();
  const subject = `Spin Master SMTP test (${now.toISOString()})`;
  const text = [
    'SMTP test email from Spin Master.',
    '',
    `Timestamp: ${now.toISOString()}`,
    `Host: ${host}`,
    `Port: ${port}`,
    `Secure: ${secure}`,
    `From: ${from}`,
    `To: ${recipient}`,
  ].join('\n');

  const html = `
    <h2>Spin Master SMTP Test</h2>
    <p>This is a test email to verify SMTP settings.</p>
    <ul>
      <li><strong>Timestamp:</strong> ${now.toISOString()}</li>
      <li><strong>Host:</strong> ${host}</li>
      <li><strong>Port:</strong> ${port}</li>
      <li><strong>Secure:</strong> ${secure}</li>
      <li><strong>From:</strong> ${from}</li>
      <li><strong>To:</strong> ${recipient}</li>
    </ul>
  `;

  console.log('\n[step] Sending test email...');
  const info = await transport.sendMail({
    from,
    to: recipient,
    subject,
    text,
    html,
  });

  console.log('\n=== Send Result ===');
  console.log(`messageId: ${info.messageId}`);
  console.log(`accepted: ${JSON.stringify(info.accepted)}`);
  console.log(`rejected: ${JSON.stringify(info.rejected)}`);
  console.log(`pending: ${JSON.stringify(info.pending)}`);
  console.log(`response: ${info.response}`);
  console.log(`envelope: ${JSON.stringify(info.envelope)}`);

  const elapsedMs = Date.now() - startedAt;
  console.log(`\n✅ Email test completed in ${elapsedMs}ms`);
}

main().catch((error) => {
  console.error('\n❌ Email test failed');
  console.error(`name: ${error?.name || 'UnknownError'}`);
  console.error(`message: ${error?.message || String(error)}`);

  if (error?.code) {
    console.error(`code: ${error.code}`);
  }

  if (error?.command) {
    console.error(`command: ${error.command}`);
  }

  if (error?.response) {
    console.error(`smtp response: ${error.response}`);
  }

  if (error?.responseCode) {
    console.error(`smtp responseCode: ${error.responseCode}`);
  }

  if (error?.stack) {
    console.error('\nstack:');
    console.error(error.stack);
  }

  process.exit(1);
});
