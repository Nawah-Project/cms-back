// Register real implementations here before exposing them in the experiment editor.
// A means the full approved experience at the 27 Oct 2026 cutover, never legacy A.
export const PREVIEW_ONLY_SECTIONS = new Set<string>();
export const SECTION_REGISTRY = [
  {
    id: 'home',
    titleAr: 'الرئيسية',
    titleEn: 'Home',
    versions: ['A', 'B'],
    previewOnly: false,
    metrics: [
      'home_continue_clicked',
      'home_station_opened',
      'home_scope_changed',
      'home_peer_opened',
      'home_task_zero_completed',
    ],
  },
  {
    id: 'applications',
    titleAr: 'طلبات التقديم',
    titleEn: 'Applications',
    versions: ['A'],
    metrics: ['application_created', 'application_stage_updated'],
  },
  {
    id: 'development',
    titleAr: 'التطور المهني',
    titleEn: 'Development',
    versions: ['A'],
    metrics: ['feedback_read', 'prompt_copied', 'task_status_changed'],
  },
  {
    id: 'members-progress',
    titleAr: 'تقدم المجموعة',
    titleEn: 'Group progress',
    versions: ['A', 'B'],
    metrics: ['member_detail_loaded', 'member_profile_loaded'],
  },
  {
    id: 'analytics',
    titleAr: 'تحليل الأداء',
    titleEn: 'Performance',
    versions: ['A'],
    metrics: ['linked_applications_opened'],
  },
  {
    id: 'profile',
    titleAr: 'الملف الشخصي',
    titleEn: 'Profile',
    versions: ['A'],
    metrics: ['profile_saved'],
  },
  {
    id: 'onboarding',
    titleAr: 'الاستقبال',
    titleEn: 'Welcome',
    versions: ['A'],
    metrics: ['onboarding_completed'],
  },
] as const;
export const SECTIONS = SECTION_REGISTRY.map((s) => s.id);
export type LabSection = (typeof SECTIONS)[number];
export const ACTIONS = [
  ...new Set(SECTION_REGISTRY.flatMap((s) => [...s.metrics])),
];
export const LAB_EVENTS = [
  'view',
  'engaged',
  'request_failed',
  'validation_failed',
  ...ACTIONS,
] as const;
export function registrySection(id: string) {
  return SECTION_REGISTRY.find((s) => s.id === id);
}
export function stableArm(
  experimentId: string,
  userId: string,
  allocation: number,
) {
  // Assignment never uses a browser value or changes between reloads.
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return (createHash('sha256')
    .update(`${experimentId}:${userId}`)
    .digest()
    .readUInt32BE(0) /
    0x100000000) *
    100 <
    allocation
    ? 'B'
    : 'A';
}
