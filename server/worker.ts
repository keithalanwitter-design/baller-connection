/// <reference types="@cloudflare/workers-types" />
import type { Db } from './db';
import { handle, scheduled, type Env as AppEnv } from './app';
import { r2Store } from './blobs';
export interface Env extends Omit<AppEnv, 'DB' | 'BLOBS'> { DB: D1Database; ASSETS?: Fetcher; /** R2 bucket for practice clips (wrangler.toml [[r2_buckets]]) */ CLIPS?: R2Bucket }
const appEnv = (env: Env): AppEnv => ({ ...env, DB: env.DB as unknown as Db, BLOBS: env.CLIPS ? r2Store(env.CLIPS as never) : undefined });
export default {
  async fetch(req: Request, env: Env) { const u = new URL(req.url); if (u.pathname.startsWith('/api/')) return handle(req, appEnv(env)); return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 }); },
  async scheduled(ev: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(scheduled(appEnv(env), ev.cron)); },
};
