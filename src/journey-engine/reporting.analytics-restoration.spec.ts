import {
  buildReportsPayload,
  reportMetrics,
  type ReportApplication,
} from './reporting.util';

const date = (value: string) => new Date(`${value}T12:00:00.000Z`);
const app = (
  createdAt: string,
  values: Partial<ReportApplication> = {},
): ReportApplication => ({
  stage: 'APPLIED',
  outcome: 'NONE',
  hasAssignment: false,
  isTailored: false,
  journeyWeek: 1,
  createdAt: date(createdAt),
  transitions: [],
  ...values,
});

describe('reporting read model', () => {
  it('keeps current stages, final outcomes, and historical milestones distinct', () => {
    const metrics = reportMetrics([
      app('2026-10-01', {
        stage: 'CLOSED',
        outcome: 'REJECTED',
        transitions: [
          {
            fromStage: 'APPLIED',
            toStage: 'INTERVIEW',
            outcome: null,
            changedAt: date('2026-10-05'),
          },
          {
            fromStage: 'INTERVIEW',
            toStage: 'CLOSED',
            outcome: 'REJECTED',
            changedAt: date('2026-10-10'),
          },
        ],
      }),
      app('2026-10-02', { stage: 'ASSIGNMENT', hasAssignment: true }),
      app('2026-10-03', { stage: 'CLOSED', outcome: 'NO_RESPONSE' }),
    ]);

    expect(metrics.stages).toEqual({
      APPLIED: 0,
      ASSIGNMENT: 1,
      INTERVIEW: 0,
      DECISION: 0,
      CLOSED: 2,
    });
    expect(metrics.outcomes).toEqual({
      NONE: 1,
      ACCEPTED: 0,
      REJECTED: 1,
      WITHDRAWN: 0,
      NO_RESPONSE: 1,
    });
    expect(metrics.milestones).toEqual({
      assignments: 1,
      interviews: 1,
      decisions: 0,
    });
    expect(metrics.positive).toBe(2);
    expect(metrics.positiveRate).toBe(66.67);
  });

  it('builds change periods from persisted CV/user changes and uses application cohorts', () => {
    const report = buildReportsPayload({
      applications: [
        app('2026-10-01'),
        app('2026-10-06', {
          stage: 'INTERVIEW',
          transitions: [
            {
              fromStage: 'APPLIED',
              toStage: 'INTERVIEW',
              outcome: null,
              changedAt: date('2026-10-12'),
            },
          ],
        }),
        app('2026-10-13', { outcome: 'REJECTED' }),
      ],
      activities: [
        {
          id: 'private-change-id',
          journeyWeek: 2,
          type: 'USER_CHANGE',
          reviewSummary: 'Updated portfolio',
          postUrl: null,
          postTopic: null,
          contactName: null,
          companyName: null,
          createdAt: date('2026-10-12'),
        },
        {
          id: 'reflection-id',
          journeyWeek: 2,
          type: 'WEEKLY_REVIEW',
          reviewSummary: 'Reflected on applications',
          postUrl: null,
          postTopic: null,
          contactName: null,
          companyName: null,
          createdAt: date('2026-10-14'),
        },
      ],
      cvs: [
        {
          id: 'cv-1',
          versionNumber: 1,
          originalName: 'resume.pdf',
          uploadedAt: date('2026-10-03'),
        },
        {
          id: 'cv-2',
          versionNumber: 2,
          originalName: 'resume-v2.pdf',
          uploadedAt: date('2026-10-09'),
        },
      ],
      tasks: [],
      state: {
        readInsightCodes: [],
        completedNodeCodes: [],
        currentNodeCode: 'TASK_0',
        currentWeek: 0,
      },
      asOf: date('2026-10-20'),
    });

    expect(
      report.periodComparisons.map((period) => [
        period.kind,
        period.metrics.logged,
      ]),
    ).toEqual([
      ['BEFORE_FIRST_CHECKPOINT', 1],
      ['CV', 1],
      ['CV', 0],
      ['USER_CHANGE', 1],
    ]);
    expect(report.periodComparisons[0].metrics.positiveRate).toBe(0);
    expect(report.periodComparisons[2].endAt).toEqual(date('2026-10-12'));
    expect(report.periodComparisons[3].metrics.positive).toBe(0);
    // Activity timestamps stay distinct: the interview transition is not
    // reassigned to the application cohort's creation date.
    expect(
      report.daily.find((point) => point.date === '2026-10-12')?.positiveEvents,
    ).toBe(1);
    expect(
      report.daily.find((point) => point.date === '2026-10-06')?.positiveEvents,
    ).toBe(0);
  });

  it('does not invent a baseline or change period when no persisted checkpoint exists', () => {
    const report = buildReportsPayload({
      applications: [app('2026-10-01')],
      activities: [],
      cvs: [],
      tasks: [],
      state: {
        readInsightCodes: [],
        completedNodeCodes: [],
        currentNodeCode: 'TASK_0',
        currentWeek: 0,
      },
      asOf: date('2026-10-20'),
    });

    expect(report.periodComparisons).toEqual([]);
  });
});
