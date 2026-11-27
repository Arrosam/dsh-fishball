# Fishball for DeepSeek Harness

The Fishball, DSH Connector, and hosted Fishball sources live in this repository. They keep their own package names, versions, install methods, and test runners. The repository root is a private npm workspace, not a DSH plugin.

| Work on | Start here |
| --- | --- |
| Fishball core, embedded UI, and shared library | [Fishball](dsh-fishball/README.md) · [Design](dsh-fishball/DESIGN.md) |
| DSH-side connector and its independently installable adapter | [DSH Connector](dsh-connector/README.md) |
| Hosting Fishball as a child DSH | [Fishball Instance](dsh-fishball-instance/README.md) |
| Fishball child-profile amenities | [fishball-amenities](amenities/fishball-amenities/README.md) |
| Main Web-profile amenities | [dsh-connector-amenities](amenities/connector-amenities/README.md) |

The two sides still communicate over the connector's public MCP surface. An amenity can use its own environment and that environment's shared library, but cannot depend on another amenity or either umbrella. The umbrellas package and configure their members; they do not provide a shared runtime library.

Run one package at a time from this root with `npm test --workspace <npm-name>`. Continue to use each component's documented runner and pack command. The [workspace guide](docs/layout.md) maps release and source locations. For the external one-click install, see [dsh-fishball-bundle](https://github.com/Arrosam/dsh-fishball-bundle).

[License](LICENSE) · [Development rules](AGENTS.md)
