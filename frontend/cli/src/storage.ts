import fs from 'node:fs';
import path from 'node:path';
import type { ClientStorage, SavedState } from '@worktree/client';

/**
 * File-backed ClientStorage. Saves are atomic (tmp + rename) so a crash
 * mid-write cannot corrupt the archive; a corrupt file on load is preserved
 * as `<path>.corrupt-<ts>` instead of being silently discarded.
 */
export class FileStorage implements ClientStorage {
  constructor(private filePath: string) {}

  load(): SavedState | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      console.error(`failed to read ${this.filePath}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SavedState>;
      if (!Array.isArray(parsed.confirmed) || !Array.isArray(parsed.pending)) throw new Error('invalid shape');
      return { confirmed: parsed.confirmed, pending: parsed.pending };
    } catch (e) {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.filePath, backup);
        console.error(`state file was corrupt — moved to ${backup}`);
      } catch (renameErr) {
        console.error(`state file was corrupt and could not be moved: ${renameErr}`);
      }
      return null;
    }
  }

  save(state: SavedState): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, this.filePath);
    } catch (e) {
      console.error(`failed to save state to ${this.filePath}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/**
 * `~/.worktree/<server-host>/<userId>/state.json` — namespaced per server and
 * user so different servers (and future users) never share history.
 */
export function defaultStatePath(serverUrl: string, userId: string): string {
  const host = new URL(serverUrl).host.replace(/[^a-zA-Z0-9.-]/g, '_');
  const home = process.env.HOME ?? process.cwd();
  return path.join(home, '.worktree', host, userId, 'state.json');
}
