# ALDOL 3D Studio remote integration — 0.6.0

## Release status

This release is **partial / OAuth activation blocked**, not an operational ChatGPT connection.
Remote code and PWA cloud synchronization share WorldDocument, the canonical serializer, and the same scene command core. Motion remains an internal Studio module; static GLB rendering is unchanged. No skeletal playback, IK, bone-length correction or GLB animation export is claimed.

Baseline: main `59f64632cb12c9003bf760c69368c92c6fd25120`; Vercel `dpl_HgJWFGheMH7yACbPVuTGANaHUE7k` was READY on that SHA.

## Architecture and contracts

- `/mcp` → official MCP SDK 1.32.1, stateless Streamable HTTP, per-request server/transport, JSON response mode. SDK negotiates supported protocol versions.
- `/api/cloud` → first-party Supabase sessions; browser sessions with OAuth `client_id` are rejected.
- `/api/asset` → hash checked, bounded binary uploads; private `studio-assets` bucket, no overwrite or public URL.
- `/.well-known/oauth-protected-resource` → resource/issuer discovery.
- Supabase ARAM is reused. Only new `studio_*` tables, `studio_private` functions, Studio-specific storage policies/bucket were added. GAMES/INHA WORLD unchanged.
- One canonical WorldDocument per project; scenes and motion clips are stored as JSON in `studio_projects`, avoiding divergent normalized scene formats. `studio_revisions` stores immutable snapshots and request receipts. `studio_assets` stores reservations/hashes. `studio_activity_logs` stores mutation types without tokens or document contents.
- Ownership comes from verified `sub` and `auth.uid()`, never a tool argument. RLS checks the live `auth.sessions` row. Public RPCs are invoker functions; private definer functions have explicit UID checks, empty search paths and revoked PUBLIC/anon privileges.
- Updates take an owner advisory lock and compare `expectedVersion`. Reusing the same request ID and hash returns its receipt; mismatches reject. Durable undo/redo stacks refer to immutable revision versions. No automatic deletion of history.
- 50 projects per user, 80 MiB total revision history per user, 2 MiB each for world/motion JSON. Cloud files ≤3 MiB due to serverless request limits; local files still allow the existing 20 MiB limit. Every asset reservation counts 3 MiB towards 80 MiB storage quota to prevent bypass using a smaller claimed length. Failed reservations can consume quota and require owner-reviewed cleanup; automatic deletion is intentionally absent.

## Local-first behavior

Existing `aldol-3d-studio-pwa-v1` IndexedDB is retained without a version bump or reset. Local commands await the IDB transaction commit. Failures restore the pre-edit scene. Writes are serialized. Local project copies and timestamped pre-load recovery snapshots are available without login.

Cloud upload is opt-in: login, then **현재 장면을 새 프로젝트로 저장**. Loading a cloud project saves the current scene as a recovery snapshot first. Downloaded assets are checked before replacing the current scene. Local/cloud binding is tied to the device project identity and user identity. Pending save requests keep their request ID and snapshot across reloads. A conflict never overwrites either side; use a new project copy or explicitly load the cloud version. Automatic synchronization must be enabled for the selected project and retries on the online event. JSON and ZIP backup remain available.

## Authentication blocker — do not bypass

The live ARAM discovery endpoint returned `404 feature_disabled: OAuth server is disabled` on 2026-10-22. Available Supabase connector tools do not include Auth server configuration or OAuth client management. No account credentials were requested or copied from other projects.

`STUDIO_MCP_ENABLED=false` and `STUDIO_MCP_WRITES=false` remain intentional fail-closed deployment settings. Missing credentials return 401 + protected-resource challenge; a supplied token while disabled returns 503. No fallback public MCP or API-key authentication was added.

Enabling Supabase OAuth alone is **not sufficient**: current official documentation supports standard identity scopes only, default audience `authenticated`, and says custom scopes are not supported. This server correctly requires the resource audience `https://aldol-3d-studio.vercel.app/mcp`, OAuth `client_id`, and `studio:read` (plus `studio:write` for mutations). Do not weaken those checks to get a green result.

To finish, an account owner must provide access to the Auth/OAuth configuration and approve a compatible token issuance integration. Reuse a verified OAuth authorization server with authorization code + S256 PKCE, exact redirect allowlist, RFC 8707 resource binding, separated scopes, refresh rotation, consent and revocation, and map identities to Supabase Auth safely. If using Supabase, validate how standard scopes, client grants and resource-specific custom claims are issued before activating a hook in this shared project. Existing hooks/configuration must be inspected first; no unreviewed global hook is shipped. This release does not implement a replacement authorization server or pretend token issuance is complete.

After configuration, verify actual code exchange, access token verification, expiry/refresh and revocation, then set MCP enabled. Keep write tools off until their client/permission flow passes. Registration must use the exact ChatGPT redirect URI shown for the connection. Never infer Android availability from web success.

## QA and CI

- `npm ci --ignore-scripts`
- `npm run check && npm test && npm run test:real`
- `npm run build:pwa && npm run test:pwa:browser`
- `db/verify-isolation.sql`: real PostgreSQL transactional security suite; synthetic users/sessions and all fixtures are rolled back. Run only on an authorized database.
- Browser evidence uses 320/360/390/768px, touch, rotation, IDB persistence, offline reload, storage-failure rollback, manifest/icons and ZIP download. Chromium emulation is not Android physical-device validation.
- Local SDK transport tests inject an in-memory repository/auth context. JWT signature tests use generated test keys. Neither is a live OAuth login or a ChatGPT tool call.

Deployment activation gate: CI passes; protected preview tested; cloud login + PWA/MCP data match verified; no unsigned/wrong-audience/cross-user accesses; production SHA read back. If any mandatory gate remains blocked, retain Draft PR and the previous production version.

## Costs and maintenance

No paid resource created. Existing Supabase database/storage and Vercel function/build allocations are used; actual charges depend on existing plans and usage. Monitor history quota, failed asset reservations, storage egress, request durations/errors, Auth rate limits and package security updates. An independent scheduled off-site backup/restore drill is not configured; in-database revision recovery and manual JSON/ZIP exports do not replace disaster recovery. Existing unrelated Supabase advisor findings were left unchanged; Studio introduced no advisor finding in the observed result.

## Sources checked

- https://developers.openai.com/plugins/build/auth
- https://learn.chatgpt.com/docs/plugins (mobile plugins are supported on eligible accounts; Desktop only plugins are excluded)
- https://ts.sdk.modelcontextprotocol.io/server
- https://supabase.com/docs/guides/auth/oauth-server
- https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- https://supabase.com/changelog?tags=auth
