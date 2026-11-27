# dsh-connector-adapter

Lets this DSH sign in to another DSH's `dsh-agent-connector` through DSH's stock MCP client
(`dsh-mcp-client`), with normal OAuth. Its own package and DSH bundle; it is also installed by the
`dsh-connector-amenities` umbrella.

Settings: `clientMetadataUrl` and `servers` (`[{serverName, url}]`). Installed through the umbrella,
edit them on its component page (open `dsh-connector-adapter` on the umbrella's plugin page); a
saved change re-applies the adapter at once. Installed alone it has no settings page (it has no
browser code): edit its row's `config` in the profile's `cordis.patch.yml`. A duplicate server
name or a URL that is neither https nor http on a loopback host stops the row from starting.

It depends on no other DSH-side plugin and on nothing of the Fishball side.

## Structure

```
packages/dsh-connector-adapter/
  index.js               the row: one server object per configured connector
  src/server.js          one configured server: its grant, sign-in attempt, refresh timer and child row
  src/oauth-client.js    the OAuth browser client (authorization code with PKCE, refresh)
  src/connector-check.js recognises a dsh-connector endpoint by the metadata it serves
  src/proxy.js           the loopback proxy that swaps the child's local bearer for the access token
  src/sign-in-tool.js    the agent tool `dsh_connector_sign_in`
  src/constants.js       names, states, results, proxy rules and limits
  cordis.patch.yml       inserts the dsh-connector-adapter row
  assets/  locale/       the icon; the Plugins page title
  tests/                 the package's suites
```

## Testing

```bash
npm test --workspace dsh-connector-adapter
```

| `tests/` folder | What it checks |
| --- | --- |
| `adapter` | The adapter in an in-process DSH with the real credential store and `dsh-mcp-client`, against a fake connector: sign-in, refresh, restart, the DSH-connector check, the review rows ([use cases](<tests/adapter/USE-CASES.md>)). |
| `live-config` | Its settings are live: schema fields, `clientMetadataUrl` set / unset, server list changes without a remount, refusals ([use cases](<tests/live-config/USE-CASES.md>)). |
| `oauth-client` | `src/oauth-client.js`: the client-id URL rule, discovery, one attempt, single-flight refresh, no request outside the injected fetch ([use cases](<tests/oauth-client/USE-CASES.md>)). |

The tests speak the connector's published contract (`dsh-agent-connector/mcp-schema`) to their
fake connector; no integration package covers the adapter. Its icon is checked with the others in
[`integration/package-icons`](<../../integration/package-icons/README.md>). See [the testing guide](<../../docs/testing/README.md>).

