import type { Reminder } from '@worktree/core';

export function ReminderList({ reminders }: { reminders: Reminder[] }) {
  if (reminders.length === 0) return null;
  return (
    <ul className="reminders">
      {reminders.map((r) => (
        <li key={r.id}>
          {r.name} — {new Date(r.deadline).toLocaleString()}
          {r.repeat ? ` (every ${r.repeat} ms)` : ''}
        </li>
      ))}
    </ul>
  );
}
