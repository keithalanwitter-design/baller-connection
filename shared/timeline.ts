// v7: progress timeline, coach-approved "what changed and why", Wins wall and the shareable Player Card.
import type { Player, Snapshot } from './domain';
import { isoDay, shortWhen, weekKey } from './time';
import { first, progress } from './workflow';
import { confidenceTrend, gamesOf, shotStats, shotsFor, transfer } from './games';

export interface TimelineData {
  games: { id: string; date: string; pts: number | null; conf: number; tried: string | null; opponent: string | null; note: string | null }[];
  focusStarts: { date: string; focus: string; index: number }[];
  rubric: { date: string; index: number; avg: number; changes: string[] }[];
  reps: { week: string; count: number }[]; clips: { date: string }[]; shots: { date: string; pct: number; best: string | null }[];
  wins: { date: string; text: string; kind: string }[]; notes: { date: string; text: string; by: string; refId?: string | null }[];
  streak: number; story: { text: string; by: string; at: string; drafted: boolean } | null; start: string; end: string;
}
const avg = (r: Record<string, number>) => { const v = Object.values(r); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : 0; };

export function timeline(s: Snapshot, pid: string, includeDrafts = false): TimelineData {
  const games = gamesOf(s, pid); const notes = (s.timelineNotes ?? []).filter((n) => n.playerId === pid);
  const cycles = s.cycles.filter((c) => c.playerId === pid).sort((a, b) => a.index - b.index);
  const subs = s.submissions.filter((x) => x.playerId === pid); const byWeek = new Map<string, number>(); for (const x of subs) byWeek.set(weekKey(new Date(x.at)), (byWeek.get(weekKey(new Date(x.at))) ?? 0) + 1);
  const crs = (s.cycleReviews ?? []).filter((c) => c.playerId === pid && c.coachAt && c.ratingsAfter);
  const story = notes.filter((n) => n.kind === 'story' && (includeDrafts || n.status === 'approved')).sort((a, b) => b.at.localeCompare(a.at))[0];
  const dates = [...games.map((g) => g.date), ...cycles.map((c) => c.startAt.slice(0, 10)), ...subs.map((x) => x.at.slice(0, 10))].sort();
  const p = s.players.find((x) => x.id === pid);
  return {
    games: games.map((g) => ({ id: g.id, date: g.date, pts: g.stats?.pts ?? null, conf: g.confidence, tried: g.focusTried ?? null, opponent: g.opponent ?? null, note: notes.find((n) => n.kind === 'annotation' && n.refId === g.id)?.text ?? null })),
    focusStarts: cycles.map((c) => ({ date: c.startAt.slice(0, 10), focus: c.focus, index: c.index })),
    rubric: [...(p && Object.keys(p.rubric).length && !crs.length ? [{ date: cycles[0]?.startAt.slice(0, 10) ?? isoDay(new Date()), index: 0, avg: avg(p.rubric), changes: [] as string[] }] : []), ...crs.map((c) => ({ date: c.coachAt!.slice(0, 10), index: cycles.find((x) => x.id === c.cycleId)?.index ?? 0, avg: avg(c.ratingsAfter!), changes: Object.entries(c.ratingsAfter!).filter(([k, v]) => v !== c.ratingsBefore?.[k]).map(([k, v]) => `${k} ${c.ratingsBefore?.[k]} → ${v}`) }))],
    reps: [...byWeek].sort().map(([week, count]) => ({ week, count })),
    clips: (s.clips ?? []).filter((c) => c.playerId === pid && !c.deletedAt).map((c) => ({ date: c.at.slice(0, 10) })),
    shots: shotsFor(s, pid).map((x) => { const st = shotStats(x.shots)!; return { date: x.at.slice(0, 10), pct: st.pct, best: st.best?.name ?? null }; }),
    wins: (s.wins ?? []).filter((w) => w.playerId === pid).sort((a, b) => b.at.localeCompare(a.at)).map((w) => ({ date: w.at.slice(0, 10), text: w.text, kind: w.kind })),
    notes: notes.filter((n) => n.kind === 'annotation').map((n) => ({ date: n.date, text: n.text, by: n.by, refId: n.refId })),
    streak: progress(s, pid).streak, story: story ? { text: story.text, by: story.by, at: story.at, drafted: !!story.drafted } : null,
    start: dates[0] ?? isoDay(new Date()), end: dates[dates.length - 1] ?? isoDay(new Date()),
  };
}

