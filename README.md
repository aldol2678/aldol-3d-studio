# ALDOL 3D Studio

Standalone extraction from `aldol2678/inhagame` branch `feat/aldol-3d-studio-motion-module-20261022` (source head `95722ba9949dc1e2fd2e49fb6270e8eca865137d`).

This distribution includes scene-editor source, local MCP stdio, static GLB renderer, in-memory motion clip tools and seven editor compatibility files. They are copied from the same source revision and were originally part of INHA WORLD. No production/game code was modified by this extraction. The old source and PRs remain preserved upstream.

## Start (Node >= 20)

```sh
npm install
npm run check
npm test
npm run test:real
npm run studio -- --allow-write
# Browser/WebGL CI, where Chromium/Playwright can run:
npx playwright install chromium
npm run test:browser
# Read-only MCP stdio (writes require --allow-write):
node bin/mcp-stdio.mjs
```

The web server listens **only** on 127.0.0.1. A browser on an Android phone cannot reach this loopback without a separate authenticated remote deployment; no mobile ChatGPT plugin is configured. In-memory scenes and motions are not a persistence service. Export a Studio ZIP explicitly if you need to retain a scene.

## Compatibility and limitations

- PlayCanvas 2.22.4 is installed from npm instead of a hardcoded INHA WORLD workspace.
- Compatibility editor files are vendored to `compat/inha-editor`, so the local Studio starts independently. The INHA WORLD adapter is still an upstream-derived compatibility layer, not a clean rewrite or independent schema.
- P2.1 GLB renderer supports a bounded static triangle/embedded-PNG profile. Animated skins/GLB are **not** rendered or imported; motion tools manage JSON keyframe data only.
- Full INHA WORLD campus runtime integration tests remain in the source repository; standalone Chromium Studio tests are retained.
- License remains **UNLICENSED**, and this extraction does not grant an open-source license or permission for third parties to reuse code.
- No public repository has been created by this extraction, and no branch has been merged or deployed.

Sources: [PR #440](https://github.com/aldol2678/inhagame/pull/440), [PR #441](https://github.com/aldol2678/inhagame/pull/441).
