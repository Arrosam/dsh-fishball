# DSH Connector

Generic MCP connector plugins for DeepSeek Harness (DSH). Exposes a DSH's sessions over MCP + OAuth so any managing agent (such as [dsh-fishball](https://github.com/Arrosam/dsh-fishball)) can read, coordinate, and handle approvals/questions across sessions.

Split from `dsh-fishball@84078e5f`.

## Packages

| Folder | npm Package | Components & Role |
| --- | --- | --- |
| `packages/dsh-connector` | `dsh-agent-connector` | One plugin with 2 components: **`dsh-connector`** (MCP `/api/agent/mcp`, OAuth `/api/agent/oauth`, tokens, pairs, mailbox, routing, bundle settings page) and **`dsh-connector-ui`** (`./ui/`, sidebar indicator, agent window, notify prompt, Hand over / Take back marks, `notify` & `attention.*` tools). |
| `packages/dsh-connector-amenities` | `dsh-connector-amenities` | Optional connector amenities bundle (currently **`dsh-connector-adapter`** under `./adapter/`, letting any DSH connect to another DSH's connector via `dsh-mcp-client`). Configure each amenity from its component settings. |
| `packages/dsh-connector-shared` | `dsh-connector-shared` | Internal library bundled into DSH-side tarballs (`redact`, `request-host`). Not a plugin. |

## Related repositories

- `dsh-fishball` — Fishball agent plugins (`fishball-core`, `fishball-ui`, `fishball-shared`, shelved `fishball-board`).
- `dsh-fishball-instance` — Bridge plugin (`dsh-instance`) that runs a hosted Fishball child inside a DSH with `dsh-agent-connector`.

## Scripts

- `npm run test:v3` — Run all V3 suites for this repository.
- `npm run pack` — Build release tarballs into `.runtime/release/<version>/`.
- `npm run pack:check` — Verify an existing release offline.
