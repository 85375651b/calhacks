import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { serverDirectory } from "../config.js";
export function createDailyBudget(
  file,
  { now = Date.now, max = () => 2500 } = {},
) {
  let queue = Promise.resolve();
  return () => {
    const task = queue
      .catch(() => {})
      .then(async () => {
        const day = new Date(now()).toISOString().slice(0, 10);
        let data = { day, count: 0 };
        try {
          const v = JSON.parse(await readFile(file, "utf8"));
          if (v.day === day) data = v;
        } catch (e) {
          if (e.code !== "ENOENT") return false;
        }
        if (!Number.isFinite(data.count) || data.count >= max()) return false;
        await mkdir(dirname(file), { recursive: true });
        await writeFile(
          file + ".tmp",
          JSON.stringify({ day, count: data.count + 1 }),
          { mode: 0o600 },
        );
        await rename(file + ".tmp", file);
        return true;
      });
    queue = task;
    return task;
  };
}
export const claimGeoapify = createDailyBudget(
  join(serverDirectory, ".cache", "geoapify-daily.json"),
  {
    max: () =>
      Math.max(
        0,
        Math.min(
          2500,
          Number(process.env.GEOAPIFY_MAX_REQUESTS_PER_DAY ?? 2500) || 0,
        ),
      ),
  },
);
export const claimAddressRentCast = createDailyBudget(
  join(serverDirectory, ".cache", "rentcast-address-daily.json"),
  {
    max: () =>
      Math.max(
        0,
        Math.min(
          1000,
          Number(process.env.RENTCAST_ADDRESS_MAX_REQUESTS_PER_DAY ?? 100) || 0,
        ),
      ),
  },
);
