import express from "express";
import {insightHandlers} from "./insights/index.js";
import {search} from "./search/index.js";
import { LookupError } from "./errors.js";

export function createApp(lookup, { autocomplete, enrich } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({limit:"100kb"}));
  app.get("/api/insights/:module", async(req,res)=>{try{const handler=insightHandlers[req.params.module];if(!handler)return res.status(404).json({error:{message:"Unknown insight"}});res.json(await handler(req.query));}catch(e){res.status(503).json({error:{message:e.message}});}});
  app.post("/api/search", async(req,res)=>{try{res.json(await search(req.body));}catch(e){res.status(/Invalid|Enter|Choose|Minimum|HTTPS/.test(e.message)?400:503).json({error:{message:e.message}});}});
  app.get("/api/autocomplete", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json(autocomplete ? await autocomplete(req.query.q, req.ip) : []);
    } catch (error) {
      if (error instanceof LookupError) {
        if (error.status === 429) res.set("Retry-After", "60");
        res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
      } else res.json([]);
    }
  });
  app.get("/api/enrich", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!enrich)
        throw new LookupError(
          503,
          "APIFY_UNAVAILABLE",
          "Zillow data unavailable right now",
        );
      res.json(await enrich(req.query.address));
    } catch (error) {
      res
        .status(error instanceof LookupError ? error.status : 502)
        .json({
          error: {
            code:
              error instanceof LookupError ? error.code : "APIFY_UNAVAILABLE",
            message: "Zillow data unavailable right now",
          },
        });
    }
  });
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
