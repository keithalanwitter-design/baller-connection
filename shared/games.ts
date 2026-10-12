// v7: game log, practice-to-game transfer, confidence, shooting log. Pure helpers (no engine/workflow imports).
import type { FocusTried, Game, GameStats, Player, Snapshot, Submission } from './domain';
import { weekKey } from './time';

export const SPOTS = ['Left corner', 'Left wing', 'Top', 'Right wing', 'Right corner'] as const;
/** Under-13 players get the emoji scale and a shorter stat list. */
export const isYoung = (p: Pick<Player, 'age'>) => p.age < 13;
export const STAT_KEYS: (keyof GameStats)[] = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'ast', 'stl', 'tov'];
export const YOUNG_STATS: (keyof GameStats)[] = ['pts', 'reb', 'ast', 'stl'];
export const STAT_LABEL: Record<keyof GameStats, string> = { min: 'Minutes', pts: 'Points', fgm: 'FG made', fga: 'FG tries', tpm: '3s made', tpa: '3s tried', ftm: 'FT made', fta: 'FT tried', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', tov: 'Turnovers' };
/** Growth language, not grades. */
export const FEEL_WORDS = ['', 'Rough', 'Unsure', 'Steady', 'Confident', 'Locked in'];
export const FEEL_EMOJI = ['', '😟', '😕', '😐', '🙂', '😄'];
export const TRIED_LABEL: Record<FocusTried, string> = { yes: 'Yes', sometimes: 'Sometimes', not_yet: 'Not yet' };
export const TRIED_SCORE: Record<FocusTried, number> = { yes: 1, sometimes: 0.5, not_yet: 0 };

export function cleanStats(st: GameStats = {}): GameStats {
  const out: GameStats = {};
  for (const k of STAT_KEYS) { const v = st[k]; if (v === undefined || v === null || (v as unknown) === '') continue; const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 200) throw new Error(`${STAT_LABEL[k]} must be between 0 and 200.`); out[k] = n; }
  for (const [m, a, l] of [['fgm', 'fga', 'Field goals'], ['tpm', 'tpa', '3-pointers'], ['ftm', 'fta', 'Free throws']] as const) if (out[m] != null && out[a] != null && out[m]! > out[a]!) throw new Error(`${l}: made can’t be more than tried.`);
  if (out.tpm != null && out.fgm != null && out.tpm > out.fgm) throw new Error('3s made are part of FG made, so they can’t be more.');
  return out;
}
export const pct = (m?: number | null, a?: number | null) => (a ? Math.round(((m ?? 0) / a) * 100) : null);
export const gamesOf = (s: Snapshot, pid: string) => (s.games ?? []).filter((g) => g.playerId === pid).sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
export const gameLine = (g: Game) => { const st = g.stats ?? {}; const bits = [st.pts != null && `${st.pts} pts`, st.reb != null && `${st.reb} reb`, st.ast != null && `${st.ast} ast`, st.fga ? `FG ${st.fgm ?? 0}/${st.fga}` : null].filter(Boolean); return bits.length ? bits.join(' · ') : 'No stats (that’s fine)'; };

