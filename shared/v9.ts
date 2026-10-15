// v9: the “coach who sees your reps between sessions” helpers. Pure, shared by engine, server and UI.
import type { Game, Player, Review, Session, Snapshot } from './domain';
import { isoDay, weekKey } from './time';
import { clock, first, playerCycle, userName } from './workflow';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const weekdayOf = (iso: string) => WEEKDAYS[new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).getDay()];
export const shortDay = (iso: string) => weekdayOf(iso).slice(0, 3);

/** The three prompts behind “I’m stuck / I’m frustrated”. All optional; answer one or all. */
export const STUCK_PROMPTS = [
  { key: 'happened', label: 'What happened?', hint: 'A game, a drill, a bad day. Whatever it is.' },
  { key: 'want', label: 'What would help right now?', hint: 'A different drill, a lighter week, a conversation.' },
  { key: 'feeling', label: 'How are you feeling about it?', hint: 'One word is fine.' },
] as const;
export const STUCK_PROMISE = (days: number) => `Your coach reads this and writes back himself ${days <= 1 ? 'within 1 business day' : `within ${days} business days`}. He may talk with a parent if something needs a grown-up.`;

/** Teach-back prompts and examples. Text only, optional. */
export const TEACHBACK = {
  title: 'In your words',
  change: 'What will you do differently?',
  notice: 'What will you notice if it works?',
  examples: ['I’ll keep my eyes on the rim until the ball is in my hands. I’ll notice fewer turnovers on the catch.', 'I’ll plant my back foot before I shoot. I think the ball will go up straighter.'],
};

/** The rough-week choices. No streaks to lose, nothing to make up. */
export const ROUGH_WEEK = [
  { key: 'light', label: 'A light week', note: 'Skip clips this week. Nothing to make up.' },
  { key: 'reset', label: 'A reset', note: 'Your coach picks a fresh, smaller focus.' },
  { key: 'talk', label: 'Talk to my coach', note: 'Send a note. He writes back.' },
] as const;

export const REP_CHOICES = [1, 2, 3, 4];

/** The coach's most recent session note, if it’s recent enough to still be “from your session”. */
export function latestSession(s: Snapshot, pid: string, maxDays = 14): Session | null {
  const t = clock(s).getTime(); const x = (s.sessions ?? []).filter((z) => z.playerId === pid).sort((a, b) => b.at.localeCompare(a.at))[0];
  return x && t - new Date(x.at).getTime() <= maxDays * 864e5 ? x : null;
}
export const sessionLine = (x: Session) => `From your session on ${weekdayOf(x.date).slice(0, 3)}`;

/** Three do/don’t tips for parents. One is specific to the current focus. */
export function parentTips(s: Snapshot, p: Player): { kind: 'do' | 'dont'; text: string }[] {
  const cyc = playerCycle(s, p.id); const focus = cyc?.focus;
  return [
    { kind: 'do', text: 'Ask: “What’s your focus this week?” and let them answer in their own words.' },
    { kind: 'do', text: focus ? `If they want to show you, watch one clip together. This month’s focus: ${focus.toLowerCase()}.` : 'If they want to show you a clip, watch it together. Skip the critique.' },
    { kind: 'dont', text: 'Skip “Did you do your reps?” and “Why didn’t that go in?” on the ride home. The coach handles the coaching.' },
  ];
}

/** One plain sentence for a parent: the coach’s own if he wrote one this week, else built from what he’s working on. */
export function parentSentence(s: Snapshot, p: Player): { text: string; byCoach: boolean; by?: string } {
  const n = p.parentNote; if (n && n.week === weekKey(clock(s))) return { text: n.text, byCoach: true, by: userName(s, n.by) };
  const cyc = playerCycle(s, p.id); const r = [...s.reviews].filter((x) => x.playerId === p.id && x.status === 'final').sort((a, b) => b.at.localeCompare(a.at))[0];
  const fn = first(p.name); const coach = first(userName(s, p.coachId));
  if (!cyc) return { text: `${coach} is taking a first look at ${fn}’s clips. You’ll see the first focus here once it’s set.`, byCoach: false };
  const c = weekChoiceNote(p, clock(s)); if (c) return { text: `${fn} is taking a light week by choice. Nothing is owed. The focus is still ${cyc.focus.toLowerCase()}.`, byCoach: false };
  return { text: `${fn} is working on ${cyc.focus.toLowerCase()}.${r?.adjust ? ` ${coach}’s one adjustment right now: ${r.adjust.replace(/[.!]+$/, '').toLowerCase()}.` : ''}`, byCoach: false };
}
export function weekChoiceNote(p: Player, d: Date) { const c = p.weekChoice; return c && c.week === weekKey(d) ? c : null; }

/** “What’s changed since week 1”: the first clip next to the latest clip, with the coach’s note on each. */
export function sinceWeek1(s: Snapshot, pid: string) {
  const clips = (s.clips ?? []).filter((c) => c.playerId === pid && !c.deletedAt).sort((a, b) => a.at.localeCompare(b.at));
  if (clips.length < 2) return null;
  const note = (c: (typeof clips)[number]) => { const sub = s.submissions.find((x) => x.id === c.submissionId); const rev = sub ? s.reviews.find((r) => r.submissionId === sub.id && r.status === 'final') : undefined; return { clip: c, title: s.assignments.find((a) => a.id === c.assignmentId)?.title ?? 'Practice clip', note: rev ? rev.wentWell : '', adjust: rev ? rev.adjust : '' }; };
  const a = note(clips[0]); const b = note(clips[clips.length - 1]);
  const drill = (x: ReturnType<typeof note>) => s.assignments.find((q) => q.id === x.clip.assignmentId)?.drillId ?? null;
  const same = clips.slice().reverse().find((c) => c !== clips[0] && s.assignments.find((q) => q.id === c.assignmentId)?.drillId && s.assignments.find((q) => q.id === c.assignmentId)?.drillId === drill(a));
  return { then: a, now: same ? note(same) : b, sameDrill: !!same, changeNote: [...(s.timelineNotes ?? [])].filter((n) => n.playerId === pid && n.kind === 'story' && n.status === 'approved').sort((x, y) => y.at.localeCompare(x.at))[0]?.text ?? null };
}

/** Coaches read a game note and mark it. Counts for the “carried over” line in the digest. */
export const gameNoteLine = (g: Game) => [g.carried && `Carried over: ${g.carried}`, g.missed && `Didn’t yet: ${g.missed}`].filter(Boolean).join(' · ');

/** A review still waiting on the coach’s read of the player’s teach-back. */
export const teachBackWaiting = (s: Snapshot, pid: string): Review[] => s.reviews.filter((r) => r.playerId === pid && r.status === 'final' && r.teachBack && !r.teachBack.mark);

export const gamifyOn = (p: Pick<Player, 'gamify'>) => !!p.gamify;
export const today = (s: Snapshot) => isoDay(clock(s));

/** Short roles agreement shown at onboarding and again in the parent view. */
export const ROLES_AGREEMENT = [
  { who: 'The player', line: 'sends a clip when we agreed, writes one honest sentence about it, and says the adjustment back in their own words.' },
  { who: 'The parent', line: 'asks about the rep, not the result. Lets the player own the clip day. Doesn’t coach over the coach.' },
  { who: 'The coach', line: 'watches every clip, writes back by the reply window, sets one focus at a time, and tells the player the truth kindly.' },
  { who: 'Everyone', line: 'a missed week is fine. Say so and we reset. “I’m stuck” notes go to the coach only.' },
] as const;
