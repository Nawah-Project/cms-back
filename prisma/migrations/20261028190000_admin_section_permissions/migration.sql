ALTER TABLE "users" ADD COLUMN "admin_permissions" JSONB;
ALTER TABLE "users" ADD COLUMN "is_root_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "is_root_admin" = true
WHERE lower("email") = lower('hussainfathy911@gmail.com')
  AND "role" = 'ADMIN'::"UserRole";

UPDATE "users"
SET "admin_permissions" = '{"UX_LAB":"READ"}'::jsonb
WHERE lower("email") = lower('ro2aaelshazly@gmail.com')
  AND "role" = 'ADMIN'::"UserRole";

CREATE TABLE "admin_permission_audits" (
  "id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "target_id" UUID NOT NULL,
  "previous" JSONB,
  "next" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_permission_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_permission_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_permission_audits_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "admin_permission_audits_target_id_created_at_idx" ON "admin_permission_audits"("target_id", "created_at" DESC);
CREATE INDEX "admin_permission_audits_actor_id_created_at_idx" ON "admin_permission_audits"("actor_id", "created_at" DESC);
