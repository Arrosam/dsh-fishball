# Third-party notices

dsh-connector-adapter is MIT-licensed ([LICENSE](LICENSE)).

It runs inside DeepSeek Harness and uses the host's installed packages as peer dependencies: `@deepseek-ai/*` (MIT, Copyright (c) 2026 DeepSeek). No host source is copied or bundled into this package.

## Runtime dependencies

The package manager installs these alongside the adapter. None of their code is copied or bundled into this repository or its tarball:
- `@modelcontextprotocol/client` and `@modelcontextprotocol/core` 2.4.0 (Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC). Their manifests declare Apache-2.0. As their LICENSE files explain, earlier MIT contributions whose authors have not consented to relicensing remain under MIT.
- `zod` (MIT, Copyright (c) 2025 Colin McDonnell); `jose` (MIT, Copyright (c) 2018 Filip Skokan); `pkce-challenge` (MIT, Copyright (c) 2019).
- `eventsource` (MIT, Copyright (c) EventSource GitHub organisation); `eventsource-parser` (MIT, Copyright (c) 2026 Espen Hovlandsdal).
- `cross-spawn` (MIT, Copyright (c) 2018 Made With MOXY Lda); `path-key` and `shebang-regex` (MIT, Copyright (c) Sindre Sorhus); `shebang-command` (MIT, Copyright (c) Kevin Mårtensson).
- `which` and `isexe` (ISC, Copyright (c) Isaac Z. Schlueter and Contributors).

## FishMark

The Fishball mark in `assets/adapter-icon.svg` is FishMark from the owner's own fishball app (`app/src/main/java/org/areel/fishball/ui/Surfaces.kt` at `f4a887d`; MIT, same author), redrawn as SVG with the launcher icon's colours. Its plug badge is drawn for this repository.

Any third-party code added later must be listed here with its licence and notice.