/** Practice-to-game transfer: did the weekly focus show up in games? yes = 1, sometimes = ½, not yet = 0. */
export function transfer(s: Snapshot, pid: string, cycleId?: string | null) {
  const gs = gamesOf(s, pid).filter((g) => g.focusTried && (cycleId === undefined || g.cycleId === cycleId));
  const yes = gs.filter((g) => g.focusTried === 'yes').length; const sometimes = gs.filter((g) => g.focusTried === 'sometimes').length; const notYet = gs.length - yes - sometimes;
  const rate = gs.length ? (yes + sometimes * 0.5) / gs.length : null;
  return { games: gs.length, yes, sometimes, notYet, rate, pct: rate === null ? null : Math.round(rate * 100), label: rate === null ? 'No games logged yet' : `Focus showed up in ${yes}${sometimes ? ` (+${sometimes} sometimes)` : ''} of ${gs.length} game${gs.length === 1 ? '' : 's'}` };
}
const currentCycle = (s: Snapshot, pid: string) => s.cycles.filter((c) => c.playerId === pid).sort((a, b) => b.index - a.index)[0];
/** Coach cue: 2+ games this cycle and the focus shows up less than half the time (and the coach hasn't marked it handled). */
export function transferCue(s: Snapshot, p: Player) {
  const c = currentCycle(s, p.id); if (!c || c.status !== 'active') return null; const t = transfer(s, p.id, c.id);
  if (t.games < 2 || (t.rate ?? 1) >= 0.5) return null; if ((s.timelineNotes ?? []).some((n) => n.playerId === p.id && n.kind === 'cue' && n.refId === c.id)) return null;
  return { cycle: c, ...t };
}
/** Confidence dropped two games in a row (a > b > c across the last three games). A gentle, coach-only flag. */
export function confidenceDip(s: Snapshot, pid: string) {
  const gs = gamesOf(s, pid).slice(-3); if (gs.length < 3) return null;
  const [a, b, c] = gs.map((g) => g.confidence); if (!(a > b && b > c)) return null; return { games: gs, values: [a, b, c], last: gs[2] };
}
export function confidenceTrend(s: Snapshot, pid: string) { const gs = gamesOf(s, pid); if (gs.length < 2) return null; const h = Math.ceil(gs.length / 2); const avg = (x: Game[]) => x.reduce((n, g) => n + g.confidence, 0) / x.length; return { from: +avg(gs.slice(0, gs.length - h || 1)).toFixed(1), to: +avg(gs.slice(-h)).toFixed(1) }; }

/** 5-spot shooting log summary. */
export function shotStats(shots?: number[][] | null) {
  if (!shots?.length) return null; const spots = SPOTS.map((name, i) => { const [m = 0, a = 0] = shots[i] ?? []; return { name, made: m, att: a, pct: pct(m, a) }; });
  const made = spots.reduce((n, x) => n + x.made, 0); const att = spots.reduce((n, x) => n + x.att, 0); if (!att) return null;
  const best = spots.filter((x) => x.att >= 3).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.att - a.att)[0] ?? null;
  return { spots, made, att, pct: pct(made, att)!, best };
}
export function cleanShots(shots?: number[][]) {
  if (!shots) return null; if (!Array.isArray(shots) || shots.length !== 5) throw new Error('Shooting log needs the 5 spots.');
  const out = shots.map((x) => { const m = Math.round(Number(x?.[0] ?? 0)); const a = Math.round(Number(x?.[1] ?? 0)); if (!Number.isFinite(m) || !Number.isFinite(a) || m < 0 || a < 0 || a > 200) throw new Error('Shot counts must be 0–200.'); if (m > a) throw new Error('Makes can’t be more than attempts.'); return [m, a]; });
  return out.some((x) => x[1] > 0) ? out : null;
}
export const shotsFor = (s: Snapshot, pid: string) => s.submissions.filter((x): x is Submission & { shots: number[][] } => x.playerId === pid && !!x.shots?.length).sort((a, b) => a.at.localeCompare(b.at));

/** Pre-game card: one focus, one cue, one affirmation in the player's words. */
export function gamePlan(s: Snapshot, p: Player) {
  const c = currentCycle(s, p.id); const r = s.reviews.filter((x) => x.playerId === p.id && x.status === 'final').sort((a, b) => b.at.localeCompare(a.at))[0];
  const a = s.assignments.filter((x) => x.playerId === p.id && (x.status === 'open' || x.status === 'submitted'))[0];
  return { focus: c?.focus ?? null, cue: r?.adjust || a?.cues?.[0] || null, affirmation: p.affirmation?.trim() || null, suggestion: p.workingOn?.trim() || (p.proudOf ? `I’m the player who ${p.proudOf.replace(/^I /i, '').toLowerCase()}` : 'I’ve done the reps. I trust them.') };
}
/** Game asks for coach feedback: one per week (they don't use the weekly review allowance). */
export const gameAsksThisWeek = (s: Snapshot, pid: string, now: Date) => (s.games ?? []).filter((g) => g.playerId === pid && g.wantsReply && weekKey(new Date(g.at)) === weekKey(now)).length;
