import { describe, expect, it } from 'vitest';
import type { Command, Snapshot } from '../shared/domain';
import { dispatch, WorkflowError } from '../shared/engine';
import { scopeSnapshot, type Actor } from '../shared/permissions';
import { seed } from '../shared/seed';
import { cleanShots, confidenceDip, gamePlan, gamesOf, isYoung, shotStats, transfer, transferCue } from '../shared/games';
import { draftStory, publicCard, timeline } from '../shared/timeline';
import { buildQueue, OWED } from '../shared/workflow';
import { client, login, makeEnv } from './helpers';

const HEAD: Actor = { id: 'u_head', role: 'head' }; const ASST: Actor = { id: 'u_asst', role: 'assistant' }; const SYS: Actor = { id: 'system', role: 'system' }; const OPS: Actor = { id: 'u_ops', role: 'ops' };
const AV: Actor = { id: 'u_avery', role: 'player', playerId: 'avery', familyId: 'f_pine' }; const DANA: Actor = { id: 'u_dana', role: 'parent', familyId: 'f_pine' };
const RI: Actor = { id: 'u_riley', role: 'player', playerId: 'riley', familyId: 'f_moss' };
const run = (s: Snapshot, a: Actor, ...cs: Command[]) => cs.reduce((x, c) => dispatch(x, c, a).snapshot, s);
const P = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!;
const game = (extra: Partial<Extract<Command, { type: 'logGame' }>> = {}): Command => ({ type: 'logGame', playerId: 'avery', confidence: 4, focus: 4, energy: 3, wellDone: 'Went left twice', focusTried: 'yes', ...extra });
const fb = { wentWell: 'You went left under pressure', adjust: 'Eyes up before the trap', why: 'That is the focus showing up in games' };

describe('v7 game log + post-game check-in', () => {
  it('logs a few-tap game tied to the weekly focus; light queue item with no SLA unless the player asks', () => {
    const s = run(seed(), AV, game({ stats: { pts: 6, fgm: 3, fga: 7 }, opponent: 'Hillcrest' })); const g = s.games.at(-1)!;
    expect(g.cycleId).toBe('c_avery'); expect(g.focusText).toMatch(/Weak-hand/); expect(g.wantsReply).toBe(false); expect(g.dueBy).toBeNull();
    const item = buildQueue(s, 'u_head').find((q) => q.key === `game:${g.id}`)!; expect(item.kind).toBe('Game log'); expect(item.dueBy).toBeUndefined(); expect(OWED(item.kind)).toBe(false);
    expect(s.notifications.some((n) => n.userId === 'u_head' && n.type === 'game')).toBe(true);
    const seen = run(s, HEAD, { type: 'reviewGame', playerId: 'avery', gameId: g.id }); expect(buildQueue(seen, 'u_head').some((q) => q.key === `game:${g.id}`)).toBe(false);
  });
  it('asking for feedback makes it owed with the tier reply window; coach replies in the standard format', () => {
    let s = run(seed(), AV, game({ wantsReply: true })); const g = s.games.at(-1)!; const item = buildQueue(s, 'u_head').find((q) => q.key === `game:${g.id}`)!;
    expect(item.kind).toBe('Game check-in'); expect(item.dueBy).toBe(g.dueBy); expect(OWED(item.kind)).toBe(true);
    expect(() => run(s, HEAD, { type: 'reviewGame', playerId: 'avery', gameId: g.id })).toThrow(/asked for feedback/);
    expect(() => run(s, HEAD, { type: 'reviewGame', playerId: 'avery', gameId: g.id, wentWell: 'ok', adjust: '', why: '' })).toThrow(WorkflowError);
    s = run(s, HEAD, { type: 'reviewGame', playerId: 'avery', gameId: g.id, ...fb }); const r = s.games.at(-1)!.reply!;
    expect(r.feedback).toMatch(/→ Eyes up before the trap/); expect(r.feedback).toMatch(/Why: That is the focus/); expect(r.by).toBe('u_head');
    expect(s.outbox.some((m) => m.kind === 'feedback-ready' && /your game/.test(m.body))).toBe(true);
  });
  it('validates: 1–5 check-in, one line, made ≤ tried, focus question when a focus is active, no future games, one ask a week', () => {
    const s = seed(); const bad = (c: Partial<Extract<Command, { type: 'logGame' }>>) => expect(() => run(s, AV, game(c))).toThrow(WorkflowError);
    bad({ confidence: 0 }); bad({ energy: 6 }); bad({ wellDone: '' }); bad({ stats: { fgm: 5, fga: 3 } }); bad({ stats: { tpm: 3, fgm: 2 } }); bad({ stats: { pts: -1 } }); bad({ focusTried: undefined }); bad({ date: '2999-01-01' });
    const once = run(s, AV, game({ wantsReply: true })); expect(() => run(once, AV, game({ wantsReply: true }))).toThrow(/already asked/); expect(run(once, AV, game()).games.length).toBe(once.games.length + 1);
    expect(() => run(s, AV, { ...game(), playerId: 'riley' } as Command)).toThrow(); expect(() => run(s, OPS, game())).toThrow();
    expect(() => run(s, AV, game({ playerId: 'theo' }))).toThrow();
  });
  it('under-13 players get the young mode (emoji scale, fewer stats)', () => { const s = seed(); expect(isYoung(P(s, 'sam'))).toBe(true); expect(isYoung(P(s, 'avery'))).toBe(false); });
  it('parent digest includes games and confidence', () => {
    const s = run(run(seed(), AV, game({ stats: { pts: 8 } })), HEAD, { type: 'generateDigests' }); const d = s.digests.find((x) => x.playerId === 'avery')!;
    expect(d.text).toMatch(/Games: \d+ this week/); expect(d.text).toMatch(/confidence averaged [\d.]+\/5/); expect(d.text).toMatch(/tried the focus in \d+ of \d+/);
  });
  it('personal bests and focus-confirmed games land on the Wins wall (deduped)', () => {
    const s = run(seed(), AV, game({ stats: { pts: 12 } })); expect(s.wins.some((w) => w.kind === 'best' && /12 points/.test(w.text))).toBe(true);
    const s2 = run(s, AV, game({ stats: { pts: 12 } })); expect(s2.wins.filter((w) => /12 points/.test(w.text))).toHaveLength(1);
    expect(s.milestones.some((m) => m.playerId === 'avery' && m.key === 'First game logged')).toBe(true);
  });
});

