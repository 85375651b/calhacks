import { Router } from "express";
import { join } from "node:path";
import { serverDirectory } from "../config.js";
import { createFavorites, clientId } from "./favorites.js";
export const favoritesRouter = Router();
const store = createFavorites(join(serverDirectory, "data", "favorites.json")),
  limits = new Map();
favoritesRouter.use((req, res, next) => {
  try {
    req.clientId = clientId(req.get("X-Client-Id"));
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const key = req.ip;
    const entry = limits.get(key) || { count: 0, until: now + 60000 };
    entry.count++;
    limits.set(key, entry);
    if (entry.count > 120)
      return res.status(429).json({
        error: {
          message: "Please wait a moment before updating saved homes.",
        },
      });
    next();
  } catch (e) {
    res.status(400).json({ error: { message: e.message } });
  }
});
const handle = (fn) => async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await fn(req));
  } catch (e) {
    res
      .status(e.message.includes("up to 5") ? 409 : 400)
      .json({ error: { message: e.message } });
  }
};
favoritesRouter.get(
  "/",
  handle((req) => store.list(req.clientId)),
);
favoritesRouter.post(
  "/",
  handle((req) => store.add(req.clientId, req.body)),
);
favoritesRouter.delete(
  "/:id",
  handle((req) => store.remove(req.clientId, req.params.id)),
);
