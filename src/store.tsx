import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Command, DomainEvent, Snapshot } from '../shared/domain';
import { makeApi } from './api';

interface Ctx { s: Snapshot | null; mode: 'local' | 'remote'; run: (c: Command) => Promise<DomainEvent[] | null>; reset: () => Promise<void>; error: string | null; last: { events: DomainEvent[]; cmd: Command; n: number; t: number } | null; clearError: () => void; dismiss: () => void }
const C = createContext<Ctx>(null as unknown as Ctx);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [api] = useState(makeApi);
  const [s, setS] = useState<Snapshot | null>(null); const [error, setError] = useState<string | null>(null); const [last, setLast] = useState<Ctx['last']>(null);
  useEffect(() => { api.snapshot().then(setS).catch((e) => setError(`API unreachable: ${e.message}`)); }, [api]);
  const run = useCallback(async (cmd: Command) => {
    try { const r = await api.dispatch(cmd); setS(r.snapshot); setLast((l) => ({ events: r.events, cmd, n: (l?.n ?? 0) + 1, t: Date.now() })); setError(null); return r.events; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [api]);
  const reset = useCallback(async () => { setS(await api.reset()); setLast(null); }, [api]);
  const v = useMemo(() => ({ s, mode: api.mode, run, reset, error, last, clearError: () => setError(null), dismiss: () => setLast(null) }), [s, api, run, reset, error, last]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => useContext(C);
/** Snapshot is guaranteed loaded inside <Loaded>. */
// eslint-disable-next-line react-refresh/only-export-components
export const useSnap = () => useContext(C).s as Snapshot;
