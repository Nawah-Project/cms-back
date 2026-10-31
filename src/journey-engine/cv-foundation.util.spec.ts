import { cvFoundationStatus, CV_FOUNDATION_CODE } from './cv-foundation.util';
describe('Week 1 CV foundation', () => {
  const unlocked = { currentWeek: 1, completedNodeCodes: ['TASK_0'], cvFoundationBaselineVersion: 3, week1StartedAt: new Date('2026-10-20T12:00:00Z') };
  it('keeps analytics locked before task zero even if a CV was uploaded', () => {
    expect(cvFoundationStatus({ currentWeek: 0 }, [{ versionNumber: 4, uploadedAt: new Date() }]).completed).toBe(false);
  });
  it('requires a genuinely newer CV after the task-zero milestone', () => {
    for (const cv of [{versionNumber:3, uploadedAt:new Date()}, {versionNumber:4, uploadedAt:new Date('2026-10-19')}]) {
      expect(cvFoundationStatus(unlocked,[cv]).canComplete).toBe(false);
    }
  });
  it('requires confirmation after an eligible upload and preserves completion', () => {
    const cvs = [{versionNumber:4,uploadedAt:new Date('2026-10-21')}];
    expect(cvFoundationStatus(unlocked,cvs)).toMatchObject({canComplete:true, completed:false});
    expect(cvFoundationStatus({...unlocked,readInsightCodes:[CV_FOUNDATION_CODE]},cvs).completed).toBe(true);
    expect(cvFoundationStatus({...unlocked,readInsightCodes:[CV_FOUNDATION_CODE],cvFoundationCompletedAt:new Date()}).completed).toBe(true);
  });
});
