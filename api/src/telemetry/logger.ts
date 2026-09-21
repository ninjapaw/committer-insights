import pino from 'pino';

/** Field names that must never appear in log output. */
const REDACT_PATHS = [
  'authorization',
  'Authorization',
  'headers.authorization',
  'headers.Authorization',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'clientSecret',
  'client_secret',
  'idToken',
  'id_token',
  'email',
  'upn',
  'userPrincipalName',
  '*.accessToken',
  '*.refreshToken',
  '*.clientSecret',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/** Masks an identity value for safe logging (e.g. "cuid-1234567" -> "cu...67"). */
export function maskIdentityValue(value: string | undefined): string {
  if (!value) return '(none)';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}...${value.slice(-2)}`;
}
