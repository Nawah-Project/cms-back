ALTER TABLE "users"
ADD COLUMN "portfolioUrl" VARCHAR(2048);

CREATE TABLE "user_cvs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" VARCHAR(64) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cvs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_cvs_userId_key" ON "user_cvs"("userId");
CREATE UNIQUE INDEX "user_cvs_storageKey_key" ON "user_cvs"("storageKey");

ALTER TABLE "user_cvs"
ADD CONSTRAINT "user_cvs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
