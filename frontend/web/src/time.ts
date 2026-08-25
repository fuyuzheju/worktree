/** Parse a datetime-local input value ("YYYY-MM-DDTHH:mm[:ss]", local time) to epoch ms. */
export function localInputToEpoch(value: string): number | null {
  if (value === '') return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Format epoch ms for a datetime-local input, in the browser's local time (second precision). */
export function epochToLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDeadline(ms: number): string {
  return new Date(ms).toISOString();
}