describe('v7 practice-to-game transfer', () => {
  it('computes the focus-in-game rate (yes 1, sometimes ½, not yet 0) per cycle', () => {
    const s = seed(); const t = transfer(s, 'avery', 'c_avery'); expect(t).toMatchObject({ games: 3, yes: 1, sometimes: 1, notYet: 1, pct: 50 });
    expect(transfer(s, 'riley', 'c_riley').pct).toBe(17); expect(transfer(s, 'sam').rate).toBeNull();
  });
  it('raises a coach “Game transfer” cue under 50% with 2+ games; a pressure rep (or “handled”) clears it', () => {
    const s = seed(); expect(transferCue(s, P(s, 'avery'))).toBeNull(); expect(transferCue(s, P(s, 'riley'))).toBeTruthy();
    expect(buildQueue(s, 'u_asst').some((q) => q.kind === 'Game transfer' && q.player.id === 'riley')).toBe(true);
    const s2 = run(s, ASST, { type: 'adjustPlan', playerId: 'riley', note: 'Adding a pressure rep so it looks like the game', addDrillIds: ['d7'] });
    expect(transferCue(s2, P(s2, 'riley'))).toBeNull(); expect(s2.assignments.at(-1)!.pressure?.kind).toBe('counted');
    const s3 = run(s, ASST, { type: 'addNote', playerId: 'riley', kind: 'cue', text: 'Talked about it' }); expect(transferCue(s3, P(s3, 'riley'))).toBeNull();
  });
  it('pressure reps are saved on drills (target required) and copied into plans', () => {
    const s = run(seed(), HEAD, { type: 'saveDrill', drill: { title: 'Timed closeouts', reps: 3, minutes: 10, cues: ['Chop feet'], tags: [], pressure: { kind: 'timed', target: '30 seconds per set' } } });
    expect(s.drills.at(-1)!.pressure).toEqual({ kind: 'timed', target: '30 seconds per set' });
    expect(() => run(seed(), HEAD, { type: 'saveDrill', drill: { title: 'X', reps: 3, minutes: 10, cues: [], tags: [], pressure: { kind: 'defender', target: ' ' } } })).toThrow(/target/);
    const p = run(seed(), HEAD, { type: 'publishPlan', playerId: 'sam', focus: 'Handle pressure', drillIds: ['d7'] }); expect(p.assignments.at(-1)!.pressure?.target).toMatch(/4 of 5/);
  });
});

