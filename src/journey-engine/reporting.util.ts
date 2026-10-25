/** Cohort metrics describe recorded evidence as of now, not response dates. */
export interface ReportApplication {
  stage: string; outcome: string; hasAssignment: boolean; isTailored: boolean;
  journeyWeek: number; createdAt: Date;
  transitions: { fromStage: string; toStage: string; outcome: string | null; changedAt: Date }[];
}
export const reportApplicationSelect = {
  stage: true, outcome: true, hasAssignment: true, isTailored: true,
  journeyWeek: true, createdAt: true,
  transitions: { select: { fromStage: true, toStage: true, outcome: true, changedAt: true } },
} as const;
export function applicationEvidence(app: ReportApplication) {
  const reached = (stage: string) => app.stage === stage || app.transitions.some(t => t.fromStage === stage || t.toStage === stage);
  const interview = reached('INTERVIEW');
  const assignment = app.hasAssignment || reached('ASSIGNMENT');
  const unknownInterview = !interview && app.stage !== 'APPLIED';
  const positive = !['NO_RESPONSE', 'WITHDRAWN'].includes(app.outcome) &&
    (interview || assignment || reached('DECISION') || app.outcome === 'ACCEPTED');
  return { interview, assignment, positive, unknownInterview };
}
export function reportMetrics(apps: ReportApplication[]) {
  let tailored=0, positive=0, interviews=0, assignments=0, unknownInterviews=0;
  let rejected=0, withdrawn=0, noResponse=0, accepted=0;
  for(const app of apps) {
    const e=applicationEvidence(app);
    tailored+=Number(app.isTailored); positive+=Number(e.positive);
    interviews+=Number(e.interview); assignments+=Number(e.assignment); unknownInterviews+=Number(e.unknownInterview);
    rejected+=Number(app.outcome==='REJECTED'); withdrawn+=Number(app.outcome==='WITHDRAWN');
    noResponse+=Number(app.outcome==='NO_RESPONSE'); accepted+=Number(app.outcome==='ACCEPTED');
  }
  return { logged:apps.length, tailored, positive, interviews, assignments, unknownInterviews,
    rejected, withdrawn, noResponse, accepted,
    positiveRate: apps.length ? Math.round(positive/apps.length*10000)/100 : null };
}
export function isJourneyComplete(codes: readonly string[]) { return codes.includes('FINAL_REPORT'); }
