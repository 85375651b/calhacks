import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
// Each file owns a single queue; readers wait for completed writes.
export function atomicJson(file) {
  let queue = Promise.resolve();
  async function read() {
    try {
      const d = JSON.parse(await readFile(file, "utf8"));
      if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error();
      return d;
    } catch (e) {
      if (e.code === "ENOENT") return {};
      throw new Error("Saved data could not be read. Try again later.");
    }
  }
  return {
    async read() {
      await queue.catch(() => {});
      return read();
    },
    mutate(fn) {
      const job = queue
        .catch(() => {})
        .then(async () => {
          const d = await read(),
            result = fn(d);
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file + ".tmp", JSON.stringify(d), { mode: 0o600 });
          await rename(file + ".tmp", file);
          return result;
        });
      queue = job;
      return job;
    },
  };
}
