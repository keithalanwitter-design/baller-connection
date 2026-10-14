import type { Snapshot } from './domain';

/** Verified claims we accept from a Google ID token (after signature, iss, aud, exp, nonce checks). */
export interface GoogleClaims { sub: string; email: string; email_verified: boolean; name?: string }
export type GoogleOutcome =
  | { kind: 'signin'; userId: string; role: string; link: boolean }
  | { kind: 'invite'; inviteId: string }
  | { kind: 'refuse'; reason: 'unverified' | 'no-account' | 'inactive' | 'young-player' | 'linked-elsewhere' };
export const GOOGLE_REASON: Record<Extract<GoogleOutcome, { kind: 'refuse' }>['reason'] | 'invite' | 'error' | 'off', string> = {
  unverified: 'Google says that email isn’t verified, so we can’t use it to sign you in.',
  'no-account': 'There’s no Baller Connection account for that Google email. Families join by application and invite. Apply first, or sign in with the email your invite went to.',
  inactive: 'That account is switched off. Ask your coach to turn it back on.',
  'young-player': 'Players under 13 sign in with the username and PIN a parent sets.',
  'linked-elsewhere': 'That Baller Connection account is already linked to a different Google account.',
  invite: 'You have a pending invite for that email. Enter the code from your invite email to finish joining. Google sign-in works after that.',
  error: 'Google sign-in didn’t complete. Please try again.',
  off: 'Google sign-in isn’t set up on this server yet.',
};

/** Account linking, by verified email, to EXISTING accounts only. No open signup: a stranger's Google account never creates a user. */
export function googleLink(s: Pick<Snapshot, 'users' | 'invites' | 'players'>, identities: { sub: string; userId: string }[], c: GoogleClaims): GoogleOutcome {
  if (c.email_verified !== true) return { kind: 'refuse', reason: 'unverified' };
  const email = c.email.trim().toLowerCase();
  const linked = identities.find((i) => i.sub === c.sub);
  const u = linked ? s.users.find((x) => x.id === linked.userId) : s.users.find((x) => (x.email ?? '').toLowerCase() === email);
  if (u) {
    if (!u.active) return { kind: 'refuse', reason: 'inactive' };
    if (u.role === 'player') { const p = s.players.find((x) => x.id === u.playerId); if (!p || p.age < 13) return { kind: 'refuse', reason: 'young-player' }; }
    if (!linked && identities.some((i) => i.userId === u.id)) return { kind: 'refuse', reason: 'linked-elsewhere' };
    return { kind: 'signin', userId: u.id, role: u.role, link: !linked };
  }
  const inv = s.invites.find((i) => i.status === 'pending' && i.email.toLowerCase() === email);
  return inv ? { kind: 'invite', inviteId: inv.id } : { kind: 'refuse', reason: 'no-account' };
}
