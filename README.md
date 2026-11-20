# DSH Connector

Generic MCP connector plugins for DeepSeek Harness (DSH). Exposes a DSH's sessions over MCP + OAuth so any managing agent (such as [dsh-fishball](https://github.com/Arrosam/dsh-fishball)) can read, coordinate, and handle approvals/questions across sessions.

Split from `dsh-fishball@84078e5f`.

## Packages

| Folder | npm Package | Components & Role |
| --- | --- | --- |
| `packages/dsh-connector` | `dsh-agent-connector` | One plugin with 2 components: **`dsh-connector`** (MCP `/api/agent/mcp`, OAuth `/api/agent/oauth`, tokens, pairs, mailbox, routing, bundle settings page, Hand over / Take back marks) and **`dsh-connector-ui`** (`./ui/`, sidebar indicator, agent window, notify prompt, `notify` & `attention.*` tools). |
| `packages/dsh-connector-amenities` | `dsh-connector-amenities` | Optional connector amenities bundle: **`dsh-connector-adapter`** (`./adapter/`, letting any DSH connect to another DSH's connector via `dsh-mcp-client`) and **`dsh-connector-watchdog`** (`./watchdog/`, supervises managed sessions against their purpose and approves in-scope permission requests for their manager; see [watchdog-project-notes.md](docs/watchdog-project-notes.md)). Configure each amenity from its component settings. |
| `packages/dsh-connector-shared` | `dsh-connector-shared` | Internal library bundled into DSH-side tarballs (`redact`, `request-host`). Not a plugin. |

## Related repositories

- `dsh-fishball` — Fishball agent plugins (`fishball-core`, `fishball-ui`, `fishball-shared`, shelved `fishball-board`).
- `dsh-fishball-instance` — Bridge plugin (`dsh-instance`) that runs a hosted Fishball child inside a DSH with `dsh-agent-connector`.

## Design documents

- [`docs/watchdog-project-notes.md`](docs/watchdog-project-notes.md) — Handoff notes for the separate DSH-side Watchdog plugin (`dsh-fishball-watchdog`), moved from `dsh-fishball`.
- [`docs/test-design/instance-ext-w0-mcp-use-cases.md`](docs/test-design/instance-ext-w0-mcp-use-cases.md) — W0 MCP use cases behind `packages/dsh-connector/tests/instance-ext/`.

Other design documents the code cites (`DESIGN.md`, `docs/planning/v3-*.md`, `docs/test-design/v3/*`) stay in `dsh-fishball`.

## Scripts

- `npm run test:v3` — Run all V3 suites for this repository: the cross-package suites under `test/v3/` and every package's own.
- `npm test --workspace <package>` (or `npm test` inside a package folder) — Run one package's own suites. Each package keeps them in its own `tests/` folder, configured by `tests/test.config.mjs`:
  - `packages/dsh-connector/tests/` — `dsh-agent-connector`, including its K1/K1d/K2/K3 contract suites;
  - `packages/dsh-connector/ui/tests/` — `dsh-connector-ui`, including the R-EMBED suite (run with `node test/run-package.mjs packages/dsh-connector/ui`; it is not a workspace);
  - `packages/dsh-connector-amenities/tests/` — `adapter/` (`dsh-connector-adapter`) and `watchdog/`;
  - `packages/dsh-connector-shared/tests/` — `dsh-connector-shared`.

  Shared harness code (`test/support/`, `test/private-skills/`) stays at the root; cross-package suites (`contract/own-schema`, `contract/package-boundaries`, `release/pack`, `fishball-core`, `dsh-instance`) stay under `test/v3/`.
- `npm run pack` — Build release tarballs into `.runtime/release/<version>/`.
- `npm run pack:check` — Verify an existing release offline.
