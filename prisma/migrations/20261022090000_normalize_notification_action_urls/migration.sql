-- Notifications store frontend paths, not backend API endpoints.
-- Correct historical links to the canonical routes used by the current UI.
UPDATE "notifications"
SET "actionUrl" = '/members-progress'
WHERE "actionUrl" = '/members';

UPDATE "notifications"
SET "actionUrl" = '/professional-development/feedback'
WHERE "actionUrl" = '/professional-development/feedback-insights';
