import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CLI_SETTINGS, loadSettings, saveSettings, settingsPath } from '../src/settings';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-settings-'));
const prevHome = process.env.HOME;

beforeEach(() => {
  process.env.HOME = tmpHome;
  fs.rmSync(path.join(tmpHome, '.worktree'), { recursive: true, force: true });
});

afterEach(() => {
  process.env.HOME = prevHome;
});

describe('CLI settings', () => {
  it('defaults when no file exists', () => {
    expect(loadSettings()).toEqual(DEFAULT_CLI_SETTINGS);
    expect(settingsPath()).toBe(path.join(tmpHome, '.worktree', 'config.json'));
  });

  it('round-trips via saveSettings', () => {
    const next = { autoReminder: { enabled: false, pct: 30 } };
    saveSettings(next);
    expect(loadSettings()).toEqual(next);
    expect(JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))).toEqual(next);
  });

  it('falls back to defaults on a corrupt file', () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), '{not json');
    expect(loadSettings()).toEqual(DEFAULT_CLI_SETTINGS);
  });

  it('validates per field and clamps the percentage', () => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ autoReminder: { enabled: 'yes', pct: 500 } }));
    expect(loadSettings()).toEqual({ autoReminder: { enabled: true, pct: 99 } });
    fs.writeFileSync(settingsPath(), JSON.stringify({ autoReminder: { enabled: false, pct: 0 } }));
    expect(loadSettings()).toEqual({ autoReminder: { enabled: false, pct: 1 } });
  });
});
