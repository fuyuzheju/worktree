import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

beforeEach(() => {
  localStorage.clear();
});

const configFor = (user: string) => ({
  serverUrl: 'http://localhost:3000',
  user,
  display: { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' },
  lang: 'en',
});

describe('App recovery screen', () => {
  it('shows the translated recovery form when the client cannot start', () => {
    // "bad user" fails USER_RE, so the client constructor throws and App falls
    // back to the recovery form — which renders outside the Shell's provider.
    localStorage.setItem('worktree.config', JSON.stringify(configFor('bad user')));
    localStorage.setItem(
      'worktree.token.localhost_3000.bad_user',
      JSON.stringify({ token: 'tok-1', tokenId: 1 }),
    );
    render(<App />);
    expect(screen.getByText('Worktree could not start')).toBeDefined();
    expect(screen.getByText('Username')).toBeDefined();
    expect(screen.getByText('Server URL')).toBeDefined();
    expect(screen.getByText('Apply and reload')).toBeDefined();
  });
});
