import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BallerApi, Me } from '../shared/api';
import { PRIVATE_CONTEXTS, type Command, type DomainEvent, type Perspective, type Snapshot, type UserRole } from '../shared/domain';
import { makeApi } from './api';

interface Ctx {
  s: Snapshot | null; mode: 'demo' | 'live'; api: BallerApi; me: Me | null; ready: boolean;
  /** Demo persona (live mode: the signed-in role). */ as: Me | null; setDemoRole: (r: UserRole) => void;
  run: (c: Command) => Promise<DomainEvent[] | null>; /** Upload a clip; returns its id (or null with the error shown). */ upload: (pid: string, f: Blob, meta: { durationSec: number; mime: string; watchFor: string }) => Promise<string | null>; reset: () => Promise<void>; refresh: () => Promise<void>; signIn: (login: string, secret: string, pin?: boolean) => Promise<Me | null>; signOut: () => Promise<void>;
  error: string | null; setError: (e: string | null) => void; last: { events: DomainEvent[]; cmd: Command; n: number; t: number } | null; clearError: () => void; dismiss: () => void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
const DEMO_NAMES: Record<UserRole, string> = { head: 'Coach [Your Name]', assistant: 'Jamie Reed', ops: 'Lee Hart', parent: 'Parent', player: 'Player' };
const DEMO_IDS: Record<UserRole, string> = { head: 'u_head', assistant: 'u_asst', ops: 'u_ops', parent: 'demo_parent', player: 'demo_player' };
export function StoreProvider({ children }: { children: ReactNode }) {
  const [api] = useState(makeApi);
  const [s, setS] = useState<Snapshot | null>(null); const [me, setMe] = useState<Me | null>(null); const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null); const [last, setLast] = useState<Ctx['last']>(null);
  const [demoRole, setDemoRoleState] = useState<UserRole>(() => (localStorage.getItem('bc-demo-role') as UserRole) || 'head');
  const refresh = useCallback(async () => { try { const r = await api.load(); setS(r.snapshot); setMe(r.me); } catch (e) { setError(`API unreachable: ${(e as Error).message}`); } finally { setReady(true); } }, [api]);
  useEffect(() => { refresh(); }, [refresh]);
  // Live: poll for other users' changes (cron, teammates) every 20 s while the tab is visible.
  useEffect(() => { if (api.mode !== 'live' || !me) return; const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000); return () => clearInterval(t); }, [api, me, refresh]);
  const as: Me | null = useMemo(() => (api.mode === 'live' ? me : { id: DEMO_IDS[demoRole], name: DEMO_NAMES[demoRole], role: demoRole }), [api, me, demoRole]);
  const run = useCallback(async (cmd: Command) => {
    try { const r = await api.dispatch(cmd, as ?? undefined); setS(r.snapshot); setLast((l) => ({ events: r.events, cmd, n: (l?.n ?? 0) + 1, t: Date.now() })); setError(null); return r.events; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [api, as]);
  const upload = useCallback(async (pid: string, f: Blob, meta: { durationSec: number; mime: string; watchFor: string }) => { try { const r = await api.uploadClip(pid, f, meta, as ?? undefined); setS(r.snapshot); setError(null); return r.clip.id; } catch (e) { setError((e as Error).message); return null; } }, [api, as]);
  const reset = useCallback(async () => { setS(await api.reset()); setLast(null); }, [api]);
  const signIn = useCallback(async (l: string, sec: string, pin?: boolean) => { try { const u = await api.login(l, sec, pin); await refresh(); setError(null); return u; } catch (e) { setError((e as Error).message); return null; } }, [api, refresh]);
  const signOut = useCallback(async () => { await api.logout(); setMe(null); await refresh(); }, [api, refresh]);
  const setDemoRole = useCallback((r: UserRole) => { localStorage.setItem('bc-demo-role', r); setDemoRoleState(r); }, []);
  // The demo engine holds one snapshot for every persona; the live server scopes it. A parent never gets a player's private notes in either.
  const view = useMemo(() => (s && api.mode === 'demo' && as?.role === 'parent' ? { ...s, messages: s.messages.filter((m) => !PRIVATE_CONTEXTS.includes(m.context)) } : s), [s, api, as]);
  const v = useMemo(() => ({ s: view, mode: api.mode, api, me, ready, as, setDemoRole, run, upload, reset, refresh, signIn, signOut, error, setError, last, clearError: () => setError(null), dismiss: () => setLast(null) }), [view, api, me, ready, as, setDemoRole, run, upload, reset, refresh, signIn, signOut, error, last]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => useContext(C);
/** Snapshot is guaranteed loaded inside the routed app. */
// eslint-disable-next-line react-refresh/only-export-components
export const useSnap = () => useContext(C).s as Snapshot;
/** The UI perspective for a role: assistants and the head coach share the coach view. */
// eslint-disable-next-line react-refresh/only-export-components
export const perspective = (r?: UserRole | null): Perspective => (r === 'head' || r === 'assistant' ? 'coach' : r === 'ops' ? 'ops' : r === 'parent' ? 'parent' : 'player');
