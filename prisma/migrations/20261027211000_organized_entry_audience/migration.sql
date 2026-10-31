ALTER TABLE "ux_lab_experiments" DROP CONSTRAINT "ux_lab_experiment_audience";
ALTER TABLE "ux_lab_experiments" ADD CONSTRAINT "ux_lab_experiment_audience" CHECK ("audience" IN ('ALL','GROUPS','USERS','ENTRY'));
ALTER TABLE "ux_lab_experiments" ADD CONSTRAINT "ux_lab_organized_entry_policy" CHECK (
  "audience" <> 'ENTRY' OR ("section"='home' AND "allocation"=50 AND "primary_metric"='home_task_zero_completed' AND cardinality("group_ids")=0 AND cardinality("user_ids")=0)
);
