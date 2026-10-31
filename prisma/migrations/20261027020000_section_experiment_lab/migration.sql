CREATE TABLE "ux_lab_releases" (
 "id" UUID NOT NULL, "section" VARCHAR(40) NOT NULL, "version" VARCHAR(10) NOT NULL,
 "created_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ux_lab_releases_pkey" PRIMARY KEY ("id"), CONSTRAINT "ux_lab_release_version" CHECK ("version" IN ('A','B'))
);
CREATE INDEX "ux_lab_releases_section_created_at_idx" ON "ux_lab_releases"("section", "created_at" DESC);
CREATE TABLE "ux_lab_experiments" (
 "id" UUID NOT NULL, "title" VARCHAR(120) NOT NULL, "hypothesis" VARCHAR(1000) NOT NULL,
 "section" VARCHAR(40) NOT NULL, "treatment" VARCHAR(10) NOT NULL DEFAULT 'B',
 "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT', "audience" VARCHAR(10) NOT NULL DEFAULT 'ALL',
 "group_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[], "user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
 "allocation" INTEGER NOT NULL DEFAULT 50, "primary_metric" VARCHAR(40) NOT NULL, "min_sample" INTEGER NOT NULL DEFAULT 30,
 "created_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "started_at" TIMESTAMP(3), "ended_at" TIMESTAMP(3),
 CONSTRAINT "ux_lab_experiments_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ux_lab_experiment_status" CHECK ("status" IN ('DRAFT','RUNNING','PAUSED','COMPLETED')),
 CONSTRAINT "ux_lab_experiment_allocation" CHECK ("allocation" BETWEEN 10 AND 90 AND "min_sample" BETWEEN 10 AND 10000),
 CONSTRAINT "ux_lab_experiment_audience" CHECK ("audience" IN ('ALL','GROUPS','USERS'))
);
CREATE INDEX "ux_lab_experiments_section_status_idx" ON "ux_lab_experiments"("section", "status");
CREATE UNIQUE INDEX "ux_lab_one_running_per_section" ON "ux_lab_experiments"("section") WHERE "status" = 'RUNNING';
CREATE TABLE "ux_lab_assignments" (
 "id" UUID NOT NULL, "experiment_id" UUID NOT NULL, "user_id" UUID NOT NULL, "version" VARCHAR(10) NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ux_lab_assignments_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ux_lab_assignments_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "ux_lab_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ux_lab_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ux_lab_assignments_experiment_id_user_id_key" ON "ux_lab_assignments"("experiment_id", "user_id");
CREATE TABLE "ux_lab_events" (
 "id" UUID NOT NULL, "user_id" UUID NOT NULL, "session_id" UUID NOT NULL, "group_id" UUID,
 "section" VARCHAR(40) NOT NULL, "version" VARCHAR(10) NOT NULL, "context" VARCHAR(100) NOT NULL,
 "name" VARCHAR(40) NOT NULL, "duration" INTEGER NOT NULL DEFAULT 0,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ux_lab_events_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ux_lab_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ux_lab_events_duration" CHECK ("duration" BETWEEN 0 AND 15)
);
CREATE INDEX "ux_lab_events_created_at_section_idx" ON "ux_lab_events"("created_at", "section");
CREATE INDEX "ux_lab_events_context_user_id_session_id_name_idx" ON "ux_lab_events"("context", "user_id", "session_id", "name");
