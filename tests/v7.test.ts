import { describe, expect, it } from 'vitest';
import type { Command, Snapshot } from '../shared/domain';
import { dispatch, WorkflowError } from '../shared/engine';
import { scopeSnapshot, type Actor } from '../shared/permissions';
import { seed } from '../shared/seed';
import { cleanShots, confidenceDip, gamePlan, isYoung, shotStats } from '../shared/games';
import { draftStory, publicCard } from '../shared/timeline';
import { buildQueue, OWED } from '../shared/workflow';
import { client, login, makeEnv } from './helpers';

const HEAD: Actor = { id: 'u_head', role: 'head' }; const ASST: Actor = { id: 'u_asst', role: 'assistant' }; const SYS: Actor = { id: 'system', role: 'system' }; const OPS: Actor = { id: 'u_ops', role: 'ops' };
const AV: Actor = { id: 'u_avery', role: 'player', playerId: 'avery', familyId: 'f_pine' }; const DANA: Actor = { id: 'u_dana', role: 'parent', familyId: 'f_pine' };
const RI: Actor = { id: 'u_riley', role: 'player', playerId: 'riley', familyId: 'f_moss' };
const run = (s: Snapshot, a: Actor, ...cs: Command[]) => cs.reduce((x, c) => dispatch(x, c, a).snapshot, s);
const P = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!;
const game = (extra: Partial<Extract<Command, { type: 'logGame' }>> = {}): Command => ({ type: 'logGame', playerId: 'avery', confidence: 4, carried: 'Went left twice', missed: 'Lost it once on the switch', ...extra });

