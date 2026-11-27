# dsh-connector-ui

The Fishball UI part of [`dsh-agent-connector`](<../README.md>). It is a component shipped inside
the `dsh-agent-connector` tarball (`./ui/`), not a package of its own: it has no npm release and no
workspace. The connector's `cordis.patch.yml` inserts its row (`dsh-connector-ui`, loaded from
`./ui/index.js`) beside the connector's own.

## What it does

The connector is the backend and this component its frontend. It draws; every state and operation
is the connector's UI backend (`dshConnectorUi`). It holds no state and stores nothing.

- **Sidebar entries.** One fish entry in DSH's sidebar for each connected agent whose window this
  DSH can open (today the Fishball that `dsh-instance` hosts here), named after the agent. No entry
  while there is no such agent. DSH's own brand mark and name are not changed.
- **The window.** DSH's main area, opened by an entry, showing the hosted child's page through the
  instance's admission. A child that is not ready shows its state and a Retry link to the
  instance's own settings page.
- **The light and the notify prompt.** A dot on the fish while an agent has lit it or a notice is
  waiting; an important one animates the fish. A notice shows as a bubble beside the fish until you
  click it or open the window.
- **Tools for agents**, declared through the connector's contribution service:
  `embed-ui.notify` (show the user a short notice), `embed-ui.attention.signal` (light the fish) and
  `embed-ui.attention.state` (read the light).

Hand over / Take back, "Managed by" and the managed row mark are not here: they are the
connector's own (`client.marks.js`), so every DSH with the connector shows them.

Without a local connector the component logs one `connector-missing` error and draws nothing.
Without a usable `dshInstanceChild` it logs one `instance-missing` warning. If the connector's
browser entry cannot be loaded, it logs one warning and registers nothing.

## Structure

```
packages/dsh-connector/ui/
  index.js                        host half: the row's apply (routes, missing-service report, tools, window offer)
  src/host/constants.js           fixed values: services, routes, admission rule, log lines
  src/host/services.js            looks up dshInstanceChild, dshConnectorUi, dshConnectorTools at run time
  src/host/routes.js              owner-only routes /api/dsh-connector-ui/{services,child/status,child/admit}
  src/client/client.js            browser half: loads the connector's client entry, then the parts below
  src/client/client.shell.js      the sidebar entries, the window, the style sheet and dictionary
  src/client/client.attention.js  the fish's light and the notify prompt
  assets/connector-ui-icon.svg    the component's icon
  locale/                         the Plugins page title
  tests/                          the component's suites
```

`package.json` (name `dsh-connector-ui`, private) lists `dsh-agent-connector` in
`dsh.client.external`: `client.js` loads the connector's client entry (its `ui` export: the
snapshot stream, the POST helper, the value store) before the shell, so a page opens one stream
for both.

## Testing

Its suites belong to the connector package and run with it:

```bash
npm test --workspace dsh-agent-connector
```

To run the component alone:

```bash
node packages/dsh-connector-test-helpers/src/runner/cli.mjs packages/dsh-connector/ui
```

| `tests/` folder | What it checks |
| --- | --- |
| `contract/embed` | R-EMBED: manifests, packed listings and import specifiers; a main DSH boots with and without this component, and the UI comes only from it. |
| `draw` | U-DRAW: it draws, the connector holds every operation and all state (entries, window, light, notify prompt). |
| `layout` | UI-FIX-D: the layout at narrow widths, in real DSH processes drawn by a headless Chromium. |
| `shell` | U-SHELL: one sidebar entry per agent with a window, no brand override, the missing-service lines, the routes. |
| `wire` | U-WIRE: install combinations, service availability and `apiVersion`. |

The `shell` and `contract/embed` suites boot DSH with the older host worker in
`dsh-connector-test-helpers/legacy-host`. The component's icon is also checked with every other
package's in [`integration/package-icons`](<../../../integration/package-icons/README.md>).

## Licence

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
