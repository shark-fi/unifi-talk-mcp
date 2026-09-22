import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeDevice } from "./devices.js";

test("summarizes a hardware phone", () => {
  const raw = {
    mac: "aabbccddeeff",
    ip: "192.0.2.10",
    model: "UTP-G3-TOUCH-PRO",
    version: "3.27.1",
    last_seen: "2026-09-15T19:31:19.876Z",
    uptime: 343293,
    status: "online",
    serial_number: "12345678",
    display_name: "Front Desk",
    user: "Alex Example ",
    ext: "0001",
    sip_reg: true,
    update_available: false,
    hashed_key: "deadbeef",
    last_synced_contact_ids: ["contact_1", "contact_2"],
    additional_config: { sip_password: "secret" },
  };
  assert.deepEqual(summarizeDevice(raw), {
    name: "Front Desk",
    kind: "hardware",
    model: "UTP-G3-TOUCH-PRO",
    user: "Alex Example",
    ext: "0001",
    status: "online",
    sip_registered: true,
    last_seen: "2026-09-15T19:31:19.876Z",
    ip: "192.0.2.10",
    mac: "aabbccddeeff",
    serial: "12345678",
    firmware: "3.27.1",
    update_available: null,
    uptime_seconds: 343293,
  });
});

test("summarizes a softphone and reports a pending update", () => {
  const summary = summarizeDevice({
    mac: "msp:abc:def",
    model: "msp",
    ip: null,
    status: "offline",
    display_name: "UniFi Endpoint App",
    user: "Sam Example",
    ext: "0006",
    sip_reg: false,
    last_seen: null,
    update_available: "v2.26.3+697",
  });
  assert.equal(summary.kind, "softphone");
  assert.equal(summary.model, null);
  assert.equal(summary.mac, null);
  assert.equal(summary.last_seen, null);
  assert.equal(summary.sip_registered, false);
  assert.equal(summary.update_available, "v2.26.3+697");
});

test("never includes fields outside the summary", () => {
  const summary = summarizeDevice({ model: "UTP-G3-TOUCH-PRO", hashed_key: "x", additional_config: { sip_password: "y" } });
  assert.ok(!("hashed_key" in summary));
  assert.ok(!("additional_config" in summary));
});
