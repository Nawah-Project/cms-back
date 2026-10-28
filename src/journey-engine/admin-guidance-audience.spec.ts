import { JourneyEngineService } from './journey-engine.service';
import { RESEARCH_TEST_USER_ID } from './guidance-progress.util';
const code = 'INSIGHT_TASK_0_CV_BASE';
const baseState = { currentWeek: 0, currentNodeCode: 'TASK_0', unlockedInsightCodes: [], completedNodeCodes: [], readInsightCodes: [], cvVersionNumber: 1, cvFoundationBaselineVersion: 1, cvFoundationCompletedAt: null, week1StartedAt: new Date('2026-10-20'), hasUnlockedAdvPrep: false };
describe('Admin guidance audience', () => {
  it('counts eligible people, exposes their identities and separates reads from required application', async () => {
    const users = [
      { id: 'not-started', name: 'New member', journeyState: null, membership: null, cvHistory: [] },
      { id: 'task-zero', name: 'Task zero', journeyState: baseState, membership: null, cvHistory: [] },
      { id: 'pending', name: 'Read but not applied', journeyState: { ...baseState, currentWeek: 1, currentNodeCode: 'W1_M1', completedNodeCodes: ['TASK_0'] }, membership: null, cvHistory: [] },
      { id: 'done', name: 'CV updated', journeyState: { ...baseState, currentWeek: 1, currentNodeCode: 'W1_M1', completedNodeCodes: ['TASK_0'], readInsightCodes: [code], cvFoundationCompletedAt: new Date('2026-10-21') }, membership: null, cvHistory: [] },
    ].map(user => ({ ...user, cv: { id: 'cv' }, portfolioUrl: 'https://example.invalid', targetJobTitle: 'Designer' }));
    const prisma = {
      feedbackPost: { findMany: jest.fn().mockResolvedValue([{ id: 'post', unlockTriggerCode: code, title: 'CV', content: '', reads: [{ userId: 'pending' }, { userId: 'pending' }] }]) },
      user: { findMany: jest.fn().mockResolvedValue(users) },
      journeyNode: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new JourneyEngineService(prisma as never, {} as never, {} as never);
    const guide = (await service.getAdminPlotGuidance()).find(g => g.code === code)!;
    expect(guide).toMatchObject({ totalMembers: 4, unlockedCount: 2, readsCount: 2, completedCount: 1, pendingCount: 1, blockingCount: 1 });
    expect(guide.members.map(m => m.id)).toEqual(['pending', 'done']);
    expect(guide.titleAr).toBe('CV');
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ role: 'USER', id: { not: RESEARCH_TEST_USER_ID } });
  });
});
