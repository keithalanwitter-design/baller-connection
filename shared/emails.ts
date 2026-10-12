import { DEFAULT_PREFS, type EmailCategory, type EmailPrefs } from './domain';

/**
 * v6 email templates: one pure renderer for the engine, the server and tests. Every template has a text and an HTML part
 * in the brand colors (court navy #0A1430, blaze orange #FF5E1A). Links are written as `{{APP}}/#/path` and filled in at
 * delivery with APP_URL; non-essential mail carries `{{UNSUB}}`, filled with a signed one-click unsubscribe link.
 */
export type EmailKind = 'magic-link' | 'password' | 'invite' | 'consent-request' | 'feedback-ready' | 'focus-nudge' | 'reply-needed' | 'parent-digest' | 'plan-drop' | 'payment-receipt' | 'payment-failed' | 'waitlist-open' | 'application' | 'fit-call' | 'staff' | 'notification-digest' | 'access-ended';
export const CATEGORY: Record<EmailKind, EmailCategory> = {
  'magic-link': 'essential', password: 'essential', invite: 'essential', 'consent-request': 'essential', 'payment-receipt': 'essential', 'payment-failed': 'essential', 'waitlist-open': 'essential', application: 'essential', 'fit-call': 'essential', staff: 'essential', 'access-ended': 'essential',
  'feedback-ready': 'coaching', 'focus-nudge': 'coaching', 'reply-needed': 'coaching', 'plan-drop': 'coaching',
  'parent-digest': 'digest', 'notification-digest': 'updates',
};
export const CATEGORY_LABEL: Record<Exclude<EmailCategory, 'essential'>, string> = { coaching: 'Coaching emails (feedback ready, nudges, plan drops, reply needed)', digest: 'Weekly parent digest', updates: 'Update roundups (unread in-app notifications)' };
export const COLORS = { navy: '#0A1430', orange: '#FF5E1A', ink: '#1B2236', paper: '#F5F3EE', muted: '#5B6275' };

export type EmailData = Record<string, string | number | undefined | null>;
interface Tpl { subject: (d: EmailData) => string; lines: (d: EmailData) => string[]; cta?: (d: EmailData) => { label: string; path: string } | null; quote?: (d: EmailData) => string | null | undefined }
const n = (d: EmailData, k: string, f = '') => String(d[k] ?? f);
const money = (cents: unknown) => `$${(Number(cents ?? 0) / 100).toFixed(2)}`;

