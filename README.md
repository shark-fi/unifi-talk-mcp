# unifi-talk-mcp

A Model Context Protocol server for **UniFi Talk**, Ubiquiti's phone system: call history,
call timelines and transcriptions, users and extensions, phone numbers, devices, ring groups,
queues, IVR, service health, and usage.

> **Unofficial.** Ubiquiti publishes no Talk API. This server uses the private API behind the
> Talk web UI, as documented by the reverse-engineering project
> [millsbrandon/UniFi-Talk-API](https://github.com/millsbrandon/UniFi-Talk-API) against Talk 5.1.2.
> Any Talk update can rename or remove endpoints.

## How it works

Talk does not accept UniFi integration API keys. It sits behind the UniFi OS web session, so the
server logs in to `/api/auth/login` with a local account, holds the session cookie and CSRF token in
memory, and logs in again when the session expires. Login happens on the first tool call, not at
startup.

### Tools

| Tool                  | Purpose                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `talk_status`         | Talk version and region, console summary, service health                    |
| `talk_list_calls`     | Paginated call history (`page`, `per_page`)                                 |
| `talk_get_call`       | Event timeline and transcription for one call                               |
| `talk_list_devices`   | Phones and softphones: user, ext, status, SIP registration, last seen, firmware |
| `talk_list_endpoints` | Catalog of known endpoints with parameters, filterable by area              |
| `talk_get`            | Call any read endpoint by id (users, numbers, devices, ring groups, config…) |
| `talk_invoke`         | Call a write endpoint by id. **Disabled unless `TALK_ALLOW_WRITES=true`**   |

### Safety

- **Read-only by default.** `talk_invoke` refuses every call unless `TALK_ALLOW_WRITES=true`.
- **Secrets are always redacted.** SIP registration passwords, SIP trunk credentials, PINs, device
  key hashes, and tokens are replaced with `[redacted]` before results reach the model.
- **Redacted values can't be written back.** `talk_invoke` rejects any body containing `[redacted]`,
  so a read-modify-write can't overwrite a real SIP password with the placeholder.
- **Path parameters are validated.** IDs can't contain `/` or dot segments, so calls can't escape
  `/proxy/talk/api`.
- **Left out on purpose:** binary downloads (recordings, greetings, PCAPs), file uploads, and writes
  that would need credentials typed into chat (SIP trunks, third-party SIP devices).

## Setup

### 1. Create a dedicated local account

In UniFi OS on the console that runs Talk, open **Admins & Users** and create an admin:

- Choose **Restrict to local access only**. Cloud (UI.com) accounts and accounts with MFA can't
  sign in through `/api/auth/login`.
- Give it the least-privileged Talk role that covers what you need, and no access to other apps.

### 2. Build

Requires Node.js 22 or later.

```sh
npm install
npm run build
npm test
```

### 3. Configure your MCP client

| Variable            | Required | Default | Description                                              |
| ------------------- | -------- | ------- | -------------------------------------------------------- |
| `TALK_BASE_URL`     | yes      | —       | Console address, e.g. `https://192.168.1.1`              |
| `TALK_USERNAME`     | yes      | —       | Local UniFi OS account                                   |
| `TALK_PASSWORD`     | yes      | —       | Its password                                             |
| `TALK_ALLOW_WRITES` | no       | `false` | Enable `talk_invoke`                                     |
| `TALK_CA_CERT`      | no       | —       | Path to the console's CA certificate (PEM)               |
| `TALK_INSECURE_TLS` | no       | `false` | Skip TLS verification. Last resort                       |
| `TALK_TIMEOUT_MS`   | no       | `30000` | Per-request timeout                                      |

**Claude Desktop:** merge this into `mcpServers` in
`~/Library/Application Support/Claude/claude_desktop_config.json`, then restart the app. Use absolute
paths; GUI apps don't inherit your shell's `PATH` (`command -v node` gives yours).

```json
"Unifi-talk": {
  "command": "/usr/local/bin/node",
  "args": ["/absolute/path/to/unifi-talk-mcp/dist/index.js"],
  "env": {
    "TALK_BASE_URL": "https://192.168.1.1",
    "TALK_USERNAME": "talk-mcp",
    "TALK_PASSWORD": "…",
    "TALK_CA_CERT": "/absolute/path/to/console-ca.pem"
  }
}
```

**Claude Code:**

```sh
claude mcp add unifi-talk -s user \
  -e TALK_BASE_URL=https://192.168.1.1 \
  -e TALK_USERNAME=talk-mcp \
  -e TALK_PASSWORD=… \
  -- node /absolute/path/to/unifi-talk-mcp/dist/index.js
```

### TLS

UniFi consoles use self-signed certificates issued to `unifi.local`, which never match the address
you connect to. Save the console's certificate as a PEM file and point `TALK_CA_CERT` at it. The
server trusts that certificate, and it accepts the hostname mismatch only when the console presents
that exact certificate (matched by SHA-256 fingerprint). Any other certificate is rejected.

Before trusting the saved file, compare its fingerprint with the one your browser shows for the
console. If UniFi OS regenerates its certificate (after a reset, for example), connections fail
until you save the new one.

`TALK_INSECURE_TLS=true` turns verification off entirely and prints a warning at startup. Use it
only as a last resort.

## Smoke test

```sh
npm run smoke
```

With no `TALK_*` variables set, the test runs **offline**: it starts the server against a closed
local port and checks tool registration, input validation, the write gate, and error reporting.

With `TALK_BASE_URL`, `TALK_USERNAME`, and `TALK_PASSWORD` exported, it runs **live**, read-only
calls (`talk_status`, one call-log record, users, devices) and prints only success and field names,
never data.

## Troubleshooting

| Symptom                                   | Cause                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `fatal: Missing required environment...`  | The client config doesn't pass `TALK_*` variables                                        |
| `UniFi OS login failed (HTTP 401/403)`    | Wrong credentials, a cloud account, or MFA enabled                                       |
| `rate limited (HTTP 429)`                 | Too many logins; wait a few minutes                                                      |
| `TLS verification failed`                 | Self-signed certificate; set `TALK_CA_CERT`                                              |
| `returned HTML instead of JSON`           | Talk isn't installed on this console, or the endpoint changed in your Talk version       |
| `Cannot reach …: ECONNREFUSED`            | Wrong address, or HTTPS isn't reachable from this machine                                |

## Known gaps

- No real-time events (Talk's WebSocket at `/proxy/talk/ws`).
- No recording or voicemail audio downloads; voicemail audio has no HTTP endpoint at all.
- Sending SMS: the endpoint is unknown.
- Endpoints marked `candidate` in `talk_list_endpoints` haven't been confirmed on a live console.
