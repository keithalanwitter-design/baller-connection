import type { Snapshot, TableName } from '../shared/domain';
import { TABLES } from '../shared/domain';
import type { Db, Stmt } from './db';

/** Repository: maps the Snapshot aggregate to D1/SQLite tables. */
export class Repo {
  constructor(private db: Db) {}
  async isSeeded() { return !!(await this.db.prepare('SELECT value FROM meta WHERE key = ?').bind('version').first()); }
  async load(): Promise<Snapshot> {
    const meta = Object.fromEntries((await this.db.prepare('SELECT key, value FROM meta').all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
    const out: Record<string, unknown> = { version: Number(meta.version), clockOffsetMs: Number(meta.clockOffsetMs ?? 0), coach: JSON.parse(meta.coach) };
    for (const t of TABLES) out[t] = (await this.db.prepare(`SELECT data FROM ${t} ${t === 'events' ? 'ORDER BY at' : ''}`).all<{ data: string }>()).results.map((r) => JSON.parse(r.data));
    return out as unknown as Snapshot;
  }
  /** Writes only tables whose contents changed, in one batch (atomic on D1). */
  async save(next: Snapshot, prev?: Snapshot) {
    const st: Stmt[] = [];
    const m = (k: string, v: string) => st.push(this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v));
    m('version', String(next.version)); m('clockOffsetMs', String(next.clockOffsetMs)); m('coach', JSON.stringify(next.coach));
    for (const t of TABLES as readonly TableName[]) {
      const rows = next[t] as unknown as { id: string; playerId?: string; state?: string; tier?: string; at?: string }[];
      if (prev && JSON.stringify(prev[t]) === JSON.stringify(rows)) continue;
      st.push(this.db.prepare(`DELETE FROM ${t}`));
      for (const r of rows) {
        if (t === 'players') st.push(this.db.prepare('INSERT INTO players (id, player_id, state, tier, data) VALUES (?, ?, ?, ?, ?)').bind(r.id, r.id, r.state, r.tier, JSON.stringify(r)));
        else if (t === 'events') st.push(this.db.prepare('INSERT INTO events (id, player_id, at, data) VALUES (?, ?, ?, ?)').bind(r.id, r.playerId ?? null, r.at, JSON.stringify(r)));
        else st.push(this.db.prepare(`INSERT INTO ${t} (id, player_id, data) VALUES (?, ?, ?)`).bind(r.id, r.playerId ?? null, JSON.stringify(r)));
      }
    }
    await this.db.batch(st);
  }
}
