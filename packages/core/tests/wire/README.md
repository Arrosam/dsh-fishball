# fishball-core tests: wire

Core's main row wired into DSH (F-WIRE) and its MULTI-1 target collection: core's package surface
(manifest exports, its patch's rows, the model seam and tool tables, no connector-side import), core
alone in a real standalone DSH (service shape, status, the one manager, scoped tools and guards,
persona, Connect's loopback pages, the live model, restart), the MULTI-1 targets (ids, epochs,
credentials, names, namespaced tools, Connect per target, events and asks across targets, bridge and
attention), the hosted parent's lifecycle (credential cleanup, a failing epoch save, drain on close),
the retirement decisions at the link boundary (MULTI-1-FIX), the running managed sessions of a target
and their re-read while a page watches (SESSIONS, SESSIONS-WATCH, DESIGN §35), the persisted brand
config (BRAND-CONFIG) and wake batching seen from the manager (WAKE-SYS, DESIGN §29). The row index
with techniques and oracles is [USE-CASES.md](<USE-CASES.md>) (the old suite's, kept as the requirement
record); entry [../wire.test.mjs](<../wire.test.mjs>).

| file | rows |
|---|---|
| [cases.mjs](<cases.mjs>) | WIRE-EP-01..03, WIRE-DT-01, WIRE-SYS fishball-core |
| [multi.mjs](<multi.mjs>) | MULTI-TGT, -HOST, -CRED, -NAME, -TOOL, -CONN, -EVT-SYS, -ASK-SYS, -SVC |
| [lifecycle.mjs](<lifecycle.mjs>) | MULTI-LIFE-CRED-DT-01, -CRED-ST-02, -SAVE-ST-01, -DRAIN-ST-01..03 |
| [retirement.mjs](<retirement.mjs>) | MULTI-1-FIX (with its sub-cases "replacement probe…", "live retry…") |
| [running-sessions.mjs](<running-sessions.mjs>), [running-sessions-watch.mjs](<running-sessions-watch.mjs>) | SESSIONS, SESSIONS-WATCH (unit and createTargets levels) |
| [brand-config.mjs](<brand-config.mjs>) | BRAND-CONFIG-DT-01, -ST-01 |
| [batch.mjs](<batch.mjs>) | WAKE-SYS-TOOL-01, -EP-01, -EP-02, -ST-01 |

## How it is observed

- **System rows** boot the current DSH with fishball-core installed as a bundle and fishball-shared
  beside it as a library (fishball-test-helpers/dsh-world through
  [../support/core-world.mjs](<../support/core-world.mjs>); fishball-shared's folder is resolved by name from
  core's own dependency). Core's ops (`fishballInstance.ui.targets`, `ui.asks`, `bridge`, `attention`,
  `fishballStatus`, the manager's model requests) are the world extension
  [../support/core-world-ext.mjs](<../support/core-world-ext.mjs>). Target DSHs are
  fishball-test-helpers/fake-connector's `startFakeDsh` (one MCP server each, K1 shapes from the vendored
  connector contract); Connect rows use `startConnectFake` and its `approvalBrowser`.
- **The hosted child** is a stand-in for the instance's child-side row ([fixtures/child-row](<fixtures/child-row/index.mjs>):
  the published id `dsh-instance-child`, a volatile `targetUrl`, an optional handoff token written to
  `DSH_AGENT_TOKEN`). As a launch overlay row by default; the lifecycle rows keep it in the home's
  `cordis.patch.yml` (written at every start, changed live and reconciled with dsh-app-boot's public
  `reconcileProfilePatches`). The instance itself is not used (it lives in dsh-fishball-instance).
- **Unit rows** (MULTI-1-FIX, SESSIONS) import core's `src/targets/` bound to the current DSH with core's
  link swapped for a scripted or spying link module ([../support/link-swap.mjs](<../support/link-swap.mjs>));
  no network.
- **Static rows** read core's own manifest, patch (parsed by the current DSH) and shipped source
  ([../support/core-static.mjs](<../support/core-static.mjs>)).
- Expected values come from the frozen contracts, restated in
  [../support/targets-oracle.mjs](<../support/targets-oracle.mjs>) (shared with events, asks, bridge).

## Re-baselined in the port (requirement changes, see .runtime/port/port-core-wire-failures.md)

- MULTI-EVT-SYS-01: DESIGN §29 batches wake events, so the two copies of one eventId may arrive in ONE
  manager message whose id is its first record's `fbe_<handle>`; the row now reads each delivery's
  records (`source.events`) and checks each target's copy is its own record, once, acked on its own target.
- MULTI-TOOL-ST-01, -ST-02, MULTI-SVC-DT-01: core itself calls `sessions_list {limit: 100}` on connect
  (running sessions, 2026-11-21; §35), so the rows count only their own calls (`MULTI.callArgs`).
- WIRE-SYS: only the fishball-core composition stays; fishball-ui + core, the board stand-in and the
  broken board are integration rows. WIRE-EP-02 scans core's folder only (fishball-shared's own rule
  is fishball-shared's test).

## Integration rows (moved out)

WIRE-SYS fishball-ui+fishball-core, fishball-board+fishball-ui+fishball-core and SHELVE broken board
(need fishball-ui and the board stand-in installed beside core); SESSIONS-WATCH SYS S1–S4 (needs
fishball-ui's strip topic on the page stream).
## Regression rows

MULTI-1-FIX (fixes ae05cc96 and 9dd1bcec, base 8421cfee): `node scripts/test.mjs fishball-core
--against=8421cfee -- --test-name-pattern=MULTI-1-FIX` fails "parent renewal clears the last writable
token…" and "parent renewal saves a fresh writable token…" with their sub-cases ("renewal: the replacement
origin received ambient A", "cold restart: E2 used a credential other than B"); the three "deferred
continue" rows and the ambient one pass there too (an earlier fix). The normal run passes all of them.
