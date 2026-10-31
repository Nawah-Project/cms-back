-- Earlier deployments created these optional experiment overrides directly.
-- Keep existing choices and allow a clean database to match the Prisma model.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ux_variant" VARCHAR(10);
ALTER TABLE "member_groups" ADD COLUMN IF NOT EXISTS "ux_variant" VARCHAR(10);
