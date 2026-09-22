/**
 * Compact view of a Talk device. The raw devices endpoint spends most of its bytes on
 * contact-sync ID lists and per-device voicemail config; this keeps what's needed to answer
 * "which phones are offline, who has them, and are they current".
 */
export interface DeviceSummary {
  name: string | null;
  kind: "hardware" | "softphone";
  model: string | null;
  user: string | null;
  ext: string | null;
  status: string | null;
  sip_registered: boolean | null;
  last_seen: string | null;
  ip: string | null;
  mac: string | null;
  serial: string | null;
  firmware: string | null;
  update_available: string | null;
  uptime_seconds: number | null;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
const number = (value: unknown) => (typeof value === "number" ? value : null);
const boolean = (value: unknown) => (typeof value === "boolean" ? value : null);

export function summarizeDevice(raw: Record<string, unknown>): DeviceSummary {
  // Softphones (the UniFi Endpoint App) report model "msp" and a synthetic "msp:..." MAC.
  const softphone = raw.model === "msp";
  return {
    name: text(raw.display_name),
    kind: softphone ? "softphone" : "hardware",
    model: softphone ? null : text(raw.model),
    user: text(raw.user),
    ext: text(raw.ext),
    status: text(raw.status),
    sip_registered: boolean(raw.sip_reg),
    last_seen: text(raw.last_seen),
    ip: text(raw.ip),
    mac: softphone ? null : text(raw.mac),
    serial: text(raw.serial_number),
    firmware: text(raw.version),
    // false when current, otherwise the available version string.
    update_available: text(raw.update_available),
    uptime_seconds: number(raw.uptime),
  };
}
