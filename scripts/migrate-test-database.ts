import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
if (new URL(databaseUrl).pathname.replace(/^\//, '') !== 'cms_test') {
  throw new Error(
    'TEST_DATABASE_URL must target the dedicated cms_test database.',
  );
}
const cliPath = resolve('node_modules/.bin/prisma');
const result = spawnSync(cliPath, ['migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
