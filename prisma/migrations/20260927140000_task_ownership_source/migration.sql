CREATE TYPE "TaskSource" AS ENUM ('PERSONAL', 'MENTOR_ASSIGNED');

ALTER TABLE "professional_tasks"
ADD COLUMN "source" "TaskSource" NOT NULL DEFAULT 'MENTOR_ASSIGNED';

CREATE INDEX "IDX_tasks_source" ON "professional_tasks"("source");

ALTER TABLE "professional_tasks"
ADD CONSTRAINT "CHK_tasks_personal_ownership"
CHECK ("source" <> 'PERSONAL' OR ("userId" = "createdById" AND "mentorPriority" = false));
