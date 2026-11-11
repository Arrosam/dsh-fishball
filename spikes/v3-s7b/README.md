# V3-S7b spike (throwaway)

Prototype for [docs/spikes/v3-s7b.md](../../docs/spikes/v3-s7b.md). Not product code.

- `as-plugin.mjs`: a DSH plugin inserted by a launch patch row. The connector's authorization server for
  both grants (metadata, token endpoint and MCP gate on DSH's listener; the token-only approval page on
  its own approval listener), plus a control route standing in for the native settings form.
- `cimd-fetch.mjs`: Client ID Metadata Document fetch with the SSRF limits, used by the plugin.
- `launch.mjs`: boots a disposable DSH (`--profile web`, 127.0.0.1, port 0) under `../../.runtime/`.
- `world.mjs`, `fixtures.mjs`: throwaway CA/certs (openssl), a stand-in public client host serving CIMD
  documents, and a local TLS-terminating proxy that plays the user's tunnel (`https://fb.example`).
- `browser.mjs`: the scripted browser (open page, submit the form, take the redirect).
- `probe-ts.mjs <version>`: stock `@modelcontextprotocol/client` 2.2.0 from that DSH's install, plus the
  stock `dsh-mcp-client` row, plus raw refusal tables.
- `probe-tunnel.mjs <version>`: behind the tunnel; runs `probe_py.py` (Python MCP SDK) on loopback and
  through the tunnel.
- `probe-clash.mjs <version>`: another process holds the approval port.
- `evidence-*.json`: recorded runs, with every token, access token, refresh token and code redacted.

Setup, with a temporary cache and no user npm or pip config:

```sh
npm_config_cache=../../.runtime/npm-cache npm_config_userconfig=empty-npm-config \
  npm_config_globalconfig=empty-npm-global npm install --ignore-scripts
python3 -m venv ../../.runtime/pyenv && PIP_CONFIG_FILE=/dev/null \
  PIP_CACHE_DIR=../../.runtime/pip-cache ../../.runtime/pyenv/bin/pip install mcp==2.3.0
```
