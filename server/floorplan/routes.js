import express, { Router } from "express";
import { clientId } from "../storage/favorites.js";
import { createJobManager } from "./jobs.js";
import {
  assets as assetStore,
  storeActorPlans,
  samplePlans,
} from "./assets.js";
import { converters, NotImplementedError } from "./converters/index.js";
import { ConversionError } from "./converters/cubicasa.js";
import { calibrate, rotation } from "../../src/lib/planner/calibration.js";
import { adaptResult } from "./actorAdapter.js";
const defaultManager = createJobManager({
  storePlans: storeActorPlans,
  sample: samplePlans,
  resultAvailable: async (result) => {
    const plans = result?.plans?.filter((p) => p.assetId) || [];
    if (!plans.length) return false;
    try {
      await Promise.all(plans.map((p) => assetStore.get(p.assetId)));
      return true;
    } catch {
      return false;
    }
  },
});
export function createFloorPlanRouter({
  manager = defaultManager,
  assets = assetStore,
  registry = converters,
} = {}) {
  const router = Router(),
    limits = new Map();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    // Public actor assets are authorized in the asset handler; uploads require the owner header.
    const publicAsset = req.method === "GET" && req.path.startsWith("/assets/");
    if (publicAsset) {
      const now = Date.now();
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
      const key = "asset:" + req.ip,
        v = limits.get(key) || { n: 0, until: now + 60000 };
      limits.set(key, v);
      if (++v.n > 180 || limits.size > 5000)
        return res
          .status(429)
          .json({
            error: { message: "Please wait before loading more previews." },
          });
      return next();
    }
    try {
      req.clientId = clientId(req.get("X-Client-Id"));
    } catch {
      return res
        .status(400)
        .json({
          error: { message: "A valid anonymous client ID is required." },
        });
    }
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const k = req.clientId + (req.method === "GET" ? ":read" : ":write"),
      v = limits.get(k) || { n: 0, until: now + 60000 };
    limits.set(k, v);
    if (++v.n > (req.method === "GET" ? 90 : 20) || limits.size > 5000)
      return res
        .status(429)
        .json({
          error: { message: "Please wait a minute before trying again." },
        });
    next();
  });
  const handle = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch {
      res
        .status(400)
        .json({
          error: {
            message:
              "Floor plan request unavailable. Check the address or try an upload.",
          },
        });
    }
  };
  router.post(
    "/jobs",
    handle((req) => manager.start(req.body, req.clientId)),
  );
  router.get(
    "/jobs/:jobId",
    handle((req) => manager.get(req.params.jobId, req.clientId)),
  );
  router.delete(
    "/jobs/:jobId",
    handle((req) => manager.cancel(req.params.jobId, req.clientId)),
  );
  router.post(
    "/sample",
    handle(() => samplePlans()),
  );
  router.get(
    "/converters",
    handle(() => registry.list()),
  );
  router.post("/:assetId/convert", async (req, res) => {
    try {
      const asset = await assets.get(req.params.assetId, req.clientId),
        body = req.body || {};
      const c = body.calibration;
      const automaticScale = registry.list().find(entry => entry.id === body.converter)?.automaticScale;
      const calibration = !c && automaticScale ? null : calibrate(
        c?.p1,
        c?.p2,
        c?.realLengthIn,
        asset.widthPx,
        asset.heightPx,
      );
      const height =
        typeof body.ceilingHeightIn === "number" &&
        Number.isFinite(body.ceilingHeightIn)
          ? Math.max(72, Math.min(240, body.ceilingHeightIn))
          : 96;
      const listingFacts = adaptResult(
        { listingFacts: body.listingFacts },
        null,
        "",
      ).listingFacts;
      const result = await registry.convert(
        typeof body.converter === "string" ? body.converter : "auto",
        {
          asset,
          calibration: calibration ? {
            pixelsPerInch: calibration.pixelsPerInch,
            rotationDeg: rotation(body.rotationDeg),
          } : null,
          levelIndex: Number.isInteger(body.levelIndex) && body.levelIndex >= 0 && body.levelIndex <= 3 ? body.levelIndex : 0,
          rotationDeg: rotation(body.rotationDeg),
          ceilingHeightIn: height,
          listingFacts,
        },
      );
      res.json(result);
    } catch (e) {
      if (e instanceof ConversionError) return res.status(422).json({ error: { message: e.message } });
      if (e instanceof NotImplementedError)
        res
          .status(501)
          .json({ status: "not_implemented", converters: registry.list() });
      else
        res
          .status(400)
          .json({
            error: {
              message:
                "Could not convert this plan. Check its scale or try again.",
            },
          });
    }
  });
  router.get(
    "/metadata/:assetId",
    handle(async (req) => {
      const { ownerClientId, pngPath, addressKey, expiresAt, ...publicAsset } =
        await assets.get(req.params.assetId, req.clientId);
      return publicAsset;
    }),
  );
  router.delete(
    "/uploads/:assetId",
    handle((req) => assets.remove(req.params.assetId, req.clientId)),
  );
  router.get("/assets/:filename", async (req, res) => {
    try {
      if (!/^[a-f0-9]{32}\.png$/.test(req.params.filename)) throw Error();
      const asset = await assets.get(
        req.params.filename.slice(0, -4),
        req.get("X-Client-Id"),
      );
      res.set({
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control":
          asset.source === "upload"
            ? "private, no-store"
            : "private, max-age=3600",
      });
      res.sendFile(asset.pngPath);
    } catch {
      res
        .status(404)
        .json({
          error: {
            message: "Plan not found, expired, or belongs to another browser.",
          },
        });
    }
  });
  router.post(
    "/uploads",
    express.raw({
      type: [
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf",
        "application/octet-stream",
      ],
      limit: "10mb",
    }),
    async (req, res) => {
      try {
        const plans = await assets.ingest(req.body, {
          source: "upload",
          ownerClientId: req.clientId,
          sourceName: "Your upload",
        });
        res.json({ ...plans[0], plans });
      } catch (e) {
        res
          .status(400)
          .json({
            error: {
              message: /10|PDF|PNG|SVG/.test(e.message)
                ? e.message
                : "File could not be decoded. Upload a PNG, JPG, WebP or PDF.",
            },
          });
      }
    },
  );
  return router;
}
