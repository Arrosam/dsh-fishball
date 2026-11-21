# dsh-connector-adapter: live settings

Black-box cases for R2 (the adapter's Config: `clientMetadataUrl` string with no default, `servers`
array of `{serverName, url}` with default `[]`, both `.volatile()`, the old type, bounds and
descriptions kept) and R3 (a live change of `servers` re-runs apply: the `dshConnectorAdapter`
service's `status()` lists the new servers, without remounting the row), relayed by the lead on
2026-11-22. `index.js` was not read. Names: `<case id> <row> [SDK x] <title>`; DSH 0.2.1-rc.5,
0.2.2-rc.1 and 0.2.2-rc.3.

## World ([world.mjs](<world.mjs>))

The adapter suite's in-process DSH host (real credentials, authorization, system prompt, tools and
stock MCP client; [../oauth-client/subject.mjs](<../oauth-client/subject.mjs>)) plus the SDK's
cordis-plugin-loader. The plugin is `createAdapterPlugin({now, timers, fetch})` with the adapter
suite's fake clock and recording fetch, registered as a loader builtin and mounted as one row, so a
settings change is `loader.update(id, {config})`. `apply` is wrapped to count its calls (a remount or
restart runs it again). The served namespace comes from DSH's own `dsh-settings`.

## Cases

| Id | Technique | Rows | What it proves |
| --- | --- | --- | --- |
| ADP-LC-SC-01 | EP | order, clientMetadataUrl, servers | field order; volatility; no default for clientMetadataUrl; servers' item schema with pattern and required; descriptions |
| ADP-LC-BVA-01 | BVA | 1 | serverName 32 accepted, 33 and a bad character refused; missing url refused; unset → [] |
| ADP-LC-SC-02 | EP | 1 | DSH's settings service serves the namespace (value and base) |
| ADP-LC-ST-01 | ST | 1–3 | [m] → [m, n2] → … → []: status() follows each change at once; url change; no remount, sign-in tool kept |
| ADP-LC-EP-01 | EP | 1–2 | clientMetadataUrl unset → needs-configuration, set → needs-authorization; a CIMD change alone re-runs without a remount |
| ADP-LC-DT-01 | DT | 1–2 | schema-invalid list → refused by the Loader (old list stays); a duplicate serverName (valid for the schema, refused by the adapter) → the row's own failure |