const T: Record<EmailKind, Tpl> = {
  'magic-link': { subject: () => 'Your Baller Connection sign-in link', lines: (d) => [`Tap the button to sign in${d.name ? `, ${d.name}` : ''}. The link works once and expires in 15 minutes.`, 'If you didn’t ask for this, ignore this email; nobody can sign in without the link.'], cta: (d) => ({ label: 'Sign in', path: `/magic?token=${d.token}` }) },
  password: { subject: () => 'Set your Baller Connection password', lines: (d) => [`Set your password (link valid ${n(d, 'hours', '2')} hours).`, 'If you didn’t ask for this, ignore this email.'], cta: (d) => ({ label: 'Set password', path: `/reset?token=${d.token}` }) },
  invite: { subject: (d) => `${d.player} has a spot at ${n(d, 'program', 'Baller Connection')}`, lines: (d) => [`${d.player} has a spot on the ${d.tier} plan ($${d.price}/month, cancel anytime).`, `Or enter code ${d.code} at /invite.`, `This link expires ${d.expires}. Next: choose the plan and pay securely with Stripe, then a 2-minute setup (goal, rhythm, consent).`], cta: (d) => ({ label: 'Accept the invite', path: `/invite?token=${d.token}` }) },
  'waitlist-open': { subject: (d) => `A spot opened for ${d.player}`, lines: (d) => [`Good news: a spot opened on the roster and ${d.player} is next on the waitlist.`, `It’s held for you until ${d.expires}. Accept, pay for the ${d.tier} plan ($${d.price}/month) and finish setup. After that the spot goes to the next family.`, `Or enter code ${d.code} at /invite.`], cta: (d) => ({ label: 'Claim the spot', path: `/invite?token=${d.token}` }) },
  'consent-request': { subject: (d) => `Finish setting up ${d.player}`, lines: (d) => [`Thanks for accepting ${d.player}’s invite. Two quick steps before coaching starts:`, '1. Choose the plan and pay (secure Stripe checkout; cancel anytime).', '2. Give parental consent (what we store, who sees it, how to delete it).'], cta: (d) => ({ label: 'Finish setup', path: `/welcome?p=${d.playerId}` }) },
  'feedback-ready': { subject: (d) => `Feedback is in for ${d.player}`, lines: (d) => [`${d.coach} replied to ${d.player}’s check-in on ${d.rep}.`, 'Open Today to read it and tap “Got it” (or ask a question).'], quote: (d) => (d.snippet ? String(d.snippet) : null), cta: () => ({ label: 'Read the feedback', path: '/app' }) },
  'focus-nudge': { subject: (d) => `Quick check on ${d.coachFirst}’s note`, lines: (d) => [`${d.player}, ${d.coachFirst}’s feedback has been waiting 2 days.`, 'Tap “Got it” if it makes sense, or ask one question. Either is fine.'], cta: () => ({ label: 'Open Today', path: '/app' }) },
  'reply-needed': { subject: (d) => `Reply needed: ${d.player}’s family`, lines: (d) => [`${d.from} wrote about ${d.player}. Reply by ${d.due}.`], quote: (d) => (d.snippet ? String(d.snippet) : null), cta: (d) => ({ label: 'Reply', path: `/coach/player/${d.playerId}?tab=messages` }) },
  'parent-digest': { subject: (d) => `${d.playerFirst}’s week`, lines: (d) => [String(d.text ?? '')], cta: () => ({ label: 'Open parent view', path: '/parent' }) },
  'plan-drop': { subject: (d) => `This week’s reps for ${d.playerFirst}`, lines: (d) => [`Plan drop: ${d.playerFirst}’s reps for this week are on Today${d.focus ? ` (focus: ${d.focus})` : ''}.`], cta: () => ({ label: 'See this week', path: '/app' }) },
  'payment-receipt': { subject: (d) => `Receipt: ${d.tier} plan for ${d.player}`, lines: (d) => [`Payment received: ${money(d.amount)} for ${d.player}’s ${d.tier} plan.`, d.next ? `Next charge: ${d.next}. Cancel or pause anytime from Billing; no contracts.` : 'Cancel or pause anytime from Billing; no contracts.', 'Stripe also emails you its own receipt.'], cta: () => ({ label: 'Manage billing', path: '/parent?tab=billing' }) },
  'payment-failed': { subject: (d) => `Payment didn’t go through for ${d.player}`, lines: (d) => [`We couldn’t charge your card for ${d.player}’s ${d.tier} plan.`, `Coaching continues for ${n(d, 'graceDays', '7')} days, until ${d.graceEnds}. If the payment isn’t fixed by then, coaching pauses (progress is saved) until it is.`, 'Update your card in Billing; Stripe retries automatically too.'], cta: () => ({ label: 'Update payment', path: '/parent?tab=billing' }) },
  'access-ended': { subject: (d) => `${d.player}’s coaching is paused`, lines: (d) => [`${d.player}’s coaching is paused: ${d.reason}.`, 'Progress, plans and feedback are saved. Restart anytime from Billing (if the roster is full we’ll hold a waitlist spot for you).'], cta: () => ({ label: 'Billing', path: '/parent?tab=billing' }) },
  application: { subject: () => 'We got your application', lines: (d) => [`Hi ${d.parent}, thanks for applying for ${d.player}. A person reads every application and replies within 2 business days.`] },
  'fit-call': { subject: () => 'Your intro call', lines: (d) => [`Your 15-minute call is booked for ${d.when}.`] },
  staff: { subject: (d) => `You’ve been added to ${n(d, 'program', 'Baller Connection')}`, lines: (d) => [`Hi ${d.name}, you were added as ${d.role}. Sign in with an emailed link, or set a password from the sign-in page with “First time / forgot password”.`], cta: () => ({ label: 'Sign in', path: '/login' }) },
  'notification-digest': { subject: (d) => `${d.count} update${Number(d.count) > 1 ? 's' : ''} from Baller Connection`, lines: (d) => [`Hi ${d.name},`, String(d.items ?? ''), 'Open the app to act on these.'], cta: () => ({ label: 'Open the app', path: '/login' }) },
};
const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const link = (path: string) => `{{APP}}/#${path}`;

