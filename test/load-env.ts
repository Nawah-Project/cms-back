import 'dotenv/config';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is required; refusing to run integration tests against the development database.',
  );
}
const testDatabaseName = new URL(process.env.TEST_DATABASE_URL).pathname
  .replace(/^\//, '')
  .split('?')[0];
if (testDatabaseName !== 'cms_test') {
  throw new Error(
    'TEST_DATABASE_URL must target the dedicated cms_test database.',
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
