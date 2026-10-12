import type { Clip, Command, DomainEvent, Snapshot, UserRole } from './domain';
export interface Me { id: string; name: string; role: UserRole; familyId?: string | null; playerId?: string | null }
/** The typed service interface every view talks to. DemoApi runs the shared engine in the browser; HttpApi talks to the Worker / Node server. */
export interface BallerApi {
  readonly mode: 'demo' | 'live';
  load(): Promise<{ me: Me | null; snapshot: Snapshot }>;
  dispatch(cmd: Command, as?: Me): Promise<{ snapshot: Snapshot; events: DomainEvent[] }>;
  reset(): Promise<Snapshot>;
  login(login: string, secret: string, pin?: boolean): Promise<Me>;
  logout(): Promise<void>;
  acceptInvite(b: { token?: string; code?: string; parentName: string; email: string; password: string }): Promise<{ playerId?: string }>;
  setPlayerPin(b: { playerId: string; username: string; pin: string }): Promise<void>;
  requestPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  url(path: string): string;
  /** Upload a short clip (already checked in the browser; the server checks again). Returns the registered clip + fresh snapshot. */
  uploadClip(playerId: string, file: Blob, meta: { durationSec: number; mime: string; watchFor: string }, as?: Me): Promise<{ clip: Clip; snapshot: Snapshot }>;
  /** Playable URL for a clip, or null when it isn't available here (demo clips live only in the tab that recorded them). */
  clipSrc(clip: Clip): string | null;
}
