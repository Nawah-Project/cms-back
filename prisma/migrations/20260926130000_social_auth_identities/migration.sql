CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'APPLE');

ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "providerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UQ_auth_identities_provider_subject"
ON "auth_identities"("provider", "providerSubject");

CREATE INDEX "IDX_auth_identities_userId"
ON "auth_identities"("userId");

ALTER TABLE "auth_identities"
ADD CONSTRAINT "auth_identities_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
