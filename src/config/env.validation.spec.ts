import { validateEnvironment } from './env.validation';

const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://cms:password@postgres:5432/cms?schema=public',
  JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-thirty-two-bytes',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-at-least-thirty-two-bytes',
  FRONTEND_ORIGIN: 'https://app.example.com',
  CV_STORAGE_DIR: '/var/lib/cms/cvs',
};

describe('validateEnvironment', () => {
  it('accepts complete production configuration', () => {
    expect(() => validateEnvironment(validProductionEnv)).not.toThrow();
  });

  it('fails fast when a production secret is missing or weak', () => {
    expect(() =>
      validateEnvironment({ ...validProductionEnv, JWT_ACCESS_SECRET: '' }),
    ).toThrow('JWT_ACCESS_SECRET must be set');
    expect(() =>
      validateEnvironment({ ...validProductionEnv, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow('at least 32 bytes');
  });

  it('rejects repeated secrets, placeholder secrets, and HTTP production origins', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnv,
        JWT_REFRESH_SECRET: validProductionEnv.JWT_ACCESS_SECRET,
      }),
    ).toThrow('must be different');
    expect(() =>
      validateEnvironment({
        ...validProductionEnv,
        JWT_ACCESS_SECRET: 'REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_BYTES',
      }),
    ).toThrow('replace the JWT secret placeholders');
    expect(() =>
      validateEnvironment({ ...validProductionEnv, FRONTEND_ORIGIN: 'http://app.example.com' }),
    ).toThrow('must use HTTPS');
  });

  it('rejects malformed database, file size, and partial OAuth configuration', () => {
    expect(() =>
      validateEnvironment({ ...validProductionEnv, DATABASE_URL: 'mysql://db/cms' }),
    ).toThrow('must use PostgreSQL');
    expect(() =>
      validateEnvironment({ ...validProductionEnv, CV_MAX_FILE_SIZE_BYTES: '30000000' }),
    ).toThrow('CV_MAX_FILE_SIZE_BYTES');
    expect(() =>
      validateEnvironment({ ...validProductionEnv, GOOGLE_CLIENT_ID: 'configured' }),
    ).toThrow('configure all Google OAuth settings');
  });
});
