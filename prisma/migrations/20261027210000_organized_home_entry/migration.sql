ALTER TABLE "ux_lab_experiments" ADD COLUMN "entry_sequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ux_lab_experiments" ADD CONSTRAINT "ux_lab_entry_sequence_nonnegative" CHECK ("entry_sequence" >= 0);
