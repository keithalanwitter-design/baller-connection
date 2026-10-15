import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Command, Snapshot } from '../shared/domain';
import { dispatch } from '../shared/engine';
import { scopeSnapshot, type Actor } from '../shared/permissions';
import { seed } from '../shared/seed';
import { buildQueue, guide } from '../shared/workflow';
import { canSeeClip, clipError, CLIP_MAX_BYTES, normalizeMime, sniffMime, videoDuration } from '../shared/clips';
import { memoryStore } from '../server/blobs';
import { handle } from '../server/app';
import { login, makeEnv } from './helpers';

const HEAD: Actor = { id: 'u_head', role: 'head' }; const ASST: Actor = { id: 'u_asst', role: 'assistant' }; const OPS: Actor = { id: 'u_ops', role: 'ops' }; const SYS: Actor = { id: 'system', role: 'system' };
const DANA: Actor = { id: 'u_dana', role: 'parent', familyId: 'f_pine' }; const CHRIS: Actor = { id: 'u_chris', role: 'parent', familyId: 'f_moss' };
const NIA: Actor = { id: 'u_nia', role: 'player', playerId: 'nia', familyId: 'f_fable' }; const AVERY: Actor = { id: 'u_avery', role: 'player', playerId: 'avery', familyId: 'f_pine' };
const SAM: Actor = { id: 'u_sam', role: 'player', playerId: 'sam', familyId: 'f_quill' }; const JO: Actor = { id: 'u_jo', role: 'parent', familyId: 'f_quill' };
const run = (s: Snapshot, a: Actor, ...cs: Command[]) => cs.reduce((x, c) => dispatch(x, c, a).snapshot, s);
const P = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!;
const fx = (f: string) => new Uint8Array(fs.readFileSync(`tests/fixtures/${f}`));
const fb = { wentWell: 'Feet were set early', adjust: 'Hold the follow-through', why: 'A held finish makes the miss readable' };
const reg = (s: Snapshot, a: Actor, pid: string, over: Partial<{ durationSec: number; bytes: number; mime: string }> = {}, clipId = 'c_t') => run(s, a, { type: 'registerClip', playerId: pid, clipId, storageKey: `clips/${pid}/${clipId}`, mime: 'video/mp4', bytes: 20000, durationSec: 8, watchFor: 'my elbow', ...over });

describe('clip limits (shared by browser, server and engine)', () => {
  it('reads real container durations (ffmpeg fixtures: mp4, mov, webm)', () => {
    expect(videoDuration(fx('short-4s.mp4'))).toBeCloseTo(4, 0); expect(videoDuration(fx('short-5s.mov'))).toBeCloseTo(5, 0); expect(videoDuration(fx('short-6s.webm'))).toBeCloseTo(6, 0); expect(videoDuration(fx('long-35s.mp4'))).toBeCloseTo(35, 0);
    expect(sniffMime(fx('short-5s.mov'))).toBe('video/quicktime'); expect(sniffMime(fx('short-6s.webm'))).toBe('video/webm'); expect(sniffMime(new TextEncoder().encode('not a video at all'))).toBeNull();
  });
  it('validates duration, size and type with family-readable reasons', () => {
    expect(clipError({ mime: 'video/mp4', bytes: 1000, durationSec: 30 })).toBeNull(); expect(clipError({ mime: 'video/mp4', bytes: 1000, durationSec: 30.3 })).toBeNull();
    expect(clipError({ mime: 'video/mp4', bytes: 1000, durationSec: 31 })).toMatch(/31 s.*30 s max/); expect(clipError({ mime: 'video/mp4', bytes: CLIP_MAX_BYTES + 1, durationSec: 5 })).toMatch(/limit is 50 MB/);
    expect(clipError({ mime: 'image/gif', bytes: 10, durationSec: 2 })).toMatch(/MP4, MOV or WebM/); expect(clipError({ mime: 'video/mp4', bytes: 10, durationSec: null })).toMatch(/couldn’t read/);
    expect(normalizeMime('', 'IMG_0042.MOV')).toBe('video/quicktime'); expect(normalizeMime('video/mp4;codecs=avc1')).toBe('video/mp4');
  });
  it('engine refuses a long clip even if a client skips the browser check', () => { expect(() => reg(seed(), AVERY, 'avery', { durationSec: 42 })).toThrow(/30 s max/); expect(() => reg(seed(), AVERY, 'avery', { bytes: CLIP_MAX_BYTES * 2 })).toThrow(/50 MB/); });
  it('under 13: clips need the updated parental consent', () => {
    let s = seed(); s.consents = s.consents.map((c) => (c.playerId === 'sam' ? { ...c, version: '2026-10' } : c));
    expect(() => reg(s, SAM, 'sam')).toThrow(/under 13/); s = run(s, JO, { type: 'recordConsent', playerId: 'sam', guardianName: 'Jo Quill', agreed: true }); expect(reg(s, SAM, 'sam').clips.some((c) => c.id === 'c_t')).toBe(true);
  });
});

