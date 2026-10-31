import type { JourneyNode, UserJourneyState } from '@prisma/client';
import { cvFoundationStatus } from '../journey-engine/cv-foundation.util';
export type ObservatoryCounts = {
  apps: number;
  tailored: number;
  posts: number;
  outreach: number;
  reviews: number;
};
export type ObservatoryGate =
  | 'PROFILE'
  | 'GUIDE'
  | 'CV'
  | 'APPLICATIONS'
  | 'TAILORED'
  | 'POSTS'
  | 'OUTREACH'
  | 'REVIEW'
  | 'TIME'
  | 'READY'
  | 'NOT_STARTED'
  | 'FINISHED'
  | 'UNKNOWN';
export const metricRate = (n: number, d: number) =>
  d ? Math.round((n / d) * 1000) / 10 : null;
export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.ceil((sorted.length - 1) / 2)]) /
        2
    : null;
};
export function classifyJourney(input: {
  now: Date;
  idleDays: number;
  registeredAt: Date;
  profileReady: boolean;
  state: UserJourneyState | null;
  node: JourneyNode | undefined;
  nodes: JourneyNode[];
  counts: ObservatoryCounts;
  guide: { status: string; currentStep: number; startedAt: Date } | undefined;
  cvs: { versionNumber: number; uploadedAt: Date }[];
  lastWorkAt: Date | null;
}) {
  const { now, state, node, nodes, counts, guide } = input;
  const completedCurrent = !!state?.completedNodeCodes.includes(
    state.currentNodeCode,
  );
  const elapsedDays = state
    ? Math.max(
        0,
        (now.getTime() - state.currentNodeStartedAt.getTime()) / 86400000,
      )
    : null;
  const lastWork =
    input.lastWorkAt ?? state?.currentNodeStartedAt ?? input.registeredAt;
  const idleForDays = Math.max(
    0,
    (now.getTime() - lastWork.getTime()) / 86400000,
  );
  const foundation = state ? cvFoundationStatus(state, input.cvs) : null;
  let availableAt: Date | null = null;
  if (state && node?.nextNodeCode) {
    const next = nodes.find((n) => n.code === node.nextNodeCode);
    if (next) {
      const days =
        next.weekNumber > node.weekNumber && node.weekNumber >= 1
          ? 7 * (next.weekNumber - node.weekNumber)
          : nodes
              .filter(
                (n) =>
                  n.weekNumber === next.weekNumber &&
                  n.orderIndex < next.orderIndex,
              )
              .reduce((v, n) => v + n.durationDays, 0);
      availableAt = new Date(state.weekStartedAt.getTime() + days * 86400000);
    }
  }
  const missing = {
    apps: Math.max(0, (node?.requiredAppsCount ?? 0) - counts.apps),
    tailored: Math.max(0, (node?.requiredTailoredCount ?? 0) - counts.tailored),
    posts: Math.max(0, (node?.requiredPostsCount ?? 0) - counts.posts),
    outreach: Math.max(0, (node?.requiredOutreachCount ?? 0) - counts.outreach),
    reviews: node?.nodeType === 'REVIEW_STATION' && counts.reviews < 1 ? 1 : 0,
  };
  let gate: ObservatoryGate = 'READY';
  if (!input.profileReady) gate = 'PROFILE';
  else if (!state) gate = 'NOT_STARTED';
  else if (!node) gate = 'UNKNOWN';
  else if (state.completedNodeCodes.includes('FINAL_REPORT')) gate = 'FINISHED';
  else if (node.code === 'TASK_0' && guide?.status !== 'COMPLETED')
    gate = 'GUIDE';
  else if (
    node.weekNumber === 1 &&
    node.nodeType === 'MAIN_QUEST' &&
    !foundation?.completed
  )
    gate = 'CV';
  else if (!completedCurrent) {
    if (missing.apps) gate = 'APPLICATIONS';
    else if (missing.tailored) gate = 'TAILORED';
    else if (missing.posts) gate = 'POSTS';
    else if (missing.outreach) gate = 'OUTREACH';
    else if (missing.reviews) gate = 'REVIEW';
    else if (node.nodeType === 'FINAL_REPORT') gate = 'REVIEW';
  }
  if (gate === 'READY' && availableAt && availableAt > now) gate = 'TIME';
  const needsReview =
    !['TIME', 'FINISHED', 'UNKNOWN'].includes(gate) &&
    idleForDays >= input.idleDays;
  return {
    gate,
    needsReview,
    elapsedDays:
      elapsedDays === null ? null : Math.round(elapsedDays * 10) / 10,
    idleForDays: Math.round(idleForDays * 10) / 10,
    completedCurrent,
    availableAt: availableAt?.toISOString() ?? null,
    waitHours:
      gate === 'TIME' && availableAt
        ? Math.max(
            0,
            Math.round(
              ((availableAt.getTime() - now.getTime()) / 3600000) * 10,
            ) / 10,
          )
        : null,
    missing,
    foundationCompleted: foundation?.completed ?? false,
  };
}
