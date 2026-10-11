/** Minimal subset of the Cloudflare D1 API. The Worker gets the real D1; Node/tests get the sql.js adapter below. */
export interface Stmt { bind(...v: unknown[]): Stmt; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown> }
export interface Db { prepare(sql: string): Stmt; batch(stmts: Stmt[]): Promise<unknown>; exec(sql: string): Promise<unknown> }