describe('v7 confidence', () => {
  it('flags a dip two games in a row to the coach only (notification + queue), cleared when the coach responds', () => {
    let s = seed(); s.games = s.games.filter((g) => g.playerId !== 'avery');
    s = run(s, AV, game({ confidence: 4, date: '2026-10-01' }), game({ confidence: 3, date: '2026-10-03' })); expect(confidenceDip(s, 'avery')).toBeNull();
    s = run(s, AV, game({ confidence: 2 })); const dip = confidenceDip(s, 'avery')!; expect(dip.values).toEqual([4, 3, 2]);
    expect(s.notifications.filter((n) => n.type === 'confidence').map((n) => n.userId)).toEqual(['u_head']);
    expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Confidence')).toBe(true);
    expect(scopeSnapshot(s, DANA).notifications.some((n) => n.type === 'confidence')).toBe(false);
    s = run(s, HEAD, { type: 'reviewGame', playerId: 'avery', gameId: dip.last.id, ...fb }); expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Confidence')).toBe(false);
    const flat = run(seed(), AV, game({ confidence: 4 })); expect(confidenceDip(flat, 'avery')).toBeNull();
  });
  it('game plan card: one focus, one cue, the player’s own line', () => {
    let s = seed(); const g = gamePlan(s, P(s, 'avery')); expect(g.focus).toMatch(/Weak-hand/); expect(g.cue).toMatch(/walk-through/); expect(g.affirmation).toBeNull();
    s = run(s, AV, { type: 'setAffirmation', playerId: 'avery', text: 'I’ve done the left-hand reps. Trust them.' }); expect(gamePlan(s, P(s, 'avery')).affirmation).toMatch(/Trust them/);
    expect(() => run(s, HEAD, { type: 'setAffirmation', playerId: 'avery', text: 'x' })).toThrow();
  });
  it('streaks and rubric gains add wins', () => {
    let s = seed(); const k = ['Handles 10 min', 'Form shots 25', 'Sleep 9 h']; s = run(s, AV, ...k.map((key) => ({ type: 'toggleHabit', playerId: 'avery', key }) as Command));
    expect(s.wins.some((w) => w.playerId === 'avery' && w.kind === 'streak' && w.key === 'streak:3')).toBe(true);
  });
});

describe('v7 5-spot shooting log', () => {
  it('validates and summarizes makes/attempts, best spot and percentage', () => {
    expect(() => cleanShots([[1, 2]])).toThrow(); expect(() => cleanShots([[3, 2], [0, 0], [0, 0], [0, 0], [0, 0]])).toThrow(/more than attempts/); expect(cleanShots([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]])).toBeNull();
    const st = shotStats([[7, 10], [5, 10], [7, 10], [8, 10], [6, 10]])!; expect(st).toMatchObject({ made: 33, att: 50, pct: 66 }); expect(st.best?.name).toBe('Right wing');
  });
  it('is saved with the rep check-in and shows on the timeline and in coach review data', () => {
    const shots = [[4, 5], [3, 5], [2, 5], [5, 5], [1, 5]];
    const s = run(seed(), AV, { type: 'submitRep', playerId: 'avery', repsDone: 2, reflection: 'Finished better on the right side', shots }); const sub = s.submissions.at(-1)!;
    expect(sub.shots).toEqual(shots); expect(shotStats(sub.shots)!.best?.name).toBe('Right wing'); expect(timeline(s, 'avery').shots.at(-1)!.pct).toBe(60);
    expect(() => run(seed(), AV, { type: 'submitRep', playerId: 'avery', repsDone: 2, reflection: 'Finished better', shots: [[9, 5], [0, 0], [0, 0], [0, 0], [0, 0]] })).toThrow(WorkflowError);
  });
});

