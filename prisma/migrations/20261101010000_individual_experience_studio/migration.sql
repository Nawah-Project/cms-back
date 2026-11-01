-- CreateTable
CREATE TABLE "individual_research_cases" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "allowedAdminIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "title" VARCHAR(160) NOT NULL,
    "goal" VARCHAR(3000) NOT NULL,
    "hypothesis" VARCHAR(3000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "nextStep" VARCHAR(2000),
    "followUpAt" TIMESTAMP(3),
    "consentStatus" VARCHAR(20) NOT NULL DEFAULT 'NOT_RECORDED',
    "consentAt" TIMESTAMP(3),
    "consentMethod" VARCHAR(30),
    "consentEvidence" VARCHAR(2000),
    "consentWithdrawnAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "review" JSONB,
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "individual_research_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "individual_case_sessions" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "goal" VARCHAR(2000) NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "participantStatements" VARCHAR(6000),
    "researcherObservations" VARCHAR(6000),
    "barriers" VARCHAR(3000),
    "hypotheses" VARCHAR(3000),
    "agreements" VARCHAR(3000),
    "nextActions" VARCHAR(3000),
    "outcome" VARCHAR(3000),
    "followUpAt" TIMESTAMP(3),
    "followUpStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "individual_case_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "individual_case_observations" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "sessionId" UUID,
    "kind" VARCHAR(30) NOT NULL,
    "lens" VARCHAR(30) NOT NULL DEFAULT 'OTHER',
    "content" VARCHAR(6000) NOT NULL,
    "evidence" VARCHAR(3000),
    "status" VARCHAR(25) NOT NULL DEFAULT 'NEEDS_EVIDENCE',
    "isBarrier" BOOLEAN NOT NULL DEFAULT false,
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "individual_case_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "individual_case_plan_items" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "goal" VARCHAR(2000),
    "activity" VARCHAR(3000),
    "completionCondition" VARCHAR(2000) NOT NULL,
    "resourceUrl" VARCHAR(2048),
    "nodeCode" VARCHAR(100),
    "taskId" UUID,
    "feedbackId" UUID,
    "dueAt" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "individual_case_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "individual_access_overrides" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "resourceType" VARCHAR(40) NOT NULL,
    "resourceId" VARCHAR(100) NOT NULL,
    "permission" VARCHAR(10) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "issuedBy" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "individual_access_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "individual_case_events" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entityId" UUID,
    "requestId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "individual_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "individual_research_cases_requestId_key" ON "individual_research_cases"("requestId");

-- CreateIndex
CREATE INDEX "individual_research_cases_userId_status_idx" ON "individual_research_cases"("userId", "status");

-- CreateIndex
CREATE INDEX "individual_research_cases_ownerId_updatedAt_idx" ON "individual_research_cases"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "individual_research_cases_retentionUntil_idx" ON "individual_research_cases"("retentionUntil");

-- CreateIndex
CREATE UNIQUE INDEX "individual_case_sessions_caseId_requestId_key" ON "individual_case_sessions"("caseId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "individual_case_observations_caseId_requestId_key" ON "individual_case_observations"("caseId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "individual_case_plan_items_caseId_requestId_key" ON "individual_case_plan_items"("caseId", "requestId");

-- CreateIndex
CREATE INDEX "individual_access_overrides_userId_resourceType_resourceId__idx" ON "individual_access_overrides"("userId", "resourceType", "resourceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "individual_access_overrides_caseId_requestId_key" ON "individual_access_overrides"("caseId", "requestId");

-- CreateIndex
CREATE INDEX "individual_case_events_caseId_createdAt_idx" ON "individual_case_events"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "individual_case_events_caseId_requestId_key" ON "individual_case_events"("caseId", "requestId");

-- AddForeignKey
ALTER TABLE "individual_research_cases" ADD CONSTRAINT "individual_research_cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_research_cases" ADD CONSTRAINT "individual_research_cases_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_case_sessions" ADD CONSTRAINT "individual_case_sessions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "individual_research_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_case_observations" ADD CONSTRAINT "individual_case_observations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "individual_research_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_case_observations" ADD CONSTRAINT "individual_case_observations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "individual_case_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_case_plan_items" ADD CONSTRAINT "individual_case_plan_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "individual_research_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_case_plan_items" ADD CONSTRAINT "individual_case_plan_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "professional_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_case_plan_items" ADD CONSTRAINT "individual_case_plan_items_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_access_overrides" ADD CONSTRAINT "individual_access_overrides_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "individual_research_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_access_overrides" ADD CONSTRAINT "individual_access_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_case_events" ADD CONSTRAINT "individual_case_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "individual_research_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

