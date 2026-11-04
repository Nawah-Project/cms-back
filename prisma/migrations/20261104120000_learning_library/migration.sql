-- CreateTable
CREATE TABLE "learning_library" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_book" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "learning_book_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "learning_edition" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "learning_edition_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "learning_note" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "learning_note_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "learning_map" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "learning_map_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "learning_goal" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "learning_goal_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "learning_reading" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "learning_reading_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "learning_position" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "learning_position_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "learning_mutation" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_mutation_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "learning_asset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "offset" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_library_ownerId_key" ON "learning_library"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "learning_edition_ownerId_fingerprint_key" ON "learning_edition"("ownerId", "fingerprint");

-- CreateIndex
CREATE INDEX "learning_asset_ownerId_status_idx" ON "learning_asset"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "learning_asset_ownerId_editionId_key" ON "learning_asset"("ownerId", "editionId");

