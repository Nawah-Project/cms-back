-- CreateEnum
CREATE TYPE "JourneyNodeType" AS ENUM ('ONBOARDING_QUEST', 'MAIN_QUEST', 'REVIEW_STATION', 'FINAL_REPORT');

-- CreateEnum
CREATE TYPE "SideTaskType" AS ENUM ('LINKEDIN_POST', 'OUTREACH_CONTACT', 'WEEKLY_REVIEW');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('SENT', 'REPLIED', 'REFERRED');

-- AlterTable: users
ALTER TABLE "users"
ADD COLUMN "targetJobTitle" VARCHAR(150),
ADD COLUMN "preferredLocations" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: applications
ALTER TABLE "applications"
ADD COLUMN "isTailored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "journeyWeek" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "hasAssignment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "interviewDate" TIMESTAMP(3),
ADD COLUMN "prepChecklist" JSONB,
ADD COLUMN "interviewNotes" TEXT,
ADD COLUMN "sharedWithGroup" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: feedback_posts
ALTER TABLE "feedback_posts"
ADD COLUMN "unlockTriggerCode" VARCHAR(100),
ADD COLUMN "promptTemplate" TEXT,
ADD COLUMN "tierLevel" TEXT DEFAULT 'BASIC';

-- CreateTable: journey_nodes
CREATE TABLE "journey_nodes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "nodeType" "JourneyNodeType" NOT NULL DEFAULT 'MAIN_QUEST',
    "titleAr" VARCHAR(200) NOT NULL,
    "titleEn" VARCHAR(200) NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "requiredAppsCount" INTEGER NOT NULL DEFAULT 0,
    "requiredTailoredCount" INTEGER NOT NULL DEFAULT 0,
    "requiredPostsCount" INTEGER NOT NULL DEFAULT 0,
    "requiredOutreachCount" INTEGER NOT NULL DEFAULT 0,
    "unlocksInsightCode" VARCHAR(100),
    "nextNodeCode" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journey_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: user_journey_states
CREATE TABLE "user_journey_states" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "currentWeek" INTEGER NOT NULL DEFAULT 0,
    "currentNodeCode" VARCHAR(50) NOT NULL DEFAULT 'TASK_0',
    "currentNodeStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weekStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedNodeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unlockedInsightCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isGroupUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "canUseTableView" BOOLEAN NOT NULL DEFAULT false,
    "hasUnlockedAdvPrep" BOOLEAN NOT NULL DEFAULT false,
    "cvVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_journey_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable: side_task_submissions
CREATE TABLE "side_task_submissions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "nodeCode" VARCHAR(50) NOT NULL,
    "journeyWeek" INTEGER NOT NULL,
    "type" "SideTaskType" NOT NULL,
    "postUrl" VARCHAR(2048),
    "postTopic" VARCHAR(300),
    "applicationId" UUID,
    "contactName" VARCHAR(150),
    "contactRole" VARCHAR(150),
    "contactUrl" VARCHAR(2048),
    "outreachState" "OutreachStatus" DEFAULT 'SENT',
    "reviewSummary" TEXT,
    "newCvUploaded" BOOLEAN NOT NULL DEFAULT false,
    "sharedInGroup" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "side_task_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: domain_event_logs
CREATE TABLE "domain_event_logs" (
    "id" UUID NOT NULL,
    "eventName" VARCHAR(100) NOT NULL,
    "actorId" UUID,
    "targetUserId" UUID,
    "groupId" UUID,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" VARCHAR(100),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notifications
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "titleAr" VARCHAR(255) NOT NULL,
    "titleEn" VARCHAR(255) NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "actionUrl" VARCHAR(500),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journey_nodes_code_key" ON "journey_nodes"("code");

-- CreateIndex
CREATE INDEX "journey_nodes_weekNumber_orderIndex_idx" ON "journey_nodes"("weekNumber", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "user_journey_states_userId_key" ON "user_journey_states"("userId");

-- CreateIndex
CREATE INDEX "side_task_submissions_userId_nodeCode_type_idx" ON "side_task_submissions"("userId", "nodeCode", "type");

-- CreateIndex
CREATE INDEX "side_task_submissions_userId_journeyWeek_idx" ON "side_task_submissions"("userId", "journeyWeek");

-- CreateIndex
CREATE INDEX "domain_event_logs_actorId_createdAt_idx" ON "domain_event_logs"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "domain_event_logs_groupId_createdAt_idx" ON "domain_event_logs"("groupId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "domain_event_logs_eventName_createdAt_idx" ON "domain_event_logs"("eventName", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "user_journey_states" ADD CONSTRAINT "user_journey_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_task_submissions" ADD CONSTRAINT "side_task_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

