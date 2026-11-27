# Writing tests

The rules every test in this repository follows. They apply to package tests and integration tests.

## Where a test lives

- **A package's own tests** are in `<package>/tests/`, as `*.test.mjs` files, grouped in one folder per
  area (`packages/dsh-instance/tests/placement/`, …). They test that package's behaviour only and run
  day to day with `npm test` in the package folder. There is no whole-repository run.
- **Tests never import another package's files.** A test imports the package it tests (by relative
  path, its own package) and `@dsh-instance/test-helpers/<part>` (by name). A tool two packages need
  goes into `packages/test-helpers`; a tool only one package's tests need goes into that package's
  `tests/support/`.
- **Cross-package behaviour** (a real host DSH with a hosted child, the instance with the real
  connector or the real fishball-core, a packed release) is tested only in an **integration package**
  under `integration/<name>/`. They run before a release, never day to day: `npm run test:release`
  runs every package and every integration package in parallel, one worker each. An integration
  test reaches another package only through what that package publishes: its manifest `exports`, its
  installed or packed form, its patch file and routes in a running DSH.

## How a case is written

- **Behaviour first.** A case states one observable behaviour in its name and checks it through the
  package's public surface: exports, files it writes, routes it registers, what a page renders. It
  never reads or imitates the implementation to decide what to expect.
- **Named by technique.** Every case is registered once per supported SDK (`eachSdk`) and named
  `<ID> <part> [SDK <version>] <behaviour>` (`caseTest`). The ID says the technique: `-EP-`
  equivalence partition, `-BVA-` boundary value, `-DT-` decision-table rule, `-ST-` state
  transition, `-UC-` use case flow. Table rows are data (one array of rows → one case each).
- **Expected outcomes come from the requirement**: the package README, the JSDoc contract of the
  export under test, the design notes a commit cites. When the code and a test disagree, the test is
  not bent to the code: the failure is classified (below).
- **Regression cases.** A fix comes with a case that fails on the code before the fix and passes on
  the fix; the commit message says so, and `docs/testing/regressions.md` records how it was shown.
- **No time limits.** No `timeout` option, no time budget, no deadline in a wait. A wait waits for its
  condition (an event, or a poll with no deadline), so a hang shows as a hang. A duration that is
  itself the behaviour (a ticket's 30 s life) is tested with an injected clock, not by waiting.
- **Scratch only.** A case writes only below a fresh temp folder (`tempRoot`) or the run's own HOME;
  it never writes into the checkout, a sibling checkout or the user's DSH home.

## When a case fails

Every failing case is classified as one of:

- **real bug**: the code breaks a requirement that still holds. The case stays as written and is
  registered with `{ todo: 'BUG-<n> <one line>' }`, so it runs and reports without failing the run, and
  `docs/testing/bugs.md` describes it. Once the bug is fixed the `todo` goes away.
- **outdated test**: a later, recorded decision changed the requirement (name the commit or document).
  The case is rewritten to the current requirement, and `docs/testing/coverage.md` says what changed.
