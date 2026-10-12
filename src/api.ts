import type { BallerApi, Me } from '../shared/api';
import type { Command, Snapshot } from '../shared/domain';
import { dispatch } from '../shared/engine';
import { SYSTEM, type Actor } from '../shared/permissions';
import { seed } from '../shared/seed';
import { buildOpsQueue, buildQueue, teamLoad } from '../shared/workflow';

const KEY = 'baller-connection-v4';
const DEMO_STAFF: Record<string, Me> = { head: { id: 'u_head', name: 'Coach [Your Name]', role: 'head' }, assistant: { id: 'u_asst', name: 'Jamie Reed', role: 'assistant' }, ops: { id: 'u_ops', name: 'Lee Hart', role: 'ops' } };
/** Demo: the shared engine in the browser, persisted to localStorage. The demo bar picks who you are. */
export class DemoApi implements BallerApi {
  readonly mode = 'demo' as const; private s: Snapshot;
  constructor() { let s: Snapshot | null = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { s = null; } this.s = s?.settings?.reviewsPerWeek && s.reflections ? s : seed(); this.s = dispatch(this.s, { type: 'sweep' }, SYSTEM).snapshot; this.save(); }
  private save() { localStorage.setItem(KEY, JSON.stringify(this.s)); }
  /** Resolve the demo persona for a command: staff by role, family members by the player they act on. */
  actor(cmd: Command, as?: Me): Actor {
    if (cmd.type === 'advanceClock' || cmd.type === 'sweep') return SYSTEM; if (cmd.type === 'submitApplication' || cmd.type === 'acceptInvite') return { id: 'public', role: 'public' };
    const role = as?.role ?? 'head'; if (role === 'head' || role === 'assistant' || role === 'ops') return DEMO_STAFF[role];
    const p = this.s.players.find((x) => 'playerId' in cmd && x.id === cmd.playerId) ?? this.s.players.find((x) => x.id === localStorage.getItem('bc-fam'));
    const u = this.s.users.find((x) => x.role === role && (role === 'parent' ? x.familyId === p?.familyId : x.playerId === p?.id));
    return { id: u?.id ?? `demo_${role}_${p?.id}`, role, familyId: p?.familyId, playerId: role === 'player' ? p?.id : null };
  }
  async load() { return { me: null, snapshot: this.s }; }
  async dispatch(cmd: Command, as?: Me) { const r = dispatch(this.s, cmd, this.actor(cmd, as)); this.s = r.snapshot; this.save(); return r; }
  async reset() { this.s = dispatch(seed(), { type: 'sweep' }, SYSTEM).snapshot; this.save(); return this.s; }
  async login(): Promise<Me> { throw new Error('Demo mode has no accounts. Use the demo bar to switch roles.'); }
  async logout() {}
  async acceptInvite(b: { token?: string; code?: string; parentName: string; email: string }) { const r = dispatch(this.s, { type: 'acceptInvite', ...b }, { id: 'public', role: 'public' }); this.s = r.snapshot; this.save(); return { playerId: r.created?.playerId }; }
  async setPlayerPin(b: { playerId: string; username: string }) { await this.dispatch({ type: 'setPlayerLogin', playerId: b.playerId, username: b.username }, { id: '', name: '', role: 'parent' }); }
  async requestPassword() {} async resetPassword() {}
  async get<T>(path: string): Promise<T> {
    if (path === '/api/team') return teamLoad(this.s) as T; if (path === '/api/outbox') return [...this.s.outbox].reverse() as T; if (path === '/api/queue') return { coach: buildQueue(this.s), ops: buildOpsQueue(this.s) } as T;
    if (path === '/api/calendar-link') return { url: '' } as T; throw new Error('Not available in demo');
  }
  async post<T>(): Promise<T> { throw new Error('Not available in demo'); }
  url() { return ''; }
}
/** Live: the Worker / Node API with httpOnly session cookies. */
export class HttpApi implements BallerApi {
  readonly mode = 'live' as const; private base: string; constructor(base: string) { this.base = base; }
  private async req<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(this.base + path, { credentials: 'include', ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status }); return j as T;
  }
  async load() { try { return await this.req<{ me: Me; snapshot: Snapshot }>('/api/snapshot'); } catch (e) { if ((e as { status?: number }).status === 401) { const pub = seed(); return { me: null, snapshot: { ...pub, players: [], families: [], users: [], events: [], invites: [], messages: [], notifications: [] } }; } throw e; } }
  dispatch(cmd: Command) { return cmd.type === 'submitApplication' ? this.req<{ playerId: string }>('/api/apply', cmd).then(async () => ({ ...(await this.load()), events: [] })) : this.req<{ snapshot: Snapshot; events: never[] }>('/api/commands', cmd); }
  async reset() { await this.req('/api/demo/reset', {}); return (await this.load()).snapshot; }
  async login(login: string, secret: string, pin = false) { return (await this.req<{ user: Me }>('/api/auth/login', pin ? { login, pin: secret } : { login, password: secret })).user; }
  async logout() { await this.req('/api/auth/logout', {}); }
  acceptInvite(b: object) { return this.req<{ playerId?: string }>('/api/auth/accept-invite', b); }
  async setPlayerPin(b: object) { await this.req('/api/auth/player-login', b); }
  async requestPassword(email: string) { await this.req('/api/auth/request-password', { email }); }
  async resetPassword(token: string, password: string) { await this.req('/api/auth/reset-password', { token, password }); }
  get<T>(path: string) { return this.req<T>(path); } post<T>(path: string, body: unknown) { return this.req<T>(path, body); }
  url(path: string) { return this.base + path; }
}
/** Live mode when the build points at an API (VITE_API_URL, or "same-origin" when the Worker serves the app); `?demo=1` always forces the demo. */
export function isDemo() { const q = new URLSearchParams(location.search); if (q.get('demo') === '1') sessionStorage.setItem('bc-demo', '1'); if (q.get('demo') === '0') sessionStorage.removeItem('bc-demo'); return sessionStorage.getItem('bc-demo') === '1' || !import.meta.env.VITE_API_URL; }
export function makeApi(): BallerApi { const b = import.meta.env.VITE_API_URL as string | undefined; return isDemo() || !b ? new DemoApi() : new HttpApi(b === 'same-origin' ? '' : b.replace(/\/$/, '')); }
