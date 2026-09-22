import assert from "node:assert/strict";
import { test } from "node:test";
import { ENDPOINTS, findEndpoint, resolvePath } from "./endpoints.js";

test("endpoint ids are unique", () => {
  const ids = ENDPOINTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("resolves path parameters under the Talk API prefix", () => {
  assert.equal(
    resolvePath(findEndpoint("call_flow"), { uuid: "3f1c2a9e-0b7d-4c55-9e1a-7d2b8c6f4a10" }),
    "/proxy/talk/api/call_log/flow/3f1c2a9e-0b7d-4c55-9e1a-7d2b8c6f4a10",
  );
});

test("requires every path parameter", () => {
  assert.throws(() => resolvePath(findEndpoint("call_flow")), /requires path parameter 'uuid'/);
});

test("rejects path traversal and separators", () => {
  const endpoint = findEndpoint("call_flow");
  for (const uuid of ["..", ".", "../../api/users", "a/b", "a?b=1", "a%2Fb", ""]) {
    assert.throws(() => resolvePath(endpoint, { uuid }), /Invalid value/, uuid);
  }
});

test("unknown endpoint ids fail clearly", () => {
  assert.throws(() => findEndpoint("nope"), /Unknown endpoint 'nope'/);
});
