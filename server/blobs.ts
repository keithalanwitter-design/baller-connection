/** Clip storage. The Worker uses an R2 bucket binding (CLIPS); the Node server uses a local directory. Bytes always pass through the API, which checks access first. */
export interface BlobStore {
  readonly name: string;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string, range?: { offset: number; length?: number }): Promise<{ body: Uint8Array | ReadableStream; size: number; mime: string } | null>;
  delete(key: string): Promise<void>;
}
/** Minimal R2Bucket surface we use (avoids a hard dependency on workers-types here). */
interface R2Like {
  put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string, opts?: { range?: { offset: number; length?: number } }): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}
export function r2Store(bucket: R2Like): BlobStore {
  return {
    name: 'r2',
    async put(key, bytes, mime) { await bucket.put(key, bytes, { httpMetadata: { contentType: mime } }); },
    async get(key, range) { const o = await bucket.get(key, range ? { range } : undefined); return o ? { body: o.body, size: o.size, mime: o.httpMetadata?.contentType ?? 'video/mp4' } : null; },
    async delete(key) { await bucket.delete(key); },
  };
}
/** In-memory store (tests). */
export function memoryStore(): BlobStore & { keys(): string[] } {
  const m = new Map<string, { b: Uint8Array; mime: string }>();
  return {
    name: 'memory', keys: () => [...m.keys()],
    async put(key, b, mime) { m.set(key, { b: b.slice(), mime }); },
    async get(key, range) { const o = m.get(key); if (!o) return null; const b = range ? o.b.subarray(range.offset, range.length ? range.offset + range.length : undefined) : o.b; return { body: b, size: o.b.length, mime: o.mime }; },
    async delete(key) { m.delete(key); },
  };
}
