import assert from "node:assert/strict";
import { test } from "node:test";
import { REDACTED, containsRedacted, redact } from "./redact.js";

test("redacts secret fields at any depth", () => {
  const input = {
    users: [{ ext: "0002", sip_password: "hunter2", voicemail_pin: 1234, name: "Front Desk" }],
    gateways: [{ host: "sip.example.com", username: "trunk", password: "s3cret", credentials: { key: "x" } }],
  };
  assert.deepEqual(redact(input), {
    users: [{ ext: "0002", sip_password: REDACTED, voicemail_pin: REDACTED, name: "Front Desk" }],
    gateways: [{ host: "sip.example.com", username: "trunk", password: REDACTED, credentials: REDACTED }],
  });
});

test("redacts device key material", () => {
  const input = { model: "UVP-TOUCH-MAX-W", hashed_key: "d1dc5565", auth_key: "abc", auth_key_digest: "def", cfp: "6A:90" };
  assert.deepEqual(redact(input), {
    model: "UVP-TOUCH-MAX-W",
    hashed_key: REDACTED,
    auth_key: REDACTED,
    auth_key_digest: REDACTED,
    cfp: "6A:90",
  });
});

test("keeps booleans and nulls under secret-looking keys", () => {
  assert.deepEqual(redact({ has_password: true, pin: null }), { has_password: true, pin: null });
});

test("does not redact look-alike keys", () => {
  const input = { spinner: "a", pinned: true, compass: "n", ext: "100" };
  assert.deepEqual(redact(input), input);
});

test("does not mutate its input", () => {
  const input = { password: "x" };
  redact(input);
  assert.equal(input.password, "x");
});

test("containsRedacted finds the placeholder anywhere", () => {
  assert.equal(containsRedacted({ a: [{ b: REDACTED }] }), true);
  assert.equal(containsRedacted({ a: [{ b: "real" }] }), false);
  assert.equal(containsRedacted(undefined), false);
});
