-- Additive: existing programme, consulting, archive, and user data are untouched.
CREATE TABLE "founder_workspaces" (
  "id" UUID NOT NULL, "owner_id" UUID NOT NULL, "title" VARCHAR(200) NOT NULL,
  "document" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0,
  "create_request_id" UUID NOT NULL, "create_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "founder_workspaces_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "founder_workspace_mutations" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "request_id" UUID NOT NULL,
  "hash" VARCHAR(64) NOT NULL, "revision" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "founder_workspace_mutations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "founder_workspaces_owner_id_create_request_id_key" ON "founder_workspaces"("owner_id", "create_request_id");
CREATE INDEX "founder_workspaces_owner_id_updated_at_idx" ON "founder_workspaces"("owner_id", "updated_at");
CREATE UNIQUE INDEX "founder_workspace_mutations_workspace_id_request_id_key" ON "founder_workspace_mutations"("workspace_id", "request_id");
ALTER TABLE "founder_workspaces" ADD CONSTRAINT "founder_workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "founder_workspace_mutations" ADD CONSTRAINT "founder_workspace_mutations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "founder_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
