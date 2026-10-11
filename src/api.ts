import type { BallerApi } from '../shared/api';
import type { Command, DomainEvent, Snapshot } from '../shared/domain';
import { dispatch } from '../shared/engine';
import { seed } from '../shared/seed';

const KEY = 'baller-connection-v2';
/** In-browser implementation: same engine as the server, persisted to localStorage. */
export class LocalApi implements BallerApi {
  readonly mode = 'local' as const;
  private s: Snapshot;
  constructor() { let s: Snapshot | null = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { s = null; } this.s = s && s.version ? s : seed(); this.s = dispatch(this.s, { type: 'tick' }).snapshot; this.save(); }
  private save() { localStorage.setItem(KEY, JSON.stringify(this.s)); }
  async snapshot() { return this.s; }
  async dispatch(cmd: Command): Promise<{ snapshot: Snapshot; events: DomainEvent[] }> { const r = dispatch(this.s, cmd); this.s = r.snapshot; this.save(); return r; }
  async reset() { this.s = dispatch(seed(), { type: 'tick' }).snapshot; this.save(); return this.s; }
}
/** HTTP implementation talking to the Worker / Node API. */
export class HttpApi implements BallerApi {
  readonly mode = 'remote' as const;
  private base: string;
  constructor(base: string) { this.base = base; }
  private async req<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(this.base + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j as T;
  }
  snapshot() { return this.req<Snapshot>('/api/snapshot'); }
  dispatch(cmd: Command) { return this.req<{ snapshot: Snapshot; events: DomainEvent[] }>('/api/commands', cmd); }
  async reset() { return (await this.req<{ snapshot: Snapshot }>('/api/reset', {})).snapshot; }
}
export function makeApi(): BallerApi {
  const q = new URLSearchParams(location.search).get('api'); if (q) localStorage.setItem('bc-api', q);
  const base = q ?? localStorage.getItem('bc-api') ?? (import.meta.env.VITE_API_URL as string | undefined);
  return base && base !== 'local' ? new HttpApi(base.replace(/\/$/, '')) : new LocalApi();
}
