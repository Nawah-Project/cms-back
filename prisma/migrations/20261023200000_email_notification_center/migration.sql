-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('VERIFICATION_OTP', 'MENTOR_DIRECT', 'SYSTEM_ANNOUNCEMENT', 'TEST_EMAIL', 'VERIFICATION_REMINDER');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('DELIVERED', 'FAILED', 'PENDING');

-- CreateTable
CREATE TABLE "email_delivery_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "recipientEmail" VARCHAR(255) NOT NULL,
    "recipientName" VARCHAR(255),
    "subject" VARCHAR(500) NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "type" "EmailType" NOT NULL DEFAULT 'SYSTEM_ANNOUNCEMENT',
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_configs" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'default',
    "dailyEmailLimit" INTEGER NOT NULL DEFAULT 100,
    "monthlyEmailLimit" INTEGER NOT NULL DEFAULT 3000,
    "otpSafeReserve" INTEGER NOT NULL DEFAULT 15,
    "otpSafeReserveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_configs_pkey" PRIMARY KEY ("id")
);

-- Insert default config
INSERT INTO "notification_configs" ("id", "dailyEmailLimit", "monthlyEmailLimit", "otpSafeReserve", "otpSafeReserveEnabled", "updatedAt")
VALUES ('default', 100, 3000, 15, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE INDEX "email_delivery_logs_userId_createdAt_idx" ON "email_delivery_logs"("userId", "createdAt" DESC);
CREATE INDEX "email_delivery_logs_type_createdAt_idx" ON "email_delivery_logs"("type", "createdAt" DESC);
CREATE INDEX "email_delivery_logs_status_createdAt_idx" ON "email_delivery_logs"("status", "createdAt" DESC);
CREATE INDEX "email_delivery_logs_createdAt_idx" ON "email_delivery_logs"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

