import { execFileSync } from 'node:child_process';

/** Read piped stdin to EOF (one-shot commands like capture). */
export function readPipedStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

/** The system clipboard as text; macOS only for now. */
export function readClipboard(): string {
  if (process.platform !== 'darwin') {
    throw new Error(`clipboard capture is not supported on ${process.platform}`);
  }
  return execFileSync('pbpaste', { encoding: 'utf8' });
}
