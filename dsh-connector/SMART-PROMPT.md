# SMART-PROMPT workspace knowledge

> Current connector guidance is in the [connector README](README.md).

## Project vocabulary
- `dsh-fishball/` is the Fishball component in this monorepo. It talks to the connector only over the public MCP surface; sharing a checkout did not introduce runtime imports.
- Watchdog lives in [`amenities/watchdog`](../amenities/watchdog/README.md), installed by the [connector umbrella](../amenities/connector-amenities/README.md). Its [notes](docs/watchdog-project-notes.md) originally lived with Fishball.
- The adapter remains a connector package. The connector UI ships inside `dsh-agent-connector`; it is not a separate workspace.
- Shorthand: "connector amenities" = `dsh-connector-amenities` (likewise "connector adapter" / "connector ui" for the other packages).

## Conventions
- Per-package tests: each package keeps its suites in its own `tests/<suite>/` folder (one `<suite>.test.mjs` entry each) and runs them alone with `npm test --workspace <npm name>`, from the monorepo root, on the current DSH. The UI component `packages/dsh-connector/ui` runs with `dsh-agent-connector`.
- Shared test tooling lives only in `packages/dsh-connector-test-helpers` (runner, DSH version binding, case naming, scripted pages, the real-DSH worlds); a package's tests never import another package's tests or sources.
- Behaviour across packages goes in an integration package under `integration/` (`connector-watchdog`, `package-icons`); these run only before a release.
- `npm run test:release` from `dsh-connector/` runs the connector family’s packages and integration packages in parallel on its release matrix; logs are under `dsh-connector/.runtime/test-release/<run>/`.
