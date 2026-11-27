# Testing

How the Fishball component is tested. The per-package testing rules from the 2026-11-22 restructure still apply:

1. **Every package has its own independent tests**, based on the functionality inside that package.
   Day to day only the changed package's tests run. There is no whole-repo test run.
2. **Tests of different packages are fully independent.** A package's tests never import another
   package's internals. Shared test tools (the fake DSH, the fake connector, the scripted page, the
   headless browser, the runner) live in one package, [`fishball-test-helpers`](<../../packages/test-helpers/README.md>).
3. **Cross-package behaviour is tested in integration test packages** (`packages/integration-*`). They
   run only before a release, all in parallel, through one script.
4. **The DSH version matrix is release-only.** Day to day every package is tested against the current
   DSH alone.
5. Cases are **behaviour-focused** (black box: they observe what DSH, the user or another plugin can
   observe), and a fix comes with **regression cases shown to fail on the old code and pass on the fixed
   code** (as the heartbeat's own-compaction fix did, HB-CAU).
6. No per-package time limit.

## Layout

```
packages/<package>/tests/          the package's own tests (never shipped: the release stage drops tests/)
  *.test.mjs                       one entry file per area; each registers its cases once, on the current DSH
  <area>/…                         cases, worlds and constants of one area (only this package's)
  README.md                        what is covered, how it is observed, the case-id index
packages/test-helpers/             fishball-test-helpers: shared tools, its own tests, the runners
packages/integration-<name>/       one integration test package per cross-package concern
  tests/*.test.mjs
scripts/test.mjs                   day to day: one package's tests on the current DSH
scripts/test-release.mjs           release: every package and integration package, in parallel, over the DSH matrix
```

Paths in the table are relative to `dsh-fishball/` for `packages/` and to the monorepo root for `amenities/`.

| package | folder | tests |
|---|---|---|
| fishball-core | `packages/core` | `packages/core/tests` |
| fishball-ui | `packages/core/ui` | `packages/core/ui/tests` |
| fishball-board | `amenities/board` | `amenities/board/tests` |
| fishball-heartbeat | `amenities/heartbeat` | `amenities/heartbeat/tests` |
| fishball-taskboard | `amenities/taskboard` | `amenities/taskboard/tests` |
| fishball-consultant | `amenities/consultant` | `amenities/consultant/tests` |
| fishball-amenities | `amenities/fishball-amenities` | `amenities/fishball-amenities/tests` |
| fishball-shared | `packages/shared` | `packages/shared/tests` |
| fishball-test-helpers | `packages/test-helpers` | `packages/test-helpers/tests` |
| fishball-integration-core-ui | `packages/integration-core-ui` | fishball-core with fishball-ui: core's patch as DSH composes it, the drawn ask cards, the Fishball-page header entries, the guards, a booted DSH with both |
| fishball-integration-page-ui | `packages/integration-page-ui` | fishball-page in Chromium over a booted DSH: message_user rows and paging; fishball-child-plugins in an instance-run child (§28) |
| fishball-integration-page-stream | `packages/integration-page-stream` | core's one page stream (§34) with fishball-ui and fishball-taskboard: the carrier, the board's topic, the Task board tab on the carrier |
| fishball-integration-amenities | `packages/integration-amenities` | the amenities with core, fishball-ui and the repository: the icon family, settings namespaces, the root workspaces |
| fishball-integration-release | `packages/integration-release` | every package: the package boundaries, the release pack (tarballs, checksums, no tests/ shipped; its artifact rows need `npm run pack:v3` from the monorepo root first, `FBTEST_RELEASE_REQUIRED=1` makes a missing release fail) |

fishball-ui sits inside fishball-core's folder (`packages/core/ui`) but is its own package with its own
manifest; fishball-core's tests never run fishball-ui's and the reverse.

## Running

Run from the monorepo root. See the [root testing guide](../../../TESTING.md) for change-based routing and package boundaries. The component scripts remain compatibility wrappers.

```bash
node scripts/test.mjs fishball-taskboard          # one package, current DSH
node scripts/test.mjs fishball-core --list        # its files, nothing run
node scripts/test.mjs fishball-core -- --test-name-pattern=MULTI-NAME
node scripts/test.mjs fishball-core --file=link   # one entry file
node scripts/test.mjs fishball-heartbeat --against=<git-ref>   # today's tests on this package's code at <ref>
npm run test:release                             # release only: all package and integration workers
node scripts/test-release.mjs --dsh=current       # release run on the current DSH only
```

Inside a package folder, `npm test` runs the same as `node scripts/test.mjs <that package>`.

### The current DSH

The day-to-day DSH is the one this machine's DSH launcher runs (`<DSH data>/.bin/dsh` names
`versions/<version>`). `FBTEST_DSH_VERSION=<version>` picks another installed one;
`FBTEST_DSH_VERSIONS` moves the versions folder. The runner prints the version it uses. Case names carry
it (`[DSH 0.2.2-rc.3]`), so a report says what it ran on.

