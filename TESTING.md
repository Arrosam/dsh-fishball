# Testing Fishball

Run commands from the monorepo root using Node 24 and the installed DSH SDKs. Use a separate worktree for test changes; never point tests at a live DSH home.

## Develop with one package

```sh
npm test -w fishball-core
node scripts/test.mjs dsh-agent-connector
npm test -- dsh-fishball-bundle
node scripts/test.mjs fishball-core --file=contracts -- --test-name-pattern=K3a
```

Name one package, by npm name or workspace directory. Bare root `npm test` does not run the repository. `--list` checks the package boundary and lists its files without starting Node test workers or loading DSH. Existing Fishball `--serial` and `--against=<ref>` controls remain available. The runner gives each package a throwaway home; Fishball still selects the launcher SDK (or `FBTEST_DSH_VERSION`), connector uses its configured current SDK (or `DSH_TEST_CURRENT`), and instance cases keep their existing two SDK rows.

## Test changed packages

```sh
npm run test:changed -- --list
npm run test:changed
npm run test:changed -- --base <ref>
```

The default base is the merge base of HEAD and local `staging`; an explicit base is compared directly with HEAD. Staged, unstaged and nonignored untracked changes are included. A file belongs to its deepest workspace. Renames report both old and new paths. Integration workspaces are never selected. Selected packages start in parallel, one worker per package.

Shared changes are reported with affected packages, not silently fanned out. Root package sources/tests select only the bundle; shared runner scripts select its runner tests and list other affected workspaces. Root manifests/lock/config list affected packages for manual selection. Helper edits select the helper itself and list its declared consumers. Unmapped paths are reported. With `--list`, the Node entry prints selected npm names to stdout and impact diagnostics to stderr. Use `npm run --silent test:changed -- --list` to omit npm’s banner.

## Before a release only

```sh
npm run test:release -- --list
npm run test:release
```

The release command starts one worker per package, including integrations. It retains each component’s SDK coverage and writes logs, connector case records and the summary to `.runtime/test-release/`. Never run the release tests during regular development.

See [the package inventory comparison](TESTING-INVENTORY.md) for the test-split verification and unchanged known failures.

## Independence

Tests may import their own files or package, Node built-ins, and declared dependencies by package name through their public exports. Declare shared test helpers as dev dependencies in each consumer. Do not import other workspaces’ source or tests by path, or inherit a nested package’s dependency declarations from its parent. Cross-package scenarios belong in release-only integration workspaces. The runner checks static imports, re-exports, literal `import()` and `require()` calls, common path-literal references, and the existing amenity boundaries before executing the package.
