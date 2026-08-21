import fs from 'node:fs';
import path from 'node:path';
import { LOCAL_USER } from './config';
import { userStateRoot } from './storage';

/**
 * Users known on this device for the server: every directory under the
 * server's storage root that holds a state.json, plus the local user
 * (always available, whether or not it has data yet).
 */
export function listUsers(serverUrl: string): string[] {
  const users = new Set<string>([LOCAL_USER]);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(userStateRoot(serverUrl), { withFileTypes: true });
  } catch {
    return [...users].sort();
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (fs.existsSync(path.join(userStateRoot(serverUrl), entry.name, 'state.json'))) {
      users.add(entry.name);
    }
  }
  return [...users].sort();
}
