import type { Translate } from './i18n';

/** Sunday-first, indexed by `Date#getDay()`. */
export const WEEKDAY_KEYS = [
  'weekday.sun',
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
];

export function weekdayNames(t: Translate): string[] {
  return WEEKDAY_KEYS.map((key) => t(key));
}

/** `index` outside 0..6 (a corrupt rule's byDay) falls back to the raw number. */
export function weekdayName(t: Translate, index: number): string {
  const key = WEEKDAY_KEYS[index];
  return key === undefined ? String(index) : t(key);
}
