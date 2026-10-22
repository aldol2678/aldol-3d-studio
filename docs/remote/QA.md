# Verification matrix — 2026-10-22

| Check | Status | Evidence / boundary |
|---|---|---|
| Baseline main/deployment SHA | PASS | Both `59f64632cb12c9003bf760c69368c92c6fd25120` |
| Existing Node regression tests | PASS | 51 tests |
| New remote contract/security tests | PASS | 7 tests, SDK HTTP + signed JWT verification; injected auth/repository in transport test |
| Bundled WorldDocument/asset integration | PASS | 9 tests; 2 pre-existing separate browser/device placeholders skipped |
| Real Supabase user isolation | PASS | `db/verify-isolation.sql`, transactional two-user fixtures rolled back |
| Atomic save/history, conflict/idempotency | PASS | Real DB suite; no concurrent HTTP clients claimed |
| RLS/direct write/ownership/audience/scopes/revoked session | PASS | Real DB suite + JWT suite |
| Supabase schema readback | PASS | 4 tables RLS enabled; private bucket ≤3 MiB; public RPCs invoker |
| Missing credentials/public MCP | PASS locally | HTTP 401 + metadata challenge; no project response |
| Request size/input schema/unsafe ID | PASS locally | Test suite |
| GLB malformed/hash validation | PASS | Existing GLB suite + remote asset checks |
| Mobile 320/360/390/768, rotation, touch | PASS emulated | Chromium 153; no physical Android access |
| IndexedDB/offline reload/storage-failure rollback/ZIP | PASS emulated | `tests/browser-pwa.mjs` |
| PWA install event | NOT RUN | Manifest/icons verified; OS installation not performed |
| PWA login/cloud sync with live account | BLOCKED | No signed-in Studio user context supplied |
| PWA/MCP same live project | BLOCKED | OAuth activation and real user login pending |
| OAuth PKCE/token issuance/refresh/consent | BLOCKED | Existing Supabase OAuth server returns `feature_disabled`; scope/resource gap also unresolved |
| ChatGPT registration/discovery/live reads | BLOCKED | Auth prerequisites not met; no claimed successful call |
| ChatGPT Android | BLOCKED | Eligible mobile plugins documented; this account/plugin not tested |
| Authenticated remote write activation | BLOCKED | Explicit feature gate remains false |
| New production deployment | BLOCKED | Do not merge before required authenticated integration gates |

Preview URL, PR SHA and CI results are reported in the PR/hand-off after deployment. This matrix must not be read as a full release acceptance.
