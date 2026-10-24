import { resolveFurniture, allowResolve } from "../furniture/resolve.js";
import { Router } from "express";
import { join } from "node:path";
import { serverDirectory } from "../config.js";
import { clientId } from "./favorites.js";
import { createPlannerStore } from "./planner.js";
const library = createPlannerStore(
  join(serverDirectory, "data", "furniture.json"),
  { kind: "furniture", cap: 50 },
);
const layouts = createPlannerStore(
  join(serverDirectory, "data", "layouts.json"),
  { kind: "layouts", cap: 10 },
);
export const plannerRouter = Router();
plannerRouter.use((req, res, next) => {
  if (!req.path.startsWith("/furniture") && !req.path.startsWith("/planner/"))
    return next();
  res.set("Cache-Control", "no-store");
  try {
    req.clientId = clientId(req.get("X-Client-Id"));
    next();
  } catch {
    res
      .status(400)
      .json({ error: { message: "A valid anonymous client ID is required." } });
  }
});
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res
      .status(e.message.includes("up to") ? 409 : 400)
      .json({ error: { message: e.message } });
  }
};
plannerRouter.get(
  "/furniture",
  handle((req) => library.list(req.clientId)),
);
plannerRouter.post(
  "/furniture",
  handle((req) => library.put(req.clientId, req.body)),
);
plannerRouter.patch(
  "/furniture/:id",
  handle(async (req) => {
    const old = (await library.list(req.clientId)).find(
      (i) => i.id === req.params.id,
    );
    if (!old) throw new Error("Furniture not found.");
    return library.put(req.clientId, {
      ...old,
      ...req.body,
      id: req.params.id,
    });
  }),
);
plannerRouter.delete(
  "/furniture/:id",
  handle(async (req) => {
    const used = (await layouts.list(req.clientId)).some((l) =>
      l.placements.some((p) => p.furnitureId === req.params.id),
    );
    if (used)
      throw new Error(
        "Remove this furniture from saved layouts before deleting its definition.",
      );
    return library.remove(req.clientId, req.params.id);
  }),
);
plannerRouter.post("/furniture/resolve", async (req, res) => {
  if (!allowResolve(req.clientId)) {
    res.set("Retry-After", "60");
    return res.status(429).json({
      error: {
        code: "rate_limited",
        message: "Please wait a minute before resolving more furniture.",
      },
    });
  }
  try {
    res.json(await resolveFurniture(req.body));
  } catch (e) {
    const code = [
      "blocked",
      "no_dimensions",
      "invalid_url",
      "timeout",
      "rate_limited",
    ].includes(e.code)
      ? e.code
      : "blocked";
    res.status(code === "timeout" ? 504 : 400).json({
      error: {
        code,
        message:
          code === "timeout"
            ? "Product page timed out. Try manual dimensions."
            : code === "invalid_url"
              ? "Enter a public HTTPS product URL or furniture name."
              : "This product page cannot be read. Try manual dimensions.",
      },
    });
  }
});
plannerRouter.get(
  "/planner/layouts",
  handle((req) => layouts.list(req.clientId)),
);
plannerRouter.get(
  "/planner/layouts/:homeId",
  handle(
    async (req) =>
      (await layouts.list(req.clientId)).find(
        (l) => l.homeId === req.params.homeId,
      ) || null,
  ),
);
plannerRouter.put(
  "/planner/layouts/:homeId",
  handle((req) => layouts.put(req.clientId, req.body, req.params.homeId)),
);
plannerRouter.delete(
  "/planner/layouts/:homeId",
  handle((req) => layouts.remove(req.clientId, req.params.homeId)),
);
