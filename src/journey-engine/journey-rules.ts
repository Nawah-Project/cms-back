export const TIME_MANAGEMENT_INSIGHT = 'INSIGHT_W3_TIME_MGMT';

export function isWeeklyReflection(summary: string | null): boolean {
  try {
    const value: unknown = JSON.parse(summary ?? '');
    return !(value && typeof value === 'object' && 'isUserChange' in value && value.isUserChange === true);
  } catch {
    return true;
  }
}

export function professionalTasksUnlocked(
  week: number,
  readCodes: readonly string[] = [],
): boolean {
  return week >= 3 && readCodes.includes(TIME_MANAGEMENT_INSIGHT);
}
