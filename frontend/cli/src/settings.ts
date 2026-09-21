import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_AUTO_REMINDER_PCT, clampAutoReminderPct } from '@worktree/client';
import { isRecord } from '@worktree/core';
import { worktreeHome } from './storage';

/**
 * Device-global CLI settings, stored at `~/.worktree/config.json`.
 * Only the auto-reminder preference exists today.
 */
export interface CliSettings {
  autoReminder: { enabled: boolean; pct: number };
}

export const DEFAULT_CLI_SETTINGS: CliSettings = {
  autoReminder: { enabled: true, pct: DEFAULT_AUTO_REMINDER_PCT },
};

export function settingsPath(): string {
  return path.join(worktreeHome(), 'config.json');
}

/** Missing or corrupt file falls back to defaults; per-field validation + clamp. */
export function loadSettings(): CliSettings {
  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath(), 'utf8');
  } catch {
    return DEFAULT_CLI_SETTINGS;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_CLI_SETTINGS;
    const autoReminder = isRecord(parsed.autoReminder) ? parsed.autoReminder : {};
    return {
      autoReminder: {
        enabled:
          typeof autoReminder.enabled === 'boolean'
            ? autoReminder.enabled
            : DEFAULT_CLI_SETTINGS.autoReminder.enabled,
        pct:
          typeof autoReminder.pct === 'number' && Number.isFinite(autoReminder.pct)
            ? clampAutoReminderPct(autoReminder.pct)
            : DEFAULT_CLI_SETTINGS.autoReminder.pct,
      },
    };
  } catch {
    return DEFAULT_CLI_SETTINGS;
  }
}

/** Atomic save (tmp + rename), mirroring FileStorage.save. */
export function saveSettings(settings: CliSettings): void {
  const filePath = settingsPath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.error(`failed to save settings to ${filePath}: ${e instanceof Error ? e.message : e}`);
  }
}
