# V3-S7c spike (throwaway)

Prototype for [docs/spikes/v3-s7c.md](../../docs/spikes/v3-s7c.md). Not product code.

- `adapter-plugin.mjs`: a standalone DSH plugin that runs MCP browser authorization for stock
  `@deepseek-ai/dsh-mcp-client` rows and keeps their token fresh. One token manager per row and one
  variant per mechanism (a1 `config-editor`, a2 `live-object`, a3 `js-restart`, c `proxy`,
  c2 `child-row`, d `own-client`). The grant lives in `ctx.credentials` as a `grant` record, and the
  browser leg is a `ctx.authorization` flow. A control route stands in for a settings surface.
- `constants.mjs`: the spike's constants (K = placeholder).
- `probe.mjs <version>`: boots a disposable connector DSH (the S7b prototype, `../v3-s7b/`) and a
  disposable client DSH (the adapter plus stock rows), both of the same version, under
  `$TMPDIR/dsh-s7c-runtime`. Runs 19 checks and writes `evidence-<version>.json` with secrets redacted.
- `survey.md`: the read-only survey of existing OAuth add-ons for DSH's MCP client.

Setup: S7b's dependencies, with a throwaway npm cache and no user npm config:

```sh
cd ../v3-s7b && npm_config_cache=$TMPDIR/dsh-s7c-npm-cache npm_config_userconfig=empty-npm-config \
  npm_config_globalconfig=empty-npm-global npm ci --ignore-scripts
cd ../v3-s7c && node probe.mjs 0.2.1-rc.5 && node probe.mjs 0.2.2-rc.1
```
