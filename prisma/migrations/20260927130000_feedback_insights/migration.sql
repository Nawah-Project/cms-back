CREATE TYPE "FeedbackVisibility" AS ENUM ('DIRECT', 'GROUP', 'ALL');
CREATE TYPE "FeedbackContext" AS ENUM ('APPLICATION', 'INTERVIEW', 'WAITING', 'DECISION', 'GENERAL');
CREATE TYPE "FeedbackTag" AS ENUM ('INTERVIEW', 'CV', 'COMMUNICATION', 'TECHNICAL', 'APPLICATIONS', 'LEARNING', 'GENERAL');

CREATE TABLE "feedback_posts" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" VARCHAR(20000) NOT NULL,
    "visibility" "FeedbackVisibility" NOT NULL,
    "groupId" UUID,
    "targetUserId" UUID,
    "context" "FeedbackContext" NOT NULL DEFAULT 'GENERAL',
    "tags" "FeedbackTag"[] NOT NULL DEFAULT ARRAY[]::"FeedbackTag"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "feedback_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feedback_posts_audience_check" CHECK (
      ("visibility" = 'DIRECT' AND "targetUserId" IS NOT NULL AND "groupId" IS NULL) OR
      ("visibility" = 'GROUP' AND "groupId" IS NOT NULL AND "targetUserId" IS NULL) OR
      ("visibility" = 'ALL' AND "groupId" IS NULL AND "targetUserId" IS NULL)
    )
);

CREATE TABLE "feedback_resources" (
    "id" UUID NOT NULL,
    "feedbackId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "type" VARCHAR(50),
    "description" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_resources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedback_reads" (
    "id" UUID NOT NULL,
    "feedbackId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UQ_feedback_reads_feedback_user" ON "feedback_reads"("feedbackId", "userId");
CREATE INDEX "IDX_feedback_reads_user_readAt" ON "feedback_reads"("userId", "readAt");
CREATE INDEX "IDX_feedback_reads_feedbackId" ON "feedback_reads"("feedbackId");
CREATE INDEX "IDX_feedback_posts_authorId" ON "feedback_posts"("authorId");
CREATE INDEX "IDX_feedback_posts_visibility" ON "feedback_posts"("visibility");
CREATE INDEX "IDX_feedback_posts_groupId" ON "feedback_posts"("groupId");
CREATE INDEX "IDX_feedback_posts_targetUserId" ON "feedback_posts"("targetUserId");
CREATE INDEX "IDX_feedback_posts_publishedAt" ON "feedback_posts"("publishedAt");
CREATE INDEX "IDX_feedback_posts_archivedAt" ON "feedback_posts"("archivedAt");
CREATE INDEX "IDX_feedback_posts_feed" ON "feedback_posts"("visibility", "archivedAt", "publishedAt");
CREATE INDEX "IDX_feedback_posts_group_feed" ON "feedback_posts"("groupId", "archivedAt", "publishedAt");
CREATE INDEX "IDX_feedback_posts_direct_feed" ON "feedback_posts"("targetUserId", "archivedAt", "publishedAt");
CREATE INDEX "IDX_feedback_resources_feedbackId" ON "feedback_resources"("feedbackId");

ALTER TABLE "feedback_posts" ADD CONSTRAINT "feedback_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedback_posts" ADD CONSTRAINT "feedback_posts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "member_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedback_posts" ADD CONSTRAINT "feedback_posts_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedback_resources" ADD CONSTRAINT "feedback_resources_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_reads" ADD CONSTRAINT "feedback_reads_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_reads" ADD CONSTRAINT "feedback_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
