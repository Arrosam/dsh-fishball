# dsh-connector-adapter

Lets this DSH sign in to another DSH's `dsh-agent-connector` through DSH's stock MCP client
(`dsh-mcp-client`), with normal OAuth. Configure its servers and its client metadata URL in its own
component settings. Its own package and DSH bundle; it is also installed by the
`dsh-connector-amenities` umbrella.

It depends on no other DSH-side plugin and on nothing of the Fishball side.
