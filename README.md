# Fishball

Fishball is an always-on personal assistant for DeepSeek Harness (DSH). It keeps one long-lived session that gathers information from your other sessions, from plugins and from you. It manages your daily life and work as an information-processing centre: it reads, sorts, decides and delegates, but does no work itself and never writes local files.

The design is in [DESIGN.md](DESIGN.md) and [docs/slim-native-design.md](<docs/slim-native-design.md>). The original brief is [SMART-PROMPT.md](SMART-PROMPT.md).

## Status

Release **0.1.0-alpha.0**: two plugins, `fishball-connector` and `fishball-instance`, both published to npm at version `0.1.0-alpha.0`, connector contract 1.1. Both packages' `alpha` and `latest` tags currently point to this version. This is an alpha release, not a stable release; the install commands below pin the version explicitly.

The earlier single plugin `dsh-fishball` (v0.1.0, tag `v0.1.0`) is replaced. **There is no migration from it:** nothing of the old plugin (its session, history, settings, grants or plugins) is carried over. Remove it before installing this release (below). The older "dsh-fishball (df)" preview is archived at tag `archive/df-preview-2026-10-23`.

## Packages

- **`fishball-connector`** ([packages/connector](packages/connector)): the body, in your main DSH profile. It manages your sessions for Fishball (Hand over, `message_fishball`, permission requests, questions, watches), draws Fishball's view and the frame around it, and offers an instance the documented connector contract ([docs/connector-contract.md](<docs/connector-contract.md>), version 1.1). Its limits are changed only in DSH's own settings form for `fishball-connector`. It also works alone: with no instance, Fishball's view shows an empty state.
- **`fishball-instance`** ([packages/instance](packages/instance)): the built-in instance. It runs Fishball in its own private DSH profile, which is attached to the main DSH and stops with it, and serves Fishball's chat and settings pages. It needs the connector: without it, the instance's card says "connector missing" and nothing starts. It never installs the connector.

The repository root is not a plugin. See [docs/package-layout.md](<docs/package-layout.md>).

## Supported DSH versions

- DSH **0.2.1-rc.5** and **0.2.2-rc.1**, the versions this release is built and tested against, either the DSH Web build or the one bundled with DSH-X. The manifests' `engines.dsh` reads `>=0.2.1-rc.2`, but only these two versions are supported.
- Node: whichever one runs your DSH. The instance starts its child with DSH's own executable and arguments, so there is nothing to set. The plugins declare Node 22 or later; DSH 0.2.2-rc.1 itself declares Node 24.9 or later.

## Install

The commands use the profile `web`; use your own profile name after `--profile`.

1. **Remove the old `dsh-fishball` first**, if it is installed. There is no migration. Quit DSH, then run:

   ```bash
   dsh plugin --profile web remove dsh-fishball
   ```

2. **Install the connector, then the instance**, into the same profile, from npm:

   ```bash
   dsh plugin --profile web add fishball-connector@0.1.0-alpha.0
   dsh plugin --profile web add fishball-instance@0.1.0-alpha.0
   ```

   Install the connector first. The instance declares it as a peer (`fishball-connector >=0.1.0-alpha.0 <2`), and DSH does not install peers by itself. pnpm also lists DSH's own packages as missing peers; DSH provides them when it runs, so that warning is expected.

3. **Start DSH** as usual. The two plugins find each other by themselves; no profile edit is needed. Fishball starts once DSH is ready. On its first start the instance creates its private profile under `<DSH_HOME>/fishball/runtime`. The DSH home must be a canonical real path, not a path through a symbolic link such as `/tmp` (`/private/tmp` on macOS); otherwise the instance reports `INVALID_MAIN_HOME` and does not start.

To use the connector with your own instance, install only the connector in step 2.

### Install from local tarballs

For a local build, pack each package from its own folder (see [docs/package-layout.md](<docs/package-layout.md>)), then use the resulting tarballs instead of the npm package names in step 2. From the repository root:

```bash
(cd packages/connector && npm pack)
(cd packages/instance && npm pack)
dsh plugin --profile web add ./packages/connector/fishball-connector-0.1.0-alpha.0.tgz
dsh plugin --profile web add ./packages/instance/fishball-instance-0.1.0-alpha.0.tgz
```

The same installation order and startup steps apply.

## Uninstall

DSH runs no plugin code when a plugin is removed. Remove on the Plugins page stops the plugin as Disable does, and `dsh plugin remove` only runs pnpm. So `fishball-instance` ships a cleanup command, `uninstall.js`. Run it **with DSH quit, before you remove the package**.

### `fishball-instance`

1. Quit DSH. That also stops Fishball's child process.
2. Run the cleanup command from the package installed in your profile:

   ```bash
   node ~/.dsh/profiles/web/node_modules/fishball-instance/uninstall.js
   ```

   It works on DSH's home: `$DSH_HOME` if it is set, else `~/.dsh`. For another home, add `--home <DSH_HOME>` and run the copy in that home's `profiles/<profile>/node_modules/fishball-instance/`.
3. Remove the package:

   ```bash
   dsh plugin --profile web remove fishball-instance
   ```

   You can also start DSH again and remove it on the Plugins page.

**What it removes:** the whole `<DSH_HOME>/fishball/runtime` tree the instance created, and nothing else. That covers the child's DSH home `dsh-home` (Fishball's own profile, its chat session, settings, model keys and plugins), `launches`, `workspace`, `os-home`, `agents-home`, `tmp`, and the runtime's owner marker, secret and logs. Your main profile, your sessions, the connector's data and every other file under `<DSH_HOME>` stay as they are. A symbolic link inside the tree is removed as a link; what it points to is never touched.

**When it refuses**, it removes nothing at all and prints a code:

| Code | Meaning |
| --- | --- |
| `CHILD_RUNNING` | Fishball's child may still be running: DSH is not quit yet, or the child's state cannot be read. Quit DSH, wait a few seconds and run it again. |
| `UNSAFE_DIRECTORY` | A folder on the way (`fishball`, `runtime` or one inside it) is a symbolic link, not private to you, or not a folder. |
| `UNOWNED_RUNTIME` | The tree belongs to another DSH home: its owner marker names a different home. |
| `INVALID_MAIN_HOME` | The home is not an absolute real path (for example, it is itself a symbolic link). Pass the real path with `--home`. |

"Nothing to remove" (exit code 0) means that home has no tree. If you removed the package without running the command, quit DSH and delete `<DSH_HOME>/fishball/runtime` yourself.

### `fishball-connector`

Remove it like any plugin: `dsh plugin --profile web remove fishball-connector`, or on the Plugins page. Its own data is kept, as for any DSH plugin. An instance that is still installed then shows "connector missing" and stops its child.

### Reinstall

Install both packages again as above. After the cleanup command, the instance starts with a fresh private profile.

## Bring your DSH models into Fishball

On the instance's card on DSH's Plugins page, **Model for Fishball** → **Check for new models** lists only the API-key providers you set up in DSH that Fishball does not have yet and whose endpoint uses https. OAuth/login providers, providers with custom headers and non-https endpoints are not offered; log in to OAuth/login providers inside Fishball. Tick the ones to add, then press **Add selected**. Only what you tick is added. Providers and keys Fishball already has are kept. Keys never reach the page, the logs or the chat.

## Licence

[MIT](LICENSE). See [packages/connector/THIRD_PARTY_NOTICES.md](packages/connector/THIRD_PARTY_NOTICES.md) and [packages/instance/THIRD_PARTY_NOTICES.md](packages/instance/THIRD_PARTY_NOTICES.md).

The repository is public on GitHub.
