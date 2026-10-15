/**
 * The capture text a URL carries — the `?quick=1` link, the manifest shortcut
 * and the Android share target (which appends `text`/`title`/`url` params).
 * Returns null when the URL asks for no capture.
 */
export function captureParamText(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!['quick', 'text', 'title', 'url'].some((key) => params.has(key))) return null;
  const text = (params.get('text') ?? '').trim();
  if (text !== '') return text;
  const title = (params.get('title') ?? '').trim();
  const url = (params.get('url') ?? '').trim();
  if (title === '') return url;
  // A shared link: the title names the node, the URL becomes its note.
  return url === '' ? title : `${title}\n${url}`;
}

/** Drop the capture params from the address bar so a reload does not re-open the overlay. */
export function stripCaptureParams(): void {
  const url = new URL(window.location.href);
  for (const key of ['quick', 'text', 'title', 'url']) url.searchParams.delete(key);
  window.history.replaceState(null, '', url.toString());
}
