import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { Agent, fetch, type Response } from "undici";
import type { Config } from "./config.js";

export class TalkApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TalkApiError";
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

const TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** undici reports connection failures as a bare "fetch failed"; surface the underlying cause. */
const networkError =
  (target: URL) =>
  (error: unknown): never => {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TalkApiError(`Timed out waiting for ${target.origin}. Raise TALK_TIMEOUT_MS if the console is slow.`);
    }
    const cause = error instanceof Error ? (error.cause as (Error & { code?: string }) | undefined) : undefined;
    const code = cause?.code;
    if (code && TLS_CODES.has(code)) {
      throw new TalkApiError(
        `TLS verification failed for ${target.origin} (${code}). Set TALK_CA_CERT to the console's CA certificate ` +
          "(or TALK_INSECURE_TLS=true as a last resort).",
      );
    }
    const reason = code ?? cause?.message ?? (error instanceof Error ? error.message : String(error));
    throw new TalkApiError(`Cannot reach ${target.origin}: ${reason}`);
  };

/**
 * Talk has no API-key integration: it rides on the UniFi OS web session. We log in with a
 * local account, keep the TOKEN cookie and CSRF token in memory, and log in again once when
 * the console answers 401 (the session expires after roughly an hour of inactivity).
 */
export class TalkClient {
  readonly #config: Config;
  readonly #dispatcher: Agent;
  #token: string | undefined;
  #csrf: string | undefined;
  #loginInFlight: Promise<void> | undefined;

  constructor(config: Config) {
    this.#config = config;
    const pinned = new Set(config.pinnedFingerprints);
    this.#dispatcher = new Agent({
      connect: {
        ...(config.caCert ? { ca: config.caCert } : {}),
        rejectUnauthorized: !config.insecureTls,
        // UniFi's self-signed certificate names unifi.local, not the console's address. When the
        // console presents exactly a pinned certificate, that match stands in for the hostname check.
        checkServerIdentity: (host: string, cert: PeerCertificate) =>
          pinned.has(cert.fingerprint256) ? undefined : checkServerIdentity(host, cert),
      },
    });
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
    if (!this.#token) await this.#login();

    let response = await this.#send(method, path, options);
    if (response.status === 401) {
      await response.text().catch(() => undefined);
      this.#token = undefined;
      await this.#login();
      response = await this.#send(method, path, options);
    }
    return this.#parse(response, method, path);
  }

  async close(): Promise<void> {
    await this.#dispatcher.close();
  }

  // Concurrent tool calls share one login instead of each hitting the rate-limited endpoint.
  #login(): Promise<void> {
    this.#loginInFlight ??= this.#doLogin().finally(() => {
      this.#loginInFlight = undefined;
    });
    return this.#loginInFlight;
  }

  async #doLogin(): Promise<void> {
    const loginUrl = new URL("/api/auth/login", this.#config.baseUrl);
    const response = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        username: this.#config.username,
        password: this.#config.password,
        rememberMe: false,
      }),
      dispatcher: this.#dispatcher,
      signal: AbortSignal.timeout(this.#config.timeoutMs),
    }).catch(networkError(loginUrl));
    await response.text().catch(() => undefined);

    if (response.status === 429) {
      throw new TalkApiError("UniFi OS login is rate limited (HTTP 429). Wait a few minutes before retrying.", 429);
    }
    if (!response.ok) {
      throw new TalkApiError(
        `UniFi OS login failed (HTTP ${response.status}). Check TALK_USERNAME and TALK_PASSWORD; ` +
          "the account must be a local-access account without MFA.",
        response.status,
      );
    }

    const token = response.headers
      .getSetCookie()
      .map((cookie) => /^TOKEN=([^;]+)/.exec(cookie)?.[1])
      .find((value) => value !== undefined);
    if (!token) {
      throw new TalkApiError("UniFi OS login succeeded but returned no TOKEN cookie.");
    }

    this.#token = token;
    this.#csrf =
      response.headers.get("x-updated-csrf-token") ??
      response.headers.get("x-csrf-token") ??
      csrfFromJwt(token);
  }

  async #send(method: string, path: string, options: RequestOptions): Promise<Response> {
    const url = new URL(path, this.#config.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Cookie: `TOKEN=${this.#token}`,
    };
    if (this.#csrf) headers["X-CSRF-Token"] = this.#csrf;

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
      redirect: "manual",
      dispatcher: this.#dispatcher,
      signal: AbortSignal.timeout(this.#config.timeoutMs),
    }).catch(networkError(url));

    // UniFi OS rotates the CSRF token on some responses.
    const rotated = response.headers.get("x-updated-csrf-token");
    if (rotated) this.#csrf = rotated;

    return response;
  }

  async #parse(response: Response, method: string, path: string): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (!response.ok) {
      throw new TalkApiError(
        `${method} ${path} failed with HTTP ${response.status}: ${truncate(text, 500)}`,
        response.status,
      );
    }
    // The console serves its web UI as a fallback for unknown routes.
    if (contentType.includes("text/html")) {
      throw new TalkApiError(
        `${method} ${path} returned HTML instead of JSON — the endpoint doesn't exist on this Talk version, ` +
          "or Talk isn't installed on this console.",
      );
    }
    if (text.length === 0) return { ok: true, status: response.status };

    try {
      return JSON.parse(text);
    } catch {
      return { status: response.status, contentType, text: truncate(text, 20_000) };
    }
  }
}

/** UniFi OS embeds the CSRF token in the TOKEN JWT payload; used when no header is sent. */
function csrfFromJwt(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { csrfToken?: unknown };
    return typeof claims.csrfToken === "string" ? claims.csrfToken : undefined;
  } catch {
    return undefined;
  }
}
