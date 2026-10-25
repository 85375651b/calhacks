import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createPlannerStore, furniture, layout } from "../storage/planner.js";
test("furniture storage serializes, enforces caps, survives restart and isolates clients", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planner-"));
  try {
    const file = join(dir, "furniture.json"),
      id = randomUUID(),
      store = createPlannerStore(file, { kind: "furniture", cap: 50 });
    const results = await Promise.allSettled(
      Array.from({ length: 52 }, (_, i) =>
        store.put(id, { id: "item-" + i, name: "Chair", widthIn: 30 }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 50);
    assert.equal(
      (await createPlannerStore(file, { kind: "furniture", cap: 50 }).list(id))
        .length,
      50,
    );
    assert.equal((await store.list(randomUUID())).length, 0);
    await store.remove(id, "item-0");
    assert.equal((await store.list(id)).length, 49);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("layout and furniture validation strip fields and bound numeric values", () => {
  const f = furniture({
    id: "item",
    name: "Desk",
    widthIn: Infinity,
    depthIn: 9999,
    secret: "no",
  });
  assert.equal(f.widthIn, 36);
  assert.equal(f.depthIn, 600);
  assert.ok(!("secret" in f));
  assert.throws(() => layout({ placements: Array(81).fill({}) }, "demo"));
  const l = layout(
    {
      homeSnapshot: { id: "demo", address: "Demo", secret: "no" },
      roomOverrides: { a: { widthIn: 5, depthIn: 9999 } },
      placements: [
        {
          id: "p",
          furnitureId: "item",
          xIn: -9,
          zIn: Infinity,
          level: 99,
          unknown: 1,
        },
      ],
    },
    "demo",
  );
  assert.equal(l.placements[0].xIn, 0);
  assert.equal(l.placements[0].level, 2);
  assert.equal(l.roomOverrides.a.widthIn, 36);
  assert.ok(!("unknown" in l.placements[0]));
  assert.throws(() =>
    layout(
      { placements: [], roomOverrides: JSON.parse('{"__proto__":{}}') },
      "demo",
    ),
  );
});

test("archived layout definitions do not consume library slots",async()=>{
  const dir=await mkdtemp(join(tmpdir(),'planner-archive-'));
  try {
    const id=randomUUID(),store=createPlannerStore(join(dir,'furniture.json'),{kind:'furniture',cap:1});
    await store.put(id,{id:'sofa',name:'Sofa'});
    await store.put(id,{id:'sofa',name:'Sofa',archived:true});
    await store.put(id,{id:'chair',name:'Chair'});
    assert.equal((await store.list(id)).filter(item=>!item.archived).length,1);
    await assert.rejects(store.put(id,{id:'sofa',name:'Sofa'}),/up to 1/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test("ten-layout cap permits updates and deletion without deleting furniture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "layouts-"));
  try {
    const store = createPlannerStore(join(dir, "layouts.json"), {
        kind: "layouts",
        cap: 10,
      }),
      id = randomUUID();
    for (let i = 0; i < 10; i++)
      await store.put(id, { placements: [] }, "home-" + i);
    await assert.rejects(
      store.put(id, { placements: [] }, "extra"),
      /up to 10/,
    );
    await store.put(id, { placements: [] }, "home-0");
    await store.remove(id, "home-0");
    await store.put(id, { placements: [] }, "extra");
    assert.equal((await store.list(id)).length, 10);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
