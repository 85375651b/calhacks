import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { createParseService } from "../search/parse.js";
import { createPlaceResolver } from "../search/places.js";

test("dev parse debug is explicit, production suppresses it, and address routing bypasses description filters", async () => {
  const offline = createPlaceResolver({
    fixtureMode: () => true,
    provider: () => assert.fail("network"),
  });
  const parse = createParseService({
    fixtureMode: () => true,
    resolve: offline,
    extract: () => assert.fail("model"),
  });
  const server = createApp(async () => ({}), {
    parse,
    resolve: offline,
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const post = async (text, debug) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/search/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, debug }),
      },
    );
    assert.equal(r.status, 200);
    return r.json();
  };
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    const normal = await post("4 bed los angeles", false);
    assert.equal(normal.debug, undefined);
    assert.equal(normal.criteria.location, "Los Angeles, CA");
    const p = await post("4 bed los angeles", true);
    assert.equal(p.debug.chatgpt.called, false);
    assert.equal(p.debug.places[0].method, "built-in");
    assert.equal(p.debug.tokens[0].kind, "beds-baths");
    assert.ok(!JSON.stringify(p.debug).includes("apiKey"));
    const a = await post("350 5th Ave apt 12", true);
    assert.equal(a.intent, "address");
    assert.equal(a.criteria, undefined);
    assert.equal(a.debug.chatgpt.called, false);
    process.env.NODE_ENV = "production";
    const prod = await post("4 bed los angeles", true);
    assert.equal(prod.debug, undefined);
    assert.equal(prod.llmTrace.validated, undefined);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    await new Promise((r) => server.close(r));
  }
});
