import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage();
// Only explicit, safe summaries belong here: never URLs, headers or raw errors.
export function trace(step, details = {}) {
  context.getStore()?.push({ step, ...details });
}
export async function withAddressTrace(enabled, fn) {
  if (!enabled || process.env.NODE_ENV === "production") return fn();
  const events = [];
  return context.run(events, async () => {
    const result = await fn();
    trace("decision", { result: result.result, reasonCode: result.reasonCode, unavailable: result.unavailable });
    return { ...result, debug: events };
  });
}
