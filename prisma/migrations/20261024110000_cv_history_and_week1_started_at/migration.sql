-- AlterTable
ALTER TABLE "user_journey_states" ADD COLUMN IF NOT EXISTS "week1StartedAt" TIMESTAMP(3);

-- Backfill week1StartedAt for users who have reached week 1+
UPDATE "user_journey_states"
SET "week1StartedAt" = "weekStartedAt"
WHERE "currentWeek" >= 1 AND "week1StartedAt" IS NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_cv_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" VARCHAR(64) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cv_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_cv_history_userId_versionNumber_idx" ON "user_cv_history"("userId", "versionNumber");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_cv_history_userId_fkey'
    ) THEN
        ALTER TABLE "user_cv_history" ADD CONSTRAINT "user_cv_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Backfill existing CVs into user_cv_history
INSERT INTO "user_cv_history" ("id", "userId", "versionNumber", "originalName", "mimeType", "size", "storageKey", "uploadedAt")
SELECT
    gen_random_uuid(),
    c."userId",
    COALESCE(j."cvVersionNumber", 1),
    c."originalName",
    c."mimeType",
    c."size",
    c."storageKey",
    c."uploadedAt"
FROM "user_cvs" c
LEFT JOIN "user_journey_states" j ON j."userId" = c."userId"
WHERE NOT EXISTS (
    SELECT 1 FROM "user_cv_history" h WHERE h."userId" = c."userId"
);