export interface Rendered { subject: string; text: string; html: string; category: EmailCategory }
/** Render one email. Pure: no secrets beyond what `data` carries (the plaintext token in a magic link / invite). */
export function render(kind: EmailKind, data: EmailData): Rendered {
  const t = T[kind]; const category = CATEGORY[kind]; const subject = t.subject(data); const lines = t.lines(data).filter(Boolean); const cta = t.cta?.(data) ?? null; const quote = t.quote?.(data) ?? null;
  const program = n(data, 'program', 'Baller Connection');
  const foot = category === 'essential' ? `You’re getting this because it’s about your ${program} account; it can’t be turned off.` : `Don’t want these? Unsubscribe in one click: {{UNSUB}} (or change email settings in the app).`;
  const text = [...lines, ...(quote ? [`“${quote}”`] : []), ...(cta ? [`${cta.label}: ${link(cta.path)}`] : []), '', `— ${program}`, foot].join('\n').replace(/ at \/invite\./g, ' at /invite.');
  const html = `<!doctype html><html><body style="margin:0;background:${COLORS.paper};font-family:Arial,Helvetica,sans-serif;color:${COLORS.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.paper};padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${COLORS.navy};padding:18px 24px;color:#fff;font-weight:800;letter-spacing:1px;font-size:15px">BALLER<span style="color:${COLORS.orange}">CONNECTION</span></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:22px;color:${COLORS.navy}">${esc(subject)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${esc(l).replace(/\n/g, '<br>')}</p>`).join('\n')}
${quote ? `<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:4px solid ${COLORS.orange};background:${COLORS.paper};font-size:15px">${esc(quote)}</blockquote>` : ''}
${cta ? `<p style="margin:20px 0"><a href="${link(cta.path)}" style="background:${COLORS.orange};color:${COLORS.navy};text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;display:inline-block">${esc(cta.label)}</a></p><p style="font-size:12px;color:${COLORS.muted};word-break:break-all">Or paste: ${link(cta.path)}</p>` : ''}
</td></tr><tr><td style="padding:16px 24px;background:${COLORS.paper};font-size:12px;color:${COLORS.muted}">${esc(program)} · one focus, one next rep, a coach who answers.<br>${category === 'essential' ? esc(foot) : `Don’t want these? <a href="{{UNSUB}}" style="color:${COLORS.navy}">Unsubscribe in one click</a> or change email settings in the app.`}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html, category };
}

/** Should this category go to this user at all? Essential always does. */
export const wants = (prefs: Partial<EmailPrefs> | null | undefined, c: EmailCategory) => c === 'essential' || ({ ...DEFAULT_PREFS, ...(prefs ?? {}) } as EmailPrefs)[c] !== false;
/** Local hour in a zone (quiet hours are local to the program). */
export function localHour(d: Date, tz = 'America/Chicago') { return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(d)) % 24; }
export const inQuiet = (h: number, start: number, end: number) => (start === end ? false : start < end ? h >= start && h < end : h >= start || h < end);
/** Non-essential mail inside quiet hours waits until quiet time ends. Returns ISO send-after time, or null to send now. */
export function quietUntil(now: Date, prefs: Partial<EmailPrefs> | null | undefined, c: EmailCategory, tz?: string): string | null {
  if (c === 'essential') return null; const p = { ...DEFAULT_PREFS, ...(prefs ?? {}) };
  if (!inQuiet(localHour(now, tz), p.quietStart, p.quietEnd)) return null;
  const step = 15 * 6e4; let t = Math.ceil(now.getTime() / step) * step; for (let i = 0; i < 96; i++, t += step) if (!inQuiet(localHour(new Date(t), tz), p.quietStart, p.quietEnd)) return new Date(t).toISOString();
  return null;
}
/** Delivery backoff after a provider error; after MAX_ATTEMPTS the row is dead-lettered. */
export const RETRY_BACKOFF_MS = [60e3, 5 * 60e3, 30 * 60e3, 2 * 36e5]; export const MAX_ATTEMPTS = 5;
