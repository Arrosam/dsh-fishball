# DSH Fishball Instance

> **Looking to install Fishball or connect an agent via MCP?**
> This repository holds the underlying `dsh-instance` package for **advanced users and developers**. For the one-click embedded bundle (`dsh-fishball-bundle`), standalone setup, and MCP integration guide, see **[`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle)**.

Bridge plugin (`dsh-instance`) that installs and runs a hosted Fishball child DSH inside your main DeepSeek Harness (DSH), connecting it to `dsh-agent-connector`.

Split from `dsh-fishball@84078e5f`.

## Package

| Folder | npm Package | Role |
| --- | --- | --- |
| `packages/dsh-instance` | `dsh-instance` | Launches Fishball in a private child DSH profile under `<DSH_HOME>/fishball/runtime`, places `fishball-amenities` (`fishball-board`, `fishball-heartbeat`, `fishball-taskboard`) and `fishball-core` (which includes `fishball-ui`), provisions a hosted token from `dsh-agent-connector`, syncs model providers, and exposes its settings page & `uninstall.js` cleanup command. |

## Supported DSH versions

- DSH **0.2.1-rc.5** and **0.2.2-rc.1**, either the DSH Web build or the one bundled with DSH-X.
- Node **22.14+** for packing; DSH itself needs Node **24.9+** (the child launches with the main DSH's executable and arguments).
- `$DSH_HOME` (default `~/.dsh`) must be a canonical real path without symbolic links on the path (otherwise startup fails with `INVALID_MAIN_HOME`).

## Install

For a single-command install including the connector, amenities, and instance, install [`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle) instead (do not install `dsh-instance` alongside `dsh-fishball-bundle`).

When installing components manually, `dsh-instance` runs alongside `dsh-agent-connector` in the same DSH profile (`web` below; replace with your profile name). **Quit DSH before installing.** If upgrading from an earlier pre-V3 preview (`dsh-fishball`, `fishball-connector`, `fishball-instance`, `fishball-embed-ui`, `dsh-fishball-*`), remove those packages and delete `<DSH_HOME>/fishball/` first.

`dsh-agent-connector` includes `dsh-connector` and `dsh-connector-ui` (you may optionally add `dsh-connector-amenities` for `dsh-connector-adapter` and `dsh-connector-watchdog`); `dsh-instance` automatically installs both `fishball-core` (with `fishball-ui`) and `fishball-amenities` (`fishball-board`, `fishball-heartbeat`, `fishball-taskboard`) into its child DSH.

### Option A — Standard DSH install (from npm under `alpha`, via DSH Plugins page or CLI)

In DSH's Plugins page (**Plugins → Add plugin**), install `dsh-agent-connector@1.0.0-alpha.2` and `dsh-instance@1.0.0-alpha.1` (plus optionally `dsh-connector-amenities@1.0.0-alpha.1`), or run:

```bash
dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.2 dsh-instance@1.0.0-alpha.1
# Optional: adapter + watchdog amenities
dsh plugin --profile web add dsh-connector-amenities@1.0.0-alpha.1
```

pnpm may print missing-peer warnings for DSH's own `@deepseek-ai/*` packages; DSH provides them at runtime, so that warning is expected.

### Option B — From GitHub source (pack & install offline when needed)

1. Clone all three repositories side by side and pack in order (`dsh-fishball` first so `dsh-instance` automatically embeds `fishball-amenities-1.0.0-alpha.1.tgz` and `fishball-core-1.0.0-alpha.1.tgz` into `bundled/`):

   ```bash
   git clone https://github.com/Arrosam/dsh-fishball.git
   git clone https://github.com/Arrosam/dsh-connector.git
   git clone https://github.com/Arrosam/dsh-fishball-instance.git

   (cd dsh-fishball && npm run pack:v3)
   (cd dsh-connector && npm run pack)
   (cd dsh-fishball-instance && npm run pack)
   ```

