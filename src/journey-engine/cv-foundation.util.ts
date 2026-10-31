export const CV_FOUNDATION_CODE = 'INSIGHT_TASK_0_CV_BASE';

interface FoundationState {
  currentWeek?: number;
  completedNodeCodes?: string[];
  readInsightCodes?: string[];
  cvVersionNumber?: number;
  cvFoundationBaselineVersion?: number | null;
  cvFoundationCompletedAt?: Date | null;
  week1StartedAt?: Date | null;
}
export function cvFoundationStatus(state: FoundationState, cvs: { versionNumber: number; uploadedAt: Date }[] = []) {
  const unlocked = (state.completedNodeCodes ?? []).includes('TASK_0') || (state.currentWeek ?? 0) >= 1;
  const baselineVersion = state.cvFoundationBaselineVersion ?? 1;
  const latest = [...cvs].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const currentVersion = Math.max(state.cvVersionNumber ?? 1, latest?.versionNumber ?? 1);
  const uploadedAfterUnlock = Boolean(unlocked && latest && latest.versionNumber > baselineVersion && (!state.week1StartedAt || latest.uploadedAt >= state.week1StartedAt));
  const completed = unlocked && (state.readInsightCodes ?? []).includes(CV_FOUNDATION_CODE) && Boolean(state.cvFoundationCompletedAt || uploadedAfterUnlock);
  return { unlocked, baselineVersion, currentVersion, uploadedAfterUnlock, canComplete: uploadedAfterUnlock || completed, completed };
}