### The release matrix

`scripts/test-release.mjs` starts one worker per package and one per integration package, all at once.
Each worker runs its package's tests once per DSH of the matrix
(`fishball-test-helpers/dsh` `RELEASE_MATRIX`: the supported versions from the root README plus the
current one), one version after another, each version in a fresh isolated environment. Logs go to
`.runtime/test-release/<stamp>/<worker>.log` at the monorepo root; the script prints a summary and exits
non-zero if any worker failed.

### Environment isolation

Every run gets a fresh `HOME`, `DSH_HOME`, `TMPDIR` and XDG folders under the OS temp directory,
removed afterwards; no test reads the user's real DSH home. A booted DSH uses a throwaway home under
that root and the scripted model (no network).

### Preconditions

- The DSH versions are installed under `~/Library/Application Support/DSH/data/versions/`.
- fishball-core's own dependency `@modelcontextprotocol/client` must resolve from the repository
  (`npm install` at the root). Without it the link's cases fail with `ERR_MODULE_NOT_FOUND`; the
  runner says so before it starts.
- Browser rows use the local Playwright headless shell (`FBTEST_CHROME` names another Chromium).

## Independence, enforced

`scripts/test.mjs` checks a package's test files before it runs them. A test file may import only:
`node:` modules, files inside its own package folder (its `tests/` and the code under test),
`fishball-test-helpers/*`, and the public exports (by package name) of the packages its manifest lists as
dependencies, peers, optional dependencies or dev dependencies. Helpers are declared as dev dependencies. A relative import that leaves the package folder, or a path into another
package, stops the run with the offending line. fishball-test-helpers itself imports no package under
test.

## Writing cases

- One case per behaviour, named `<CASE-ID> <row> [DSH <version>] <partition or flow>`
  (`fishball-test-helpers/cases` `caseName`). Ids keep their technique: `-EP` equivalence partitions,
  `-BVA` boundary values, `-DT` decision tables, `-ST` state transitions, `-UC` use-case flows.
- Observe only what is public: DSH services, routes, the session log, the rendered page, files the
  package documents, log lines by code. Never a private variable of the code under test.
- Values the product owns (route paths, codes, words) come from the requirements or the package's
  published contract, not from its implementation.
- **A fix brings a regression case.** Write it before the fix, run
  `node scripts/test.mjs <package> --against=<ref before the fix>` to show it fails there, and say so
  in the commit (the heartbeat fix: HB-CAU failed 9 of 36 on 23e334c8 and passes on 2a375e82).
  `--against` swaps in only the package's own code at that ref (from `git archive` of its folder) and
  keeps every other package, the helpers and the tests as they are now, so today's tests load; it
  cannot reach a commit where the package had another folder (then export that commit's folder by hand,
  as the ports of the taskboard's 1cd04063 and fishball-ui's contrast fixes did).
- A withdrawn requirement removes its cases; nothing is registered as a skipped placeholder. A row
  that cannot run in the package's world (it needs a second package) belongs in an integration package.

## Inventory

[inventory/](<inventory/README.md>) records what the old `test/` tree covered, case id by case id,
and where each one went. [failures.md](<failures.md>) classifies every case that failed in the
baseline as a real bug or an outdated test.