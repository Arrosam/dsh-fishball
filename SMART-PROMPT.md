# SMART-PROMPT workspace knowledge

## Project vocabulary
- "dsh-fishball": a separate, related repo/project. Content such as design documents has been moved from it into this repo.
- "watchdog": a component or feature that has its own design document. Its original notes were kept in dsh-fishball. The user wants it implemented in `dsh-connector-amenities`.
- This repo combined several packages into one, including `dsh-connector-adapter`, `dsh-connector-amenities` and `dsh-connector-ui`.
- Shorthand: "connector amenities" = `dsh-connector-amenities` (likewise "connector adapter" / "connector ui" for the other packages).

## Recurring themes
- Design documents are being moved from dsh-fishball into this repo. The user worries that some may not have moved over properly.
- When docs move, the user wants the old copies deleted from dsh-fishball and references there repointed to this repo.
- "here" in drafts means this repo, as opposed to dsh-fishball.

## Conventions
- Per-package tests: each package keeps its suites in its own `tests/<suite>/` folder (one `<suite>.test.mjs` entry each) and runs them alone with `npm test --workspace <npm name>`, on the current DSH. The UI component `packages/dsh-connector/ui` runs with `dsh-agent-connector`.
- Shared test tooling lives only in `packages/dsh-connector-test-helpers` (runner, DSH version binding, case naming, scripted pages, the real-DSH worlds); a package's tests never import another package's tests or sources.
- Behaviour across packages goes in an integration package under `integration/` (`connector-watchdog`, `package-icons`); these run only before a release.
- `npm run test:release` (`scripts/test-release.mjs`) runs every package and integration package in parallel on the release matrix; logs in `.runtime/test-release/<run>/`.
