import { beforeEach, describe, expect, it } from 'vitest';
import { clearToken, listLoggedInUsers, loadToken, saveToken, tokenKey } from '../src/config';

beforeEach(() => {
  localStorage.clear();
});

describe('token storage', () => {
  it('round-trips tokens keyed by server and user', () => {
    const stored = { token: 'tok-1', tokenId: 7, label: 'my phone' };
    saveToken('http://localhost:3000', 'alice', stored);
    expect(loadToken('http://localhost:3000', 'alice')).toEqual(stored);
    expect(loadToken('http://localhost:3000', 'bob')).toBeNull();
    expect(loadToken('https://other.example.com', 'alice')).toBeNull();
    clearToken('http://localhost:3000', 'alice');
    expect(loadToken('http://localhost:3000', 'alice')).toBeNull();
  });

  it('ignores invalid stored tokens', () => {
    localStorage.setItem(tokenKey('http://localhost:3000', 'alice'), '{not json');
    expect(loadToken('http://localhost:3000', 'alice')).toBeNull();
    localStorage.setItem(tokenKey('http://localhost:3000', 'alice'), JSON.stringify({ token: 'tok' }));
    expect(loadToken('http://localhost:3000', 'alice')).toBeNull();
  });

  it('namespaces like the state key', () => {
    expect(tokenKey('http://localhost:3000', 'alice')).toBe('worktree.token.localhost_3000.alice');
  });

  it('lists logged-in users for one server only, sorted', () => {
    saveToken('http://localhost:3000', 'bob', { token: 'tok-b', tokenId: 2 });
    saveToken('http://localhost:3000', 'alice', { token: 'tok-a', tokenId: 1 });
    saveToken('https://other.example.com', 'carol', { token: 'tok-c', tokenId: 3 });
    expect(listLoggedInUsers('http://localhost:3000')).toEqual(['alice', 'bob']);
    expect(listLoggedInUsers('https://other.example.com')).toEqual(['carol']);
    // a token key with an invalid username is ignored
    localStorage.setItem('worktree.token.localhost_3000.bad name!', JSON.stringify({ token: 'x', tokenId: 4 }));
    expect(listLoggedInUsers('http://localhost:3000')).toEqual(['alice', 'bob']);
  });
});