describe('clip access control', () => {
  it('only the player, their parent(s) and assigned coaches can see a clip', () => {
    const s = seed(); const c = s.clips.find((x) => x.playerId === 'riley')!; const riley = P(s, 'riley');
    expect(canSeeClip({ id: 'u_riley', role: 'player', playerId: 'riley' }, riley, c)).toBe(true); expect(canSeeClip(CHRIS, riley, c)).toBe(true); expect(canSeeClip(ASST, riley, c)).toBe(true); expect(canSeeClip(HEAD, riley, c)).toBe(true);
    expect(canSeeClip(DANA, riley, c)).toBe(false); expect(canSeeClip(OPS, riley, c)).toBe(false); expect(canSeeClip(AVERY, riley, c)).toBe(false); expect(canSeeClip({ id: 'u_x', role: 'assistant' }, riley, c)).toBe(false);
    expect(scopeSnapshot(s, OPS).clips).toEqual([]); expect(scopeSnapshot(s, DANA).clips.every((x) => x.playerId === 'avery')).toBe(true); expect(scopeSnapshot(s, CHRIS).clips.map((x) => x.id)).toEqual(['clip_riley']);
  });
  it('a coach on another player cannot delete; the family can, and the 90-day sweep does', () => {
    const s = seed(); expect(() => run(s, { id: 'u_other', role: 'assistant' }, { type: 'deleteClip', playerId: 'avery', clipId: 'clip_riley' })).toThrow();
    expect(run(s, CHRIS, { type: 'deleteClip', playerId: 'riley', clipId: 'clip_riley' }).clips.some((x) => x.id === 'clip_riley')).toBe(false);
    expect(run(s, SYS, { type: 'advanceClock', hours: 24 * 88 }).clips.some((x) => x.id === 'clip_riley')).toBe(true); expect(run(s, SYS, { type: 'advanceClock', hours: 24 * 91 }).clips.length).toBe(0);
  });
  it('data deletion removes clips', () => { let s = run(seed(), CHRIS, { type: 'requestData', playerId: 'riley', kind: 'delete' }); s = run(s, OPS, { type: 'completeDataRequest', requestId: s.dataRequests.at(-1)!.id }); expect(s.clips.some((c) => c.playerId === 'riley')).toBe(false); });
});