describe('v7 Player Card privacy', () => {
  it('is off by default, parent-only, token hidden from everyone but the parent; stats only on opt-in; first name only under 13', () => {
    let s = seed(); expect(P(s, 'avery').card ?? null).toBeNull();
    for (const a of [HEAD, AV, OPS]) expect(() => run(s, a, { type: 'setCard', playerId: 'avery', enabled: true })).toThrow();
    s = run(s, DANA, { type: 'setCard', playerId: 'avery', enabled: true }); const tok = P(s, 'avery').card!.token!; expect(tok).toMatch(/^[a-f0-9]{32}$/);
    expect(scopeSnapshot(s, DANA).players.find((p) => p.id === 'avery')!.card!.token).toBe(tok);
    for (const a of [HEAD, AV, ASST]) expect(JSON.stringify(scopeSnapshot(s, a))).not.toContain(tok);
    expect(publicCard(s, P(s, 'avery')).stats).toBeNull(); expect(publicCard(s, P(s, 'avery')).name).toBe('Avery P.');
    s = run(s, DANA, { type: 'setCard', playerId: 'avery', showStats: true }); expect(publicCard(s, P(s, 'avery')).stats?.games).toBeGreaterThan(0);
    const young = { ...P(s, 'avery'), age: 11 }; expect(publicCard(s, young).name).toBe('Avery');
    s = run(s, DANA, { type: 'setCard', playerId: 'avery', newLink: true, enabled: true }); expect(P(s, 'avery').card!.token).not.toBe(tok);
  });
  it('public endpoint: 404 until the parent turns it on, card only (no app data), 404 after off or replace', async () => {
    const env = await makeEnv(); const dana = await login(env, 'dana@demo.test'); const anon = client(env);
    expect((await anon.get('/api/card/' + 'a'.repeat(32))).status).toBe(404);
    expect((await dana.cmd({ type: 'setCard', playerId: 'avery', enabled: true })).status).toBe(200);
    const tok = (await dana.get('/api/snapshot')).body.snapshot.players.find((p: { id: string }) => p.id === 'avery').card.token;
    const head = await login(env, 'head@demo.test'); expect(JSON.stringify((await head.get('/api/snapshot')).body)).not.toContain(tok);
    expect((await head.cmd({ type: 'setCard', playerId: 'avery', enabled: false })).status).toBe(403);
    const r = await anon.get('/api/card/' + tok); expect(r.status).toBe(200); expect(r.body.name).toBe('Avery P.'); expect(r.body.stats).toBeNull(); expect(Object.keys(r.body)).not.toContain('goal'); expect(JSON.stringify(r.body)).not.toMatch(/dana|canvas|demo\.test/i);
    await dana.cmd({ type: 'setCard', playerId: 'avery', newLink: true, enabled: true }); expect((await anon.get('/api/card/' + tok)).status).toBe(404);
    await dana.cmd({ type: 'setCard', playerId: 'avery', enabled: false }); const tok2 = (await dana.get('/api/snapshot')).body.snapshot.players.find((p: { id: string }) => p.id === 'avery').card.token; expect((await anon.get('/api/card/' + tok2)).status).toBe(404);
  });
});

