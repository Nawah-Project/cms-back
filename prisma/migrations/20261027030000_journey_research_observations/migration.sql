CREATE TABLE "ux_journey_observations" (
 "id" UUID NOT NULL, "node_code" VARCHAR(50) NOT NULL, "group_id" UUID, "subject_user_id" UUID,
 "title" VARCHAR(140) NOT NULL, "hypothesis" VARCHAR(1500) NOT NULL, "next_action" VARCHAR(700) NOT NULL,
 "category" VARCHAR(20) NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN', "owner_id" UUID, "author_id" UUID NOT NULL,
 "evidence" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ux_journey_observations_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ux_journey_observations_status_check" CHECK ("status" IN ('OPEN','VALIDATING','RESOLVED')),
 CONSTRAINT "ux_journey_observations_category_check" CHECK ("category" IN ('FRICTION','OPPORTUNITY','QUESTION'))
);
CREATE INDEX "ux_journey_observations_node_code_created_at_idx" ON "ux_journey_observations"("node_code", "created_at" DESC);
CREATE INDEX "ux_journey_observations_group_id_status_idx" ON "ux_journey_observations"("group_id", "status");
