import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { trace } from "../search/address-trace.js";
export const hash = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function persistentMemo(file, { now = Date.now } = {}) {
  let entries = {},
    queue = Promise.resolve();
  const flight = new Map();
  const ready = readFile(file, "utf8")
    .then((s) => {
      entries = JSON.parse(s);
    })
    .catch((e) => {
      if (e.code !== "ENOENT")
        console.warn("Cache unreadable; starting fresh.");
    });
  async function save() {
    queue = queue
      .catch(() => {})
      .then(async () => {
        entries = Object.fromEntries(
          Object.entries(entries)
            .filter(([, v]) => v.until > now())
            .slice(-2000),
        );
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file + ".tmp", JSON.stringify(entries), {
          mode: 0o600,
        });
        await rename(file + ".tmp", file);
      });
    await queue;
  }
  return async (key, fn, ttl = 86400000) => {
    key = hash(key);
    await ready;
    if (entries[key]?.until > now()) {
      trace("cache", { namespace: file.split(/[\\/]/).pop(), hit: true });
      if (entries[key].error) throw new Error(entries[key].error);
      return entries[key].value;
    }
    if (flight.has(key)) return flight.get(key);
    trace("cache", { namespace: file.split(/[\\/]/).pop(), hit: false });
    const job = (async () => {
      try {
        const value = await fn();
        const duration = typeof ttl === "function" ? ttl(value) : ttl;
        if (duration <= 0) return value;
        entries[key] = {
          value,
          until: now() + duration,
        };
        await save();
        return value;
      } catch (e) {
        entries[key] = { error: e.message, until: now() + 300000 };
        await save();
        throw e;
      } finally {
        flight.delete(key);
      }
    })();
    flight.set(key, job);
    return job;
  };
}
