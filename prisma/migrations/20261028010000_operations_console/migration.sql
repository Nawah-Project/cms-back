CREATE TABLE "operations_settings" ("id" TEXT PRIMARY KEY DEFAULT 'main', "revision" INTEGER NOT NULL DEFAULT 0, "value" JSONB NOT NULL, "updated_by" UUID, "updated_at" TIMESTAMP(3) NOT NULL);
CREATE TABLE "operations_samples" ("id" UUID PRIMARY KEY, "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "value" JSONB NOT NULL);
CREATE INDEX "operations_samples_captured_at_idx" ON "operations_samples"("captured_at");
CREATE TABLE "operations_settings_audit" ("id" UUID PRIMARY KEY, "actor_id" UUID NOT NULL, "revision" INTEGER NOT NULL, "previous" JSONB NOT NULL, "next" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "operations_settings_audit_created_at_idx" ON "operations_settings_audit"("created_at");
