# connector-contract: the dsh-connector's published K1 and K2 modules, vendored

`dsh-connector` (npm `dsh-agent-connector`) moved to its own repository in 6b7c53bf. Fishball's tests
still need its published contract, so its two modules are copied here as they are:

| export | folder | what |
|---|---|---|
| `fishball-test-helpers/connector-contract/mcp-schema` | [mcp-schema/](<mcp-schema/README.md>) | K1: the MCP surface, OAuth documents and challenges, pairing rules, events |
| `fishball-test-helpers/connector-contract/tools` | [tools/](<tools/README.md>) | K2: the contribution service's names, limits and validators |

Version mirrored: neither module's README names a dsh-connector release. The copy is the one of
`test/fixtures/dsh-connector-contract/` at 165b734c ("Pin the connector contract with
workspaces_list and models_list"), which matched dsh-agent-connector's `feat/connector-discovery-tools`
branch (DISCOVERY-TOOLS and WAKE-REDUCE amendments of 2026-11-21).

Rules: never edit a file here by hand. When the connector changes its contract, copy its modules
again (both folders, unchanged) and update the paragraph above. The modules import no DSH package and
load in plain Node.
