import { isWeeklyReflection } from './journey-rules';

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
  let decisions=0;
  const stages = { APPLIED: 0, ASSIGNMENT: 0, INTERVIEW: 0, DECISION: 0, CLOSED: 0 };
  const outcomes = { NONE: 0, ACCEPTED: 0, REJECTED: 0, WITHDRAWN: 0, NO_RESPONSE: 0 };
  for(const app of apps) {
    const e=applicationEvidence(app);
    tailored+=Number(app.isTailored); positive+=Number(e.positive);
    interviews+=Number(e.interview); assignments+=Number(e.assignment); unknownInterviews+=Number(e.unknownInterview);
    if (app.stage in stages) stages[app.stage as keyof typeof stages]++;
    if (app.outcome in outcomes) outcomes[app.outcome as keyof typeof outcomes]++;
    decisions+=Number(app.stage === 'DECISION' || app.outcome === 'ACCEPTED' || app.transitions.some(t => t.fromStage === 'DECISION' || t.toStage === 'DECISION'));
    rejected+=Number(app.outcome==='REJECTED'); withdrawn+=Number(app.outcome==='WITHDRAWN');
    noResponse+=Number(app.outcome==='NO_RESPONSE'); accepted+=Number(app.outcome==='ACCEPTED');
  }
  return { logged:apps.length, tailored, positive, interviews, assignments, unknownInterviews,
    rejected, withdrawn, noResponse, accepted,
    positiveRate: apps.length ? Math.round(positive/apps.length*10000)/100 : null,
    stages, outcomes, milestones: { assignments, interviews, decisions } };
}
export function isJourneyComplete(codes: readonly string[]) { return codes.includes('FINAL_REPORT'); }

export interface ReportActivityInput {
  id: string;
  journeyWeek: number;
  type: string;
  reviewSummary: string | null;
  postUrl: string | null;
  postTopic: string | null;
  contactName: string | null;
  companyName: string | null;
  createdAt: Date;
}

export interface ReportCvInput {
  id: string;
  versionNumber: number;
  originalName: string;
  uploadedAt: Date;
}

export interface ReportTaskInput {
  id: string;
  title: string;
  completedAt: Date | null;
}

export interface ReportStateInput {
  readInsightCodes: string[];
  completedNodeCodes: string[];
  currentNodeCode: string;
  currentWeek: number;
  week1StartedAt?: Date | null;
}