describe('v9 game note + coach mark', () => {
  it('a short note ties to the current focus; a light queue item with no deadline; the coach’s mark clears it and a carried mark lands on the wall', () => {
    const s0 = seed(); s0.wins = s0.wins.filter((w) => !(w.playerId === 'avery' && w.kind === 'focus')); const s = run(s0, AV, game({ opponent: 'Hillcrest' })); const g = s.games.at(-1)!;
    expect(g.cycleId).toBe('c_avery'); expect(g.focusText).toMatch(/Weak-hand/); expect(g.carried).toMatch(/left twice/); expect(g.missed).toMatch(/switch/); expect(g.mark).toBeNull(); expect(g.dueBy).toBeNull();
    const item = buildQueue(s, 'u_head').find((q) => q.key === `game:${g.id}`)!; expect(item.kind).toBe('Game note'); expect(item.dueBy).toBeUndefined(); expect(OWED(item.kind)).toBe(false);
    expect(s.notifications.some((n) => n.userId === 'u_head' && n.type === 'game')).toBe(true);
    const marked = run(s, HEAD, { type: 'markGame', playerId: 'avery', gameId: g.id, mark: 'carried', note: 'That is the focus showing up.' });
    expect(buildQueue(marked, 'u_head').some((q) => q.key === `game:${g.id}`)).toBe(false); expect(marked.games.at(-1)!.mark).toBe('carried');
    expect(marked.wins.some((w) => w.kind === 'focus' && /Carried into a game/.test(w.text))).toBe(true);
    expect(() => run(s, AV, { type: 'markGame', playerId: 'avery', gameId: g.id, mark: 'carried' })).toThrow(); expect(() => run(s, DANA, { type: 'markGame', playerId: 'avery', gameId: g.id, mark: 'carried' })).toThrow();
    expect(() => run(s, HEAD, { type: 'markGame', playerId: 'avery', gameId: g.id, mark: 'great' as never })).toThrow(WorkflowError);
  });
  it('there is no per-game reply to owe, no “focus tried” score and no percentage anywhere', () => {
    const s = run(seed(), AV, game()); const g = s.games.at(-1)!; expect(g.wantsReply).toBe(false); expect(g.focusTried).toBeNull();
    expect(JSON.stringify(s.games)).not.toMatch(/transfer/i); expect(s.outbox.every((m) => !/\d+%/.test(m.body))).toBe(true);
  });
  it('validates: one line on what carried over, 1–5 “how it felt”, made ≤ tried, no future games', () => {
    const s = seed(); const bad = (c: Partial<Extract<Command, { type: 'logGame' }>>) => expect(() => run(s, AV, game(c))).toThrow(WorkflowError);
    bad({ confidence: 0 }); bad({ energy: 6 }); bad({ carried: '' }); bad({ stats: { fgm: 5, fga: 3 } }); bad({ stats: { tpm: 3, fgm: 2 } }); bad({ stats: { pts: -1 } }); bad({ date: '2999-01-01' });
    expect(run(s, AV, game({ carried: 'Nothing yet' })).games.length).toBe(s.games.length + 1);
    expect(() => run(s, AV, { ...game(), playerId: 'riley' } as Command)).toThrow(); expect(() => run(s, OPS, game())).toThrow();
    expect(() => run(s, AV, game({ playerId: 'theo' }))).toThrow();
  });
  it('under-13 players get the young mode (emoji scale, fewer stats)', () => { const s = seed(); expect(isYoung(P(s, 'sam'))).toBe(true); expect(isYoung(P(s, 'avery'))).toBe(false); });
  it('the parent note carries the coach’s read of the last game note, never a rate', () => {
    const s = run(run(seed(), AV, game({ stats: { pts: 8 } })), HEAD, { type: 'generateDigests' }); const d = s.digests.find((x) => x.playerId === 'avery')!;
    expect(d.text).toMatch(/Game note/); expect(d.text).not.toMatch(/\d+%|transfer|confidence averaged/i);
  });
  it('a carried mark adds one coach-curated moment per focus (deduped); the first note is a milestone', () => {
    const s0 = seed(); s0.wins = s0.wins.filter((w) => !(w.playerId === 'avery' && w.kind === 'focus'));
    const a1 = run(s0, AV, game()); let s = run(a1, HEAD, { type: 'markGame', playerId: 'avery', gameId: a1.games.at(-1)!.id, mark: 'carried' });
    const n = s.wins.filter((w) => w.kind === 'focus').length; expect(n).toBe(1);
    const a2 = run(s, AV, game()); s = run(a2, HEAD, { type: 'markGame', playerId: 'avery', gameId: a2.games.at(-1)!.id, mark: 'carried' });
    expect(s.wins.filter((w) => w.kind === 'focus').length).toBe(1); const bests = s.wins.filter((w) => w.kind === 'best').length; expect(run(s, AV, game({ stats: { pts: 40 } })).wins.filter((w) => w.kind === 'best').length).toBe(bests); // no points-based “personal best” wins
  });
});

describe('pressure reps', () => {
  it('pressure reps are saved on drills (target required) and copied into plans', () => {
    const s = run(seed(), HEAD, { type: 'saveDrill', drill: { title: 'Timed closeouts', reps: 3, minutes: 10, cues: ['Chop feet'], tags: [], pressure: { kind: 'timed', target: '30 seconds per set' } } });
    expect(s.drills.at(-1)!.pressure).toEqual({ kind: 'timed', target: '30 seconds per set' });
    expect(() => run(seed(), HEAD, { type: 'saveDrill', drill: { title: 'X', reps: 3, minutes: 10, cues: [], tags: [], pressure: { kind: 'defender', target: ' ' } } })).toThrow(/target/);
    const p = run(seed(), HEAD, { type: 'publishPlan', saw: 'Quick hands, eyes drop under pressure.', playerId: 'sam', focus: 'Handle pressure', drillIds: ['d7'] }); expect(p.assignments.at(-1)!.pressure?.target).toMatch(/4 of 5/);
  });
});

