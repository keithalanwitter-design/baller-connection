/// <reference types="@cloudflare/workers-types" />
import type { Db } from './db';
import { handle, scheduled, type Env as AppEnv } from './app';
export interface Env extends Omit<AppEnv, 'DB'> { DB: D1Database; ASSETS?: Fetcher }
const appEnv = (env: Env) => ({ ...env, DB: env.DB as unknown as Db });
export default {
  async fetch(req: Request, env: Env) { const u = new URL(req.url); if (u.pathname.startsWith('/api/')) return handle(req, appEnv(env)); return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 }); },
  async scheduled(ev: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(scheduled(appEnv(env), ev.cron)); },
};
