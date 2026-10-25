-- The application already supports ASSIGNMENT; fresh PostgreSQL schemas lacked it.
ALTER TYPE "ApplicationStage" ADD VALUE IF NOT EXISTS 'ASSIGNMENT' AFTER 'APPLIED';
