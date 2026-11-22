# fishball-core tests: bridge

Core's façade over a target's link (F-FACADE, `src/bridge/`): which connector tools Fishball's model is
offered and under which names (K2 `EXTERNAL_NAME`: `.` → `__`, 64 characters, refused names logged
once, four core tools withheld), the call order (link down → `disconnected`, not listed →
`unsupported-operation`, the X19 gate, the image gate), X12 `bridge(pluginId, ops)`, X8 attention,
`present(event)`, the contributed-tool count, and `attachment_read` shown as a DSH image (RFIX-F13).
Entry [../bridge.test.mjs](<../bridge.test.mjs>).

| file | rows |
|---|---|
| [cases.mjs](<cases.mjs>) | EXT-UC-02 A3, EXT-UC-04 A1, EXT-DT-03 E6/E8 (Fishball side), F-FACADE EP/DT/ST/BVA, K2-AMEND-1 |
| [rfix.mjs](<rfix.mjs>) | RFIX-F13-EP-01, -BVA-01, -DT-01 |

## How it is observed

[world.mjs](<world.mjs>): a real DSH of the current version (tools, agent loop, sessions) runs the Fishball agent
with a fake model that records the tool schemas it is offered and can call one tool; core's link is
[fakes.mjs](<fakes.mjs>) (its public API, K1 shapes). EXT-UC-02 A3 also runs core's real events module
(the events area's `WAKE_CONTRACT.immediate`). The connector's tool list comes from
`fishball-test-helpers/connector-contract/mcp-schema` restricted to core's own `MCP.tools`
(`connectorTools`, ../support/targets-oracle.mjs); K2 values from `…/connector-contract/tools`. One static
row (K2-AMEND-1 static) reads core's own `src/bridge/*.js` for a restated `'__'` literal.

## Not ported

- EXT-DT-03 E6 / E8 (end to end): `todo` for X-REMOTE, two DSH processes with the real connector and its
  contributors; the connector left this repository in 6b7c53bf.
- F-FACADE BVA 'count in status': a `todo` for F-STATUS; the status area checks the forwarded
  `contributedTools` (MULTI-STATUS-EP-01).
- MODEL 'browser page reload…' was attributed to this suite by the baseline's ambiguous matcher; it is
  fishball-ui's model-dialog todo, not a bridge row.
