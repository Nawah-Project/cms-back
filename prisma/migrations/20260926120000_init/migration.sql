-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'INTERVIEW', 'DECISION', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationOutcome" AS ENUM ('NONE', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationMethod" AS ENUM ('COMPANY_WEBSITE', 'LINKEDIN', 'REFERRAL', 'EMAIL', 'RECRUITMENT_PLATFORM', 'DIRECT_CONTACT', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "applicationDate" TEXT NOT NULL,
    "location" TEXT,
    "applicationMethod" "ApplicationMethod",
    "jobUrl" TEXT,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "outcome" "ApplicationOutcome" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_stage_transitions" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fromStage" "ApplicationStage" NOT NULL,
    "toStage" "ApplicationStage" NOT NULL,
    "outcome" "ApplicationOutcome",
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_stage_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_key" ON "memberships"("userId");

-- CreateIndex
CREATE INDEX "IDX_memberships_group" ON "memberships"("groupId");

-- CreateIndex
CREATE INDEX "IDX_applications_userId" ON "applications"("userId");

-- CreateIndex
CREATE INDEX "IDX_applications_userId_stage" ON "applications"("userId", "stage");

-- CreateIndex
CREATE INDEX "IDX_applications_userId_outcome" ON "applications"("userId", "outcome");

-- CreateIndex
CREATE INDEX "IDX_applications_userId_applicationDate" ON "applications"("userId", "applicationDate");

-- Supports the user's recent applications widget.
CREATE INDEX "IDX_applications_userId_updatedAt" ON "applications"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "IDX_stage_transitions_application" ON "application_stage_transitions"("applicationId");

-- CreateIndex
CREATE INDEX "IDX_stage_transitions_user_changed" ON "application_stage_transitions"("userId", "changedAt");

-- CreateIndex
CREATE INDEX "IDX_stage_transitions_changed" ON "application_stage_transitions"("changedAt");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "member_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_transitions" ADD CONSTRAINT "application_stage_transitions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_transitions" ADD CONSTRAINT "application_stage_transitions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Serialize membership inserts per group and enforce the capacity in the database.
CREATE FUNCTION enforce_group_capacity() RETURNS TRIGGER AS $$
DECLARE
  member_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."groupId" = OLD."groupId" THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM "member_groups" WHERE "id" = NEW."groupId" FOR UPDATE;
  SELECT COUNT(*) INTO member_count FROM "memberships" WHERE "groupId" = NEW."groupId";
  IF member_count >= 10 THEN
    RAISE EXCEPTION 'Group capacity exceeded' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memberships_capacity_guard
BEFORE INSERT OR UPDATE OF "groupId" ON "memberships"
FOR EACH ROW EXECUTE FUNCTION enforce_group_capacity();
