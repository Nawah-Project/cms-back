ALTER TYPE "ApplicationOutcome" ADD VALUE 'NO_RESPONSE';

CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "TaskNoteType" AS ENUM ('MENTOR_FEEDBACK', 'PERSONAL_NOTE');

ALTER TABLE "applications" ADD COLUMN "closedAt" TIMESTAMP(3);
UPDATE "applications" SET "closedAt" = "updatedAt" WHERE "stage" = 'CLOSED' AND "closedAt" IS NULL;
CREATE INDEX "IDX_applications_open_applicationDate" ON "applications"("stage", "outcome", "applicationDate");
CREATE INDEX "IDX_stage_transitions_application_stage_changed" ON "application_stage_transitions"("applicationId", "toStage", "changedAt");

CREATE TABLE "professional_tasks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(5000),
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "mentorPriority" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "professional_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_tasks_userId" ON "professional_tasks"("userId");
CREATE INDEX "IDX_tasks_createdById" ON "professional_tasks"("createdById");
CREATE INDEX "IDX_tasks_status" ON "professional_tasks"("status");
CREATE INDEX "IDX_tasks_dueDate" ON "professional_tasks"("dueDate");
CREATE INDEX "IDX_tasks_mentorPriority" ON "professional_tasks"("mentorPriority");
CREATE INDEX "IDX_tasks_user_status_dueDate" ON "professional_tasks"("userId", "status", "dueDate");
ALTER TABLE "professional_tasks" ADD CONSTRAINT "professional_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_tasks" ADD CONSTRAINT "professional_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "task_checklist_items" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_task_checklist_task_position" ON "task_checklist_items"("taskId", "position");
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "professional_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "task_notes" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "type" "TaskNoteType" NOT NULL,
    "content" VARCHAR(5000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "task_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_task_notes_taskId" ON "task_notes"("taskId");
CREATE INDEX "IDX_task_notes_authorId" ON "task_notes"("authorId");
CREATE INDEX "IDX_task_notes_type" ON "task_notes"("type");
CREATE INDEX "IDX_task_notes_readAt" ON "task_notes"("readAt");
CREATE INDEX "IDX_task_notes_task_type_readAt" ON "task_notes"("taskId", "type", "readAt");
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "professional_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
