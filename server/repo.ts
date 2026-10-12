import { SETTINGS_DEFAULTS, TABLES, type Settings, type Snapshot, type TableName } from '../shared/domain';
import type { Db, Stmt } from './db';
import { ORDER, SCHEMA, type Col } from './schema';

type Row = Record<string, unknown>;
const toDb = (c: Col, v: unknown) => (v === undefined || v === null ? null : c.kind === 'json' ? JSON.stringify(v) : c.kind === 'bool' ? (v ? 1 : 0) : v);
const fromDb = (c: Col, v: unknown) => (v === null || v === undefined ? (c.kind === 'json' ? null : c.kind === 'bool' ? false : null) : c.kind === 'json' ? JSON.parse(v as string) : c.kind === 'bool' ? !!v : v);
const rowKey = (t: TableName, o: Row) => JSON.stringify(SCHEMA[t].cols.map((c) => toDb(c, o[c.prop])));

/** Repository over normalized D1/SQLite tables. Writes are row-level diffs inside one atomic batch. */
export class Repo {
  constructor(private db: Db) {}
  async isSeeded() { return !!(await this.db.prepare("SELECT value FROM meta WHERE key = 'version'").first()); }
  async version() { const r = await this.db.prepare("SELECT value FROM meta WHERE key = 'version'").first<{ value: string }>(); return Number(r?.value ?? 0); }
  async load(): Promise<Snapshot> {
    const meta = Object.fromEntries((await this.db.prepare('SELECT key, value FROM meta').all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
    const settings = Object.fromEntries((await this.db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()).results.map((r) => [r.key, JSON.parse(r.value)])) as unknown as Settings;
    const out: Record<string, unknown> = { version: Number(meta.version ?? 0), clockOffsetMs: Number(meta.clockOffsetMs ?? 0), settings: { ...SETTINGS_DEFAULTS, ...settings } };
    for (const t of TABLES) {
      const { table, cols } = SCHEMA[t];
      const rows = (await this.db.prepare(`SELECT ${cols.map((c) => c.col).join(', ')} FROM ${table}${t === 'events' ? ' ORDER BY at' : ''}`).all<Row>()).results;
      out[t] = rows.map((r) => Object.fromEntries(cols.map((c) => [c.prop, fromDb(c, r[c.col])])));
    }
    return out as unknown as Snapshot;
  }
  /** Upserts changed rows, deletes removed rows, bumps version. `prev` omitted = initial seed. */
  async save(next: Snapshot, prev?: Snapshot) {
    const st: Stmt[] = []; const kv = (tbl: string, k: string, v: string) => st.push(this.db.prepare(`INSERT INTO ${tbl} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, v));
    kv('meta', 'version', String(next.version)); kv('meta', 'clockOffsetMs', String(next.clockOffsetMs));
    for (const [k, v] of Object.entries(next.settings)) if (!prev || JSON.stringify((prev.settings as unknown as Row)[k]) !== JSON.stringify(v)) kv('settings', k, JSON.stringify(v));
    for (const t of [...ORDER].reverse()) { // deletes: children first
      if (!prev) continue; const keep = new Set((next[t] as unknown as Row[]).map((r) => r.id));
      for (const r of prev[t] as unknown as Row[]) if (!keep.has(r.id)) st.push(this.db.prepare(`DELETE FROM ${SCHEMA[t].table} WHERE id = ?`).bind(r.id));
    }
    for (const t of ORDER) {
      const { table, cols } = SCHEMA[t]; const before = new Map((prev?.[t] as unknown as Row[] | undefined)?.map((r) => [r.id as string, rowKey(t, r)]) ?? []);
      const sql = `INSERT INTO ${table} (${cols.map((c) => c.col).join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c.prop !== 'id').map((c) => `${c.col} = excluded.${c.col}`).join(', ')}`;
      for (const r of next[t] as unknown as Row[]) if (before.get(r.id as string) !== rowKey(t, r)) st.push(this.db.prepare(sql).bind(...cols.map((c) => toDb(c, r[c.prop]))));
    }
    await this.db.batch(st); return st.length;
  }
  // ---- auth queries ----
  userByLogin(ident: string) { return this.db.prepare('SELECT u.id, u.role, u.name, u.email, u.username, u.family_id, u.player_id, u.active, c.password_hash, c.pin_hash FROM users u LEFT JOIN credentials c ON c.user_id = u.id WHERE (u.email = ?1 OR u.username = ?1) AND u.active = 1').bind(ident.trim().toLowerCase()).first<Row>(); }
  userById(id: string) { return this.db.prepare('SELECT id, role, name, email, username, family_id, player_id, active FROM users WHERE id = ? AND active = 1').bind(id).first<Row>(); }
  setCredential(userId: string, field: 'password_hash' | 'pin_hash', hash: string) { return this.db.prepare(`INSERT INTO credentials (user_id, ${field}, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET ${field} = excluded.${field}, updated_at = excluded.updated_at`).bind(userId, hash, new Date().toISOString()).run(); }
  createSession(tokenHash: string, userId: string, days: number, ua: string) { const now = new Date(); return this.db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)').bind(tokenHash, userId, now.toISOString(), new Date(now.getTime() + days * 864e5).toISOString(), ua.slice(0, 200)).run(); }
  sessionUser(tokenHash: string) { return this.db.prepare('SELECT u.id, u.role, u.name, u.email, u.username, u.family_id, u.player_id FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1').bind(tokenHash, new Date().toISOString()).first<Row>(); }
  deleteSession(tokenHash: string) { return this.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run(); }
  createPasswordToken(tokenHash: string, userId: string, hours: number) { return this.db.prepare('INSERT INTO password_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(tokenHash, userId, new Date(Date.now() + hours * 36e5).toISOString()).run(); }
  async usePasswordToken(tokenHash: string) { const r = await this.db.prepare('SELECT user_id FROM password_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').bind(tokenHash, new Date().toISOString()).first<{ user_id: string }>(); if (r) await this.db.prepare('UPDATE password_tokens SET used_at = ? WHERE token_hash = ?').bind(new Date().toISOString(), tokenHash).run(); return r?.user_id; }
  async recentFailures(ident: string) { const r = await this.db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ident = ? AND at > ?').bind(ident, new Date(Date.now() - 15 * 6e4).toISOString()).first<{ n: number }>(); return Number(r?.n ?? 0); }
  recordFailure(ident: string) { return this.db.prepare('INSERT INTO login_attempts (ident, at) VALUES (?, ?)').bind(ident, new Date().toISOString()).run(); }
  // ---- targeted reads ----
  outbox(limit = 200, status?: string) { return this.db.prepare(`SELECT id, recipient AS "to", subject, body, html, at, status, kind, category, user_id AS userId, attempts, send_after AS sendAfter, last_error AS lastError FROM outbox${status ? ' WHERE status = ?2' : ''} ORDER BY at DESC LIMIT ?1`).bind(...(status ? [limit, status] : [limit])).all<Row>(); }
  /** Queued mail whose send-after time (quiet hours / retry backoff) has passed. */
  dueEmails(nowIso: string) { return this.db.prepare("SELECT id, recipient AS \"to\", subject, body, html, kind, category, user_id AS userId, attempts FROM outbox WHERE status = 'queued' AND (send_after IS NULL OR send_after <= ?) ORDER BY at LIMIT 50").bind(nowIso).all<{ id: string; to: string; subject: string; body: string; html: string | null; kind: string; category: string | null; userId: string | null; attempts: number | null }>(); }
  setEmailBody(id: string, body: string, html: string | null) { return this.db.prepare('UPDATE outbox SET body = ?, html = ? WHERE id = ?').bind(body, html, id).run(); }
  markEmail(id: string, status: string, attempts: number, sendAfter: string | null = null, lastError: string | null = null) { return this.db.prepare('UPDATE outbox SET status = ?, attempts = ?, send_after = ?, last_error = ? WHERE id = ?').bind(status, attempts, sendAfter, lastError, id).run(); }
  /** Staff "retry" on a failed / dead-lettered email: back in the queue with a fresh attempt budget. */
  requeueEmail(id: string) { return this.db.prepare("UPDATE outbox SET status = 'queued', attempts = 0, send_after = NULL, last_error = NULL WHERE id = ? AND status IN ('failed', 'dead', 'queued')").bind(id).run(); }
  // ---- v6 magic links ----
  createMagicToken(tokenHash: string, userId: string, minutes: number, ip: string, purpose = 'login') { const now = Date.now(); return this.db.prepare('INSERT INTO magic_tokens (token_hash, user_id, purpose, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?)').bind(tokenHash, userId, purpose, new Date(now).toISOString(), new Date(now + minutes * 6e4).toISOString(), ip.slice(0, 64)).run(); }
  /** Single use: the UPDATE only matches an unused, unexpired token, so two clicks can't both win. */
  async useMagicToken(tokenHash: string) { const now = new Date().toISOString(); const r = await this.db.prepare('UPDATE magic_tokens SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1 RETURNING user_id').bind(now, tokenHash).first<{ user_id: string }>(); return r?.user_id; }
  magicTokenState(tokenHash: string) { return this.db.prepare('SELECT used_at, expires_at FROM magic_tokens WHERE token_hash = ?').bind(tokenHash).first<{ used_at: string | null; expires_at: string }>(); }
  /** Sign out everywhere: every session and every unused sign-in link for the user. */
  async endAllSessions(userId: string) { await this.db.batch([this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(userId), this.db.prepare('DELETE FROM magic_tokens WHERE user_id = ? AND used_at IS NULL').bind(userId)]); }
  countSessions(userId: string) { return this.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ? AND expires_at > ?').bind(userId, new Date().toISOString()).first<{ n: number }>(); }
  playerAge(playerId: string) { return this.db.prepare('SELECT age FROM players WHERE id = ?').bind(playerId).first<{ age: number }>(); }
  userPrefs(userId: string) { return this.db.prepare('SELECT prefs FROM users WHERE id = ?').bind(userId).first<{ prefs: string | null }>().then((r) => (r?.prefs ? JSON.parse(r.prefs) : null)); }
  unemailedNotifications() { return this.db.prepare('SELECT n.id, n.user_id, n.text, n.link, u.email, u.name, u.prefs FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.emailed_at IS NULL AND n.read_at IS NULL ORDER BY n.at').all<{ id: string; user_id: string; text: string; link: string; email: string | null; name: string; prefs: string | null }>(); }
  markEmailed(ids: string[]) { return this.db.batch(ids.map((i) => this.db.prepare('UPDATE notifications SET emailed_at = ? WHERE id = ?').bind(new Date().toISOString(), i))); }
  insertEmail(e: { id: string; to: string; subject: string; body: string; kind: string; status: string; html?: string | null; category?: string | null; userId?: string | null; sendAfter?: string | null }) { return this.db.prepare('INSERT INTO outbox (id, recipient, subject, body, at, status, kind, html, category, user_id, attempts, send_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)').bind(e.id, e.to, e.subject, e.body, new Date().toISOString(), e.status, e.kind, e.html ?? null, e.category ?? null, e.userId ?? null, e.sendAfter ?? null).run(); }
}
