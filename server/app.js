import express from "express";
import { LookupError } from "./errors.js";

export function createApp(lookup) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/api/lookup", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json(await lookup(req.query.address));
    } catch (error) {
      const known = error instanceof LookupError;
      if (known && error.status === 429) res.set("Retry-After", "30");
      res.status(known ? error.status : 500).json({
        error: {
          code: known ? error.code : "SERVER_ERROR",
          message: known
            ? error.message
            : "We couldn’t load this property right now. Please try again later.",
        },
      });
    }
  });
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "API route not found." } }),
  );
  return app;
}
