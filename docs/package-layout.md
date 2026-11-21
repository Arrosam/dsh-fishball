# Package layout (V3)

The repository holds nine packages (one, `fishball-board`, shelved: not in 1.0.0-alpha.1) in two sides that never import each other (requirements
R-ARCH-10; design §1.0). The root `package.json` is private and not a plugin; it only lists the
workspaces. Install, uninstall and the supported DSH versions are in the [README](<../README.md>).

## Tree

```
package.json                    root, private, workspaces only
packages/
  dsh-connector/                DSH side, plugin: the MCP endpoint and OAuth server (backend)
    index.js                    the row; cordis.patch.yml inserts it
    client.js                   its own settings page (tokens, designated agent, approval port, limits)
    src/                        mcp/ (http, oauth, oauth-web, tools), tokens/, pairs/, mailbox/,
                                routing/, handover/, hosted/, revocation/, contrib/, ui/, settings/
    mcp-schema/  tools/         ./mcp-schema and ./tools: the frozen K1/K2 data-and-types modules
    host-services/              K3 type contracts of the host-only services (types only)
    contract/                   the V2 ./contract export, removed by C-WIRE-2
    locale/  assets/
  dsh-connector-ui/             DSH side, plugin: the connector's frontend
    index.js  src/host/         host half: service lookup, connector-missing / instance-missing,
                                the notify and attention tools, its own Fetch routes
    src/client/                 client.js with client.shell.js, client.marks.js, client.attention.js
  dsh-instance/                 DSH side, plugin: the hosted child
    host.js                     the row
    client.js client.status.js client.models.js   its own settings page
    native-child.js child-row.js                  the child's lifecycle row and child-side row
    uninstall.js                the cleanup command
    src/native-runtime/         launch, lifecycle, placement, overlay, wire
    src/host/                   hosted token, locator, routes, model sync, first-install sync
    src/child/                  the child halves of model sync
    bundled/                    release output only (the placed Fishball plugins); never committed
  dsh-connector-adapter/        DSH side, plugin: OAuth for a stock dsh-mcp-client row
  dsh-connector-shared/         DSH side, library (no `dsh` field): provider-sync, files, redact,
                                request-host, oauth-client
  core/                         Fishball side, plugin `fishball-core`: the backend
    client.js client.settings.js   its own settings page
    contracts/                  K3/K3a types, and constants.js (runtime values, MCP and LINK)
    src/                        main/, manager/, link/, events/, asks/, bridge/, guards/,
                                identity/, session/, settings/, status/
  fishball-ui/                  Fishball side, plugin: every UI change in a Fishball DSH
    client.js client.{entries,asks,strip,model}.js
    fishball-page/  fishball-recommend-plugins/  fishball-child-plugins/   their own small packages
  board/                        Fishball side, plugin `fishball-board`: shelved, not in 1.0.0-alpha.1
  fishball-amenities/taskboard/ Fishball side, component `fishball-taskboard` of the amenities bundle: task board and memo pad
  shared/                       Fishball side, library `fishball-shared` (no `dsh` field): ui-seam
```

## Rules

- **No cross-side import.** No DSH-side package imports, peers, vendors, bundles or generates code
  from a Fishball-side package, and the reverse (R-ARCH-10). The only coupling is the connector's
  public MCP surface. Core keeps its own copy of the constants it needs (`core/contracts/constants.js`
  `MCP`, `LINK`), checked against the connector by contract tests.
- **One library per side.** `dsh-connector-shared` and `fishball-shared` hold only modules that at
  least two packages of their own side use (R-ARCH-08, strict reading since REMOVE-V2b). Each user
  lists its library in `dependencies` and `bundleDependencies`, so its tarball carries it.
- **Chunks, not folders, for browser code.** DSH serves a package's `client.js` and only
  `client.<name>.js` files beside it, so browser parts are flat chunks.
- **The instance carries the Fishball plugins as data.** In a packed `dsh-instance`, `bundled/`
  holds `fishball-ui` and `core` (`fishball-board` is shelved, not in 1.0.0-alpha.1), each exactly its package's `files` plus `package.json`
  and its own bundled libraries. In a checkout, placement reads the sibling workspace folders. The
  host DSH never resolves or loads them.

## Packing

The release step (task REL-PACK) builds every tarball: one shared version `1.0.0-alpha.1`,
`engines.dsh` `>=0.2.1-rc.5`, the bundled libraries, and the instance's `bundled/`. Until it lands,
`npm pack` in a package folder gives a tarball of that package alone, and a packed `dsh-instance`
without `bundled/` cannot place the Fishball plugins (`PLACEMENT_SOURCE_UNAVAILABLE`).
