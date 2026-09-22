// Prints the *shape* of Talk responses (sizes, key names, array lengths, numeric paging fields),
// never their values. Used to work out which paging parameters Talk honors.
//
// Needs TALK_BASE_URL, TALK_USERNAME, TALK_PASSWORD (and TALK_CA_CERT) in the environment.
// Runs read-only GETs over a single login.

import { TalkClient } from "../dist/client.js";
import { loadConfig } from "../dist/config.js";

const PAGING_KEY = /total|count|page|limit|size|offset|has_more/i;

const itemKeys = (item) => (item && typeof item === "object" ? Object.keys(item) : typeof item);

function describe(value) {
  const size = JSON.stringify(value)?.length ?? 0;
  if (Array.isArray(value)) {
    const largestItem = value.reduce((max, item) => Math.max(max, JSON.stringify(item).length), 0);
    return { size, type: "array", length: value.length, largestItem, itemKeys: itemKeys(value[0]) };
  }
  if (value && typeof value === "object") {
    const out = { size, type: "object", keys: Object.keys(value) };
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child)) {
        out[`${key}[]`] = { length: child.length, itemKeys: itemKeys(child[0]) };
      } else if (PAGING_KEY.test(key) && (typeof child === "number" || typeof child === "boolean")) {
        out[key] = child;
      } else if (child && typeof child === "object") {
        out[`${key}{}`] = Object.keys(child);
      }
    }
    return out;
  }
  return { size, type: typeof value };
}

const CALL_LOG = "/proxy/talk/api/call_log";
const probes = [
  ["users", "/proxy/talk/api/users"],
  ["call_log (no params)", CALL_LOG],
  ["call_log page=1 per_page=1", CALL_LOG, { page: 1, per_page: 1 }],
  ["call_log page=1 items_per_page=1", CALL_LOG, { page: 1, items_per_page: 1 }],
  ["call_log page=1 limit=1", CALL_LOG, { page: 1, limit: 1 }],
  ["call_log page=1 page_size=1", CALL_LOG, { page: 1, page_size: 1 }],
  ["call_log page=2 per_page=1", CALL_LOG, { page: 2, per_page: 1 }],
];

const client = new TalkClient(loadConfig());
try {
  for (const [label, path, query] of probes) {
    try {
      const value = await client.request("GET", path, { query });
      console.log(`\n## ${label}\n${JSON.stringify(describe(value), null, 2)}`);
    } catch (error) {
      console.log(`\n## ${label}\nERROR ${String(error.message ?? error).slice(0, 200)}`);
    }
  }
} finally {
  await client.close();
}
