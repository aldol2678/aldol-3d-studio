# ALDOL 3D Studio

**Live Vercel site:** https://aldol-3d-studio.vercel.app/  
**Deployment:** ALDOL Studio browser-local PWA (production, public HTTPS). [Vercel deployment](https://vercel.com/aldol/aldol-3d-studio)

## Mobile PWA

On Android, open the live site in Chrome and choose **⋮ → Add to Home screen / Install app** (label depends on your browser). When the install prompt appears in the Studio toolbar, the **＋ 설치** button provides the same action. The app includes a service worker, PWA manifest, install icons and touch-friendly editing UI; browser settings can still affect installation availability.

Scenes and verified imported GLB/PNG assets are stored **only in this device's IndexedDB**, not on Vercel. Use **World JSON** or **씬+에셋 ZIP** to retain a manual backup before clearing browser storage or changing phones. Reload and offline usage work after the initial online load and service worker installation. Incognito/private mode may erase data automatically.

Mobile Studio editing includes primitive scene objects, move/rotate/scale gestures, asset import via the **에셋** drawer, local undo/redo and backup exports. **No cross-device sync, cloud storage, account login, animated GLB support, deployed MCP API, or physical Android device certification.** The standalone Node stdio/HTTP MCP remains local-only; the Vercel PWA does not expose that server to the internet.


**Standalone, public-source 3D scene editor and MCP development workspace.**

[![CI](https://github.com/aldol2678/aldol-3d-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/aldol2678/aldol-3d-studio/actions/workflows/ci.yml)
[Source](https://github.com/aldol2678/aldol-3d-studio) · [CI history](https://github.com/aldol2678/aldol-3d-studio/actions) · [Mobile/MCP readiness](docs/MOBILE-MCP-READINESS.md)

> **Status: v0.5.0-dev.** Independent GitHub repository created on 2026-10-22. The initial Studio/GLB/Motion migration and standalone CI passed. The remote MCP work on this branch is a **localhost-only technical preflight**, not a deployed connector or mobile app integration. The code remains `UNLICENSED` (publicly visible source, not open-source licensed).

## Features and boundaries

| Area | Available now | Not available / not certified |
| --- | --- | --- |
| Scene editor | Nodes, hierarchy, transforms, gizmos, undo/redo, ZIP export | Hosted persistent projects |
| GLB | Static triangle meshes with bounded PBR/embedded PNG profile | Skins, morphs, animated GLB, FBX import |
| Motion MCP | JSON clip library, schema validation, joint-name mapping, sampled pose blending and JSON export | Skeletal playback, IK and retargeted bone lengths |
| Local stdio MCP | Scene and motion tools, read-only default; writes only with `--allow-write` | Shared persistence between stdio and browser sessions |
| HTTP MCP preflight | Read-only Streamable HTTP JSON-RPC at **127.0.0.1 only**, `POST /mcp` | Public HTTPS listener, OAuth 2.1, ChatGPT plugin installation |
| Mobile browser QA | Chromium touch emulation at common mobile viewports | Physical Android/iOS hardware certification |

The motion tool names are `motion_library`, `motion_validate`, `motion_import`, `motion_retarget`, `motion_blend`, and `motion_export`. Only `motion_import` and `motion_retarget` mutate the in-memory library, and they are available only through the write-enabled **local stdio** server.

## Get started (Node.js 20+)

```sh
git clone https://github.com/aldol2678/aldol-3d-studio.git
cd aldol-3d-studio
npm ci
npm run check
npm test
npm run test:real

# Local scene editor: http://127.0.0.1:4173/
npm run studio -- --allow-write

# Local stdio MCP: read-only by default
node bin/mcp-stdio.mjs
# Opt in to in-memory scene/motion edits for trusted local callers:
node bin/mcp-stdio.mjs --allow-write
```

For Chromium PlayCanvas and touch emulation tests, install a browser and run:

```sh
npx playwright install chromium
npm run test:browser
```

### Loopback HTTP MCP preflight

```sh
npm run mcp:http
# POST http://127.0.0.1:4174/mcp
```

With that local server running, in another terminal:

```sh
curl -sS -X POST http://127.0.0.1:4174/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

This is a **local developer transport only**. It binds to `127.0.0.1`, rejects cross-origin requests/host rebinding, does not expose mutation tools, does not persist a user session across restarts, and has **no OAuth credentials**. Never publish or reverse-proxy this listener to the internet. See [the readiness/gating plan](docs/MOBILE-MCP-READINESS.md) before implementing any authenticated remote transport.

### ChatGPT and Android

OpenAI's [custom MCP server connection guide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) currently states **custom MCP connections are web-only** (checked 2026-10-22). Running this local HTTP preflight therefore **does not** make the plugin available in ChatGPT for Android. It prepares protocol compatibility for an eventual authenticated hosted service; Android usage is a separate product-availability and real-device gate.

## Provenance, CI, license

- Extracted from [INHA WORLD](https://github.com/aldol2678/inhagame), via [Studio P2.1 PR #440](https://github.com/aldol2678/inhagame/pull/440), [Motion PR #441](https://github.com/aldol2678/inhagame/pull/441), and [standalone extraction PR #442](https://github.com/aldol2678/inhagame/pull/442). Original source and PRs are retained.
- `EXTRACTION-MANIFEST.json` records SHA-256 for the original 82-file extracted snapshot. The repository also has newer standalone-specific files such as CI and the mobile-readiness module. It is **not** a live file-count manifest.
- Bundled editor compatibility files under `compat/inha-editor/` preserve the existing world document implementation. They are not a separately redesigned schema.
- CI verifies Node syntax, unit tests, real adapter/Factory roundtrips, and Chromium PlayCanvas/mobile emulation. Real handheld device testing and deployed security testing remain open.
- **License: `UNLICENSED`.** The public repository does not grant third parties permission to use, redistribute, or modify the code. No MIT/Apache grant is implied by public visibility.

Development tasks belong in the standalone repository. INHA WORLD's production assets and consumer integration have **not** been migrated to this repository.

## Remote integration (v0.6.0, activation pending)

This branch adds a protected Streamable HTTP MCP endpoint and opt-in Supabase project sync.
OAuth activation and authenticated end-to-end QA remain blocked; the remote endpoint fails closed by default.
See [operations and activation requirements](docs/remote/OPERATIONS.md) and [verification matrix](docs/remote/QA.md).
Existing local PWA and stdio usage remain supported. License remains UNLICENSED.
