import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initialCombobox, comboboxReducer as reduce, enterTarget, inputPrivacy } from "../../src/lib/search/combobox.js";
test("only explicit selection rewrites typed text; arrows and hover do not", () => {
  let state = reduce(initialCombobox(), { type: "type", value: "123 main st, Austin, TX 99999" });
  const item = { label: "123 Main Street, Austin, TX 78701" };
  state = reduce(state, { type: "results", items: [item], revision: state.revision });
  assert.equal(state.active, -1);
  assert.equal(enterTarget(state), null);
  const typed = state.value;
  state = reduce(state, { type: "hover", index: 0 });
  assert.equal(enterTarget(state), null);
  state = reduce(state, { type: "arrow", direction: 1 });
  assert.equal(state.value, typed);
  assert.equal(enterTarget(state), item);
  state = reduce(state, { type: "select", item });
  assert.equal(state.value, item.label);
  state = reduce(state, { type: "type", value: item.label + "x" });
  assert.equal(state.selected, null);
});
test("blur, Escape, submit and stale responses cannot reopen or rewrite; restoration stays closed", () => {
  for (const reason of ["blur", "escape", "submit", "tab", "outside"]) {
    let state = reduce(initialCombobox(), { type: "type", value: "Typed exactly " });
    const revision = state.revision;
    state = reduce(state, { type: "close", reason });
    state = reduce(state, { type: "results", revision, items: [{ label: "different" }] });
    state = reduce(state, { type: "arrow", direction: 1 });
    assert.equal(state.open, false);
    assert.equal(state.value, "Typed exactly ");
  }
  const restored = reduce(initialCombobox(), { type: "restore", value: "  lowercase ZIP 99999  " });
  assert.equal(restored.open, false);
  assert.equal(restored.value, "  lowercase ZIP 99999  ");
});
test("shared field disables browser/password-manager autofill and has no asynchronous text writer", async () => {
  assert.deepEqual(inputPrivacy, { autoComplete: "off", autoCorrect: "off", autoCapitalize: "off", spellCheck: false, "data-lpignore": "true", "data-1p-ignore": "true", "data-form-type": "other" });
  const source = await readFile(new URL("../../src/components/AddressCombobox.jsx", import.meta.url), "utf8");
  assert.match(source, /\.\.\.inputPrivacy/);
  assert.doesNotMatch(source, /onMouseMove|onFocus|change\(p.standardized/);
  const home = await readFile(new URL("../../src/pages/Home.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /setText\(v.address/);
});
