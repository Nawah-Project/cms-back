export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const ACCESS_TTL_SECONDS = 20 * 60;
export const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60;

function getSecret(name: string, developmentSecret: string): string {
  const secret = process.env[name];
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
