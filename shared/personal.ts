import type { Assignment, Player, Review, Snapshot } from './domain';
/** Personalization: the player's own onboarding words, used everywhere. Pure, shared by engine, server and UI. */
export const young = (p: Pick<Player, 'age'>) => p.age < 13;
const fn = (p: Player) => p.name.split(' ')[0];
const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1).replace(/[.!]+$/, '');

export function greeting(p: Player, d: Date) {
  const part = d.getHours() < 12 ? 'Morning' : d.getHours() < 17 ? 'Hey' : 'Evening';
  return young(p) ? `Hi ${fn(p)}!` : `${part}, ${fn(p)}.`;
}
/** "You said you want to …: this rep builds that." */
export function repWhy(p: Player, a?: Pick<Assignment, 'title'> | null, focus?: string) {
  if (!p.goal) return focus ? `It builds your focus: ${focus}.` : 'It builds your focus.';
  return young(p) ? `You said: “${p.goal}.” This rep helps with that!` : `You said you want to ${lower(p.goal).replace(/^i want to /, '')}. ${a ? 'This rep' : 'This plan'} builds that${focus ? `, through “${focus}”` : ''}.`;
}
export type LearnMode = 'show-me' | 'why-first' | 'short-steps' | 'together';
export function learnMode(p: Player): LearnMode {
  return p.learnStyle.startsWith('Watch') ? 'show-me' : p.learnStyle.startsWith('Explain') ? 'why-first' : p.learnStyle.startsWith('Do it') ? 'together' : 'short-steps';
}
/** Placeholders + section order for the coach's feedback composer, by learning style. */
export function feedbackTemplate(p: Player) {
  const m = learnMode(p);
  return {
    mode: m,
    label: { 'show-me': 'Show-me: point at what to watch, then what to try', 'why-first': 'Why-first: lead with the reason', 'short-steps': 'Short steps: few words, one action', together: 'Together: give them a partner or a count' }[m],
    order: m === 'why-first' ? (['why', 'wentWell', 'adjust'] as const) : (['wentWell', 'adjust', 'why'] as const),
    hint: {
      wentWell: m === 'short-steps' ? 'Good: low hips.' : 'What you did well (be specific)',
      adjust: m === 'show-me' ? 'Watch: … Then try: …' : m === 'together' ? 'Grab a partner / count out loud: …' : 'One adjustment',
      why: m === 'why-first' ? 'Why this matters for your goal' : 'Why (one line)',
    },
  };
}
/** Compose the one feedback format into plain text, ordered for the player's learning style. */
export function composeFeedback(p: Player, r: Pick<Review, 'wentWell' | 'adjust' | 'why' | 'nextRep'>) {
  const parts: Record<string, string> = { wentWell: r.wentWell && `✓ ${r.wentWell}`, adjust: r.adjust && `→ ${r.adjust}`, why: r.why && `Why: ${r.why}` };
  return [...feedbackTemplate(p).order.map((k) => parts[k]), r.nextRep && `Next: ${r.nextRep}`].filter(Boolean).join('\n');
}
/** Plain-language version for parents (weekly summary). */
export const plainFeedback = (p: Player, r: Pick<Review, 'wentWell' | 'adjust' | 'decision'>) => `${fn(p)} ${r.decision === 'approve' ? 'nailed a rep' : 'is retrying a rep'}. Doing well: ${lower(r.wentWell)}. Working on: ${lower(r.adjust)}.`;
/** "Coach knows you": the player's own words (editable), else built from onboarding. */
export function coachKnows(p: Player) {
  if (p.aboutMe?.trim()) return p.aboutMe.trim();
  const bits = [p.goal && `wants to ${lower(p.goal)}`, p.position && `plays ${p.position.toLowerCase()}`, p.learnStyle && `learns best by “${lower(p.learnStyle)}”`, p.rhythm && `practices ${p.rhythm}`, p.proudOf && `is proud of ${lower(p.proudOf)}`, p.frustration && `gets frustrated when ${lower(p.frustration)}`].filter(Boolean);
  return bits.length ? `${fn(p)} ${bits.join(', ')}.` : '';
}

/** Weekly rhythm: Mon plan drop · Wed mid-week check-in · Fri wrap/reflection · Sun parent digest. */
export type RhythmKey = 'plan-drop' | 'midweek' | 'wrap' | 'digest' | 'rest';
export const RHYTHM: { key: RhythmKey; day: number; label: string; player: string; coach: string }[] = [
  { key: 'plan-drop', day: 1, label: 'Mon · Plan drop', player: 'This week’s reps are on Today.', coach: 'Plans and adjustments go out.' },
  { key: 'midweek', day: 3, label: 'Wed · Mid-week check-in', player: 'Log at least one rep by tonight.', coach: 'Nudge anyone without a check-in.' },
  { key: 'wrap', day: 5, label: 'Fri · Wrap & reflect', player: 'Two lines on your week.', coach: 'Reflections land in your profile view.' },
  { key: 'digest', day: 0, label: 'Sun · Parent summary', player: 'Your parent gets your week in a minute.', coach: 'Approve the drafted digests.' },
];
export function rhythmToday(d: Date) { return RHYTHM.find((r) => r.day === d.getDay()) ?? { key: 'rest' as const, day: d.getDay(), label: 'Train day', player: 'Do your next rep and today’s habits.', coach: 'Clear the queue.' }; }
export const subsThisWeek = (s: Snapshot, pid: string, wk: string, weekKey: (d: Date) => string) => s.submissions.filter((x) => x.playerId === pid && weekKey(new Date(x.at)) === wk);
