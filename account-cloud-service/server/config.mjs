import path from 'node:path';

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function requiredSecret(name, minimumLength = 32) {
  const value = process.env[name]?.trim() ?? '';
  if (value.length < minimumLength) {
    throw new Error(`${name} must be configured with at least ${minimumLength} characters.`);
  }
  return value;
}

function parseOrigins(value) {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : DEFAULT_ORIGINS;
}

function parseInteger(name, fallback, minimum, maximum) {
  const raw = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(raw)));
}

export function loadAccountConfig() {
  const production = process.env.NODE_ENV === 'production';
  const port = parseInteger('ACCOUNT_PORT', 8082, 1, 65535);
  const host = process.env.ACCOUNT_HOST?.trim() || '0.0.0.0';
  const publicBaseUrl = process.env.ACCOUNT_PUBLIC_BASE_URL?.trim() || `http://localhost:${port}`;
  const clientOrigins = parseOrigins(process.env.ACCOUNT_ALLOWED_ORIGINS);
  const databasePath = path.resolve(process.env.ACCOUNT_DATABASE_PATH?.trim() || './data/emberveil-accounts.sqlite');
  const authSecret = requiredSecret('BETTER_AUTH_SECRET');
  const csrfCookieSecret = requiredSecret('ACCOUNT_CSRF_COOKIE_SECRET');
  const csrfHmacKey = requiredSecret('ACCOUNT_CSRF_HMAC_KEY');
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

  if (production && !publicBaseUrl.startsWith('https://')) {
    throw new Error('ACCOUNT_PUBLIC_BASE_URL must use HTTPS in production.');
  }
  if (production && !smtpConfigured) {
    throw new Error('SMTP_HOST and SMTP_FROM are required in production.');
  }

  return Object.freeze({
    production,
    port,
    host,
    publicBaseUrl,
    clientOrigins,
    databasePath,
    authSecret,
    csrfCookieSecret,
    csrfHmacKey,
    smtpConfigured,
    smtp: smtpConfigured
      ? {
          host: process.env.SMTP_HOST,
          port: parseInteger('SMTP_PORT', 587, 1, 65535),
          secure: process.env.SMTP_SECURE === 'true',
          user: process.env.SMTP_USER || undefined,
          pass: process.env.SMTP_PASS || undefined,
          from: process.env.SMTP_FROM,
        }
      : null,
  });
}
