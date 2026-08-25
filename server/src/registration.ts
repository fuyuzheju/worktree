export type RegistrationDecision =
  | { ok: true }
  | { ok: false; reason: 'invalid-code' | 'registration-closed' };

/**
 * Decides whether a registration is allowed. `open` is the only mode today;
 * an `invite` gate (InviteCode table + admin endpoints) plugs in here later
 * without touching the protocol — clients already send `inviteCode`.
 */
export interface RegistrationGate {
  check(username: string, inviteCode: string | undefined): RegistrationDecision;
}

export class OpenRegistrationGate implements RegistrationGate {
  check(_username: string, _inviteCode: string | undefined): RegistrationDecision {
    return { ok: true };
  }
}

export function createRegistrationGate(mode: string): RegistrationGate {
  switch (mode) {
    case 'open':
      return new OpenRegistrationGate();
    default:
      // Fail fast on typos instead of silently falling back to open.
      throw new Error(`unknown REGISTRATION_MODE: ${mode}`);
  }
}
