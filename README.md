# DSH Fishball Instance

Bridge plugin (`dsh-instance`) that installs and runs a hosted Fishball child DSH inside your main DeepSeek Harness (DSH), connecting it to `dsh-agent-connector`.

Split from `dsh-fishball@84078e5f`.

## Package

| Folder | npm Package | Role |
| --- | --- | --- |
| `packages/dsh-instance` | `dsh-instance` | Launches Fishball in a private child DSH profile under `<DSH_HOME>/fishball/runtime`, places `fishball-ui` and `fishball-core`, provisions a hosted token from `dsh-agent-connector`, syncs model providers, and exposes its settings page & `uninstall.js` cleanup command. |

## Local development & packing

- In dev mode, `dsh-instance` resolves `fishball-ui` and `fishball-core` from `$FISHBALL_REPO/packages/{fishball-ui,core}` or a sibling `../dsh-fishball/packages/` checkout.
- When packing for offline installs, pass `--fishball-release <dir>` (or set `FISHBALL_RELEASE_DIR`, or pack `../dsh-fishball` first) to embed `fishball-ui` and `fishball-core` tarballs into `bundled/`.

## Related repositories

- `dsh-connector` — Generic DSH MCP connector (`dsh-agent-connector`, `dsh-connector-ui`, `dsh-connector-adapter`).
- `dsh-fishball` — Fishball agent plugins (`fishball-core`, `fishball-ui`, `fishball-shared`).

## Scripts

- `npm run test:v3` — Run all V3 suites for `dsh-instance`.
- `npm run pack` — Build release tarball into `.runtime/release/<version>/`.
- `npm run pack:check` — Verify an existing release offline.
