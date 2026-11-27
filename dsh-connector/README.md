# DSH Connector

> **Looking to install Fishball or connect an agent via MCP?**
> See the [Fishball bundle and MCP integration guide](https://github.com/Arrosam/dsh-fishball/tree/main).

Generic MCP connector plugins for DeepSeek Harness (DSH). The connector exposes a DSH's sessions
over MCP with OAuth, so a managing agent (such as [Fishball](../dsh-fishball/docs/README.md))
can start, read and message sessions and answer their permission requests and questions. The
other packages are optional amenities around it, a shared library, and the test tooling. The
connector was split from `dsh-fishball@84078e5f`; it now lives in the [monorepo](../README.md).
Fishball uses its public MCP surface, not its package internals.

## Packages

| Folder | npm name | Role | README |
| --- | --- | --- | --- |
| `packages/dsh-connector` | `dsh-agent-connector` | The connector plugin: MCP `/api/agent/mcp`, OAuth `/api/agent/oauth`, tokens, pairs, mailbox, routing, its settings page, Hand over / Take back. Ships the `dsh-connector-ui` component. | [README](<packages/dsh-connector/README.md>) |
| `packages/dsh-connector/ui` | `dsh-connector-ui` (component, not a workspace) | Inside the connector tarball: the Fishball sidebar entries, the agent window, the light and notify prompt, the `notify` and `attention.*` tools. | [README](<packages/dsh-connector/ui/README.md>) |
| `packages/dsh-connector-adapter` | `dsh-connector-adapter` | Optional amenity: lets a DSH sign in to another DSH's connector through `dsh-mcp-client`. Its own bundle. | [README](<packages/dsh-connector-adapter/README.md>) |
| `../amenities/watchdog` | `dsh-connector-watchdog` | Optional amenity: supervises managed sessions against their purpose and approves in-scope permission requests for their manager. Its own bundle. | [README](<../amenities/watchdog/README.md>) |
| `../amenities/connector-amenities` | `dsh-connector-amenities` | Umbrella: depends on the two amenities so one install brings both; carries their settings pages. | [README](<../amenities/connector-amenities/README.md>) |
| `packages/dsh-connector-shared` | `dsh-connector-shared` | Internal library bundled into the DSH-side tarballs (`redact`, `request-host`, `live-settings`). Not a plugin. | [README](<packages/dsh-connector-shared/README.md>) |
| `packages/dsh-connector-test-helpers` | `dsh-connector-test-helpers` (private) | Shared test tooling: the runner, DSH version binding, case naming, scripted pages, the real-DSH worlds. Never packed. | [README](<packages/dsh-connector-test-helpers/README.md>) |
| `integration/connector-watchdog` | `dsh-connector-integration-watchdog` (private) | Release-only: Watchdog beside the connector in one real DSH. | [README](<integration/connector-watchdog/README.md>) |
| `integration/package-icons` | `dsh-connector-integration-package-icons` (private) | Release-only: every plugin package's icon checked together. | [README](<integration/package-icons/README.md>) |

## Testing

Each package has its own suites in its own `tests/` folder. Day to day, run the package you
changed on the current DSH, from the monorepo root:

```bash
npm test --workspace <npm name>     # or: npm test, inside the package folder
```

The UI component's suites run with the connector (`npm test --workspace dsh-agent-connector`).
Behaviour that needs more than one package is in the [integration packages](<integration/README.md>).

Before a connector release, run the connector family’s packages and integration packages in parallel from `dsh-connector/` on the release matrix
(DSH 0.2.1-rc.5, 0.2.2-rc.1, 0.2.2-rc.3); logs go to `.runtime/test-release/<run>/`:

```bash
npm run test:release
```

The rules, options and environment variables are in [the testing guide](<docs/testing/README.md>).

## Releasing

Run these commands from `dsh-connector/`.

- `npm run pack` builds the release tarballs, `SHA256SUMS`, `INSTALL.md`, `PUBLISH.md` and an
  offline pnpm store into `.runtime/release/<version>/` (`scripts/pack.mjs`).
- `npm run pack:check` re-verifies an existing release, offline.

## Design documents

- [`docs/watchdog-project-notes.md`](<docs/watchdog-project-notes.md>): handoff notes for the
  DSH-side Watchdog plugin, moved from `dsh-fishball`.
- [`docs/test-design/instance-ext-w0-mcp-use-cases.md`](<docs/test-design/instance-ext-w0-mcp-use-cases.md>):
  the W0 MCP use cases behind `packages/dsh-connector/tests/instance-ext/`.

See [Fishball’s design record](../dsh-fishball/DESIGN.md), [V3 plans](../dsh-fishball/docs/planning/),
and [historical V3 test designs](../dsh-fishball/docs/history/test-design/v3/) for shared design context.

## Related projects

- [`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball/tree/main) — All-in-one Fishball embedded bundle & main user-facing project page.
- [Fishball](../dsh-fishball/docs/README.md) — The Fishball agent plugins, including its optional amenities.
- [Hosted instance](../dsh-fishball-instance/README.md) — The bridge plugin that runs a hosted Fishball child.
