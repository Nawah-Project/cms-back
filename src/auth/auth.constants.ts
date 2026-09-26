export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

function getTtl(name: string, defaultValue: number): number {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    throw new Error(`${name} must be a positive integer number of seconds`);
  }
  return seconds;
}

export const ACCESS_TTL_SECONDS = getTtl('ACCESS_TOKEN_TTL_SECONDS', 20 * 60);
export const REFRESH_TTL_SECONDS = getTtl(
  'REFRESH_TOKEN_TTL_SECONDS',
  14 * 24 * 60 * 60,
);

function getSecret(name: string, developmentSecret: string): string {
  const secret = process.env[name]?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be configured in production`);
  }
  return developmentSecret;
}

export const ACCESS_TOKEN_SECRET = getSecret(
  'JWT_ACCESS_SECRET',
  'local-development-access-secret-change-before-deploy',
);
export const REFRESH_TOKEN_SECRET = getSecret(
  'JWT_REFRESH_SECRET',
  'local-development-refresh-secret-change-before-deploy',
);
