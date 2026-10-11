/// <reference types="@cloudflare/workers-types" />
import type { Db } from './db';
import { handle } from './app';
export interface Env { DB: D1Database; ALLOW_ORIGIN?: string }
export default { fetch: (req: Request, env: Env) => handle(req, env.DB as unknown as Db, env.ALLOW_ORIGIN ?? '*') };
