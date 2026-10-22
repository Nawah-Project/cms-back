ALTER TYPE "OutreachStatus" ADD VALUE IF NOT EXISTS 'NO_RESPONSE';

ALTER TABLE "side_task_submissions"
ADD COLUMN "companyName" VARCHAR(200),
ADD COLUMN "contactMethod" VARCHAR(100);