2. Install `dsh-agent-connector` and `dsh-instance` from their generated `.runtime/release/` folders:

   ```bash
   (cd dsh-connector/.runtime/release/1.0.0-alpha.1 &&
     DSH_CONNECTOR_STORE="$(node "$PWD/offline-store.mjs" "$PWD/pnpm-store" "$(dsh plugin --profile web root --silent)" "$(dsh plugin --profile web store path --silent)")" &&
     dsh plugin --profile web add "$PWD/dsh-agent-connector-1.0.0-alpha.2.tgz" --offline --store-dir="$DSH_CONNECTOR_STORE" --cache-dir="$PWD/pnpm-cache" --registry=https://registry.npmjs.org)

   (cd dsh-fishball-instance/.runtime/release/1.0.0-alpha.1 &&
     FISHBALL_INSTANCE_STORE="$(node "$PWD/offline-store.mjs" "$PWD/pnpm-store" "$(dsh plugin --profile web root --silent)" "$(dsh plugin --profile web store path --silent)")" &&
     dsh plugin --profile web add "$PWD/dsh-instance-1.0.0-alpha.1.tgz" --offline --store-dir="$FISHBALL_INSTANCE_STORE" --cache-dir="$PWD/pnpm-cache" --registry=https://registry.npmjs.org)
   ```

3. Start DSH and open it at `127.0.0.1` or `localhost`. Click the fish icon in the sidebar (or go to **DSH → Plugins → `dsh-instance` → Open Fishball**), then choose Fishball's model when prompted.

## Uninstall

DSH runs no plugin code on removal, so run the instance cleanup command before removing the package:

1. Quit DSH (this also stops Fishball's child process).
2. Run the cleanup command from the installed package (`--home <DSH_HOME>` if not `~/.dsh` / `$DSH_HOME`):

   ```bash
   node ~/.dsh/profiles/web/node_modules/dsh-instance/uninstall.js
   ```

3. Remove the package (`dsh plugin --profile web remove dsh-instance`, or remove it from the Plugins page after restarting DSH).

What it removes: `<DSH_HOME>/fishball/runtime` (the child's profile, session, settings, logs, and placed plugins) while preserving `<DSH_HOME>/fishball/hosted.json`. If it refuses with exit code `1`, nothing was deleted (`CHILD_RUNNING`, `CHILD_STATE_UNKNOWN`, `UNSAFE_DIRECTORY`, `UNOWNED_RUNTIME`, `INVALID_MAIN_HOME`); stop DSH / verify no child process remains, and if the launch record is missing, delete `<DSH_HOME>/fishball/runtime` manually.

## Local development & packing

- In dev mode, `dsh-instance` resolves `fishball-core` and `fishball-amenities` (plus its bundled amenities) from `$FISHBALL_REPO/packages/` or a sibling `../dsh-fishball/packages/` checkout.
- When packing for offline installs, pass `--fishball-release <dir>` (or set `FISHBALL_RELEASE_DIR`, or pack `../dsh-fishball` first) to embed the `fishball-amenities` and `fishball-core` tarballs into `bundled/`.

## Related repositories

- [`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle) — All-in-one embedded Fishball bundle & main user-facing project page.
- [`dsh-connector`](https://github.com/Arrosam/dsh-connector) — Generic DSH MCP connector (`dsh-agent-connector` carrying `dsh-connector` and `dsh-connector-ui`, plus optional `dsh-connector-amenities` / `dsh-connector-adapter` / `dsh-connector-watchdog`).
- [`dsh-fishball`](https://github.com/Arrosam/dsh-fishball) — Fishball agent plugins (`fishball-core` [includes `fishball-ui`], `fishball-amenities` bundling `fishball-board`, `fishball-heartbeat`, `fishball-taskboard`, and `fishball-shared`).

## Scripts

- `npm run test:v3` — Run all V3 suites for `dsh-instance`.
- `npm run pack` — Build release tarball into `.runtime/release/<version>/`.
- `npm run pack:check` — Verify an existing release offline.
