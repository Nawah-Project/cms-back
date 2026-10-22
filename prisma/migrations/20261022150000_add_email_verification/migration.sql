-- AlterTable
ALTER TABLE "users"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationCodeHash" VARCHAR(128),
ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationSentAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationAttempts" INTEGER NOT NULL DEFAULT 0;

-- Preserve access for ADMIN accounts only; existing regular users must verify email on next login
UPDATE "users"
SET "emailVerified" = true,
    "emailVerifiedAt" = COALESCE("emailVerifiedAt", CURRENT_TIMESTAMP)
WHERE "role" = 'ADMIN';

-- Remove pre-existing pilot group memberships for regular users so only active users who complete TASK_0 in the new Journey system take group seats
DELETE FROM "memberships"
WHERE "userId" IN (
  SELECT "id" FROM "users" WHERE "role" != 'ADMIN'
);

