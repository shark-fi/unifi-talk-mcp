// Drives the built server as a real MCP client over stdio.
//
// Offline (default): points the server at a closed local port and checks tool wiring, input
// validation, the write gate, and error reporting. Nothing leaves this machine.
//
// Live: set TALK_BASE_URL, TALK_USERNAME and TALK_PASSWORD in the environment. Runs read-only
// calls against the console and prints only success/failure and top-level field names, never data.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const live = Boolean(process.env.TALK_BASE_URL);
const env = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  ...(live
    ? Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("TALK_")))
    : { TALK_BASE_URL: "https://127.0.0.1:9", TALK_USERNAME: "smoke", TALK_PASSWORD: "smoke", TALK_TIMEOUT_MS: "3000" }),
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
  env,
  stderr: "inherit",
});
const client = new Client({ name: "unifi-talk-smoke", version: "0.0.0" });
await client.connect(transport);

const textOf = (result) => result.content?.map((c) => c.text ?? "").join("\n") ?? "";

// Schema violations surface either as a thrown protocol error or an isError result, depending on SDK version.
async function callExpectingError(name, args) {
  try {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, `${name} should have failed`);
    return textOf(result);
  } catch (error) {
    return String(error.message ?? error);
  }
}

const ok = (label) => console.log(`ok   ${label}`);

try {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["talk_get", "talk_get_call", "talk_invoke", "talk_list_calls", "talk_list_devices", "talk_list_endpoints", "talk_status"],
  );
  ok(`lists ${tools.length} tools`);

  const catalog = JSON.parse(textOf(await client.callTool({ name: "talk_list_endpoints", arguments: { area: "calls" } })));
  assert.ok(catalog.endpoints.length > 0 && catalog.endpoints.every((e) => e.area === "calls"));
  assert.equal(catalog.writes_enabled, process.env.TALK_ALLOW_WRITES === "true");
  ok(`talk_list_endpoints filters by area (${catalog.endpoints.length} call endpoints)`);

  const gated = await callExpectingError("talk_invoke", { endpoint: "delete_call_log", path_params: { uuid: "x" } });
  if (process.env.TALK_ALLOW_WRITES !== "true") {
    assert.match(gated, /Writes are disabled/);
    ok("talk_invoke is refused while writes are disabled");
  }

  const writeViaGet = await callExpectingError("talk_get", { endpoint: "delete_call_log", path_params: { uuid: "x" } });
  assert.match(writeViaGet, /delete_call_log|invalid|enum/i);
  ok("talk_get rejects write endpoints");

  const traversal = await callExpectingError("talk_get", { endpoint: "call_flow", path_params: { uuid: "../../users" } });
  assert.match(traversal, /Invalid value for path parameter/);
  ok("path traversal in path_params is rejected");

  if (!live) {
    const unreachable = await callExpectingError("talk_get", { endpoint: "users" });
    assert.match(unreachable, /Cannot reach https:\/\/127\.0\.0\.1:9/);
    ok("unreachable console gives a clear error");
  } else {
    for (const [name, args] of [
      ["talk_status", {}],
      ["talk_list_calls", { per_page: 1 }],
      ["talk_get", { endpoint: "users" }],
      ["talk_get", { endpoint: "devices" }],
      ["talk_list_devices", {}],
    ]) {
      const result = await client.callTool({ name, arguments: args });
      const text = textOf(result);
      if (result.isError) {
        console.log(`FAIL ${name} ${JSON.stringify(args)}: ${text.slice(0, 300)}`);
        process.exitCode = 1;
        continue;
      }
      let shape;
      try {
        const parsed = JSON.parse(text);
        shape = Array.isArray(parsed) ? `array(${parsed.length})` : `keys: ${Object.keys(parsed).join(", ")}`;
        if (parsed._truncated) shape += ` [${parsed._truncated}]`;
        if (name === "talk_list_calls" && Array.isArray(parsed.records) && parsed.records.length > args.per_page) {
          shape += ` — FAIL: asked for ${args.per_page} records, got ${parsed.records.length}`;
          process.exitCode = 1;
        }
      } catch {
        shape = "INVALID JSON";
        process.exitCode = 1;
      }
      shape += `, ${text.length} chars`;
      const partial = text.match(/"error":\s*"([^"]{0,200})/);
      if (partial) {
        console.log(`WARN ${name}: partial errors — ${partial[1]}`);
      }
      ok(`${name} ${JSON.stringify(args)} → ${shape}`);
    }
  }

  console.log(live ? "\nLive smoke test finished." : "\nOffline smoke test passed.");
} finally {
  await client.close();
}