describe('clips over HTTP (Node/Worker share server/app.ts)', () => {
  const up = (env: Awaited<ReturnType<typeof makeEnv>>, cookie: string | undefined, pid: string, bytes: Uint8Array, type = 'video/mp4', extra: Record<string, string> = {}) =>
    handle(new Request('http://t/api/clips', { method: 'POST', headers: { 'content-type': type, 'x-player-id': pid, 'x-watch-for': encodeURIComponent('my feet'), ...(cookie ? { cookie } : {}), ...extra }, body: bytes as unknown as BodyInit }), env);
  const get = (env: Awaited<ReturnType<typeof makeEnv>>, cookie: string | undefined, id: string, range?: string) => handle(new Request(`http://t/api/clips/${id}`, { headers: { ...(cookie ? { cookie } : {}), ...(range ? { range } : {}) } }), env);
  it('upload: checks the bytes server-side, stores privately, serves only to allowed users, deletes bytes with the clip', async () => {
    const blobs = memoryStore(); const env = await makeEnv({ BLOBS: blobs }); const riley = await login(env, 'riley@demo.test');
    const ok = await up(env, riley.cookie, 'riley', fx('short-4s.mp4')); expect(ok.status).toBe(200); const { clip } = await ok.json() as { clip: { id: string; durationSec: number; watchFor: string; storageKey: string } };
    expect(clip.durationSec).toBeCloseTo(4, 0); expect(clip.watchFor).toBe('my feet'); expect(blobs.keys()).toContain(clip.storageKey);
    expect((await up(env, riley.cookie, 'riley', fx('long-35s.mp4'))).status).toBe(422); // too long (container says 35 s)
    expect((await up(env, riley.cookie, 'riley', new TextEncoder().encode('pretend this is video'))).status).toBe(415); // magic bytes, not the header
    expect((await up(env, riley.cookie, 'riley', fx('short-4s.mp4'), 'video/mp4', { 'content-length': String(CLIP_MAX_BYTES + 10) })).status).toBe(413);
    expect((await up(env, (await login(env, 'ops@demo.test')).cookie, 'riley', fx('short-4s.mp4'))).status).toBe(403);
    expect((await up(env, (await login(env, 'dana@demo.test')).cookie, 'riley', fx('short-4s.mp4'))).status).toBe(404);
    expect((await up(env, undefined, 'riley', fx('short-4s.mp4'))).status).toBe(401);
    const full = await get(env, riley.cookie, clip.id); expect(full.status).toBe(200); expect(full.headers.get('cache-control')).toMatch(/private/); expect((await full.arrayBuffer()).byteLength).toBe(fx('short-4s.mp4').length);
    const part = await get(env, (await login(env, 'chris@demo.test')).cookie, clip.id, 'bytes=0-99'); expect(part.status).toBe(206); expect((await part.arrayBuffer()).byteLength).toBe(100);
    expect((await get(env, (await login(env, 'assistant@demo.test')).cookie, clip.id)).status).toBe(200);
    expect((await get(env, (await login(env, 'dana@demo.test')).cookie, clip.id)).status).toBe(404);
    expect((await get(env, (await login(env, 'ops@demo.test')).cookie, clip.id)).status).toBe(403);
    const forged = await riley.cmd({ type: 'registerClip', playerId: 'riley', clipId: 'x', storageKey: 'x', mime: 'video/mp4', bytes: 10, durationSec: 5 }); expect(forged.status).toBe(403);
    expect((await riley.cmd({ type: 'deleteClip', playerId: 'riley', clipId: clip.id })).status).toBe(200); expect(blobs.keys()).not.toContain(clip.storageKey);
    expect((await get(env, riley.cookie, clip.id)).status).toBe(404);
  });
  it('mov and webm are accepted too; no storage configured → 503', async () => {
    const env = await makeEnv({ BLOBS: memoryStore() }); const riley = await login(env, 'riley@demo.test');
    expect((await up(env, riley.cookie, 'riley', fx('short-5s.mov'), 'video/quicktime')).status).toBe(200); expect((await up(env, riley.cookie, 'riley', fx('short-6s.webm'), 'video/webm')).status).toBe(200);
    const bare = await makeEnv(); expect((await up(bare, (await login(bare, 'riley@demo.test')).cookie, 'riley', fx('short-4s.mp4'))).status).toBe(503);
  });
});

describe('clip review: timestamps, timing, quota', () => {
  const withClip = () => { let s = reg(seed(), DANA, 'avery'); s = run(s, DANA, { type: 'submitRep', playerId: 'avery', repsDone: 2, reflection: 'Slower on the left this time', clipId: 'c_t', watchFor: 'left hand finish' }); return s; };
  it('a clip rides on its submission and counts toward the weekly review allowance', () => {
    const s = withClip(); const sub = s.submissions.at(-1)!; expect(sub.clipId).toBe('c_t'); expect(s.clips.find((c) => c.id === 'c_t')!.submissionId).toBe(sub.id); expect(s.clips.find((c) => c.id === 'c_t')!.watchFor).toBe('left hand finish');
    expect(() => run(s, DANA, { type: 'submitRep', playerId: 'avery', repsDone: 1, reflection: 'again with same clip', clipId: 'c_t' })).toThrow();
  });
  it('timestamped notes attach to the structured feedback; review time is recorded', () => {
    const s = run(withClip(), HEAD, { type: 'review', playerId: 'avery', decision: 'approve', ...fb, notes: [{ t: 12.04, text: 'hips high on gather' }, { t: 3, text: 'good low dribble' }, { t: 5, text: '  ' }], secondsSpent: 214 });
    const r = s.reviews.at(-1)!; expect(r.notes).toEqual([{ t: 3, text: 'good low dribble' }, { t: 12, text: 'hips high on gather' }]); expect(r.secondsSpent).toBe(214); expect(r.feedback).toMatch(/0:12 hips high on gather/);
  });
  it('notes without a clip are refused', () => { const s = run(seed(), DANA, { type: 'submitRep', playerId: 'avery', repsDone: 2, reflection: 'no clip this time' }); expect(() => run(s, HEAD, { type: 'review', playerId: 'avery', decision: 'approve', ...fb, notes: [{ t: 1, text: 'x' }] })).toThrow(/need a clip/); });
  it('drill feedback templates save per drill', () => { const s = run(seed(), HEAD, { type: 'saveDrillFeedback', drillId: 'd1', fbTemplate: fb }); expect(s.drills.find((d) => d.id === 'd1')!.fbTemplate).toEqual(fb); expect(() => run(seed(), NIA, { type: 'saveDrillFeedback', drillId: 'd1', fbTemplate: fb })).toThrow(); });
});

