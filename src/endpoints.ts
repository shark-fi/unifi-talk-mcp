/**
 * Catalog of UniFi Talk endpoints. Talk has no official API; these come from the
 * reverse-engineered reference at https://github.com/millsbrandon/UniFi-Talk-API (Talk 5.1.2,
 * UDM-Pro). Binary downloads (recordings, greetings, PCAPs, CSV) and multipart uploads are
 * deliberately left out, as are writes that would require typing credentials into chat
 * (SIP trunks, third-party devices).
 */

export const API_PREFIX = "/proxy/talk/api";

export const AREAS = [
  "system",
  "calls",
  "recordings",
  "voicemail",
  "users",
  "numbers",
  "contacts",
  "routing",
  "devices",
  "sip",
  "settings",
  "sms",
  "billing",
] as const;

export type Area = (typeof AREAS)[number];

export interface Endpoint {
  id: string;
  area: Area;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Relative to API_PREFIX; may contain {placeholders}. */
  path: string;
  description: string;
  query?: string[];
  /** Shape hint for write bodies. */
  body?: string;
  /** Seen in the web UI bundle but not confirmed against a live console. */
  candidate?: boolean;
}

export const ENDPOINTS: readonly Endpoint[] = [
  // system
  { id: "talk_info", area: "system", method: "GET", path: "/info", description: "Talk version, region, feature flags, system identity" },
  { id: "user_info", area: "system", method: "GET", path: "/user/info", description: "The logged-in account's Talk role and permissions" },
  { id: "install_status", area: "system", method: "GET", path: "/install", description: "Installation and onboarding status" },
  { id: "system_info", area: "system", method: "GET", path: "/ucore/system_info", description: "UniFi OS core system info (OS version, uptime)" },
  { id: "dashboard", area: "system", method: "GET", path: "/dashboard/consolidated_info", description: "Dashboard summary: console name, gateway IP, startup time" },
  { id: "service_health", area: "system", method: "GET", path: "/dashboard/service_health", description: "Time-series Talk service health and monitoring events" },
  { id: "peer_consoles", area: "system", method: "GET", path: "/peer_consoles", description: "Peer UniFi consoles on the network" },
  { id: "applications", area: "system", method: "GET", path: "/applications", description: "Installed application configurations" },
  { id: "pcap_status", area: "system", method: "GET", path: "/debug/pcap/status", description: "SIP packet capture status" },

  // calls
  { id: "call_log", area: "calls", method: "GET", path: "/call_log", query: ["page", "items_per_page"], description: "Paginated call history with caller ID, direction, status, and voicemail data. page is required; items_per_page defaults to 50" },
  { id: "call_log_countries", area: "calls", method: "GET", path: "/call_log/countries", description: "Countries present in the call log" },
  { id: "call_flow", area: "calls", method: "GET", path: "/call_log/flow/{uuid}", description: "Full event timeline for one call" },
  { id: "call_transcription", area: "calls", method: "GET", path: "/call_log/transcription/{uuid}", description: "AI transcription for one call (null unless transcription is enabled)" },
  { id: "call_center_queue", area: "calls", method: "GET", path: "/call_center/queue", description: "Live call center queue and member states" },
  { id: "call_stats", area: "calls", method: "GET", path: "/stats/calls/series", description: "Time-series inbound/outbound and answered call counts" },
  { id: "recording_rules", area: "calls", method: "GET", path: "/call_recording_rule", description: "Call recording rules" },
  { id: "delete_call_log", area: "calls", method: "DELETE", path: "/call_log/{uuid}", description: "Delete one call log record" },
  { id: "delete_call_logs", area: "calls", method: "POST", path: "/delete_call_logs", body: '{"uuids": ["..."]}', description: "Bulk delete call log records" },
  { id: "update_recording_rule", area: "calls", method: "PUT", path: "/call_recording_rule/{id}", body: "Recording rule object", description: "Update a call recording rule" },

  // recordings
  { id: "delete_recording", area: "recordings", method: "DELETE", path: "/call_log/recording/{uuid}", description: "Delete the recording for one call" },
  { id: "delete_recordings", area: "recordings", method: "POST", path: "/call_log/recording/delete", body: '{"uuids": ["..."]}', description: "Bulk delete call recordings" },

  // voicemail
  { id: "voicemail_data", area: "voicemail", method: "GET", path: "/voicemail/data/{uuid}", description: "Voicemail metadata: file path, duration, read_at" },
  { id: "delete_voicemail", area: "voicemail", method: "POST", path: "/call_log/{uuid}/delete", body: '{"ext": "0002"}', description: "Delete a voicemail for an extension" },
  { id: "delete_voicemails", area: "voicemail", method: "POST", path: "/voicemail/delete", body: '{"uuids": ["..."]}', description: "Bulk delete voicemails" },

  // users
  { id: "users", area: "users", method: "GET", path: "/users", description: "All Talk users with extensions and permissions (SIP passwords redacted)" },
  {
    id: "update_user",
    area: "users",
    method: "PUT",
    path: "/user/{uuid}",
    body: "Full user object",
    description:
      "Full-object user update (device and number reassignment). Reads redact sip_password, so a read-modify-write can drop it — use with care",
  },

  // numbers
  { id: "numbers", area: "numbers", method: "GET", path: "/number/list", description: "All phone numbers (DIDs) with user, device, and extension assignments" },
  { id: "blocked_numbers", area: "numbers", method: "GET", path: "/number/blocked", description: "Blocked caller ID rules (full number, prefix, area code)" },
  { id: "emergency_status", area: "numbers", method: "GET", path: "/setting/emergency_status", description: "E911 address registration status per number" },
  { id: "porting_requests", area: "numbers", method: "GET", path: "/number/porting/list", description: "Number porting requests and status" },
  { id: "porting_request_count", area: "numbers", method: "GET", path: "/number/porting/request_count", description: "Porting request counts and limits" },
  { id: "block_number", area: "numbers", method: "PUT", path: "/number/blocked", body: "Rule object: number, prefix, or area code, with per-user/group/global scope", description: "Add a blocked caller ID rule" },
  { id: "unblock_numbers", area: "numbers", method: "POST", path: "/number/delete_blocked", body: '{"ids": [...]}', description: "Remove blocked caller ID rules by id" },
  { id: "set_default_area_code", area: "numbers", method: "PUT", path: "/setting/default_area_code", body: '{"area_code": "415"}', description: "Set the default area code for 7-digit dialing" },

  // contacts
  { id: "contacts", area: "contacts", method: "GET", path: "/contacts", description: "Contacts used by the Talk UI" },
  { id: "contact_lists", area: "contacts", method: "GET", path: "/contact_list", description: "Shared contact directories" },
  { id: "upsert_contacts", area: "contacts", method: "POST", path: "/contacts", body: "Array of contact objects", description: "Create or update contacts" },
  { id: "create_contact_list", area: "contacts", method: "POST", path: "/contact_list", body: '{"name": "...", "contacts": [...]}', description: "Create a named contact list" },

  // routing
  { id: "ring_flow", area: "routing", method: "GET", path: "/ring_flow", description: "Call routing schedules" },
  { id: "ring_groups", area: "routing", method: "GET", path: "/ring_groups", description: "Ring groups and members" },
  { id: "group_list", area: "routing", method: "GET", path: "/group_list", description: "Group definitions used by the routing UI" },
  { id: "queues", area: "routing", method: "GET", path: "/queues", description: "Call queue configurations" },
  { id: "parking_lots", area: "routing", method: "GET", path: "/parking_lots", description: "Call parking lots" },
  { id: "switchboard", area: "routing", method: "GET", path: "/switchboard", description: "Switchboard (IVR / auto attendant) configuration" },
  { id: "create_ring_group", area: "routing", method: "PUT", path: "/group", body: "Group object (name, members)", description: "Create a ring group" },
  { id: "update_ring_group", area: "routing", method: "PUT", path: "/group/{id}", body: "Group object", description: "Update a ring group" },
  { id: "upsert_parking_lot", area: "routing", method: "PUT", path: "/parking_lot", body: "Parking lot object", description: "Create or update a parking lot" },
  { id: "delete_parking_lots", area: "routing", method: "POST", path: "/parking_lots/delete", body: '{"uuids": ["..."]}', description: "Delete parking lots" },
  { id: "upsert_switchboard_item", area: "routing", method: "PUT", path: "/switchboard/item", body: "Switchboard item object (prompt, routing)", description: "Create or update a switchboard (IVR) node" },
  { id: "delete_switchboard_item", area: "routing", method: "DELETE", path: "/switchboard/item/{id}", description: "Delete a switchboard (IVR) node" },

  // devices
  { id: "devices", area: "devices", method: "GET", path: "/devices", description: "Adopted Talk phones and ATAs with model, MAC, and assignment" },
  { id: "softphone_uids", area: "devices", method: "GET", path: "/uids/softphone", description: "Softphone UID availability and assignments" },
  { id: "phone_designer", area: "devices", method: "GET", path: "/phone_designer", description: "Phone screen layout configurations" },
  { id: "protect_cameras", area: "devices", method: "GET", path: "/protect/cameras", description: "UniFi Protect cameras available for video/intercom calling" },

  // sip
  { id: "sip_gateways", area: "sip", method: "GET", path: "/third_party_sip/gateway_list", description: "Third-party SIP trunks (credentials redacted)" },

  // settings
  { id: "config", area: "settings", method: "GET", path: "/setting/config", description: "Full Talk config: recording, voicemail, NAT, codecs, E911, owner" },
  { id: "hold_music", area: "settings", method: "GET", path: "/setting/hold_music", description: "Hold music tracks" },
  { id: "ringtones", area: "settings", method: "GET", path: "/setting/ringtones", description: "Available ringtones" },
  { id: "ai_call_transcription_settings", area: "settings", method: "GET", path: "/ai_call_transcriptions", description: "AI call transcription settings", candidate: true },
  { id: "ai_voicemail_transcription_settings", area: "settings", method: "GET", path: "/ai_vm_transcriptions", description: "AI voicemail transcription settings", candidate: true },
  { id: "set_hold_music", area: "settings", method: "PUT", path: "/setting/hold_music", body: '{"title": "Piano.wav", "type": "standard"}', description: "Set the active hold music track" },
  { id: "set_ringback", area: "settings", method: "PUT", path: "/setting/ringback", body: '{"title": "Serene.wav", "type": "standard"}', description: "Set the ringback tone" },

  // sms
  { id: "sms_conversations", area: "sms", method: "GET", path: "/sms/conversations", query: ["page"], description: "SMS conversations with message previews" },

  // billing
  { id: "billing_usage", area: "billing", method: "GET", path: "/billing/usage", description: "Usage counters: minutes, SMS, CNAM, transcription, softphone" },
  { id: "coupon_balance", area: "billing", method: "GET", path: "/billing/coupons/balance", description: "Coupon balance" },
  { id: "seat_usage", area: "billing", method: "GET", path: "/lock/usage", description: "Seat and license usage" },
  { id: "identity_status", area: "billing", method: "GET", path: "/identity/status", description: "KYC / business profile status" },
  { id: "regulatory_bundle", area: "billing", method: "GET", path: "/regulatory_bundle", description: "A2P / STIR-SHAKEN bundle status" },
  { id: "payment_terms", area: "billing", method: "GET", path: "/acceptance/payments", description: "Payment terms acceptance state" },
  { id: "owner_transfer_state", area: "billing", method: "GET", path: "/owner_transfer/transfer_state", description: "Owner transfer state" },
];

