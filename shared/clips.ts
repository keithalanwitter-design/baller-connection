import type { Clip, Player, Snapshot } from './domain';
import type { Actor } from './permissions';

/** v5 short-clip rules. One source of truth for the browser check, the server check, the engine and the promise ledger. */
export const CLIP_MAX_SEC = 30;
export const CLIP_MAX_MB = 50; export const CLIP_MAX_BYTES = CLIP_MAX_MB * 1024 * 1024;
export const CLIP_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const CLIP_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';
export const CLIP_RETENTION_DAYS = 90;
/** Small grace for container rounding (a "30 s" phone clip is often 30.03 s). */
const GRACE = 0.5;
export const TRIM_HINT = 'Trim it on your phone first. iPhone: Photos → Edit → drag the yellow ends. Android: Gallery → Edit → Trim. Keep just the moment you want your coach to see.';

export const fmtT = (sec: number) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);
/** Normalize a browser/OS mime ("video/mov", "", with codecs) to one of CLIP_TYPES, using the file name as a fallback. */
export function normalizeMime(mime: string, name = ''): string {
  const m = (mime || '').split(';')[0].trim().toLowerCase(); const ext = name.toLowerCase().split('.').pop();
  if (m === 'video/mp4' || (!m && ext === 'mp4') || m === 'video/x-m4v') return 'video/mp4';
  if (m === 'video/quicktime' || m === 'video/mov' || ((!m || m === 'application/octet-stream') && ext === 'mov')) return 'video/quicktime';
  if (m === 'video/webm' || (!m && ext === 'webm')) return 'video/webm';
  return m;
}
/** null = OK. Otherwise a plain-language reason the family can act on. */
export function clipError(c: { mime: string; bytes: number; durationSec: number | null }): string | null {
  if (!(CLIP_TYPES as readonly string[]).includes(c.mime)) return 'Clips must be MP4, MOV or WebM video.';
  if (!(c.bytes > 0)) return 'That file is empty.';
  if (c.bytes > CLIP_MAX_BYTES) return `That file is ${mb(c.bytes)} MB. The limit is ${CLIP_MAX_MB} MB. Trim it, or record at 1080p instead of 4K.`;
  if (c.durationSec === null || !Number.isFinite(c.durationSec) || c.durationSec <= 0) return 'We couldn’t read how long that clip is. Record it with your phone camera (MP4/MOV) and try again.';
  if (c.durationSec > CLIP_MAX_SEC + GRACE) return `That clip is ${Math.round(c.durationSec)} s. Clips are ${CLIP_MAX_SEC} s max.`;
  return null;
}
export const tooLong = (sec: number | null) => sec !== null && sec > CLIP_MAX_SEC + GRACE;

/** Who may watch a clip: the player, their parent(s), and the coaches assigned to the player (the assigned coach, plus the head coach, who signs off assistant reviews). Never ops. */
export function canSeeClip(a: Actor, p: Player | undefined, clip: Pick<Clip, 'playerId' | 'deletedAt'>): boolean {
  if (!p || clip.deletedAt || clip.playerId !== p.id) return false;
  switch (a.role) { case 'player': return a.playerId === p.id; case 'parent': return !!a.familyId && a.familyId === p.familyId; case 'assistant': return p.coachId === a.id; case 'head': return true; default: return false; }
}
export const clipExpired = (c: Pick<Clip, 'deleteAfter'>, now: Date) => new Date(c.deleteAfter).getTime() <= now.getTime();
export const liveClips = (s: Snapshot, pid: string) => (s.clips ?? []).filter((c) => c.playerId === pid && !c.deletedAt);

// ---------- container duration (server-side enforcement; no ffmpeg in a Worker) ----------
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const str4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
/** Detect the container from magic bytes (the declared content-type is not trusted). */
export function sniffMime(b: Uint8Array): string | null {
  if (b.length >= 12 && str4(b, 4) === 'ftyp') return str4(b, 8) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  if (b.length >= 12 && ['moov', 'mdat', 'wide', 'free'].includes(str4(b, 4))) return 'video/quicktime';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}
/** MP4/MOV: moov › mvhd duration ÷ timescale. */
function mp4Duration(b: Uint8Array): number | null {
  const walk = (start: number, end: number): number | null => {
    let o = start;
    while (o + 8 <= end) {
      let size = u32(b, o); const type = str4(b, o + 4); let hdr = 8;
      if (size === 1) { size = u64(b, o + 8); hdr = 16; } else if (size === 0) size = end - o;
      if (size < hdr || o + size > end + 8) return null;
      if (type === 'moov') return walk(o + hdr, Math.min(end, o + size));
      if (type === 'mvhd') { const v = b[o + hdr]; const p = o + hdr + 4; return v === 1 ? u64(b, p + 20) / (u32(b, p + 16) || 1) : u32(b, p + 12) / (u32(b, p + 8) || 1); }
      o += size;
    }
    return null;
  };
  return walk(0, b.length);
}
/** WebM/Matroska: Segment › Info › Duration (float, in TimecodeScale units, default 1 ms). */
function webmDuration(b: Uint8Array): number | null {
  const lim = Math.min(b.length, 1 << 20); let scale = 1e6; let dur: number | null = null;
  for (let i = 0; i < lim - 12; i++) {
    if (b[i] === 0x1f && b[i + 1] === 0x43 && b[i + 2] === 0xb6 && b[i + 3] === 0x75) break; // first Cluster: Info is before it
    if (b[i] === 0x2a && b[i + 1] === 0xd7 && b[i + 2] === 0xb1) { const n = b[i + 3] & 0x7f; if (b[i + 3] & 0x80 && n >= 1 && n <= 8) { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + b[i + 4 + k]; if (v > 0) scale = v; } }
    if (b[i] === 0x44 && b[i + 1] === 0x89 && (b[i + 2] === 0x84 || b[i + 2] === 0x88)) { const dv = new DataView(b.buffer, b.byteOffset + i + 3, b[i + 2] === 0x84 ? 4 : 8); dur = b[i + 2] === 0x84 ? dv.getFloat32(0) : dv.getFloat64(0); }
  }
  return dur === null ? null : (dur * scale) / 1e9;
}
export function videoDuration(b: Uint8Array): number | null {
  const m = sniffMime(b); if (!m) return null;
  const d = m === 'video/webm' ? webmDuration(b) : mp4Duration(b);
  return d !== null && Number.isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : null;
}