describe('v7 progress timeline', () => {
  it('collects games (points + confidence), focus starts, rubric, reps per week, clips, shots, wins and coach notes', () => {
    const s = seed(); const t = timeline(s, 'avery');
    expect(t.games.map((g) => g.conf)).toEqual([2, 3, 3, 4]); expect(t.games.map((g) => g.pts)).toEqual([4, 6, 7, 9]); expect(t.focusStarts[0].focus).toMatch(/Weak-hand/);
    expect(t.rubric.length).toBeGreaterThan(0); expect(t.reps.reduce((n, r) => n + r.count, 0)).toBe(2); expect(t.notes.length).toBe(2); expect(t.wins.length).toBeGreaterThan(0); expect(t.story?.by).toBe('u_head');
    expect(timeline(s, 'riley').clips).toHaveLength(1); expect(timeline(s, 'riley').shots[0].pct).toBe(64); expect(gamesOf(s, 'riley')).toHaveLength(3);
  });
  it('“what changed and why”: data draft cites the coach focus, needs the coach’s own line to approve, families never see drafts', () => {
    let s = seed(); const d = draftStory(s, P(s, 'riley')); expect(d).toMatch(/Catch-and-shoot rhythm/); expect(d).toMatch(/0 \(\+1 sometimes\) of 3 games/); expect(d).not.toMatch(/\bAI\b/);
    expect(() => run(s, ASST, { type: 'addNote', playerId: 'riley', kind: 'story', text: d, approve: true, drafted: true })).toThrow(/own words/);
    s = run(s, ASST, { type: 'addNote', playerId: 'riley', kind: 'story', text: d, drafted: true }); expect(scopeSnapshot(s, RI).timelineNotes.some((n) => n.kind === 'story')).toBe(false); expect(timeline(scopeSnapshot(s, RI), 'riley').story).toBeNull();
    const mine = d.replace(/Why it matters:.*$/, 'Why it matters: game speed is where the rhythm has to live.'); s = run(s, ASST, { type: 'addNote', playerId: 'riley', kind: 'story', text: mine, approve: true, drafted: true });
    expect(timeline(scopeSnapshot(s, RI), 'riley').story?.text).toMatch(/game speed/); expect(s.timelineNotes.filter((n) => n.playerId === 'riley' && n.kind === 'story')).toHaveLength(1);
    expect(() => run(s, RI, { type: 'addNote', playerId: 'riley', kind: 'annotation', text: 'my note' })).toThrow(); expect(() => run(s, HEAD, { type: 'addNote', playerId: 'riley', kind: 'story', text: 'Our AI coach says hi', approve: true })).toThrow(/written by the coach/);
  });
  it('coach annotations attach to a game; coach-tagged wins notify the family; ops sees none of it', () => {
    let s = run(seed(), HEAD, { type: 'addNote', playerId: 'avery', kind: 'annotation', refId: 'g_av3', text: 'Started trusting the left here' }, { type: 'tagWin', playerId: 'avery', text: 'Took a charge vs Westbrook', refId: 'g_av3' });
    expect(timeline(s, 'avery').games.find((g) => g.id === 'g_av3')!.note).toMatch(/trusting the left/); expect(s.wins.some((w) => w.kind === 'coach' && w.by === 'u_head' && /charge/.test(w.text))).toBe(true);
    expect(s.notifications.some((n) => n.userId === 'u_avery' && /Wins wall/.test(n.text))).toBe(true);
    const o = scopeSnapshot(s, OPS); expect(o.games).toHaveLength(0); expect(o.wins).toHaveLength(0); expect(o.timelineNotes).toHaveLength(0);
    expect(() => run(s, ASST, { type: 'tagWin', playerId: 'avery', text: 'Not my player' })).toThrow(); void SYS;
  });
  it('a player data deletion removes games, wins and notes', () => {
    let s = run(seed(), DANA, { type: 'requestData', playerId: 'avery', kind: 'delete' }); const rq = s.dataRequests.at(-1)!; s = run(s, OPS, { type: 'completeDataRequest', requestId: rq.id });
    expect(s.games.some((g) => g.playerId === 'avery')).toBe(false); expect(s.wins.some((w) => w.playerId === 'avery')).toBe(false); expect(s.timelineNotes.some((n) => n.playerId === 'avery')).toBe(false);
  });
  it('games persist through the SQL repository (Node/D1 path)', async () => {
    const env = await makeEnv(); const av = await login(env, 'dana@demo.test');
    const r = await av.cmd({ type: 'logGame', playerId: 'avery', confidence: 3, focus: 4, energy: 5, wellDone: 'Boxed out', focusTried: 'sometimes', stats: { pts: 5, reb: 7 } }); expect(r.status).toBe(200);
    const snap = (await (await login(env, 'head@demo.test')).get('/api/snapshot')).body.snapshot as Snapshot; const g = snap.games.filter((x) => x.playerId === 'avery').at(-1)!;
    expect(g.stats).toEqual({ pts: 5, reb: 7 }); expect(g.wantsReply).toBe(false); expect(g.focusTried).toBe('sometimes'); expect(snap.drills.find((d) => d.id === 'd7')!.pressure?.kind).toBe('counted');
  });
});
