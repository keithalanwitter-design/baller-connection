import fs from 'node:fs';
import path from 'node:path';
import type { BlobStore } from './blobs';
/** Local disk adapter for the Node server (CLIPS_DIR, default server/clips). Keys are sanitized to stay inside the directory. */
export function diskStore(dir: string): BlobStore {
  const root = path.resolve(dir); fs.mkdirSync(root, { recursive: true });
  const file = (key: string) => { const f = path.resolve(root, key.replace(/[^\w./-]/g, '_')); if (!f.startsWith(root + path.sep)) throw new Error('bad key'); return f; };
  return {
    name: 'disk',
    async put(key, bytes, mime) { const f = file(key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); fs.writeFileSync(f + '.type', mime); },
    async get(key, range) { const f = file(key); if (!fs.existsSync(f)) return null; const b = fs.readFileSync(f); const mime = fs.existsSync(f + '.type') ? fs.readFileSync(f + '.type', 'utf8') : 'video/mp4'; const body = range ? b.subarray(range.offset, range.length ? range.offset + range.length : undefined) : b; return { body: new Uint8Array(body), size: b.length, mime }; },
    async delete(key) { const f = file(key); fs.rmSync(f, { force: true }); fs.rmSync(f + '.type', { force: true }); },
  };
}
