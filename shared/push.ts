import type { EmailCategory, EmailPrefs, Notification } from './domain';
import { inQuiet, localHour, wants } from './emails';

/** v7 PWA: which in-app notifications also go out as a phone push, and under which email-preference category. */
export type PushEvent = 'feedback' | 'nudge' | 'reply' | 'plan' | 'gameday';
export const PUSH_EVENTS: Record<PushEvent, { label: string; category: Exclude<EmailCategory, 'essential'> }> = {
  feedback: { label: 'Feedback ready', category: 'coaching' },
  nudge: { label: 'Nudges (mid-week, Friday wrap, “does the note make sense?”)', category: 'coaching' },
  reply: { label: 'Replies to messages', category: 'coaching' },
  plan: { label: 'Plan drop', category: 'coaching' },
  gameday: { label: 'Game day card', category: 'updates' },
};
export function pushEventOf(n: Pick<Notification, 'type' | 'dedupe'>): PushEvent | null {
  if (n.type === 'feedback_ready') return 'feedback';
  if (n.type === 'new_message') return 'reply';
  if (n.type === 'gameday') return 'gameday';
  if (n.type === 'rhythm') return n.dedupe.startsWith('rhythm:plan:') ? 'plan' : 'nudge';
  return null;
}
export interface PushPayload { title: string; body: string; url: string; tag: string }
/** Pure decision: null = don't push (not a push event, category switched off, or inside quiet hours). Quiet-hour pushes are dropped, not delayed: the item is still waiting in the app and in the email roundup. */
export function pushDecision(n: Notification, prefs: Partial<EmailPrefs> | null | undefined, now: Date, tz = 'America/Chicago'): PushPayload | null {
  const ev = pushEventOf(n); if (!ev) return null;
  const cat = PUSH_EVENTS[ev].category; if (!wants(prefs, cat)) return null;
  const p = { quietStart: 21, quietEnd: 7, ...(prefs ?? {}) }; if (inQuiet(localHour(now, tz), p.quietStart, p.quietEnd)) return null;
  return { title: PUSH_EVENTS[ev].label.split(' (')[0], body: n.text.slice(0, 180), url: `#${n.link}`, tag: n.dedupe.slice(0, 64) };
}
/** Endpoints we will POST to. Anything else is refused at subscribe time (no turning the server into a request relay). */
export const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/];
export function validPushEndpoint(endpoint: string) { try { const u = new URL(endpoint); return u.protocol === 'https:' && PUSH_HOSTS.some((r) => r.test(u.hostname)); } catch { return false; } }