describe('v7 confidence', () => {
  it('flags rougher games two in a row to the coach only (notification + queue), cleared when the coach responds', () => {
    let s = seed(); s.games = s.games.filter((g) => g.playerId !== 'avery');
    s = run(s, AV, game({ confidence: 4, date: '2026-10-01' }), game({ confidence: 3, date: '2026-10-03' })); expect(confidenceDip(s, 'avery')).toBeNull();
    s = run(s, AV, game({ confidence: 2 })); const dip = confidenceDip(s, 'avery')!; expect(dip.values).toEqual([4, 3, 2]);
    expect(s.notifications.filter((n) => n.type === 'confidence').map((n) => n.userId)).toEqual(['u_head']);
    expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Check in' && /rougher/.test(q.what))).toBe(true);
    expect(scopeSnapshot(s, DANA).notifications.some((n) => n.type === 'confidence')).toBe(false);
    s = run(s, HEAD, { type: 'markGame', playerId: 'avery', gameId: dip.last.id, mark: 'partly', note: 'Good effort. Let’s talk Thursday.' }); expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Check in' && /rougher/.test(q.what))).toBe(false);
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
  it('is saved with the rep check-in and shows in coach review data', () => {
    const shots = [[4, 5], [3, 5], [2, 5], [5, 5], [1, 5]];
    const s = run(seed(), AV, { type: 'submitRep', playerId: 'avery', repsDone: 2, reflection: 'Finished better on the right side', shots }); const sub = s.submissions.at(-1)!;
    expect(sub.shots).toEqual(shots); expect(shotStats(sub.shots)!.best?.name).toBe('Right wing'); expect(shotStats(sub.shots)!.pct).toBe(60);
    expect(() => run(seed(), AV, { type: 'submitRep', playerId: 'avery', repsDone: 2, reflection: 'Finished better', shots: [[9, 5], [0, 0], [0, 0], [0, 0], [0, 0]] })).toThrow(WorkflowError);
  });
});

describe('v7 Player Card privacy', () => {
  it('is off by default, parent-only, token hidden from everyone but the parent; never stats; first name only under 13', () => {
    let s = seed(); expect(P(s, 'avery').card ?? null).toBeNull();
    for (const a of [HEAD, AV, OPS]) expect(() => run(s, a, { type: 'setCard', playerId: 'avery', enabled: true })).toThrow();
    s = run(s, DANA, { type: 'setCard', playerId: 'avery', enabled: true }); const tok = P(s, 'avery').card!.token!; expect(tok).toMatch(/^[a-f0-9]{32}$/);
    expect(scopeSnapshot(s, DANA).players.find((p) => p.id === 'avery')!.card!.token).toBe(tok);
    for (const a of [HEAD, AV, ASST]) expect(JSON.stringify(scopeSnapshot(s, a))).not.toContain(tok);
    expect(Object.keys(publicCard(s, P(s, 'avery')))).not.toContain('stats'); expect(JSON.stringify(publicCard(s, P(s, 'avery')))).not.toMatch(/level|streak/i); expect(publicCard(s, P(s, 'avery')).name).toBe('Avery P.');
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
    const r = await anon.get('/api/card/' + tok); expect(r.status).toBe(200); expect(r.body.name).toBe('Avery P.'); expect(r.body.stats).toBeUndefined(); expect(Object.keys(r.body)).not.toContain('goal'); expect(JSON.stringify(r.body)).not.toMatch(/dana|canvas|demo\.test/i);
    await dana.cmd({ type: 'setCard', playerId: 'avery', newLink: true, enabled: true }); expect((await anon.get('/api/card/' + tok)).status).toBe(404);
    await dana.cmd({ type: 'setCard', playerId: 'avery', enabled: false }); const tok2 = (await dana.get('/api/snapshot')).body.snapshot.players.find((p: { id: string }) => p.id === 'avery').card.token; expect((await anon.get('/api/card/' + tok2)).status).toBe(404);
  });
});

describe('v7 progress story + notes', () => {
  it('“what changed and why”: data draft cites the coach focus, needs the coach’s own line to approve, families never see drafts', () => {
    let s = seed(); const d = draftStory(s, P(s, 'riley')); expect(d).toMatch(/Catch-and-shoot rhythm/); expect(d).toMatch(/game note/); expect(d).not.toMatch(/\bAI\b|%/);
    expect(() => run(s, ASST, { type: 'addNote', playerId: 'riley', kind: 'story', text: d, approve: true, drafted: true })).toThrow(/own words/);
    s = run(s, ASST, { type: 'addNote', playerId: 'riley', kind: 'story', text: d, drafted: true }); expect(scopeSnapshot(s, RI).timelineNotes.some((n) => n.kind === 'story')).toBe(false);
    const mine = d.replace(/What I see now:.*$/, 'What I see now: game speed is where the rhythm has to live.'); s = run(s, ASST, { type: 'addNote', playerId: 'riley', kind: 'story', text: mine, approve: true, drafted: true });
    expect(scopeSnapshot(s, RI).timelineNotes.find((n) => n.kind === 'story')?.text).toMatch(/game speed/); expect(s.timelineNotes.filter((n) => n.playerId === 'riley' && n.kind === 'story')).toHaveLength(1);
    expect(() => run(s, RI, { type: 'addNote', playerId: 'riley', kind: 'annotation', text: 'my note' })).toThrow(); expect(() => run(s, HEAD, { type: 'addNote', playerId: 'riley', kind: 'story', text: 'Our AI coach says hi', approve: true })).toThrow(/written by the coach/);
  });
  it('coach annotations attach to a game; coach-tagged wins notify the family; ops sees none of it', () => {
    let s = run(seed(), HEAD, { type: 'addNote', playerId: 'avery', kind: 'annotation', refId: 'g_av3', text: 'Started trusting the left here' }, { type: 'tagWin', playerId: 'avery', text: 'Took a charge vs Westbrook', refId: 'g_av3' });
    expect(s.timelineNotes.some((n) => n.refId === 'g_av3' && /trusting the left/.test(n.text))).toBe(true); expect(s.wins.some((w) => w.kind === 'coach' && w.by === 'u_head' && /charge/.test(w.text))).toBe(true);
    expect(s.notifications.some((n) => n.userId === 'u_avery' && /noticed/.test(n.text))).toBe(true);
    const o = scopeSnapshot(s, OPS); expect(o.games).toHaveLength(0); expect(o.wins).toHaveLength(0); expect(o.timelineNotes).toHaveLength(0);
    expect(() => run(s, ASST, { type: 'tagWin', playerId: 'avery', text: 'Not my player' })).toThrow(); void SYS;
  });
  it('a player data deletion removes games, wins and notes', () => {
    let s = run(seed(), DANA, { type: 'requestData', playerId: 'avery', kind: 'delete' }); const rq = s.dataRequests.at(-1)!; s = run(s, OPS, { type: 'completeDataRequest', requestId: rq.id });
    expect(s.games.some((g) => g.playerId === 'avery')).toBe(false); expect(s.wins.some((w) => w.playerId === 'avery')).toBe(false); expect(s.timelineNotes.some((n) => n.playerId === 'avery')).toBe(false);
  });
  it('games persist through the SQL repository (Node/D1 path)', async () => {
    const env = await makeEnv(); const av = await login(env, 'dana@demo.test');
    const r = await av.cmd({ type: 'logGame', playerId: 'avery', confidence: 3, carried: 'Boxed out', missed: 'Rushed one', stats: { pts: 5, reb: 7 } }); expect(r.status).toBe(200);
    const snap = (await (await login(env, 'head@demo.test')).get('/api/snapshot')).body.snapshot as Snapshot; const g = snap.games.filter((x) => x.playerId === 'avery').at(-1)!;
    expect(g.stats).toEqual({ pts: 5, reb: 7 }); expect(g.wantsReply).toBe(false); expect(g.carried).toBe('Boxed out'); expect(g.missed).toBe('Rushed one'); expect(snap.drills.find((d) => d.id === 'd7')!.pressure?.kind).toBe('counted');
  });
});
