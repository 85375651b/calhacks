import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const CACHE_TTL = 24 * 60 * 60 * 1000;
export const normalizeAddress = address => address.trim().replace(/\s+/g, ' ').toLowerCase();

// One API process owns this cache. Writes are serialized and replaced atomically.
export function createCache(file, { now = Date.now, ttl = CACHE_TTL } = {}) {
  const entries = new Map();
  const ready = (async () => {
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (saved.version === 1 && Array.isArray(saved.entries)) {
        for (const [key, entry] of saved.entries) {
          if (entry?.expiresAt > now() && entry.value?.address && entry.value.sampleData === false) entries.set(key, entry);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Local lookup cache could not be read; starting with an empty cache.');
    }
  })();
  let writes = Promise.resolve();
  return {
    async get(address) {
      await ready;
      const key = normalizeAddress(address);
      const entry = entries.get(key);
      if (entry?.expiresAt > now()) return entry.value;
      entries.delete(key);
      return null;
    },
    async set(address, value) {
      await ready;
      entries.set(normalizeAddress(address), { expiresAt: now() + ttl, value });
      writes = writes.catch(() => {}).then(async () => {
        for (const [key, entry] of entries) if (entry.expiresAt <= now()) entries.delete(key);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify({ version: 1, entries: [...entries] }), { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      });
      try { await writes; } catch { console.warn('Could not persist lookup cache; results remain cached in memory.'); }
    },
  };
}
