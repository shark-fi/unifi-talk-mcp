#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TalkClient } from "./client.js";
import { loadConfig } from "./config.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.insecureTls) {
    console.error("warning: TALK_INSECURE_TLS=true — TLS certificate verification is disabled");
  }

  // Login is lazy: the server starts even if the console is unreachable, and reports it per call.
  const client = new TalkClient(config);
  const server = new McpServer(
    { name: "unifi-talk", version: "0.1.0" },
    {
      instructions:
        "UniFi Talk phone system (unofficial API). Start with talk_status or talk_list_calls; use " +
        "talk_list_endpoints to discover users, numbers, devices, routing, and more, then talk_get to read them. " +
        "Secrets are redacted. talk_invoke changes data: confirm with the user first.",
    },
  );
  registerTools(server, client, config);

  const shutdown = async () => {
    await server.close();
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