describe('understand + confirm', () => {
  it('say-it-back: the player’s own words go to the coach and the next rep opens; the coach marks it', () => {
    const s0 = seed(); expect(guide(s0, P(s0, 'nia'), 'player').action?.label).toMatch(/Say it in my words/);
    const s = run(s0, NIA, { type: 'teachBack', playerId: 'nia', reviewId: 'r_ni2', change: 'Keep the same tempo on the left side too.', notice: 'My left foot stays planted.' });
    expect(P(s, 'nia').state).toBe('Work ready'); const r = s.reviews.find((x) => x.id === 'r_ni2')!; expect(r.teachBack?.change).toMatch(/same tempo/); expect(r.teachBack?.mark).toBeNull();
    expect(s.notifications.some((n) => n.userId === 'u_asst' && n.type === 'teachback')).toBe(true);
    expect(() => run(s0, NIA, { type: 'teachBack', playerId: 'nia', reviewId: 'r_ni2', change: 'ok' })).toThrow(/your way|sentence/i);
  });
  it('“I have a question” opens a feedback thread and a Reply needed item; no rep unlocks', () => {
    const s = run(seed(), NIA, { type: 'reactFeedback', playerId: 'nia', reviewId: 'r_ni2', reaction: 'question', question: 'Same tempo on the left too?' });
    expect(P(s, 'nia').state).toBe('Next step ready'); expect(buildQueue(s).some((q) => q.kind === 'Reply needed' && q.player.id === 'nia' && /On your feedback/.test(q.what))).toBe(true);
  });
  it('no teach-back after 72 h: one gentle nudge to the player only (never a scold, never the coach)', () => {
    let s = run(seed(), SYS, { type: 'advanceClock', hours: 24 * 3 }); const r = s.reviews.find((x) => x.id === 'r_av2')!; expect(r.teachBack?.mark).toBeNull();
    s = run(seed(), NIA, { type: 'startNext', playerId: 'nia' }); s = run(s, SYS, { type: 'advanceClock', hours: 80 });
    const nudges = s.notifications.filter((n) => n.dedupe.endsWith('nudge:r_ni2')); expect(nudges.map((n) => n.userId)).toEqual(['u_nia']);
    s = run(s, SYS, { type: 'sweep' }); expect(s.notifications.filter((n) => n.dedupe.endsWith('nudge:r_ni2')).length).toBe(1);
    expect(buildQueue(s, 'u_asst').some((q) => q.kind === 'Reply needed' && /teach-back/i.test(q.what))).toBe(false);
  });
  it('“What I’m working on”: one sentence in the player’s words, stamped with the week', () => {
    const s = run(seed(), NIA, { type: 'setWorkingOn', playerId: 'nia', text: 'Hesi into pull-up at the same speed both ways.' }); expect(P(s, 'nia').workingOn).toMatch(/Hesi/); expect(P(s, 'nia').workingOnWeek).toBeTruthy();
    expect(() => run(seed(), NIA, { type: 'setWorkingOn', playerId: 'nia', text: '' })).toThrow(); expect(() => run(seed(), AVERY, { type: 'setWorkingOn', playerId: 'nia', text: 'not mine' })).toThrow();
  });
});
