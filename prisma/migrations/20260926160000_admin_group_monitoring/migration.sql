CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

ALTER TABLE "users"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

CREATE INDEX "IDX_applications_createdAt"
ON "applications"("createdAt");
