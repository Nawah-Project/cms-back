CREATE TYPE "ExperienceProgressStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'SKIPPED');

CREATE TABLE "user_experience_progress" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "flow_key" VARCHAR(100) NOT NULL,
  "status" "ExperienceProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "current_step" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_experience_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_experience_progress_step_check" CHECK ("current_step" >= 0 AND "current_step" <= 100)
);
CREATE UNIQUE INDEX "user_experience_progress_user_id_flow_key_key" ON "user_experience_progress"("user_id", "flow_key");
CREATE INDEX "user_experience_progress_flow_key_status_idx" ON "user_experience_progress"("flow_key", "status");
ALTER TABLE "user_experience_progress" ADD CONSTRAINT "user_experience_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
