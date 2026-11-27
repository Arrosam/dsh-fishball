# fishball-core tests: status

Core's status (`src/status/index.js`): `createStatus(ctx, {targets, guards, notify, brand})`, its frozen
snapshot `{fishball, guards, set, targets, brand}`, `statusOf`, `STATUS_MODEL`, the pure per-target
`stripLine(link, url, connect)`, the set check (no member since SHELVE-BOARD), the one guards notice per
DSH start, and the gentle once-only notice about the manager's extra tools (GENTLE-TOOLS). Entry file:
[status.test.mjs](<../status.test.mjs>), registered once on the current DSH.

The use cases, decision tables and technique index are in [USE-CASES.md](<USE-CASES.md>) (moved
unchanged from `test/v3/fishball-core/status/`).

## How it is observed

- **Level:** unit with fakes, on a real Cordis `Context` of the current DSH ([world.mjs](<world.mjs>)):
  DSH's `appReady`, `pluginManager`, `loader` and `profileContext` are faked to their DSH types
  ([fakes.mjs](<fakes.mjs>)); core's ports to the relayed seam. The module is imported with
  `fishball-test-helpers/bind` ([subject.mjs](<subject.mjs>)), so its `@deepseek-ai/*` imports bind to the
  current DSH.
- **Observation points:** the snapshot and every emission, the notices handed to `notify`, warnings
  through Cordis's logger exporter, the plugin manager's recorded calls, the tools record file
  `<profileContext.home>/fishball/manager-tools.json`, and outbound network attempts
  (`../link/net-probe.mjs`, the link area's diagnostics-channel recorder).
- **One notice per start:** [key-probe.mjs](<key-probe.mjs>) is a plain Node process standing for one DSH
  start; UC-STATUS-03 "A2 new process" compares its keys across two such processes. It inherits
  `FBTEST_DSH_VERSION` from the runner.
- Vocabulary ([constants.mjs](<constants.mjs>)): K1's TargetStatus words and loopback names from the
  vendored connector contract (`fishball-test-helpers/connector-contract/mcp-schema`), core's
  `contracts/constants.js` (CONNECT, GUARDS), the relayed STATUS_MODEL spellings, DSH's host vocabulary.
  The board in the set rows is a stand-in BundleInfo named `fishball-board`; no board code is read.

## Not here

- The strip view and the status card (F-STATUS-STRIP, UIPF-CARD-*): fishball-ui's.
- The scalar-port rows MULTI-0 withdrew (UC-STATUS-01 A5 / main 4, F-STATUS-DT-01 "rule 4 sends
  nothing", F-STATUS-BVA-01): retired, successors named in the mapping.
- The old `todo` rows: the strip control's press (fishball-ui / E2E), the status read through
  `fishballStatus` in a real DSH (integration, F-WIRE), core in a hosted child (the instance repository).
