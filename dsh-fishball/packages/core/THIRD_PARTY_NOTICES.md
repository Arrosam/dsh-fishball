# Third-party notices

fishball-core is MIT-licensed ([LICENSE](LICENSE)).

It runs inside DeepSeek Harness and uses the host's installed packages as peer dependencies: `@deepseek-ai/*` (MIT, Copyright (c) 2026 DeepSeek) and `@deepseek-ai/cordis` (MIT, Copyright (c) 2021-present Shigma).

## Bundled runtime dependencies

The fishball-core tarball includes `@modelcontextprotocol/client` 2.4.0 and its runtime dependencies so it can be installed offline. Each package carries its own license.

- `@modelcontextprotocol/client` and `@modelcontextprotocol/core` 2.4.0 (Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC). Their manifests declare Apache-2.0. As their LICENSE files explain, earlier MIT contributions whose authors have not consented to relicensing remain under MIT.
- `zod` (MIT, Copyright (c) 2025 Colin McDonnell); `jose` (MIT, Copyright (c) 2018 Filip Skokan); `pkce-challenge` (MIT, Copyright (c) 2019).
- `eventsource` (MIT, Copyright (c) EventSource GitHub organisation); `eventsource-parser` (MIT, Copyright (c) 2026 Espen Hovlandsdal).
- `cross-spawn` (MIT, Copyright (c) 2018 Made With MOXY Lda); `path-key` and `shebang-regex` (MIT, Copyright (c) Sindre Sorhus); `shebang-command` (MIT, Copyright (c) Kevin Mårtensson).
- `which` and `isexe` (ISC, Copyright (c) Isaac Z. Schlueter and Contributors).

Any third-party code added later must be listed here with its licence and notice.
