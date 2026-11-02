-- CreateTable
CREATE TABLE "career_consulting_cases" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "allowedAdminIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "title" VARCHAR(160) NOT NULL,
    "purpose" VARCHAR(3000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "consentStatus" VARCHAR(20) NOT NULL DEFAULT 'NOT_ACCEPTED',
    "consentAt" TIMESTAMP(3),
    "consentVersion" VARCHAR(60),
    "withdrawnAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "programmeSharing" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "requestId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_consulting_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_items" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "privateNotes" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_consulting_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_publications" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "revision" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "publishedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_consulting_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_submissions" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "fileIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_consulting_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_reviews" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "nextStep" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_consulting_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_decisions" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "choice" VARCHAR(30) NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_consulting_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_comments" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "targetId" UUID,
    "targetKind" VARCHAR(30) NOT NULL DEFAULT 'CASE',
    "body" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "authorRole" VARCHAR(20) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_consulting_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_files" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(120) NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_consulting_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_events" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "entityId" UUID,
    "requestId" UUID,
    "requestHash" VARCHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_consulting_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_response_drafts" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "fileIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "lastSubmittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_consulting_response_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_consulting_file_deletions" (
    "id" UUID NOT NULL,
    "storageKey" VARCHAR(120) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_consulting_file_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "career_consulting_cases_requestId_key" ON "career_consulting_cases"("requestId");

-- CreateIndex
CREATE INDEX "career_consulting_cases_userId_status_idx" ON "career_consulting_cases"("userId", "status");

-- CreateIndex
CREATE INDEX "career_consulting_cases_ownerId_updatedAt_idx" ON "career_consulting_cases"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "career_consulting_cases_retentionUntil_idx" ON "career_consulting_cases"("retentionUntil");

-- CreateIndex
CREATE INDEX "career_consulting_items_caseId_kind_createdAt_idx" ON "career_consulting_items"("caseId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "career_consulting_publications_caseId_createdAt_idx" ON "career_consulting_publications"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "career_consulting_publications_itemId_revision_key" ON "career_consulting_publications"("itemId", "revision");

-- CreateIndex
CREATE INDEX "career_consulting_submissions_caseId_createdAt_idx" ON "career_consulting_submissions"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "career_consulting_submissions_activityId_version_key" ON "career_consulting_submissions"("activityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "career_consulting_reviews_submissionId_key" ON "career_consulting_reviews"("submissionId");

-- CreateIndex
CREATE INDEX "career_consulting_reviews_caseId_createdAt_idx" ON "career_consulting_reviews"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "career_consulting_decisions_caseId_createdAt_idx" ON "career_consulting_decisions"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "career_consulting_comments_caseId_createdAt_idx" ON "career_consulting_comments"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "career_consulting_files_storageKey_key" ON "career_consulting_files"("storageKey");

-- CreateIndex
CREATE INDEX "career_consulting_files_caseId_createdAt_idx" ON "career_consulting_files"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "career_consulting_events_caseId_createdAt_idx" ON "career_consulting_events"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "career_consulting_events_caseId_requestId_key" ON "career_consulting_events"("caseId", "requestId");

-- CreateIndex
CREATE INDEX "career_consulting_response_drafts_caseId_idx" ON "career_consulting_response_drafts"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "career_consulting_response_drafts_publicationId_createdBy_key" ON "career_consulting_response_drafts"("publicationId", "createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "career_consulting_file_deletions_storageKey_key" ON "career_consulting_file_deletions"("storageKey");

-- CreateIndex
CREATE INDEX "career_consulting_file_deletions_attempts_createdAt_idx" ON "career_consulting_file_deletions"("attempts", "createdAt");

-- AddForeignKey
ALTER TABLE "career_consulting_cases" ADD CONSTRAINT "career_consulting_cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_cases" ADD CONSTRAINT "career_consulting_cases_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_items" ADD CONSTRAINT "career_consulting_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_publications" ADD CONSTRAINT "career_consulting_publications_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_publications" ADD CONSTRAINT "career_consulting_publications_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "career_consulting_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_submissions" ADD CONSTRAINT "career_consulting_submissions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_submissions" ADD CONSTRAINT "career_consulting_submissions_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "career_consulting_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_submissions" ADD CONSTRAINT "career_consulting_submissions_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "career_consulting_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_reviews" ADD CONSTRAINT "career_consulting_reviews_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_reviews" ADD CONSTRAINT "career_consulting_reviews_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "career_consulting_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_decisions" ADD CONSTRAINT "career_consulting_decisions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_decisions" ADD CONSTRAINT "career_consulting_decisions_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "career_consulting_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_comments" ADD CONSTRAINT "career_consulting_comments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_files" ADD CONSTRAINT "career_consulting_files_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_events" ADD CONSTRAINT "career_consulting_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_response_drafts" ADD CONSTRAINT "career_consulting_response_drafts_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "career_consulting_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_consulting_response_drafts" ADD CONSTRAINT "career_consulting_response_drafts_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "career_consulting_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE UNIQUE INDEX "career_consulting_one_work_map" ON "career_consulting_items"("caseId") WHERE kind='WORK';
