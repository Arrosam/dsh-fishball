# DSH Connector

Generic MCP connector plugins for DeepSeek Harness (DSH). The connector exposes a DSH's sessions
over MCP with OAuth, so a managing agent (such as [dsh-fishball](https://github.com/Arrosam/dsh-fishball))
can start, read and message sessions and answer their permission requests and questions. The
other packages are optional amenities around it, a shared library, and the test tooling. The
repository was split from `dsh-fishball@84078e5f`.

## Packages

| Folder | npm name | Role | README |
| --- | --- | --- | --- |
| `packages/dsh-connector` | `dsh-agent-connector` | The connector plugin: MCP `/api/agent/mcp`, OAuth `/api/agent/oauth`, tokens, pairs, mailbox, routing, its settings page, Hand over / Take back. Ships the `dsh-connector-ui` component. | [README](<packages/dsh-connector/README.md>) |
| `packages/dsh-connector/ui` | `dsh-connector-ui` (component, not a workspace) | Inside the connector tarball: the Fishball sidebar entries, the agent window, the light and notify prompt, the `notify` and `attention.*` tools. | [README](<packages/dsh-connector/ui/README.md>) |
| `packages/dsh-connector-adapter` | `dsh-connector-adapter` | Optional amenity: lets a DSH sign in to another DSH's connector through `dsh-mcp-client`. Its own bundle. | [README](<packages/dsh-connector-adapter/README.md>) |
| `packages/dsh-connector-watchdog` | `dsh-connector-watchdog` | Optional amenity: supervises managed sessions against their purpose and approves in-scope permission requests for their manager. Its own bundle. | [README](<packages/dsh-connector-watchdog/README.md>) |
| `packages/dsh-connector-amenities` | `dsh-connector-amenities` | Umbrella: depends on the two amenities so one install brings both; carries their settings pages. | [README](<packages/dsh-connector-amenities/README.md>) |
| `packages/dsh-connector-shared` | `dsh-connector-shared` | Internal library bundled into the DSH-side tarballs (`redact`, `request-host`, `live-settings`). Not a plugin. | [README](<packages/dsh-connector-shared/README.md>) |
| `packages/dsh-connector-test-helpers` | `dsh-connector-test-helpers` (private) | Shared test tooling: the runner, DSH version binding, case naming, scripted pages, the real-DSH worlds. Never packed. | [README](<packages/dsh-connector-test-helpers/README.md>) |
| `integration/connector-watchdog` | `dsh-connector-integration-watchdog` (private) | Release-only: Watchdog beside the connector in one real DSH. | [README](<integration/connector-watchdog/README.md>) |
| `integration/package-icons` | `dsh-connector-integration-package-icons` (private) | Release-only: every plugin package's icon checked together. | [README](<integration/package-icons/README.md>) |

## Testing

Each package has its own suites in its own `tests/` folder. Day to day, run the package you
changed, on the current DSH:

```bash
npm test --workspace <npm name>     # or: npm test, inside the package folder
```

The UI component's suites run with the connector (`npm test --workspace dsh-agent-connector`).
Behaviour that needs more than one package is in the [integration packages](<integration/README.md>).

Before a release, run every package and integration package in parallel on the release matrix
(DSH 0.2.1-rc.5, 0.2.2-rc.1, 0.2.2-rc.3); logs go to `.runtime/test-release/<run>/`:

```bash
npm run test:release
```

The rules, options and environment variables are in [the testing guide](<docs/testing/README.md>).

## Releasing

- `npm run pack` builds the release tarballs, `SHA256SUMS`, `INSTALL.md`, `PUBLISH.md` and an
  offline pnpm store into `.runtime/release/<version>/` (`scripts/pack.mjs`).
- `npm run pack:check` re-verifies an existing release, offline.

## Design documents

- [`docs/watchdog-project-notes.md`](<docs/watchdog-project-notes.md>): handoff notes for the
  DSH-side Watchdog plugin, moved from `dsh-fishball`.
- [`docs/test-design/instance-ext-w0-mcp-use-cases.md`](<docs/test-design/instance-ext-w0-mcp-use-cases.md>):
  the W0 MCP use cases behind `packages/dsh-connector/tests/instance-ext/`.

Other design documents the code cites (`DESIGN.md`, `docs/planning/v3-*.md`, `docs/test-design/v3/*`)
stay in `dsh-fishball`.

## Related repositories

- `dsh-fishball`: the Fishball agent plugins (`fishball-core`, `fishball-ui`, `fishball-shared`,
  shelved `fishball-board`).
- `dsh-fishball-instance`: the bridge plugin (`dsh-instance`) that runs a hosted Fishball child
  inside a DSH with `dsh-agent-connector`.
