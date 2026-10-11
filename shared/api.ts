import type { Command, DomainEvent, Snapshot } from './domain';
/** The typed service interface every view talks to. Implemented in-browser (LocalApi) and over HTTP (HttpApi → Worker/Node server). */
export interface BallerApi {
  readonly mode: 'local' | 'remote';
  snapshot(): Promise<Snapshot>;
  dispatch(cmd: Command): Promise<{ snapshot: Snapshot; events: DomainEvent[] }>;
  reset(): Promise<Snapshot>;
}
export interface ApiError { error: string }
