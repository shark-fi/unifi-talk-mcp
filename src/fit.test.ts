import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeWithinBudget } from "./fit.js";

const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ i, pad: "x".repeat(50) }));

test("returns compact JSON unchanged when it fits", () => {
  const value = { a: [1, 2], b: "c" };
  assert.equal(serializeWithinBudget(value, 1000), JSON.stringify(value));
});

test("trims a top-level array and stays valid JSON", () => {
  const text = serializeWithinBudget(rows(100), 1000);
  assert.ok(text.length <= 1000);
  const parsed = JSON.parse(text);
  assert.ok(parsed.items.length > 0 && parsed.items.length < 100);
  assert.match(parsed._truncated, new RegExp(`the result shows ${parsed.items.length} of 100 items`));
});

test("trims the largest nested list and keeps its siblings", () => {
  const value = { info: { version: "5.1.2" }, health: { status: "ok", events: rows(200) } };
  const text = serializeWithinBudget(value, 2000);
  assert.ok(text.length <= 2000);
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.info, { version: "5.1.2" });
  assert.equal(parsed.health.status, "ok");
  assert.ok(parsed.health.events.length > 0 && parsed.health.events.length < 200);
  assert.match(parsed._truncated, /'health\.events' shows \d+ of 200 items/);
});

test("falls back to a labelled raw cut when there is no list to trim", () => {
  const text = serializeWithinBudget({ blob: "x".repeat(5000) }, 100);
  assert.match(text, /cut at 100 of \d+ characters; this output is not valid JSON/);
});
