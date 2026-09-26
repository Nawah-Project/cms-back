DELETE FROM "auth_identities" WHERE "provider"::TEXT <> 'GOOGLE';

ALTER TABLE "auth_identities"
  ALTER COLUMN "provider" TYPE TEXT USING "provider"::TEXT;

DROP TYPE "AuthProvider";
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE');

ALTER TABLE "auth_identities"
  ALTER COLUMN "provider" TYPE "AuthProvider"
  USING "provider"::"AuthProvider";