export function buildReportsPayload(input: {
  applications: ReportApplication[];
  activities: ReportActivityInput[];
  cvs: ReportCvInput[];
  tasks: ReportTaskInput[];
  state: ReportStateInput;
  asOf?: Date;
}) {
  const asOf = input.asOf ?? new Date();
  const activityCounts = (week?: number) => {
    const rows = input.activities.filter(
      (activity) => week === undefined || activity.journeyWeek === week,
    );
    return {
      posts: rows.filter((activity) => activity.type === 'LINKEDIN_POST').length,
      outreach: rows.filter((activity) => activity.type === 'OUTREACH_CONTACT').length,
      reviews: rows.filter(
        (activity) =>
          activity.type === 'WEEKLY_REVIEW' &&
          isWeeklyReflection(activity.reviewSummary),
      ).length,
    };
  };

  const days = new Map<
    string,
    { date: string; logged: number; positiveEvents: number }
  >();
  const day = (date: Date) => {
    const key = date.toISOString().slice(0, 10);
    if (!days.has(key)) days.set(key, { date: key, logged: 0, positiveEvents: 0 });
    return days.get(key)!;
  };
  for (const application of input.applications) {
    day(application.createdAt).logged++;
    // Events use actual transition dates; missing history is not inferred.
    for (const transition of application.transitions) {
      if (
        ['ASSIGNMENT', 'INTERVIEW', 'DECISION'].includes(transition.toStage) ||
        transition.outcome === 'ACCEPTED'
      ) {
        day(transition.changedAt).positiveEvents++;
      }
    }
  }

  // Periods group applications by their creation timestamps between persisted
  // CV uploads and explicit USER_CHANGE records. Outcomes are current as-of
  // this snapshot and are not attributed to the checkpoint.
  const checkpoints = [
    ...input.cvs.map(cv => ({ kind: 'CV' as const, title: `CV v${cv.versionNumber}`, at: cv.uploadedAt })),
    ...input.activities.filter(activity => activity.type === 'USER_CHANGE').map((activity, index) => ({
      kind: 'USER_CHANGE' as const, title: `Manual change ${index + 1}`, at: activity.createdAt,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || a.kind.localeCompare(b.kind));
  const periodComparisons: {
    id: string;
    kind: 'BEFORE_FIRST_CHECKPOINT' | 'CV' | 'USER_CHANGE';
    title: string;
    startAt: Date;
    endAt: Date | null;
    metrics: ReturnType<typeof reportMetrics>;
  }[] = [];
  if (checkpoints.length) {
    const firstAt = checkpoints[0].at;
    const before = input.applications.filter(app => app.createdAt < firstAt);
    if (before.length) {
      const startAt = before.reduce((earliest, app) => app.createdAt < earliest ? app.createdAt : earliest, before[0].createdAt);
      periodComparisons.push({ id: 'before-first-checkpoint', kind: 'BEFORE_FIRST_CHECKPOINT', title: 'Before first recorded checkpoint', startAt, endAt: firstAt, metrics: reportMetrics(before) });
    }
    checkpoints.forEach((checkpoint, index) => {
      const next = checkpoints[index + 1];
      const cohort = input.applications.filter(app => app.createdAt >= checkpoint.at && (!next || app.createdAt < next.at));
      periodComparisons.push({
        id: `checkpoint-${index + 1}`, kind: checkpoint.kind, title: checkpoint.title,
        startAt: checkpoint.at, endAt: next?.at ?? null, metrics: reportMetrics(cohort),
      });
    });
  }

  return {
    asOf,
    overall: {
      ...reportMetrics(input.applications),
      ...activityCounts(),
    },
    weeks: [0, 1, 2, 3, 4].map((week) => ({
      week,
      ...reportMetrics(
        input.applications.filter((application) => application.journeyWeek === week),
      ),
      ...activityCounts(week),
    })),
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    periodComparisons,
    cvs: input.cvs,
    tasks: input.tasks,
    activities: input.activities.map((activity) => ({
      id: activity.id,
      week: activity.journeyWeek,
      type: activity.type,
      summary: activity.reviewSummary,
      postUrl: activity.postUrl,
      postTopic: activity.postTopic,
      contactName: activity.contactName,
      companyName: activity.companyName,
      createdAt: activity.createdAt,
      legacyChange:
        activity.type === 'WEEKLY_REVIEW' &&
        !isWeeklyReflection(activity.reviewSummary),
    })),
    readInsightCodes: input.state.readInsightCodes,
    completedNodeCodes: input.state.completedNodeCodes,
    currentNodeCode: input.state.currentNodeCode,
    currentWeek: input.state.currentWeek,
    week1StartedAt: input.state.week1StartedAt ?? null,
    finalAvailable: input.state.currentNodeCode === 'FINAL_REPORT',
    completed: isJourneyComplete(input.state.completedNodeCodes),
  };
}

/** Deterministic in-memory fixture. It deliberately has no persistence dependency. */
export function buildDemoReports() {
  const date = (value: string) => new Date(`${value}T12:00:00.000Z`);
  const application = (
    id: string,
    journeyWeek: number,
    createdAt: string,
    fields: Omit<ReportApplication, 'journeyWeek' | 'createdAt'>,
  ): ReportApplication => ({
    ...fields,
    journeyWeek,
    createdAt: date(createdAt),
  });
  const applications: ReportApplication[] = [
    // Week 1 intentionally has no applications.
    application('demo-app-01', 2, '2026-10-06', {
      stage: 'APPLIED', outcome: 'NONE', hasAssignment: false, isTailored: false, transitions: [],
    }),
    application('demo-app-02', 2, '2026-10-08', {
      stage: 'APPLIED', outcome: 'NONE', hasAssignment: false, isTailored: true, transitions: [],
    }),
    application('demo-app-03', 3, '2026-10-13', {
      stage: 'ASSIGNMENT', outcome: 'NONE', hasAssignment: true, isTailored: true,
      transitions: [{ fromStage: 'APPLIED', toStage: 'ASSIGNMENT', outcome: null, changedAt: date('2026-10-15') }],
    }),
    application('demo-app-04', 3, '2026-10-14', {
      stage: 'INTERVIEW', outcome: 'NONE', hasAssignment: false, isTailored: true,
      transitions: [{ fromStage: 'APPLIED', toStage: 'INTERVIEW', outcome: null, changedAt: date('2026-10-16') }],
    }),
    // This rejection has no transition history, so interview evidence is unknown.
    application('demo-app-05', 3, '2026-10-15', {
      stage: 'CLOSED', outcome: 'REJECTED', hasAssignment: false, isTailored: false, transitions: [],
    }),
    application('demo-app-06', 4, '2026-10-20', {
      stage: 'DECISION', outcome: 'ACCEPTED', hasAssignment: false, isTailored: true,
      transitions: [
        { fromStage: 'APPLIED', toStage: 'INTERVIEW', outcome: null, changedAt: date('2026-10-22') },
        { fromStage: 'INTERVIEW', toStage: 'DECISION', outcome: 'ACCEPTED', changedAt: date('2026-10-24') },
      ],
    }),
    application('demo-app-07', 4, '2026-10-21', {
      stage: 'CLOSED', outcome: 'REJECTED', hasAssignment: false, isTailored: false, transitions: [],
    }),
    application('demo-app-08', 4, '2026-10-22', {
      stage: 'CLOSED', outcome: 'WITHDRAWN', hasAssignment: false, isTailored: true,
      transitions: [{ fromStage: 'APPLIED', toStage: 'INTERVIEW', outcome: null, changedAt: date('2026-10-23') }],
    }),
    application('demo-app-09', 4, '2026-10-23', {
      stage: 'CLOSED', outcome: 'NO_RESPONSE', hasAssignment: false, isTailored: false, transitions: [],
    }),
  ];
  const activity = (
    id: string,
    journeyWeek: number,
    type: string,
    reviewSummary: string | null,
    createdAt: string,
    extra: Partial<ReportActivityInput> = {},
  ): ReportActivityInput => ({
    id,
    journeyWeek,
    type,
    reviewSummary,
    postUrl: null,
    postTopic: null,
    contactName: null,
    companyName: null,
    createdAt: date(createdAt),
    ...extra,
  });

  return buildReportsPayload({
    applications,
    activities: [
      activity('demo-review-2', 2, 'WEEKLY_REVIEW', 'A steady first full week.', '2026-10-12'),
      activity('demo-review-3', 3, 'WEEKLY_REVIEW', 'Refined the search and practiced interviews.', '2026-10-19'),
      activity('demo-post-3', 3, 'LINKEDIN_POST', null, '2026-10-18', { postTopic: 'Learning in public' }),
      activity('demo-review-4', 4, 'WEEKLY_REVIEW', 'Reviewed outcomes and next steps.', '2026-10-26'),
      activity('demo-outreach-4', 4, 'OUTREACH_CONTACT', null, '2026-10-25', { contactName: 'Demo contact', companyName: 'Demo company' }),
      activity('demo-change-4', 4, 'USER_CHANGE', '{"isUserChange":true,"summary":"Sample manual change"}', '2026-10-25'),
    ],
    cvs: [
      { id: 'demo-cv-1', versionNumber: 1, originalName: 'DEMO-resume-v1.pdf', uploadedAt: date('2026-10-05') },
      { id: 'demo-cv-2', versionNumber: 2, originalName: 'DEMO-resume-v2.pdf', uploadedAt: date('2026-10-20') },
    ],
    tasks: [
      { id: 'demo-task-1', title: 'DEMO: Interview practice', completedAt: date('2026-10-16') },
      { id: 'demo-task-2', title: 'DEMO: Review application outcomes', completedAt: date('2026-10-25') },
    ],
    state: {
      readInsightCodes: ['INSIGHT_TASK_0_CV_BASE', 'INSIGHT_W1_INTERVIEW_BASIC', 'INSIGHT_W3_TIME_MGMT'],
      completedNodeCodes: [
        'TASK_0',
        ...[1, 2, 3, 4].flatMap((week) => [
          ...[1, 2, 3, 4, 5].map((node) => `W${week}_M${node}`),
          ...(week < 4 ? [`W${week}_REVIEW`] : []),
        ]),
        'FINAL_REPORT',
      ],
      currentNodeCode: 'FINAL_REPORT',
      currentWeek: 4,
    },
    asOf: date('2026-10-26'),
  });
}
