# Package layout after M1

M1 split the repository into two plugins. This page maps the paths in `docs/slim-native-design.md`
§0.2 and §18.1 to the real ones. Use the real paths in later C and I tasks and in the tests.

**Rule:** each package keeps the relative structure the files had before the split (user decision,
2026-11-07). Nothing was flattened, for two reasons. `src/persona.js` and `src/slim/child/persona.js`
would both become `child/persona.js`. And `child/ui/` is reserved for I4's new client plugin, while
the old custom UI is still served from `src/slim/ui/`. Except for the edges listed under "What
changed in code" below, every file moved unchanged (`git mv`).

## Tree

```
package.json                 root, private, not a plugin: workspaces packages/connector, packages/instance
packages/connector/          npm fishball-connector 1.0.0 (major = contract major)
  package.json               exports ".", "./client", "./contract", "./package.json";
                             dsh.bundle.patch ./cordis.patch.yml; dsh.client (platform web)
  cordis.patch.yml           inserts exactly one row: id fishball-connector, name fishball-connector
  index.js                   the row (was the root index.js)
  client.js                  the browser half (was the root client.js); module id fishball-connector
  assets/icon.svg            the package icon (was assets/icon.svg)
  contract/                  the public contract, the "./contract" export (was src/connector/)
    index.js                 the export entry: re-exports the five modules below
    contract.js limits.js card-record.js inbox-markers.js attachment-transfer.js
    pile-note.js             PILE_NOTE (was src/pile-note.js), shared wording
  src/*.js                   main-side session work (was src/*.js; list in §0.2 "connector")
  src/slim/host/{bridge,session-port,approvals,images}.js
  src/connector-service.js   the `fishballConnector` service, the contract's binding (C1)
  src/slim/{contract,limits,card-record,inbox-markers,attachment-transfer}.js
                             re-export shims of ../../contract/*, so old import paths keep working
  LICENSE THIRD_PARTY_NOTICES.md
packages/instance/           npm fishball-instance 0.1.0
  package.json               exports ".", "./native-runtime", "./native-control", "./package.json";
                             dsh.bundle.patch ./cordis.patch.yml; peerDependencies fishball-connector ^1
  cordis.patch.yml           inserts exactly one row: id fishball-instance, name fishball-instance
  host.js                    the row (was native-host.js)
  native-child.js            the child's lifecycle row (was native-child.js)
  src/native-web.js src/native-preflight.js src/recommended.js src/persona.js
  src/provider-sync{,-service,-coordinator,-host}.js
  src/native-runtime/**  src/native-control/**
  src/slim/child/**          the child app (unchanged paths inside the package)
  src/slim/ui/**             the custom chat UI (retired by I8)
  src/slim/host/{embed,fetch-routes,admin,settings-routes,provider-sync-routes}.js
  src/slim/{contract,limits,card-record,inbox-markers,attachment-transfer}.js
                             re-export shims of `fishball-connector/contract`
  LICENSE
```

Deleted with no replacement: the root `cordis.patch.yml`, root `index.js`, `client.js`,
`native-host.js`, `native-child.js` (all moved) and the root `src/`. `packages/messenger/` is
unchanged; I8 retires it. No package ships it.

## §0.2 / §18.1 path → real path

| Design path | Real path |
| --- | --- |
| `packages/connector/records.js` (C3) | not created by M1; C3 creates it at that path |
| `packages/connector/contract/` | `packages/connector/contract/` (as designed) |
| `src/connector/*.js` (K1) | `packages/connector/contract/*.js` |
| `src/connector-service.js` (C1) | `packages/connector/src/connector-service.js` |
| `src/intake.js`, `src/config.js`, `src/settings-migration.js` (C1, C2) | `packages/connector/src/…`; `src/preferences.js` is deleted (C2, D22) |
| `packages/instance/host.js` | `packages/instance/host.js` (as designed) |
| `src/host/binding.js` (I1) | `packages/instance/src/host/binding.js` (new, I1) |
| `src/host/embed.js` (I3) | `packages/instance/src/slim/host/embed.js` |
| `src/host/model-sync-routes.js` (I6) | `packages/instance/src/slim/host/model-sync-routes.js`, beside `provider-sync-routes.js` |
| `src/slim/host/provider-sync-routes.js` | `packages/instance/src/slim/host/provider-sync-routes.js` |
| `src/provider-sync-service.js` | `packages/instance/src/provider-sync-service.js` |
| `src/native-runtime/*.js` (I2) | `packages/instance/src/native-runtime/*.js` |
| `child/native-child.js` (I2) | `packages/instance/native-child.js` |
| `child/app.js` (I2, I5) | `packages/instance/src/slim/child/app.js` |
| `child/chat.js` (I5) | `packages/instance/src/slim/child/chat.js` |
| `child/persona.js` (I5) | two files: the persona text is `packages/instance/src/persona.js`, the row that registers it `packages/instance/src/slim/child/persona.js` |
| `child/admin.js` (I6) | `packages/instance/src/slim/child/admin.js` |
| `child/settings-routes.js` (I6) | `packages/instance/src/slim/child/settings-routes.js` (new; the old main-side one is `src/slim/host/settings-routes.js`) |
| `child/{server,auth,decisions,images,reminders,approvals}.js` (I8) | `packages/instance/src/slim/child/…` |
| `child/ui/**` (I4, I6, I7, I9) | `packages/instance/child/ui/**` (new; the reserved path, kept apart from the old `src/slim/ui/`) |
| `child/package.json` `dsh.client` (I4) | `packages/instance/child/ui/package.json` or equivalent, I4 decides; the snapshot copy must include it (`copyChildCode`) |
| `src/slim/ui/**` (I8) | `packages/instance/src/slim/ui/**` |
| `src/native-control/**` (I8) | `packages/instance/src/native-control/**` |

