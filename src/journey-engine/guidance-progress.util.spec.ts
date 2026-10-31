import type { UserJourneyState } from '@prisma/client';
import { guidanceProgress } from './guidance-progress.util';
const code = 'INSIGHT_TASK_0_CV_BASE';
const start = new Date('2026-10-20T10:00:00Z');
const state = (patch: Partial<UserJourneyState> = {}) => ({ currentWeek: 0, currentNodeCode: 'TASK_0', completedNodeCodes: [], unlockedInsightCodes: [], readInsightCodes: [], hasUnlockedAdvPrep: false, cvVersionNumber: 1, cvFoundationBaselineVersion: 1, week1StartedAt: start, cvFoundationCompletedAt: null, ...patch } as UserJourneyState);
const node = { weekNumber: 1, nodeType: 'MAIN_QUEST' };
describe('Guidance audience and real completion', () => {
  it('does not call a registered or Task 0 member eligible for the foundation', () => {
    expect(guidanceProgress(code, null, []).available).toBe(false);
    expect(guidanceProgress(code, state(), []).available).toBe(false);
  });
  it('places an unlocked foundation before the next application quest', () => {
    expect(guidanceProgress(code, state({ currentWeek: 1, currentNodeCode: 'W1_M1', completedNodeCodes: ['TASK_0'] }), [], [], false, node)).toMatchObject({ available: true, pending: true, blocking: true, completed: false });
  });
  it('a read receipt alone cannot complete the mandatory CV update', () => {
    expect(guidanceProgress(code, state({ currentWeek: 1, readInsightCodes: [code] }), [], [code], false, node)).toMatchObject({ read: true, completed: false, pending: true });
  });
  it('requires a qualifying updated CV and the saved completion evidence', () => {
    const cvs = [{ versionNumber: 2, uploadedAt: new Date('2026-10-21T10:00:00Z') }];
    expect(guidanceProgress(code, state({ currentWeek: 1 }), cvs).completed).toBe(false);
    expect(guidanceProgress(code, state({ currentWeek: 1, readInsightCodes: [code] }), cvs)).toMatchObject({ completed: true, pending: false, blocking: false });
    expect(guidanceProgress(code, state({ currentWeek: 1, readInsightCodes: [code] }), [{ versionNumber: 2, uploadedAt: new Date('2026-10-19T10:00:00Z') }]).completed).toBe(false);
  });
  it('deduplicates saved read evidence and does not unlock a guide by week alone', () => {
    const other = 'INSIGHT_W1_INTERVIEW_BASIC';
    expect(guidanceProgress(other, state({ currentWeek: 4 }), [], [other]).available).toBe(false);
    expect(guidanceProgress(other, state({ unlockedInsightCodes: [other] }), [], [other, other])).toMatchObject({ read: true, completed: true, blocking: false });
  });
  it('keeps conditional advanced guidance conditional', () => {
    const advanced = 'INSIGHT_INTERVIEW_ADVANCED';
    expect(guidanceProgress(advanced, state({ currentWeek: 4 }), [], [], true).available).toBe(false);
    expect(guidanceProgress(advanced, state({ hasUnlockedAdvPrep: true }), [], [], true).available).toBe(true);
  });
});
