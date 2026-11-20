# Third-party notices

Fishball is MIT-licensed ([LICENSE](LICENSE)).

It runs inside DeepSeek Harness and uses the host's installed packages as peer dependencies: `@deepseek-ai/*` (MIT, Copyright (c) 2026 DeepSeek) and `@deepseek-ai/cordis` (MIT, Copyright (c) 2021-present Shigma). No host source is copied or bundled into this repository.

## Runtime dependencies

The package manager installs these alongside the connector. None of their code is copied or bundled into this repository or its tarball:
- `@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/core` 2.4.0 and `@modelcontextprotocol/node` 2.1.2 (Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC). Their manifests declare Apache-2.0. As their LICENSE files explain, earlier MIT contributions whose authors have not consented to relicensing remain under MIT.
- `zod` (MIT, Copyright (c) 2025 Colin McDonnell), used by the MCP server and core.
- `@hono/node-server` (MIT, Copyright (c) 2022 - present, Yusuke Wada and Hono contributors) and `hono` (MIT, Copyright (c) 2021 - present, Yusuke Wada and Hono contributors), both dependencies of the MCP Node adapter.

## FishMark

The Fishball mark in `assets/connector-icon.svg` is FishMark from the owner's own fishball app (`app/src/main/java/org/areel/fishball/ui/Surfaces.kt` at `f4a887d`; MIT, same author), redrawn as SVG with the launcher icon's colours. The connector's icon adds a wrench badge, drawn for this repository; the approval page (`src/mcp/oauth-web/page-theme.js`) draws the same icon. The managed-session mark (`client.marks.js`) draws FishMark alone, as dsh-fishball v0.1.0 did.

Any third-party code added later must be listed here with its licence and notice.