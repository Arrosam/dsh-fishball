# DSH Fishball Instance

> **Looking to install Fishball or connect an agent via MCP?**
> This repository holds the underlying `dsh-instance` package for **advanced users and developers**. For the one-click embedded bundle (`dsh-fishball-bundle`), standalone setup, and MCP integration guide, see **[`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle)**.

Bridge plugin (`dsh-instance`) that installs and runs a hosted Fishball child DSH inside your main
DeepSeek Harness (DSH), connecting it to `dsh-agent-connector`. Split from `dsh-fishball@84078e5f`.

This README is the repository's index: every package and document is listed here, and each package's
own README describes that package.

## Packages

| Folder | Package | Shipped | What it is |
| --- | --- | --- | --- |
| [packages/dsh-instance](<packages/dsh-instance/README.md>) | `dsh-instance` | yes (npm, `alpha`) | The plugin: launches Fishball in a private child DSH profile under `<DSH_HOME>/fishball/runtime`, places `fishball-core` (with `fishball-ui`) and `fishball-amenities` in it, provisions a hosted token from `dsh-agent-connector`, syncs model providers, its settings page, Fishball's plugins on DSH's Plugins page, and the `uninstall.js` cleanup command. |
| [packages/test-helpers](<packages/test-helpers/README.md>) | `@dsh-instance/test-helpers` | no (private) | Shared test tools: per-SDK module binding, case naming, scratch folders, waits, a scripted DSH page, a real host DSH, and the test runner. |

## Integration packages

Run only before a release. Each tests this repository's packages together with packages of the
sibling checkouts `dsh-connector` and `dsh-fishball`, which they only read.

| Folder | What it tests |
| --- | --- |
| [integration/hosted-child](<integration/hosted-child/README.md>) | A real host DSH with the real connector and a real hosted child: placement and the bundle switches across restarts, the start lifecycle, the hosted token and pairing, Fishball's plugins managed from the main DSH, Restart. |
| [integration/connector](<integration/connector/README.md>) | The instance against the real `dsh-agent-connector`: the K3 `dshInstanceChild` contract it publishes, and reinstall succession end to end. |
| [integration/fishball-core](<integration/fishball-core/README.md>) | The child profile composed with the real `fishball-core` patch (guards, presets, sandbox), and the placed copy of core equal to npm pack's file list. |
| [integration/release](<integration/release/README.md>) | `scripts/pack.mjs` and its `--check`, and a packed instance placing fishball-core from its bundled tarball offline. |

## Testing

- **Day to day**, test one package: `npm test` in its folder (or
  `node scripts/test-package.mjs <folder> [path …]`). There is no whole-repository run.
- **Before a release**: `npm run test:release` runs every package and every integration package at
  once, one worker process each, and prints one line per package; logs go to
  `.runtime/test-release/<run>/`. It needs the sibling checkouts beside this repository's main
  checkout (or `DSH_CONNECTOR_REPO`, `FISHBALL_REPO`), the Fishball release folder for
  integration/release, and the installed DSH SDKs 0.2.1-rc.5 and 0.2.2-rc.1.

Each run gets its own throwaway HOME, temp and XDG folders and never uses your `DSH_HOME`. Nothing
is installed; the runner links the workspace packages into `node_modules/`.

| Document | What it holds |
| --- | --- |
| [docs/testing/writing-tests.md](<docs/testing/writing-tests.md>) | The rules: where a test lives, how a case is written and named, regression cases, no time limits, classifying a failure. |
| [docs/testing/inventory.md](<docs/testing/inventory.md>) | Every behaviour the old `test/v3` suites covered, how it fared on the old code, and where it is tested now. |
| [docs/testing/coverage.md](<docs/testing/coverage.md>) | The check of the new tests against that inventory, and every expectation that was rewritten. |
| [docs/testing/regressions.md](<docs/testing/regressions.md>) | Each fix's regression cases and how they were shown to fail before the fix. |
| [docs/testing/bugs.md](<docs/testing/bugs.md>) | Real bugs the tests found (four, none fixed on this branch), open until fixed. |

## Install and uninstall

For the one-click setup use [`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle)
instead; do not install the bundle alongside `dsh-instance`. For a manual install, see the
[installation options](<packages/dsh-instance/README.md#installation-options>). The hosted token
comes from `dsh-agent-connector`; without it the child still starts, with no parent target.

DSH runs no plugin code on removal, so remove the instance's private data first. Quit DSH (that also
stops the child), then:

```bash
node <profile>/node_modules/dsh-instance/uninstall.js [--home <DSH_HOME>]
```

It removes `<DSH_HOME>/fishball/runtime` and nothing else (the connector's data, and `hosted.json`
beside the runtime folder, stay). Exit 0 when removed or absent, 1 when refused, 2 for a bad argument
list. It refuses, deleting nothing, with:

| Code | Meaning |
| --- | --- |
| `CHILD_RUNNING` | The recorded child still runs: quit DSH, wait a few seconds, run it again. |
| `CHILD_STATE_UNKNOWN` | Whether the child runs cannot be checked: `/bin/ps` cannot run here (run it where it can), or the launch record is missing (stop DSH, check no Fishball child is left, delete the folder yourself). |
| `UNSAFE_DIRECTORY` | A symbolic link in the runtime path or its layout. |
| `UNOWNED_RUNTIME` | The owner marker names another home. |
| `INVALID_MAIN_HOME` | The home is not a canonical real path. |

Then remove the package on DSH's Plugins page or with `dsh plugin remove dsh-instance`.

For the opt-in `remoteEmbedUrl` override and companion sidebar patch, see
[Remote embedding](<packages/dsh-instance/README.md#remote-embedding-opt-in>).

## Local development and packing

- In a checkout, `dsh-instance` places `fishball-core` and the Fishball amenities from
  `$FISHBALL_REPO/packages/` or the sibling `dsh-fishball/packages/` checkout.
- `npm run pack` builds the release into `.runtime/release/<version>/`; pass `--fishball-release <dir>`
  (or set `FISHBALL_RELEASE_DIR`, or pack `../dsh-fishball` first) to embed the Fishball core and
  amenities tarballs in `bundled/`. `npm run pack:check` checks an existing release offline.

## Related repositories

- [`dsh-fishball-bundle`](https://github.com/Arrosam/dsh-fishball-bundle): the all-in-one embedded bundle and user-facing setup guide.
- [`dsh-connector`](https://github.com/Arrosam/dsh-connector): the generic DSH MCP connector (`dsh-agent-connector`, `dsh-connector-adapter`,
  `dsh-connector-shared`, …).
- [`dsh-fishball`](https://github.com/Arrosam/dsh-fishball): the Fishball plugins (`fishball-core`, `fishball-shared`, the amenities).
