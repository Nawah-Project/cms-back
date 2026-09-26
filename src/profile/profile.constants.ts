import { join, resolve } from 'node:path';

const DEFAULT_CV_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_CONFIGURABLE_CV_SIZE_BYTES = 25 * 1024 * 1024;
const configuredCvSize = Number(process.env.CV_MAX_FILE_SIZE_BYTES);

export const CV_MAX_FILE_SIZE_BYTES =
  Number.isSafeInteger(configuredCvSize) && configuredCvSize > 0
    ? Math.min(configuredCvSize, MAX_CONFIGURABLE_CV_SIZE_BYTES)
    : DEFAULT_CV_MAX_FILE_SIZE_BYTES;

export const CV_ORPHAN_FILE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export const CV_STORAGE_DIR = resolve(
  process.env.CV_STORAGE_DIR || join(process.cwd(), 'private-storage', 'cvs'),
);
