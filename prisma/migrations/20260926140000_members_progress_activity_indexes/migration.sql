CREATE INDEX "IDX_applications_userId_companyName"
ON "applications"("userId", "companyName");

CREATE INDEX "IDX_stage_transitions_application_changed"
ON "application_stage_transitions"("applicationId", "changedAt");
