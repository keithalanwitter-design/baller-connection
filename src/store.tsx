import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const STATUSES = ['Invited', 'Connected', 'Active', 'Plan set', 'Work ready', 'Submitted', 'Feedback due', 'Next step ready'] as const;
export type Status = (typeof STATUSES)[number];
export type Tier = 'Foundation' | 'Development' | 'Inner Circle';

export interface Assignment {
  id: string; title: string; reps: number; minutes: number; cues: string[];
  state: 'assigned' | 'submitted' | 'approved' | 'retry';
  repsDone?: number; reflection?: string; feedback?: string; submittedAt?: string; reviewedAt?: string;
}
export interface Message { from: 'coach' | 'player' | 'parent'; text: string; at: string }
export interface Player {
  id: string; name: string; age: number; position: string; tier: Tier; status: Status;
  parentName: string; focus: string; goal: string; learnStyle: string; rhythm: string;
  assignments: Assignment[]; habits: string[]; rubric: Record<string, number>;
  messages: Message[]; canvas: string; nextSession: string; inviteCode?: string;
}
export interface Application { id: string; at: string; answers: Record<string, string>; tier: Tier; fit: string; next: string }
export interface State { players: Player[]; applications: Application[]; digests: Record<string, string>; }

export const HABITS = ['Ball-handling 10', 'Form shots 25', 'Sleep 9h'];
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600e3).toISOString();
let n = 0; export const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export const ASSIGNMENT_LIBRARY: Omit<Assignment, 'id' | 'state'>[] = [
  { title: 'Two-ball pound series', reps: 6, minutes: 12, cues: ['Eyes up on every set', 'Fingertips, not palms', 'Stay low through the switch'] },
  { title: 'Weak-hand finishing ladder', reps: 5, minutes: 15, cues: ['Off-foot, high glass', 'Protect the ball with the off arm', 'Finish soft'] },
  { title: 'Form shooting: 5 spots', reps: 5, minutes: 15, cues: ['Same release every rep', 'Hold the follow-through', 'Make 7 of 10 before moving'] },
  { title: 'Closeout and slide', reps: 8, minutes: 10, cues: ['Short choppy steps', 'High hand', 'Never cross your feet'] },
  { title: 'Pull-up off two dribbles', reps: 6, minutes: 14, cues: ['Hard last dribble', 'Square in the air', 'Land where you left'] },
  { title: 'Film self-check (phone, 60 sec)', reps: 1, minutes: 8, cues: ['Pick one clip', 'Name one thing that worked', 'Name one fix'] },
];
const lib = (i: number, extra: Partial<Assignment> = {}): Assignment => ({ ...ASSIGNMENT_LIBRARY[i], id: uid(), state: 'assigned', ...extra });

export function seed(): State {
  return {
    applications: [], digests: {},
    players: [
      { id: 'avery', name: 'Avery Pine', age: 13, position: 'Guard', tier: 'Development', status: 'Work ready', parentName: 'Dana Pine',
        focus: 'Weak-hand control under pressure', goal: 'Make the 8th-grade A team', learnStyle: 'Watch, then try', rhythm: '4 days a week, after school',
        assignments: [
          lib(0, { state: 'approved', repsDone: 6, reflection: 'Lost it on the switch twice. Better when I stayed low.', feedback: 'Exactly the right read. Low = control. Keep the same height next week.', submittedAt: iso(120), reviewedAt: iso(100) }),
          lib(1, { state: 'retry', repsDone: 3, reflection: 'Kept bringing it to my right hand.', feedback: 'Honest note, thank you. Slow it down: 3 walk-through reps before game speed.', submittedAt: iso(60), reviewedAt: iso(50) }),
          lib(1),
        ],
        habits: [day(-1), day(-2), day(-3), day(-5)], rubric: { 'Ball security': 3, 'Weak hand': 2, 'Finishing': 2, 'Defense': 3, 'Shot form': 3 },
        messages: [{ from: 'coach', text: 'Welcome back, Avery. This week is all left hand. One rep at a time.', at: iso(48) }],
        canvas: 'Competitive, quiet in groups. Responds to specific praise. Watch for frustration after 2 misses — reset with a make.', nextSession: day(3) },
      { id: 'riley', name: 'Riley Moss', age: 15, position: 'Wing', tier: 'Inner Circle', status: 'Submitted', parentName: 'Chris Moss',
        focus: 'Catch-and-shoot rhythm', goal: 'Earn varsity minutes', learnStyle: 'Explain the why', rhythm: '5 days a week, mornings',
        assignments: [lib(2, { state: 'submitted', repsDone: 5, reflection: 'Made 7/10 at four spots, stuck at 5/10 on the left wing. Feet felt late.', submittedAt: iso(20) })],
        habits: [day(0), day(-1), day(-2), day(-3), day(-4), day(-5)], rubric: { 'Shot form': 3, 'Footwork': 2, 'Defense': 3, 'Decision making': 4, 'Conditioning': 3 },
        messages: [{ from: 'coach', text: 'Love the morning reps. Film one set from the left wing if you can.', at: iso(70) }, { from: 'parent', text: 'Riley has a tournament Saturday — should we lighten Friday?', at: iso(6) }],
        canvas: 'Strong IQ, overthinks mechanics. Keep cues to one per session.', nextSession: day(1) },
      { id: 'sam', name: 'Sam Quill', age: 12, position: 'Forward', tier: 'Foundation', status: 'Active', parentName: 'Jo Quill',
        focus: '', goal: 'Get comfortable dribbling in traffic', learnStyle: 'Just let me try it', rhythm: '3 days a week, weekends',
        assignments: [], habits: [day(-2)], rubric: { 'Ball security': 2, 'Finishing': 2, 'Defense': 2, 'Footwork': 1, 'Confidence': 2 },
        messages: [], canvas: 'New to structured training. Big growth spurt — keep volume modest.', nextSession: day(5) },
      { id: 'nia', name: 'Nia Fable', age: 14, position: 'Guard', tier: 'Development', status: 'Next step ready', parentName: 'Ray Fable',
        focus: 'Pace changes off the dribble', goal: 'Run point for her club team', learnStyle: 'Watch, then try', rhythm: '4 days a week',
        assignments: [lib(4, { state: 'approved', repsDone: 6, reflection: 'Hesitation worked better than the crossover.', feedback: 'Great discovery. Next: hesi into pull-up, same tempo.', submittedAt: iso(40), reviewedAt: iso(10) }), lib(4, { title: 'Hesitation into pull-up' })],
        habits: [day(-1), day(-2)], rubric: { 'Ball security': 3, 'Pace': 3, 'Shot form': 2, 'Defense': 3, 'Decision making': 3 },
        messages: [{ from: 'player', text: 'Can I add the pull-up from the right side too?', at: iso(4) }],
        canvas: 'Self-starter. Ask her to explain her own reads.', nextSession: day(2) },
      { id: 'theo', name: 'Theo Banks', age: 11, position: 'Guard', tier: 'Foundation', status: 'Invited', parentName: 'Morgan Banks',
        focus: '', goal: '', learnStyle: '', rhythm: '', assignments: [], habits: [], rubric: {}, messages: [], canvas: '', nextSession: day(7), inviteCode: 'THEO-2026' },
    ],
  };
}

