// v7: progress timeline, coach-approved "what changed and why", Wins wall and the shareable Player Card.
import type { Player, Snapshot } from './domain';
import { shortWhen } from './time';
import { first } from './workflow';
import { gamesOf } from './games';

/** Plain-language draft from the logged data, anchored on the coach's focus. Coaches edit and approve it; families only ever see the approved version, signed by the coach. */
export function draftStory(s: Snapshot, p: Player) {
  const c = s.cycles.filter((x) => x.playerId === p.id).sort((a, b) => b.index - a.index)[0]; const fn = first(p.name);
  if (!c) return `${fn} hasn’t started a focus yet.`;
  const subs = s.submissions.filter((x) => s.assignments.find((a) => a.id === x.assignmentId)?.cycleId === c.id); const clips = subs.filter((x) => x.clipId).length;
  const r = s.reviews.filter((x) => x.playerId === p.id && x.status === 'final').sort((a, b) => b.at.localeCompare(a.at))[0];
  const marks = gamesOf(s, p.id).filter((g) => g.cycleId === c.id && g.mark); const carried = marks.filter((g) => g.mark === 'carried').length;
  const parts = [`Since we set the focus “${c.focus}” on ${shortWhen(c.startAt)}, ${fn} has sent ${subs.length} check-in${subs.length === 1 ? '' : 's'}${clips ? `, ${clips} with a clip` : ''}.`];
  if (marks.length) parts.push(`In ${marks.length} game note${marks.length === 1 ? '' : 's'} I read, it carried over in ${carried}.`);
  if (r?.adjust) parts.push(`The adjustment we’re working on: “${r.adjust}”.`);
  parts.push('What I see now: [coach, add one line in your own words].');
  return parts.join(' ');
}

/** What a shared Player Card shows. First name only for under-13s; stats only when the parent opted in. */
export function publicCard(s: Snapshot, p: Player) {
  const c = s.cycles.filter((x) => x.playerId === p.id).sort((a, b) => b.index - a.index)[0]; const card = p.card;
  const wins = (s.wins ?? []).filter((w) => w.playerId === p.id && (w.kind === 'coach' || w.kind === 'focus')); const moment = wins.find((w) => w.id === card?.momentId) ?? wins.sort((a, b) => b.at.localeCompare(a.at))[0];
  const coachWin = wins.filter((w) => w.kind === 'coach').sort((a, b) => b.at.localeCompare(a.at))[0]; const r = s.reviews.filter((x) => x.playerId === p.id && x.status === 'final' && x.wentWell).sort((a, b) => b.at.localeCompare(a.at))[0];
  const [fn, ...rest] = p.name.split(' ');
  return {
    name: p.age < 13 ? fn : `${fn} ${rest.length ? rest[rest.length - 1][0] + '.' : ''}`.trim(), position: p.position || null, focus: c?.focus ?? null,
    quote: coachWin?.text ?? r?.wentWell ?? null, coach: s.users.find((u) => u.id === p.coachId)?.name ?? 'Coach', moment: moment?.text ?? null, program: s.settings.programName,
  };
}
export type PublicCard = ReturnType<typeof publicCard>;
