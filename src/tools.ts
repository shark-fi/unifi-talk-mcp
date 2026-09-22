import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { TalkClient } from "./client.js";
import type { Config } from "./config.js";
import {
  API_PREFIX,
  AREAS,
  ENDPOINTS,
  READ_ENDPOINTS,
  WRITE_ENDPOINTS,
  findEndpoint,
  isWrite,
  pathParamsOf,
  resolvePath,
  type Endpoint,
} from "./endpoints.js";
import { summarizeDevice } from "./devices.js";
import { serializeWithinBudget } from "./fit.js";
import { REDACTED, containsRedacted, redact } from "./redact.js";

const MAX_RESULT_CHARS = 100_000;

type Query = Record<string, string | number | undefined>;

function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: serializeWithinBudget(redact(value), MAX_RESULT_CHARS) }] };
}

function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: message }] };
}

async function settle(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const idsOf = (endpoints: readonly Endpoint[]) => endpoints.map((e) => e.id) as [string, ...string[]];

const pathParamsSchema = z
  .record(z.string(), z.string())
  .optional()
  .describe('Values for {placeholders} in the endpoint path, e.g. {"uuid": "..."}');

export function registerTools(server: McpServer, client: TalkClient, config: Config): void {
  const call = (id: string, pathParams?: Record<string, string>, options: { query?: Query; body?: unknown } = {}) => {
    const endpoint = findEndpoint(id);
    return client.request(endpoint.method, resolvePath(endpoint, pathParams), options);
  };

  server.registerTool(
    "talk_status",
    {
      title: "Talk status",
      description: "Talk version and region, console summary, and service health. A good first call.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [info, dashboard, health] = await Promise.all([
        settle(call("talk_info")),
        settle(call("dashboard")),
        settle(call("service_health")),
      ]);
      return jsonResult({ info, dashboard, health });
    },
  );

  server.registerTool(
    "talk_list_calls",
    {
      title: "List calls",
      description: "Call history with caller ID, direction, status, and voicemail data. Paginated.",
      inputSchema: {
        page: z.number().int().min(1).default(1),
        // Records run ~1.7 KB each, so 50 stays under the result size limit.
        per_page: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ page, per_page }) => {
      try {
        // Talk ignores per_page/limit/page_size: it pages with items_per_page (default 50) and rejects a missing page.
        return jsonResult(await call("call_log", undefined, { query: { page, items_per_page: per_page } }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "talk_get_call",
    {
      title: "Get call details",
      description: "Event timeline and transcription (if enabled) for one call, by the uuid from talk_list_calls.",
      inputSchema: { uuid: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ uuid }) => {
      const [flow, transcription] = await Promise.all([
        settle(call("call_flow", { uuid })),
        settle(call("call_transcription", { uuid })),
      ]);
      return jsonResult({ uuid, flow, transcription });
    },
  );

  server.registerTool(
    "talk_list_devices",
    {
      title: "List devices",
      description:
        "Talk desk phones and softphone apps with user, extension, status, SIP registration, last seen, IP, and " +
        "firmware. A compact view of the devices endpoint; filter by status or kind.",
      inputSchema: {
        status: z.enum(["online", "offline"]).optional(),
        kind: z.enum(["hardware", "softphone"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, kind }) => {
      try {
        const raw = await call("devices");
        if (!Array.isArray(raw)) throw new Error("Unexpected devices response: expected a list");
        const devices = raw
          .filter((device): device is Record<string, unknown> => device !== null && typeof device === "object")
          .map(summarizeDevice)
          .filter((device) => (status === undefined || device.status === status) && (kind === undefined || device.kind === kind));
        return jsonResult({ count: devices.length, devices });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "talk_list_endpoints",
    {
      title: "List Talk endpoints",
      description:
        "Catalog of known UniFi Talk API endpoints (users, numbers, devices, routing, voicemail, billing, and more) " +
        "with their parameters. Use it to find an endpoint id for talk_get or talk_invoke.",
      inputSchema: { area: z.enum(AREAS).optional().describe("Only list endpoints in this area") },
      annotations: { readOnlyHint: true },
    },
    async ({ area }) =>
      jsonResult({
        writes_enabled: config.allowWrites,
        note: "Unofficial, reverse-engineered API. Endpoints marked candidate have not been confirmed on a live console.",
        endpoints: ENDPOINTS.filter((e) => area === undefined || e.area === area).map((e) => ({
          id: e.id,
          area: e.area,
          method: e.method,
          path: `${API_PREFIX}${e.path}`,
          description: e.description,
          tool: isWrite(e) ? "talk_invoke" : "talk_get",
          ...(pathParamsOf(e).length > 0 ? { path_params: pathParamsOf(e) } : {}),
          ...(e.query ? { query: e.query } : {}),
          ...(e.body ? { body: e.body } : {}),
          ...(e.candidate ? { candidate: true } : {}),
        })),
      }),
  );

  server.registerTool(
    "talk_get",
    {
      title: "Read from Talk",
      description: "Call any read-only Talk endpoint by id. See talk_list_endpoints for descriptions and parameters.",
      inputSchema: {
        endpoint: z.enum(idsOf(READ_ENDPOINTS)),
        path_params: pathParamsSchema,
        query: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ endpoint, path_params, query }) => {
      try {
        return jsonResult(await call(endpoint, path_params, { query }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "talk_invoke",
    {
      title: "Change Talk configuration",
      description:
        "Call a Talk endpoint that changes or deletes data. Disabled unless the server runs with TALK_ALLOW_WRITES=true. " +
        "Confirm with the user before calling. See talk_list_endpoints for body shapes.",
      inputSchema: {
        endpoint: z.enum(idsOf(WRITE_ENDPOINTS)),
        path_params: pathParamsSchema,
        body: z.unknown().optional().describe("JSON request body"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ endpoint, path_params, body }) => {
      if (!config.allowWrites) {
        return errorResult(
          "Writes are disabled. Set TALK_ALLOW_WRITES=true in this MCP server's environment to enable talk_invoke.",
        );
      }
      if (containsRedacted(body)) {
        return errorResult(
          `The body contains the '${REDACTED}' placeholder copied from a read. Sending it would overwrite a real ` +
            "secret. Remove those fields or supply real values.",
        );
      }
      try {
        return jsonResult(await call(endpoint, path_params, { body }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