## What changed in code (the cross-package edges)

- **Row ids and names.** `fishball` became `fishball-connector`, and `fishball-native-host` became
  `fishball-instance` (§0.2, D22). The connector's `PLUGIN.name`, the client's module id,
  `PACKAGE_NAME` and `ENTRY_ID` (the settings namespace) follow. M1 does no settings migration;
  that is C2.
- **Contract.** The `./contract` export is `packages/connector/contract/index.js`. Its 68 names are
  K1b's five modules plus `PILE_NOTE`, as listed in `docs/connector-contract.md` §10. Connector
  code imports it by relative path. Instance code imports only `fishball-connector/contract`,
  through its own `src/slim/*` shims and `src/persona.js`.
- **Child snapshot.** `copyChildCode` no longer copies `src/connector` or `src/pile-note.js`. It
  places `node_modules/fishball-connector/` in the snapshot, holding a manifest with the one
  `./contract` export and the `contract/` directory, so the child resolves the same import inside
  its private profile.
- **The binding (C1).** The connector row provides the contract's `fishballConnector` service
  (`src/connector-service.js`, contract §1) from apply, with or without an instance. The built-in
  instance reads it with `ctx.get` on each authenticated wire and calls `attachInstance` with its
  lifecycle host id as the descriptor's `id`; that id is also the bridge host's frame identity. A
  replaced wire detaches before it attaches (a child restart is a detach and a new attach). M1's
  interim `fishballConnectorBridge` is gone. The `ui`, `status` and `retry` fields are I1's.
- **Injects.** The connector row now injects `llm` (the session port's model path read it on the
  native host before). The instance row no longer injects `sessionProjections`.
- **Without the connector**, the instance's wire comes up unbridged: no session operations, no
  crash. `connector-missing` is I1's.
- `PLUGIN_KIND` and `FISHBALL_INSTALLED_PREFIX` moved from the connector's `src/constants.js` into
  `packages/instance/src/recommended.js`, their only reader.
- The two spikes that imported `src/approvals.js` and `src/digest.js` now import them from
  `packages/connector/src/`.
- Not touched: `test/`, `docs/slim-native-design.md`, `packages/messenger/`.

## Packing

Pack each package from its own folder; the root is not packable as a plugin:

```bash
(cd packages/connector && npm pack)     # fishball-connector-1.0.0.tgz, 58 entries
(cd packages/instance  && npm pack)     # fishball-instance-0.1.0.tgz, 62 entries
```

Neither tarball contains the other package's files. The instance tarball does not contain the
contract: at runtime it resolves `fishball-connector/contract` from the installed connector.
Installed on its own, without the connector, the instance's host row fails to import, and DSH logs
that error and boots on (cordis-plugin-loader logs a failed plugin import and goes on). I1 must
make the optional `ctx.inject` binding and `connector-missing` work with that in mind.

## For the tester (test harness re-pointing, conn-OQ-28)

M1 left `test/` untouched. The harness must change as follows:

1. The repository root is **no longer a plugin package**. It has no `main`, `exports`, `dsh` or
   peer fields, and the old `PACKAGE_NAME = 'dsh-fishball'` link to the root no longer loads
   anything.
2. Link or install `packages/connector` as **`fishball-connector`** and `packages/instance` as
   **`fishball-instance`**. Add both names to the profile's bundles, or use the tarballs from
   `npm pack` with `dsh plugin add`.
3. Row ids are **`fishball-connector`** and **`fishball-instance`**, and the row names are the same
   package names. `fishball` and `fishball-native-host` exist no longer. The settings namespace of
   the connector's form is `fishball-connector`.
4. Module paths moved. Import connector modules from `packages/connector/src/…`, the contract from
   `packages/connector/contract/index.js` (or `fishball-connector/contract`), and instance modules
   from `packages/instance/src/…`. `native-host.js` is `packages/instance/host.js`.
   `src/connector/*.js` is `packages/connector/contract/*.js`.
5. An instance module that imports the contract needs `fishball-connector` resolvable from the
   instance package: a `node_modules/fishball-connector` link next to it, a workspace install, or
   both tarballs installed in one profile.
6. The bridge now lives on the connector row. A test that started only the native host row and
   expected session operations must also mount the connector row. A test that read the native
   host's `inject` list should expect `llm` on the connector and no `sessionProjections` on the
   instance.
7. The child snapshot holds `node_modules/fishball-connector/` and no `src/connector/` or
   `src/pile-note.js`. Its other paths are unchanged.
8. The client module registers as `fishball-connector`, not `dsh-fishball`. The messenger package
   is still `dsh-fishball-messenger`, but no plugin ships it.
