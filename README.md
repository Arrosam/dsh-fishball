# DSH Connector

> **Looking to install Fishball or connect an agent via MCP?**
> This repository holds the underlying DSH-side connector packages for **advanced users and developers**. For the one-click embedded Fishball bundle (`dsh-fishball-bundle`), standalone setup, and MCP integration guide, see **[`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle)**.

Generic MCP connector plugins for DeepSeek Harness (DSH). Exposes a DSH's sessions over MCP + OAuth so any managing agent (such as [dsh-fishball](https://github.com/Arrosam/dsh-fishball)) can read, coordinate, and handle approvals/questions across sessions.

Split from `dsh-fishball@84078e5f`.

## Packages

| Folder | npm Package | Components & Role |
| --- | --- | --- |
| `packages/dsh-connector` | `dsh-agent-connector` | One plugin with 2 components: **`dsh-connector`** (MCP `/api/agent/mcp`, OAuth `/api/agent/oauth`, tokens, pairs, mailbox, routing, bundle settings page, Hand over / Take back marks) and **`dsh-connector-ui`** (`./ui/`, sidebar indicator, agent window, notify prompt, `notify` & `attention.*` tools). |
| `packages/dsh-connector-adapter` | `dsh-connector-adapter` | Optional amenity: lets any DSH connect to another DSH's connector via `dsh-mcp-client`. Its own bundle. |
| `packages/dsh-connector-watchdog` | `dsh-connector-watchdog` | Optional amenity: supervises managed sessions against their purpose and approves in-scope permission requests for their manager (see [watchdog-project-notes.md](docs/watchdog-project-notes.md)). Its own bundle. |
| `packages/dsh-connector-amenities` | `dsh-connector-amenities` | Umbrella: bundles `dsh-connector-adapter`, `preset-watchdog`, and `dsh-connector-watchdog` with their component settings pages so one install brings both amenities. |
| `packages/dsh-connector-shared` | `dsh-connector-shared` | Internal library bundled into DSH-side tarballs (`redact`, `request-host`, `live-settings`). Not a plugin. |

## Supported DSH versions

- DSH **0.2.1-rc.5** and **0.2.2-rc.1**, either the DSH Web build or the one bundled with DSH-X.
- Node **22.14+** for the connector and release packing; DSH itself needs Node **24.9+**.

## Install

Use your own profile name instead of `web` if needed. **Quit DSH before running `dsh plugin ... add`.**

`dsh-agent-connector` provides the core connector (`dsh-connector` and `dsh-connector-ui`). If you also want the optional amenities (`dsh-connector-adapter` and `dsh-connector-watchdog`), install `dsh-connector-amenities` separately (or install either standalone package on its own).

### Option A — Standard DSH install (from npm under `alpha`, via DSH Plugins page or CLI)

In DSH's Plugins page (**Plugins → Add plugin**), install `dsh-agent-connector@1.0.0-alpha.2` (and optionally `dsh-connector-amenities@1.0.0-alpha.1`), or run:

```bash
dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.2
# Optional: adapter + watchdog amenities
dsh plugin --profile web add dsh-connector-amenities@1.0.0-alpha.1
```

pnpm may print missing-peer warnings for DSH's own `@deepseek-ai/*` packages; DSH provides them at runtime, so that warning is expected.

### Option B — From GitHub source (pack & install offline when needed)

1. Clone and pack the release tarballs (into `.runtime/release/1.0.0-alpha.1/`):

   ```bash
   git clone https://github.com/Arrosam/dsh-connector.git
   cd dsh-connector
   npm run pack
   ```

2. Install `dsh-agent-connector` (and optionally `dsh-connector-amenities`) into your managed DSH profile:

   ```bash
   (cd .runtime/release/1.0.0-alpha.1 &&
     DSH_CONNECTOR_STORE="$(node "$PWD/offline-store.mjs" "$PWD/pnpm-store" "$(dsh plugin --profile web root --silent)" "$(dsh plugin --profile web store path --silent)")" &&
     dsh plugin --profile web add "$PWD/dsh-agent-connector-1.0.0-alpha.2.tgz" --offline --store-dir="$DSH_CONNECTOR_STORE" --cache-dir="$PWD/pnpm-cache" --registry=https://registry.npmjs.org &&
     # Optional: adapter + watchdog amenities
     dsh plugin --profile web add "$PWD/dsh-connector-amenities-1.0.0-alpha.1.tgz" --offline --store-dir="$DSH_CONNECTOR_STORE" --cache-dir="$PWD/pnpm-cache" --registry=https://registry.npmjs.org)
   ```

*(You can also install `dsh-connector-adapter-1.0.0-alpha.1.tgz` or `dsh-connector-watchdog-1.0.0-alpha.1.tgz` on its own without `dsh-connector-amenities`, though standalone amenity packages do not register their own Plugins-page UI.)*

### Using with Fishball

- **All-in-one embedded edition (recommended):** see [`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle) (do not install `dsh-agent-connector` or `dsh-connector-amenities` separately alongside `dsh-fishball-bundle`).
- **Hosted mode (manual components):** install [`dsh-fishball-instance`](https://github.com/Arrosam/dsh-fishball-instance) (`dsh-instance`) alongside `dsh-agent-connector` in the same DSH profile. `dsh-instance` automatically installs both `fishball-core` and `fishball-amenities` into Fishball's child DSH.
- **Standalone mode (Fishball in a separate DSH):** install [`dsh-fishball`](https://github.com/Arrosam/dsh-fishball) (`fishball-core`, and optionally `fishball-amenities`) in the Fishball DSH, then point its **Target** setting at this DSH's `/api/agent/mcp` endpoint with a token from the connector's settings page.

## Uninstall

Remove installed packages like any DSH plugin (or from the Plugins page inside DSH):

```bash
dsh plugin --profile web remove dsh-agent-connector
# If installed:
dsh plugin --profile web remove dsh-connector-amenities
```

Plugin data is kept on removal, and agents using a removed connector lose access.

## Related repositories

- [`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle) — All-in-one Fishball embedded bundle & main user-facing project page.
- [`dsh-fishball`](https://github.com/Arrosam/dsh-fishball) — Fishball agent plugins (`fishball-core` [includes `fishball-ui`], optional `fishball-amenities` bundling `fishball-board`, `fishball-heartbeat`, `fishball-taskboard`, and `fishball-shared`).
- [`dsh-fishball-instance`](https://github.com/Arrosam/dsh-fishball-instance) — Bridge plugin (`dsh-instance`) that runs a hosted Fishball child inside a DSH with `dsh-agent-connector`.

## Design documents

- [`docs/watchdog-project-notes.md`](docs/watchdog-project-notes.md) — Handoff notes for the separate DSH-side Watchdog plugin (`dsh-fishball-watchdog`), moved from `dsh-fishball`.
- [`docs/test-design/instance-ext-w0-mcp-use-cases.md`](docs/test-design/instance-ext-w0-mcp-use-cases.md) — W0 MCP use cases behind `packages/dsh-connector/tests/instance-ext/`.

Other design documents the code cites (`DESIGN.md`, `docs/planning/v3-*.md`, `docs/test-design/v3/*`) stay in `dsh-fishball`.

## Scripts

- `npm run test:v3` — Run all V3 suites for this repository: the cross-package suites under `test/v3/` and every package's own.
- `npm test --workspace <package>` (or `npm test` inside a package folder) — Run one package's own suites. Each package keeps them in its own `tests/` folder, configured by `tests/test.config.mjs`:
  - `packages/dsh-connector/tests/` — `dsh-agent-connector`, including its K1/K1d/K2/K3 contract suites;
  - `packages/dsh-connector/ui/tests/` — `dsh-connector-ui`, including the R-EMBED suite (run with `node test/run-package.mjs packages/dsh-connector/ui`; it is not a workspace);
  - `packages/dsh-connector-adapter/tests/` — `adapter/` and `oauth-client/`;
  - `packages/dsh-connector-watchdog/tests/` — the core cases and `live/` (WD-L01…09);
  - `packages/dsh-connector-amenities/tests/` — the umbrella's install cases;
  - `packages/dsh-connector-shared/tests/` — `dsh-connector-shared`.

  Shared harness code (`test/support/`, `test/private-skills/`) stays at the root; cross-package suites (`contract/own-schema`, `contract/package-boundaries`, `release/pack`, `fishball-core`, `dsh-instance`) stay under `test/v3/`.
- `npm run pack` — Build release tarballs into `.runtime/release/<version>/`.
- `npm run pack:check` — Verify an existing release offline.
