const MAX_CV_SIZE_BYTES = 25 * 1024 * 1024;

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Configuration error: ${name} must be set`);
  return value;
}

function isPlaceholder(value: string): boolean {
  return /replace|change.?me|example|your.?secret/i.test(value);
}

function parseOrigins(value: string, production: boolean): URL[] {
  const origins = value.split(',').map((item) => item.trim());
  if (!origins.length || origins.some((origin) => !origin)) {
    throw new Error(
      'Configuration error: FRONTEND_ORIGIN contains an empty origin',
    );
  }
  return origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(
        'Configuration error: FRONTEND_ORIGIN must contain valid origins',
      );
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      ![url.origin, `${url.origin}/`].includes(origin) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Configuration error: FRONTEND_ORIGIN entries must be bare HTTP(S) origins',
      );
    }
    if (
      production &&
      (url.protocol !== 'https:' ||
        ['localhost', '127.0.0.1'].includes(url.hostname))
    ) {
      throw new Error(
        'Configuration error: production FRONTEND_ORIGIN entries must use HTTPS',
      );
    }
    return url;
  });
}

export function validateEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const databaseUrl = requireValue(env, 'DATABASE_URL');
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error(
      'Configuration error: DATABASE_URL must be a valid PostgreSQL URL',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
    throw new Error('Configuration error: DATABASE_URL must use PostgreSQL');
  }

  const portValue = env.PORT?.trim() || '3000';
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'Configuration error: PORT must be an integer from 1 to 65535',
    );
  }

  const tokenTtls = [
    ['ACCESS_TOKEN_TTL_SECONDS', env.ACCESS_TOKEN_TTL_SECONDS, 24 * 60 * 60],
    [
      'REFRESH_TOKEN_TTL_SECONDS',
      env.REFRESH_TOKEN_TTL_SECONDS,
      90 * 24 * 60 * 60,
    ],
  ] as const;
  for (const [name, value, maximum] of tokenTtls) {
    if (value === undefined || value.trim() === '') continue;
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > maximum) {
      throw new Error(
        `Configuration error: ${name} must be an integer from 1 to ${maximum}`,
      );
    }
  }

  const cvSize = env.CV_MAX_FILE_SIZE_BYTES?.trim();
  if (cvSize) {
    const parsed = Number(cvSize);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > MAX_CV_SIZE_BYTES
    ) {
      throw new Error(
        'Configuration error: CV_MAX_FILE_SIZE_BYTES must be an integer from 1 to 26214400',
      );
    }
  }

  const cookieSameSite = (env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (!['strict', 'lax', 'none'].includes(cookieSameSite)) {
    throw new Error(
      'Configuration error: AUTH_COOKIE_SAME_SITE must be strict, lax, or none',
    );
  }
  if (
    cookieSameSite === 'none' &&
    env.COOKIE_SECURE !== 'true' &&
    env.NODE_ENV !== 'production'
  ) {
    throw new Error(
      'Configuration error: COOKIE_SECURE=true is required with SameSite=None',
    );
  }
  if (env.NODE_ENV === 'production' && env.COOKIE_SECURE === 'false') {
    throw new Error(
      'Configuration error: authentication cookies must be Secure in production',
    );
  }

  const trustProxy = env.TRUST_PROXY?.trim();
  if (trustProxy && (!/^\d+$/.test(trustProxy) || Number(trustProxy) > 10)) {
    throw new Error(
      'Configuration error: TRUST_PROXY must be an integer from 0 to 10',
    );
  }

  if (env.NODE_ENV === 'production') {
    const accessSecret = requireValue(env, 'JWT_ACCESS_SECRET');
    const refreshSecret = requireValue(env, 'JWT_REFRESH_SECRET');
    if (
      Buffer.byteLength(accessSecret) < 32 ||
      Buffer.byteLength(refreshSecret) < 32
    ) {
      throw new Error(
        'Configuration error: JWT secrets must each contain at least 32 bytes in production',
      );
    }
    if (isPlaceholder(accessSecret) || isPlaceholder(refreshSecret)) {
      throw new Error(
        'Configuration error: replace the JWT secret placeholders before production startup',
      );
    }
    if (accessSecret === refreshSecret) {
      throw new Error(
        'Configuration error: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
      );
    }
    const frontendOrigin = requireValue(env, 'FRONTEND_ORIGIN');
    parseOrigins(frontendOrigin, true);
    const storage = env.CV_STORAGE_DIR?.trim();
    if (!storage || !storage.startsWith('/')) {
      throw new Error(
        'Configuration error: CV_STORAGE_DIR must be an absolute persistent path in production',
      );
    }
  } else {
    const frontendOrigin = env.FRONTEND_ORIGIN?.trim();
    if (frontendOrigin) parseOrigins(frontendOrigin, false);
  }

  const googleKeys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
  ];
  const configuredGoogleKeys = googleKeys.filter((key) =>
    Boolean(env[key]?.trim()),
  );
  if (
    configuredGoogleKeys.length &&
    configuredGoogleKeys.length !== googleKeys.length
  ) {
    throw new Error(
      `Configuration error: configure all Google OAuth settings: ${googleKeys.join(', ')}`,
    );
  }
  if (env.GOOGLE_REDIRECT_URI) {
    try {
      const callback = new URL(env.GOOGLE_REDIRECT_URI);
      if (!['http:', 'https:'].includes(callback.protocol)) throw new Error();
      if (env.NODE_ENV === 'production' && callback.protocol !== 'https:')
        throw new Error();
    } catch {
      throw new Error(
        'Configuration error: GOOGLE_REDIRECT_URI must be a valid HTTPS URL in production',
      );
    }
  }
}
