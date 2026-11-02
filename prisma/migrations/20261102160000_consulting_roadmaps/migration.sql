-- Additive consultant-only preparation; existing cases and Journey tables untouched.
CREATE TABLE "CareerConsultingRoadmap" (
 "id" UUID NOT NULL,
 "ownerId" UUID NOT NULL,
 "title" VARCHAR(160) NOT NULL,
 "content" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1,
 "requestId" UUID NOT NULL,
 "requestHash" TEXT NOT NULL,
 "lastRequestId" UUID,
 "lastRequestHash" TEXT,
 "retentionUntil" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CareerConsultingRoadmap_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CareerConsultingRoadmap_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CareerConsultingRoadmap_ownerId_requestId_key" ON "CareerConsultingRoadmap"("ownerId", "requestId");
CREATE INDEX "CareerConsultingRoadmap_ownerId_updatedAt_idx" ON "CareerConsultingRoadmap"("ownerId", "updatedAt");
CREATE INDEX "CareerConsultingRoadmap_retentionUntil_idx" ON "CareerConsultingRoadmap"("retentionUntil");
