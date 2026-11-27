# Testing in this repository

## Rules

1. **Each package tests its own behaviour.** A package's suites live in its own `tests/` folder and
   exercise only that package's code, through its public entry points (its exports, the services and
   routes it registers in DSH, the pages it draws). Day to day you run only the package you changed.
   There is no whole-repository test run.
2. **Suites are independent across packages.** A package's tests never import another package's tests
   or source files by path. Shared test tooling lives in one place:
   [`packages/dsh-connector-test-helpers`](../../packages/dsh-connector-test-helpers/README.md).
   A package may load another package only when the product itself does at run time (for example,
   the connector loads its bundled `dsh-connector-shared`).
3. **Behaviour across packages is tested in integration packages** under [`integration/`](../../integration/README.md).
   They run only before a release.
4. **Day to day, the current DSH only.** Every suite registers its cases with
   `forEachVersion(register)` from `dsh-connector-test-helpers/cases`. Day to day that is the
   current DSH. Before a release, `npm run test:release` runs every package and integration package
   once per DSH version of the release matrix.
5. **How cases are written.**
   - Cases are behaviour-focused: one test per use-case flow, equivalence partition, boundary value,
     decision-table rule or state transition, named `<case id> <row> [SDK <version>] <title>`.
   - Every bug fix gets a regression case. The case must fail on the old code and pass on the fixed
     code; say so in a comment next to it.
   - Oracles are the requirement's values, restated in the suite's `constants.mjs`, never read back
     from the implementation.
6. **No per-package time limits.** The only limits are the per-case timeouts inside the suites, which
   are harness waits.

## Commands

| What | Command |
| --- | --- |
| One package (day to day) | `npm test --workspace <npm name>`, or `npm test` inside the package folder |
| One package, some cases | `npm test --workspace <npm name> -- --test-name-pattern="MAILBOX"` |
| The connector's UI component only | `node packages/dsh-connector-test-helpers/src/runner/cli.mjs packages/dsh-connector/ui` |
| Before a release (everything, release matrix, in parallel) | `npm run test:release` |

`packages/dsh-connector/ui` (`dsh-connector-ui`) is a component that ships inside the
`dsh-agent-connector` tarball, not a workspace of its own. Its suites belong to the connector
package and run with it.

## Environment

| Variable | Effect |
| --- | --- |
| `DSH_TEST_CURRENT` | The DSH version day-to-day runs use. By default it is the version the DSH shell's default launch preset runs. |
| `DSH_TEST_MATRIX` | A comma-separated list of DSH versions. Every suite then runs once per version. `test:release` sets it. |
| `DSH_TEST_VERSIONS_DIR` | Where installed DSH versions are read from. The default is `~/Library/Application Support/DSH/data/versions`. |
| `DSH_TEST_NAMES` | A file path. The runner also writes one JSON line per finished case there. |
| `DSH_TEST_CHROME` | The Chromium binary for the layout cases. By default the newest Playwright headless shell is used. |

The runner gives every run a throwaway HOME, TMPDIR and XDG tree and removes it afterwards, so no
case reads or writes your real DSH or npm state.

## The behaviour inventory

[`baseline-inventory.json`](baseline-inventory.json) records every behaviour the suites covered
before this layout existed, including the staging cases brought in during the merge: package,
case-id family, case name (without its SDK tag), statuses and SDKs.
`node scripts/inventory-check.mjs <package>[,<package>...] <names.jsonl>[,<names.jsonl>...]` checks
a run against it. The check automatically uses [the staging case map](staging-case-map.json)
for changed case titles and accepts an optional `--map <file>` for additional mappings.
A baseline behaviour that is neither run nor mapped (renamed or withdrawn, with a reason)
fails the check.

Use inventory package names (for example `dsh-connector,dsh-connector-ui`). Pass both the
Watchdog package and connector–Watchdog integration names files when checking
`dsh-connector-watchdog`, since its live cases moved to the integration package.
