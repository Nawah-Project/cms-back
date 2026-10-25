-- Additive only. Existing activities, CV history and administrator settings remain intact.
ALTER TYPE "SideTaskType" ADD VALUE IF NOT EXISTS 'USER_CHANGE';
ALTER TABLE "user_cvs" ADD COLUMN "contentHash" VARCHAR(64);
ALTER TABLE "user_journey_states" ADD COLUMN "readInsightCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "side_task_submissions" ADD COLUMN "requestKey" VARCHAR(64);
CREATE UNIQUE INDEX "side_task_submissions_userId_requestKey_key"
ON "side_task_submissions"("userId", "requestKey");
-- Preserve legitimate existing reading progress in the new explicit read contract.
UPDATE "user_journey_states" s SET "readInsightCodes" = ARRAY(
  SELECT DISTINCT p."unlockTriggerCode" FROM "feedback_reads" r
  JOIN "feedback_posts" p ON p.id = r."feedbackId"
  WHERE r."userId" = s."userId" AND p."unlockTriggerCode" = ANY(s."unlockedInsightCodes")
);
