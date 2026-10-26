import { buildReportsPayload, type ReportApplication, type ReportStateInput } from './reporting.util';

const at = (value: string) => new Date(value);
const initial: ReportStateInput = { currentNodeCode: 'TASK_0', currentWeek: 0, completedNodeCodes: [], readInsightCodes: [] };
function report(state: Partial<ReportStateInput> = {}) {
  return buildReportsPayload({ applications: [], cvs: [], activities: [], tasks: [], state: { ...initial, ...state } });
}

describe('journey analytics progression and application cohorts', () => {
  it('reveals sections from persisted milestones and never opens free changes before Week 3', () => {
    expect(Object.values(report().analyticsAccess).every(value => !value)).toBe(true);
    expect(report({ completedNodeCodes: ['TASK_0', 'W1_M1'] }).analyticsAccess).toMatchObject({ cv: true, pipeline: true, tailoring: false, publishing: false, freeChanges: false });
    expect(report({ currentWeek: 2, completedNodeCodes: ['W1_REVIEW'] }).analyticsAccess).toMatchObject({ tailoring: true, publishing: false, networking: false, freeChanges: false });
    expect(report({ currentWeek: 3 }).analyticsAccess).toMatchObject({ publishing: true, freeChanges: true, networking: false });
    expect(report({ currentWeek: 4 }).analyticsAccess.networking).toBe(true);
  });

  it('assigns each recorded application once with inclusive starts and exclusive ends, independently of reply dates', () => {
    const application = (id: string, time: string): ReportApplication => ({ id, companyName: `Company ${id}`, jobTitle: 'Engineer', createdAt: at(time), journeyWeek: 1, stage: 'INTERVIEW', outcome: 'NONE', hasAssignment: false, isTailored: true, transitions: [{ fromStage: 'APPLIED', toStage: 'INTERVIEW', outcome: null, changedAt: at('2026-10-20T12:00:00Z') }] });
    const payload = buildReportsPayload({
      applications: [application('before', '2026-10-01T11:59:59Z'), application('first', '2026-10-01T12:00:00Z'), application('second', '2026-10-05T12:00:00Z')],
      cvs: [{ id: 'cv-1', versionNumber: 1, originalName: 'cv.pdf', uploadedAt: at('2026-10-01T12:00:00Z') }],
      activities: [{ id: 'change-1', journeyWeek: 3, type: 'USER_CHANGE', reviewSummary: 'Revised portfolio', postUrl: null, postTopic: null, contactName: null, companyName: null, createdAt: at('2026-10-05T12:00:00Z') }],
      tasks: [], state: { ...initial, currentWeek: 3 },
    });
    expect(payload.periodComparisons.map(p => p.applications.map(a => a.id))).toEqual([['before'], ['first'], ['second']]);
    expect(payload.periodComparisons.map(p => p.metrics.logged)).toEqual([1, 1, 1]);
    expect(payload.periodComparisons[2].id).toBe('USER_CHANGE-change-1');
    expect(payload.periodComparisons[1].applications[0]).toMatchObject({ companyName: 'Company first', jobTitle: 'Engineer' });
    expect(payload.daily.find(p => p.date === '2026-10-20')?.positiveEvents).toBe(3);
  });

  it('exposes future milestone states to admin without marking any completed or unlocking the member', () => {
    const payload = buildReportsPayload({ applications: [], cvs: [], activities: [], tasks: [], state: initial, includeLockedWeeks: true });
    expect(payload.weeklyStages.every(stage => stage.available)).toBe(true);
    expect(payload.weeklyStages.every(stage => !stage.complete)).toBe(true);
    expect(payload.currentWeek).toBe(0);
    expect(payload.completedNodeCodes).toEqual([]);
    expect(payload.analyticsAccess.freeChanges).toBe(false);
    expect(payload.finalAvailable).toBe(false);
  });
});
