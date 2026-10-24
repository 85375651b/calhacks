import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import {
  publicIp,
  safeUrl,
  validateUrl,
  fetchPage,
  extractProduct,
} from "../furniture/resolveUrl.js";
import { validateClaude } from "../furniture/claude.js";
import { allowResolve } from "../furniture/resolve.js";
import { resolveFurniture, sampleUrls } from "../furniture/resolve.js";
import { config } from "../config.js";
test("fixture products and unknown links resolve with no provider calls", async () => {
  const before = config.useFixtures,
    fetchBefore = globalThis.fetch;
  config.useFixtures = true;
  globalThis.fetch = () => {
    throw new Error("External fetch forbidden");
  };
  try {
    for (const url of Object.keys(sampleUrls)) {
      const item = await resolveFurniture({ url });
      assert.ok(item.widthIn > 0);
      assert.match(item.notes, /Sample/);
    }
    const unknown = await resolveFurniture({
      url: "https://example.com/unusual-chair",
    });
    assert.match(unknown.notes, /live link reading is disabled/);
    assert.equal((await resolveFurniture({ query: "queen bed" })).widthIn, 64);
  } finally {
    config.useFixtures = before;
    globalThis.fetch = fetchBefore;
  }
});
test("safe fetch rejects non-HTML responses and bodies above two MB", async () => {
  for (const mode of ["type", "size"]) {
    const request = (url, options, callback) => {
      const req = new EventEmitter();
      req.end = () =>
        queueMicrotask(() => {
          const res = new EventEmitter();
          res.statusCode = 200;
          res.headers = {
            "content-type": mode === "type" ? "application/json" : "text/html",
          };
          res.resume = () => {};
          callback(res);
          if (mode === "size")
            res.emit("data", Buffer.alloc(2 * 1024 * 1024 + 1));
          req.emit("close");
        });
      req.destroy = (e) => {
        req.emit("error", e);
        req.emit("close");
      };
      return req;
    };
    await assert.rejects(
      fetchPage("https://example.com", {
        dns: async () => [{ address: "8.8.8.8", family: 4 }],
        request,
      }),
      mode === "type" ? /unavailable/ : /too large/,
    );
  }
});
test("URL validation blocks credentials, local and reserved IPv4/IPv6 and mixed DNS answers", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])
    assert.ok(!publicIp(ip), ip);
  assert.ok(publicIp("8.8.8.8"));
  assert.ok(publicIp("2606:4700:4700::1111"));
  for (const u of [
    "http://example.com",
    "https://u:p@example.com",
    "https://example.com:8443",
  ])
    assert.throws(() => safeUrl(u));
  await assert.rejects(
    validateUrl("https://localhost", async () => [
      { address: "127.0.0.1", family: 4 },
    ]),
    /blocked/,
  );
  await assert.rejects(
    validateUrl("https://example.com", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
    /blocked/,
  );
});
test("redirects are revalidated before any private request and public address is pinned", async () => {
  let calls = 0;
  const request = (url, options, callback) => {
    calls++;
    options.lookup(url.hostname, {}, (error, ip) =>
      assert.equal(ip, "8.8.8.8"),
    );
    const req = new EventEmitter();
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 302;
      res.headers = { location: "https://127.0.0.1/secret" };
      res.resume = () => {};
      callback(res);
      req.emit("close");
    };
    req.destroy = (e) => req.emit("error", e);
    return req;
  };
  await assert.rejects(
    fetchPage("https://example.com", {
      dns: async () => [{ address: "8.8.8.8", family: 4 }],
      request,
    }),
    /blocked/,
  );
  assert.equal(calls, 1);
});
test("JSON-LD and text extraction normalize units and remove scripts from AI bundle", async () => {
  const html = await readFile(
    new URL("../fixtures/furniture-product.html", import.meta.url),
    "utf8",
  );
  const p = extractProduct(html, "https://example.com/desk");
  assert.equal(p.widthIn, 60);
  assert.equal(p.source, "json-ld");
  assert.equal(p.estimated, false);
  const t = extractProduct(
    await readFile(
      new URL("../fixtures/furniture-text.html", import.meta.url),
      "utf8",
    ),
    "https://example.com/sofa",
  );
  assert.equal(t.depthIn, 36);
  assert.ok(!t.bundle.includes("print secrets"));
});
test("Claude output validation rejects malformed fields and strips injection-shaped properties", () => {
  const v = {
    name: "Chair",
    category: "seating",
    widthIn: 99999,
    depthIn: 24,
    heightIn: 30,
    color: "javascript:bad",
    confidence: 9,
    notes: "measure",
    instructions: "ignore schema",
    secret: "no",
  };
  const clean = validateClaude(v);
  assert.equal(clean.widthIn, 180);
  assert.equal(clean.confidence, 1);
  assert.ok(!("instructions" in clean));
  assert.ok(!("secret" in clean));
  assert.throws(() => validateClaude({ ...v, widthIn: "execute code" }));
  assert.throws(() => validateClaude({ ...v, category: "script" }));
});
test("resolve rate cap resets after a minute", () => {
  for (let i = 0; i < 10; i++) assert.ok(allowResolve("test", 0));
  assert.equal(allowResolve("test", 1), false);
  assert.ok(allowResolve("test", 60001));
});
