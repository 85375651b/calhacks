import { config, serverDirectory } from "../config.js";
import { join, dirname } from "node:path";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { ACTOR_SETTINGS } from "../config/apify.js";
export function createRunGuard(
  file,
  {
    now = Date.now,
    max = () =>
      Math.max(
        1,
        Math.min(1000, Number(process.env.APIFY_MAX_RUNS_PER_HOUR) || 60),
      ),
  } = {},
) {
  let queue = Promise.resolve();
  return () => {
    const job = queue
      .catch(() => {})
      .then(async () => {
        let runs = [];
        try {
          runs = JSON.parse(await readFile(file, "utf8"));
          if (!Array.isArray(runs)) throw new Error();
        } catch (e) {
          if (e.code !== "ENOENT") throw new Error("Data temporarily limited");
        }
        runs = runs.filter((t) => typeof t === "number" && t > now() - 3600000);
        if (runs.length >= (typeof max === "function" ? max() : max))
          throw new Error("Data temporarily limited");
        runs.push(now());
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file + ".tmp", JSON.stringify(runs), { mode: 0o600 });
        await rename(file + ".tmp", file);
      });
    queue = job;
    return job;
  };
}
export const claimRun = createRunGuard(
  join(serverDirectory, ".cache", "apify-budget.json"),
);
let active = 0;
const waiting = [];
async function slot(deadline) {
  if (active < 3) {
    active++;
    return release;
  }
  await new Promise((resolve, reject) => {
    const entry = { resolve, timer: null };
    entry.timer = setTimeout(
      () => {
        const i = waiting.indexOf(entry);
        if (i >= 0) waiting.splice(i, 1);
        reject(new Error("Data temporarily limited"));
      },
      Math.max(1, deadline - Date.now()),
    );
    waiting.push(entry);
  });
  return release;
}
function release() {
  const next = waiting.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
  } else active--;
}
export async function runActor(id, input, { limit = 1, timeout = 90000, build } = {}) {
  if (config.useFixtures)
    throw new Error("External calls are disabled in fixture mode");
  if (!config.enableApify || !config.apifyToken)
    throw new Error("Apify data is unavailable");
  const deadline = Date.now() + timeout;
  const done = await slot(deadline);
  try {
    let remaining = deadline - Date.now();
    if (remaining < 3000) throw new Error("Data temporarily limited");
    await claimRun();
    const u = new URL(
      "https://api.apify.com/v2/acts/" +
        id.replace("/", "~") +
        "/run-sync-get-dataset-items",
    );
    remaining = deadline - Date.now();
    u.search = new URLSearchParams({
      timeout: String(
        Math.max(
          1,
          Math.min(
            ACTOR_SETTINGS.timeoutSeconds,
            Math.floor(remaining / 1000) - 2,
          ),
        ),
      ),
      maxItems: String(limit),
      limit: String(limit),
      maxTotalChargeUsd: String(ACTOR_SETTINGS.chargeCapUsd),
      restartOnError: "false",
    });
    if (build) u.searchParams.set("build", build);
    const r = await fetch(u, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apifyToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(Math.max(1, remaining)),
    });
    if (!r.ok)
      throw new Error(
        r.status === 402 || r.status === 429
          ? "Data temporarily limited"
          : "Provider data unavailable",
      );
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error("Provider data unavailable");
    return data;
  } catch (e) {
    if (e.name === "TimeoutError")
      throw new Error("Provider timed out. Try again later.");
    if (
      ["Data temporarily limited", "Provider data unavailable"].includes(
        e.message,
      )
    )
      throw e;
    throw new Error("Provider data unavailable");
  } finally {
    done();
  }
}
