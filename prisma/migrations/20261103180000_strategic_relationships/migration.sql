-- Additive: existing programme, consulting, archive, and user data are untouched.
CREATE TABLE "strategic_relationship_workspaces" (
  "id" UUID NOT NULL, "owner_id" UUID NOT NULL, "title" VARCHAR(200) NOT NULL,
  "document" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0,
  "create_request_id" UUID NOT NULL, "create_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "strategic_relationship_workspaces_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "strategic_relationship_mutations" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "request_id" UUID NOT NULL,
  "hash" VARCHAR(64) NOT NULL, "revision" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategic_relationship_mutations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "strategic_relationship_workspaces_owner_id_create_request_id_key" ON "strategic_relationship_workspaces"("owner_id", "create_request_id");
CREATE INDEX "strategic_relationship_workspaces_owner_id_updated_at_idx" ON "strategic_relationship_workspaces"("owner_id", "updated_at");
CREATE UNIQUE INDEX "strategic_relationship_mutations_workspace_id_request_id_key" ON "strategic_relationship_mutations"("workspace_id", "request_id");
ALTER TABLE "strategic_relationship_workspaces" ADD CONSTRAINT "strategic_relationship_workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategic_relationship_mutations" ADD CONSTRAINT "strategic_relationship_mutations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "strategic_relationship_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "strategic_relationship_workspaces_owner_id_key" ON "strategic_relationship_workspaces"("owner_id");
