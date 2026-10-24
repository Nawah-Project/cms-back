-- Align historical notifications with their exact frontend destination
UPDATE "notifications"
SET "actionUrl" = '/journey/tasks'
WHERE "type" = 'QUEST_UNLOCKED' AND ("actionUrl" = '/applications' OR "actionUrl" IS NULL);

UPDATE "notifications"
SET "actionUrl" = '/professional-development/feedback'
WHERE "type" IN ('INSIGHT_UNLOCKED', 'INTERVIEW_PREP');

