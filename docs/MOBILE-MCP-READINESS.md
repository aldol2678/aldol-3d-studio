# Mobile-first MCP readiness, not yet mobile connectivity

**State as of 2026-10-22:** protocol preparation in a GitHub development branch. No remote deployment, OAuth issuer, connected ChatGPT custom plugin, persistent hosting or Android app MCP execution has been verified.

## Product-availability gate

OpenAI's current [custom MCP connection documentation](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) states that creating/connecting custom MCP servers is **web-only**. A working HTTP MCP endpoint is **not proof** of availability in the ChatGPT Android app. Check product availability again before claiming Android support.

This plan favors accessible **mobile-first** tooling and progressive rollout without pretending a missing host feature exists:

1. **Now:** retain local Studio and stdio MCP. Add an isolated, read-only **loopback** Streamable HTTP JSON response endpoint at `127.0.0.1:4174/mcp`. Use it only for compatibility tests, not as a reverse-proxy target. The local HTTP endpoint has no authentication; its strict local bind is deliberate.
2. **Next:** design a separately authenticated public HTTPS MCP endpoint with OAuth 2.1 discovery, PKCE, short-lived and audience-bound access tokens, refresh/rotation, per-user data isolation and explicit read/write scope separation. Do not convert this loopback endpoint into a public listener by changing the host flag.
3. **Connection gate:** register the HTTPS endpoint or a Secure MCP Tunnel through ChatGPT Plugins on a supported client. Confirm tool discovery and real authorized calls. ChatGPT currently documents this for web, not Android.
4. **Android gate:** only when custom MCP support is actually available on Android, confirm a real Android ChatGPT app can discover tools, authorize, issue calls, recover from expired OAuth and display responses. Record device/build/version evidence. Emulator-based browser QA is not this gate.

## Present HTTP contract (developer-only)

`node bin/mcp-http.mjs --port 4174` starts an **HTTP JSON-RPC MCP subset** using `2025-06-18` at `127.0.0.1`. The endpoint `POST /mcp` supports:
- `initialize`, `ping`, `tools/list`, `tools/call` (same shared core as stdio)
- Read-only `scene_read`, `scene_validate`, `scene_export_world`, `motion_library`, `motion_validate`, `motion_blend`, `motion_export`
- JSON response bodies; notifications return HTTP 202 without a JSON-RPC response
- `GET /health` on loopback reports `readOnly: true`, `remoteReady: false`

Deliberate limitations:
- No SSE streaming or standalone GET subscriptions, no remote sessions, no remote mutation tools, and no data sharing beyond one local process.
- No CORS grants; Origin-bearing browser requests and unexpected Host headers are rejected to reduce DNS-rebinding/CSRF exposure.
- No HTTP binding to `0.0.0.0`; `--allow-write` with the HTTP CLI is rejected. A reverse proxy of this unauthenticated service is **not authorized**.
- No OAuth provider: HTTP in this commit is **not an internet-capable production resource server**.
- No long-lived motion cache, shared persistence, asset upload, animated GLB import, IK or animated viewport.
- Remote MCP clients can have additional transport compatibility requirements. Protocol handshake + local integration tests cannot certify external clients.

### Sample local smoke check

```sh
npm ci
npm run mcp:http
# separately
curl -i -X POST http://127.0.0.1:4174/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}'
```

`npm run test:mcp:http` asserts handshake, tools, read-only gating, invalid methods, Origin/Host restrictions, body caps, JSON-RPC errors and local-only flags. It does not need cloud credentials.

## Minimum remote launch gates

| Gate | Acceptance evidence | Current |
| --- | --- | --- |
| Transport | Public TLS endpoint + tool discovery against selected ChatGPT client | **NOT RUN** |
| Authentication | Real OAuth 2.1 with authorization-server metadata, PKCE, token audience/resource verification, expiration/revocation, refresh tokens, user identity isolation | **NOT IMPLEMENTED** |
| Access | Anonymous / foreign-user / expired-token denial, no cross-account scene or clip data, least-privilege scopes | **NOT IMPLEMENTED** |
| Semantics | Exactly defined read-only vs write tools; scoped mutation confirmations; no accidental production game writes | **LOCAL READ-ONLY PASS** |
| Storage | Explicit per-user persistence & deletion/backup policy, encrypted secrets, bounded byte retention | **NOT IMPLEMENTED** |
| Operations | Health, redacted logs, rate/size limits, backpressure, cost cap, rollback, CI, alerting | **LOCAL SIZE LIMIT ONLY** |
| Browser QA | Chrome + mobile browser emulation regression | **CI PASS on migration; new branch pending** |
| Physical mobile | Native Android ChatGPT account/tool access plus real-device auth and calls | **UNAVAILABLE / NOT VERIFIED** |

### Sources

- [OpenAI: Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
- [OpenAI: Authentication for plugins](https://developers.openai.com/plugins/build/auth)
- [OpenAI: MCP remote server guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)

Ownership: ALDOL 3D Studio. Existing INHA WORLD applications continue using the current game-integrated adapters until separately approved and verified.