/** Plain-language draft from the logged data, anchored on the coach's focus. Coaches edit and approve it; families only ever see the approved version, signed by the coach. */
export function draftStory(s: Snapshot, p: Player) {
  const c = s.cycles.filter((x) => x.playerId === p.id).sort((a, b) => b.index - a.index)[0]; const fn = first(p.name);
  if (!c) return `${fn} hasn’t started a focus yet.`;
  const t = transfer(s, p.id, c.id); const tr = confidenceTrend(s, p.id); const subs = s.submissions.filter((x) => s.assignments.find((a) => a.id === x.assignmentId)?.cycleId === c.id);
  const r = s.reviews.filter((x) => x.playerId === p.id && x.status === 'final').sort((a, b) => b.at.localeCompare(a.at))[0];
  const sh = shotsFor(s, p.id).at(-1); const st = sh ? shotStats(sh.shots) : null;
  const parts = [`Since we set the focus “${c.focus}” on ${shortWhen(c.startAt)}, ${fn} has logged ${subs.length} practice check-in${subs.length === 1 ? '' : 's'}.`];
  if (t.games) parts.push(`${t.label.replace('Focus showed up', 'The focus showed up')} (${fn}’s own read).`);
  if (tr && tr.from !== tr.to) parts.push(`Game confidence moved from ${tr.from} to ${tr.to} out of 5.`);
  if (r?.adjust) parts.push(`The adjustment we’re working on: “${r.adjust}”.`);
  if (st?.best) parts.push(`Shooting log: ${st.pct}% overall, best from the ${st.best.name.toLowerCase()} (${st.best.made}/${st.best.att}).`);
  parts.push('Why it matters: [coach, add one line in your own words].');
  return parts.join(' ');
}

/** What a shared Player Card shows. First name only for under-13s; stats only when the parent opted in. */
export function publicCard(s: Snapshot, p: Player) {
  const pr = progress(s, p.id); const c = s.cycles.filter((x) => x.playerId === p.id).sort((a, b) => b.index - a.index)[0]; const card = p.card;
  const wins = (s.wins ?? []).filter((w) => w.playerId === p.id); const moment = wins.find((w) => w.id === card?.momentId) ?? wins.filter((w) => w.kind === 'coach' || w.kind === 'best').sort((a, b) => b.at.localeCompare(a.at))[0];
  const coachWin = wins.filter((w) => w.kind === 'coach').sort((a, b) => b.at.localeCompare(a.at))[0]; const r = s.reviews.filter((x) => x.playerId === p.id && x.status === 'final' && x.wentWell).sort((a, b) => b.at.localeCompare(a.at))[0];
  const gs = gamesOf(s, p.id); const sum = (k: 'pts' | 'reb' | 'ast') => { const v = gs.map((g) => g.stats?.[k]).filter((x): x is number => x != null); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null; };
  const [fn, ...rest] = p.name.split(' ');
  return {
    name: p.age < 13 ? fn : `${fn} ${rest.length ? rest[rest.length - 1][0] + '.' : ''}`.trim(), position: p.position || null, level: pr.level, levelName: pr.name, streak: pr.streak, focus: c?.focus ?? null,
    quote: coachWin?.text ?? r?.wentWell ?? null, coach: s.users.find((u) => u.id === p.coachId)?.name ?? 'Coach', moment: moment?.text ?? null,
    stats: card?.showStats && gs.length ? { games: gs.length, pts: sum('pts'), reb: sum('reb'), ast: sum('ast') } : null, program: s.settings.programName,
  };
}
export type PublicCard = ReturnType<typeof publicCard>;
