import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

export interface Config {
  baseUrl: URL;
  username: string;
  password: string;
  allowWrites: boolean;
  timeoutMs: number;
  caCert?: string;
  /** SHA-256 fingerprints of the certificates in TALK_CA_CERT. */
  pinnedFingerprints: string[];
  insecureTls: boolean;
}

function fingerprintsOf(pem: string, source: string): string[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) throw new Error(`TALK_CA_CERT at '${source}' contains no PEM certificates`);
  try {
    return blocks.map((block) => new X509Certificate(block).fingerprint256);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`TALK_CA_CERT at '${source}' contains an invalid certificate: ${reason}`);
  }
}

const REQUIRED = ["TALK_BASE_URL", "TALK_USERNAME", "TALK_PASSWORD"] as const;

const isTrue = (value: string | undefined) => value?.toLowerCase() === "true";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(env.TALK_BASE_URL!);
  } catch {
    throw new Error(`TALK_BASE_URL is not a valid URL: ${env.TALK_BASE_URL}`);
  }
  if (baseUrl.protocol !== "https:") {
    throw new Error("TALK_BASE_URL must use https:// — UniFi OS only serves the API over TLS");
  }

  const timeoutMs = env.TALK_TIMEOUT_MS ? Number.parseInt(env.TALK_TIMEOUT_MS, 10) : 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("TALK_TIMEOUT_MS must be a positive integer");
  }

  let caCert: string | undefined;
  let pinnedFingerprints: string[] = [];
  if (env.TALK_CA_CERT) {
    try {
      caCert = readFileSync(env.TALK_CA_CERT, "utf8");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot read TALK_CA_CERT at '${env.TALK_CA_CERT}': ${reason}`);
    }
    pinnedFingerprints = fingerprintsOf(caCert, env.TALK_CA_CERT);
  }

  return {
    baseUrl,
    username: env.TALK_USERNAME!,
    password: env.TALK_PASSWORD!,
    allowWrites: isTrue(env.TALK_ALLOW_WRITES),
    timeoutMs,
    caCert,
    pinnedFingerprints,
    insecureTls: isTrue(env.TALK_INSECURE_TLS),
  };
}
