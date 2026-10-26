import { defineConfig, loadEnv } from "vite";
import fs from "node:fs";
import path from "node:path";

// Repo-root assets shared with the Python/Blender pipeline (scene.json, library.json,
// textures/, sized .glb files, clean floor-plan JSON). Only these allowlisted paths are
// served or copied; the rest of the repo (server/.env etc.) is never exposed.
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const MIME = { ".json": "application/json", ".glb": "model/gltf-binary",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
export function isSharedAsset(rel) {
  if (rel.includes("..") || rel.includes("\\") || rel.split("/").some((p) => p.startsWith("."))) return false;
  if (rel === "library.json" || /^scene[\w-]*\.json$/.test(rel)) return true; // scene.json, scene_placed.json, ...
  if (/^[\w.-]+\.glb$/.test(rel)) return true; // root-level *.glb
  if (/^scenes?\/[\w./-]+\.json$/.test(rel)) return true; // optional extra scene files
  if (/^textures\/[\w./-]+\.(jpe?g|png)$/i.test(rel)) return true;
  if (/^floorplan\/[\w./-]+_clean\.json$/.test(rel)) return true;
  return false;
}
function sharedAssets() {
  const middleware = (req, res, next) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, ""); }
    catch { return next(); }
    if (!isSharedAsset(rel)) return next();
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) return next();
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return next();
      res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.setHeader("Content-Length", st.size);
      res.setHeader("Cache-Control", "no-cache");
      fs.createReadStream(file).pipe(res);
    });
  };
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!e.name.startsWith(".") && !(dir === "" && !["textures", "floorplan", "scene", "scenes"].includes(e.name))) walk(rel, out); }
      else if (isSharedAsset(rel)) out.push(rel);
    }
    return out;
  };
  let outDir = "dist";
  return {
    name: "shared-repo-assets",
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
    closeBundle() {
      // Snapshot the shared assets into dist so a static deploy also works.
      if (!fs.existsSync(outDir)) return;
      for (const rel of walk("")) {
        const dest = path.join(outDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(ROOT, rel), dest);
      }
    },
  };
}

export default defineConfig(() => {
  const serverEnv = loadEnv("development", "server", "PORT");
  return {
    plugins: [sharedAssets()],
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": `http://127.0.0.1:${process.env.PORT || serverEnv.PORT || 3001}`,
      },
    },
    preview: {
      host: "127.0.0.1",
      proxy: {
        "/api": `http://127.0.0.1:${process.env.PORT || serverEnv.PORT || 3001}`,
      },
    },
  };
});
