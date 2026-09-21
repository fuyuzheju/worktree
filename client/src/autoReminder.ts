export const DEFAULT_AUTO_REMINDER_PCT = 15;
export const AUTO_REMINDER_PCT_MIN = 1;
export const AUTO_REMINDER_PCT_MAX = 99;

/**
 * Fire time for an auto-reminder: when `pct` percent of the creation→deadline
 * window remains, i.e. at createdAt + (deadline - createdAt) * (1 - pct/100).
 */
export function autoReminderDeadline(createdAt: number, deadline: number, pct: number): number {
  return createdAt + (deadline - createdAt) * (1 - pct / 100);
}

/** Clamp a user-supplied percentage to the valid range (integer 1..99). */
export function clampAutoReminderPct(pct: number): number {
  return Math.min(AUTO_REMINDER_PCT_MAX, Math.max(AUTO_REMINDER_PCT_MIN, Math.round(pct)));
}
