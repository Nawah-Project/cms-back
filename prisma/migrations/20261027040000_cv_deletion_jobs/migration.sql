CREATE TABLE "cv_deletion_jobs" (
  "id" UUID NOT NULL,
  "storage_key" VARCHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_attempt_at" TIMESTAMP(3),
  CONSTRAINT "cv_deletion_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cv_deletion_jobs_storage_key_key" ON "cv_deletion_jobs"("storage_key");
