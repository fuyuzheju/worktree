/** ISO time (with optional seconds, fractions, and timezone), or a bare date. */
const ISO_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

/** Parse a user-supplied time into epoch ms; null when unparseable.
 *  The format list is the single extension point for new input formats. */
export function parseTime(raw: string): number | null {
  // Bare date "2026-09-01": local midnight, not the UTC date Date.parse yields.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const t = new Date(`${raw}T00:00:00`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (!ISO_TIME_RE.test(raw)) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}
