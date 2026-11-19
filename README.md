# DSH Connector

Generic MCP connector plugins for DeepSeek Harness (DSH). Exposes a DSH's sessions over MCP + OAuth so any managing agent (such as [dsh-fishball](https://github.com/Arrosam/dsh-fishball)) can read, coordinate, and handle approvals/questions across sessions.

Split from `dsh-fishball@84078e5f`.

## Packages

| Folder | npm Package | Role |
| --- | --- | --- |
| `packages/dsh-connector` | `dsh-agent-connector` | MCP backend (`/api/agent/mcp`), OAuth server (`/api/agent/oauth`), tokens, pairs, mailbox, routing, `message_agent`, handover & tool contribution services, settings page. |
| `packages/dsh-connector-ui` | `dsh-connector-ui` | Host DSH frontend: sidebar indicator, agent window, notify prompt, managed session marks (**Hand over** / **Take back**), `notify` & `attention.*` tools. |
| `packages/dsh-connector-adapter` | `dsh-connector-adapter` | Optional plugin letting any DSH connect to another DSH's connector through `dsh-mcp-client` with browser OAuth sign-in and a loopback proxy. |
| `packages/dsh-connector-shared` | `dsh-connector-shared` | Internal library bundled into DSH-side tarballs (`redact`, `request-host`). Not a plugin. |

## Related repositories

- `dsh-fishball` — Fishball agent plugins (`fishball-core`, `fishball-ui`, `fishball-shared`, shelved `fishball-board`).
- `dsh-fishball-instance` — Bridge plugin (`dsh-instance`) that runs a hosted Fishball child inside a DSH with `dsh-agent-connector`.

## Scripts

- `npm run test:v3` — Run all V3 suites for this repository.
- `npm run pack` — Build release tarballs into `.runtime/release/<version>/`.
- `npm run pack:check` — Verify an existing release offline.
