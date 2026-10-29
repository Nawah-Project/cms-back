ALTER TABLE "marketing_events" ADD COLUMN "conversion_key" VARCHAR(64);
CREATE UNIQUE INDEX "marketing_events_conversion_key_key" ON "marketing_events"("conversion_key");