const KEY = 'baller-connection-demo-v1';
interface Ctx { s: State; set: (fn: (s: State) => State) => void; reset: () => void; update: (id: string, fn: (p: Player) => Player) => void }
const C = createContext<Ctx>(null as unknown as Ctx);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(() => { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch { /* ignore */ } return seed(); });
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(s)); }, [s]);
  const v = useMemo<Ctx>(() => ({
    s, set: (fn) => setS(fn), reset: () => setS(seed()),
    update: (id, fn) => setS((st) => ({ ...st, players: st.players.map((p) => (p.id === id ? fn(p) : p)) })),
  }), [s]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => useContext(C);

export const current = (p: Player) => [...p.assignments].reverse().find((a) => a.state === 'assigned' || a.state === 'submitted');
export const priorRetry = (p: Player, a?: Assignment) => { if (!a) return undefined; const i = p.assignments.indexOf(a); const b = p.assignments[i - 1]; return b && b.state === 'retry' && b.title === a.title ? b : undefined; };
export const weekKey = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); };
export const today = () => new Date().toISOString().slice(0, 10);
export function streak(habits: string[]) { let k = 0; const set = new Set(habits); const d = new Date(); if (!set.has(today())) d.setDate(d.getDate() - 1); while (set.has(d.toISOString().slice(0, 10))) { k++; d.setDate(d.getDate() - 1); } return k; }
export function replyBy(at?: string) { const d = at ? new Date(at) : new Date(); let add = 2; while (add > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) add--; } return d.toLocaleDateString('en-US', { weekday: 'short' }); }
export const fmt = (at: string) => new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
export const first = (name: string) => name.split(' ')[0];

export type QueueKind = 'Reply needed' | 'Work ready' | 'Plan needed' | 'Activation' | 'Upcoming';
export interface QueueItem { kind: QueueKind; player: Player; why: string; to: string }
export function buildQueue(players: Player[]): QueueItem[] {
  const q: QueueItem[] = [];
  for (const p of players) { const last = p.messages[p.messages.length - 1]; if (last && last.from !== 'coach') q.push({ kind: 'Reply needed', player: p, why: `${last.from === 'parent' ? p.parentName : first(p.name)}: “${last.text.slice(0, 70)}”`, to: `/coach/player/${p.id}?tab=messages` }); }
  for (const p of players) if (p.status === 'Submitted' || p.status === 'Feedback due') { const a = current(p); q.push({ kind: 'Work ready', player: p, why: `${a?.title ?? 'Work'} submitted ${a?.submittedAt ? fmt(a.submittedAt) : ''} · reply by ${replyBy(a?.submittedAt)}`, to: `/coach/review/${p.id}` }); }
  for (const p of players) if (p.status === 'Active') q.push({ kind: 'Plan needed', player: p, why: `Onboarded — goal: ${p.goal || 'not set'}. Set a focus and first work.`, to: `/coach/plan/${p.id}` });
  for (const p of players) if (p.status === 'Invited' || p.status === 'Connected') q.push({ kind: 'Activation', player: p, why: p.status === 'Invited' ? `Invite sent to ${p.parentName}, not accepted yet` : 'Connected, finishing onboarding', to: `/coach/player/${p.id}` });
  for (const p of players) if (['Plan set', 'Work ready', 'Next step ready'].includes(p.status)) q.push({ kind: 'Upcoming', player: p, why: `${p.status} · next session ${new Date(p.nextSession + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`, to: `/coach/player/${p.id}` });
  return q;
}
