export const REDACTED = "[redacted]";

// Talk returns SIP registration passwords on users, credentials on SIP trunks, PINs on
// voicemail boxes, and key hashes on devices. None of these should ever reach the model.
const SECRET_KEY =
  /password|passwd|passcode|(^|_)pass$|secret|token|api_?key|auth_?key|hashed_?key|private_?key|credential|(^|_)pin($|_)|(^|_)ha1b?($|_)/i;

/** Deep-copies a value, replacing anything stored under a secret-looking key. Booleans and nulls are kept. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SECRET_KEY.test(key) && child !== null && typeof child !== "boolean" ? REDACTED : redact(child),
      ]),
    );
  }
  return value;
}

/** True when a write body carries the redaction placeholder copied back from a read. */
export function containsRedacted(value: unknown): boolean {
  if (value === REDACTED) return true;
  if (Array.isArray(value)) return value.some(containsRedacted);
  if (value !== null && typeof value === "object") return Object.values(value).some(containsRedacted);
  return false;
}
