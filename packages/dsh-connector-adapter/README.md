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
