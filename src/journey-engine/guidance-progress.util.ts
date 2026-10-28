import type { UserJourneyState } from '@prisma/client';
import { cvFoundationStatus, CV_FOUNDATION_CODE } from './cv-foundation.util';

export const RESEARCH_TEST_USER_ID = 'aeef0606-17bb-47b6-a239-4a44526303b4';

export function guidanceProgress(
  code: string,
  state: UserJourneyState | null,
  cvs: { versionNumber: number; uploadedAt: Date }[],
  recordedReads: readonly string[] = [],
  advanced = false,
  node?: { weekNumber: number; nodeType: string },
  profileReady = true,
) {
  const foundation = code === CV_FOUNDATION_CODE;
  const cv = state ? cvFoundationStatus(state, cvs) : null;
  const available = !!state && (foundation
    ? !!cv?.unlocked
    : state.unlockedInsightCodes.includes(code) || (advanced && state.hasUnlockedAdvPrep));
  const read = available && ((state?.readInsightCodes ?? []).includes(code) || recordedReads.includes(code));
  // A read receipt is not evidence that the mandatory CV update was applied.
  const completed = available && (foundation ? !!cv?.completed : read);
  return {
    available, read, completed,
    pending: available && !completed,
    required: foundation,
    blocking: foundation && available && !completed && profileReady && node?.weekNumber === 1 && node.nodeType === 'MAIN_QUEST',
  };
}
