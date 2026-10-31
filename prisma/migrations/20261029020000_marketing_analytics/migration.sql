CREATE TABLE "marketing_events" (
  "id" UUID NOT NULL,
  "visitor_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "path" VARCHAR(300) NOT NULL,
  "utm_source" VARCHAR(120),
  "utm_medium" VARCHAR(120),
  "utm_campaign" VARCHAR(160),
  "utm_content" VARCHAR(160),
  "referrer_host" VARCHAR(180),
  "device_type" VARCHAR(16) NOT NULL,
  "country" VARCHAR(2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_events_created_at_idx" ON "marketing_events"("created_at");
CREATE INDEX "marketing_events_visitor_id_created_at_idx" ON "marketing_events"("visitor_id", "created_at");
CREATE INDEX "marketing_events_session_id_created_at_idx" ON "marketing_events"("session_id", "created_at");
CREATE INDEX "marketing_events_type_created_at_idx" ON "marketing_events"("type", "created_at");
CREATE INDEX "marketing_events_utm_campaign_created_at_idx" ON "marketing_events"("utm_campaign", "created_at");
