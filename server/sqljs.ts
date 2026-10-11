import fs from 'node:fs';
import initSqlJs, { type Database } from 'sql.js';
import type { Db, Stmt } from './db';

/** D1-compatible adapter over sql.js (pure WASM SQLite) for local dev and tests. */
export async function openDb(file?: string): Promise<Db & { raw: Database }> {
  const SQL = await initSqlJs();
  const raw = file && fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  let inTx = false;
  const persist = () => { if (file && !inTx) fs.writeFileSync(file, Buffer.from(raw.export())); };
  for (const f of fs.readdirSync(new URL('./migrations', import.meta.url)).sort()) raw.exec(fs.readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): Stmt => ({
    bind: (...v) => stmt(sql, v),
    all: async <T,>() => { const st = raw.prepare(sql); st.bind(args as never); const results: T[] = []; while (st.step()) results.push(st.getAsObject() as T); st.free(); return { results }; },
    first: async <T,>() => { const st = raw.prepare(sql); st.bind(args as never); const r = st.step() ? (st.getAsObject() as T) : null; st.free(); return r; },
    run: async () => { raw.run(sql, args as never); persist(); return {}; },
  });
  return {
    raw, prepare: (sql) => stmt(sql),
    batch: async (list) => { raw.exec('BEGIN'); inTx = true; try { for (const s of list) await (s as Stmt & { run: () => Promise<unknown> }).run(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } finally { inTx = false; } persist(); return []; },
    exec: async (sql) => { raw.exec(sql); persist(); return {}; },
  };
}