export const isWrite = (endpoint: Endpoint) => endpoint.method !== "GET";
export const READ_ENDPOINTS = ENDPOINTS.filter((e) => !isWrite(e));
export const WRITE_ENDPOINTS = ENDPOINTS.filter(isWrite);

export function findEndpoint(id: string): Endpoint {
  const endpoint = ENDPOINTS.find((e) => e.id === id);
  if (!endpoint) throw new Error(`Unknown endpoint '${id}'. Call talk_list_endpoints to see what's available.`);
  return endpoint;
}

export const pathParamsOf = (endpoint: Endpoint) =>
  [...endpoint.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);

// IDs and UUIDs only. Rejecting '/' and dot-only segments keeps callers inside /proxy/talk/api.
const SAFE_SEGMENT = /^[A-Za-z0-9_.:-]+$/;

export function resolvePath(endpoint: Endpoint, params: Record<string, string> = {}): string {
  const path = endpoint.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Endpoint '${endpoint.id}' requires path parameter '${name}'.`);
    }
    if (!SAFE_SEGMENT.test(value) || /^\.+$/.test(value)) {
      throw new Error(`Invalid value for path parameter '${name}': ${JSON.stringify(value)}`);
    }
    return encodeURIComponent(value);
  });
  return `${API_PREFIX}${path}`;
}
