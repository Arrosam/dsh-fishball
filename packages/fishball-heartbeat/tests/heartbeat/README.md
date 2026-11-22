# fishball-heartbeat: the heartbeat row

Black-box cases for the heartbeat row (`index.js`): its timer, its consecutive count, the
`heartbeat_focus` tool, the restart reconstruction, compaction on cooling, what its own compaction
causes, and its live settings. Written from the requirements alone (the user's words as the lead
relayed them, the lead's refinements of 2026-11-21 and 2026-11-22, DESIGN §30, the package README);
the package's `src/` was not read. Entry file: [`../heartbeat.test.mjs`](<../heartbeat.test.mjs>).

| file | what it holds |
|---|---|
| [constants.mjs](<constants.mjs>) | every oracle value (contract words, bounds, sources, turn shapes, fixtures, the compaction seam's vocabulary) |
| [world.mjs](<world.mjs>) | the in-process world and the lab (fake clock, one home per test) |
| [cases.mjs](<cases.mjs>) | HB-EP-01…05, HB-BVA-01…07, HB-DT-01, HB-ST-01/02, HB-UC-01, HB-INT |
| [live-cases.mjs](<live-cases.mjs>) | HB-LC-SC-01, HB-LC-EP-01, HB-LC-ST-01, HB-LC-BVA-01, HB-LC-DT-01 |
| [compact-cases.mjs](<compact-cases.mjs>) | HB-CMP-EP/BVA/DT/ST/INT: compaction on cooling |
| [caused-cases.mjs](<caused-cases.mjs>) | HB-CAU-DT/BVA/ST/INT: what the heartbeat's own compaction causes is no activity (regression rows of 2a375e82) |

## How it is observed

The world is built from the current DSH's real `cordis`, `cordis-plugin-loader`, `dsh-session` and
`dsh-llm` (fishball-test-helpers/dsh `importDsh`; they are the host, not packages of this
repository). No DSH process is launched.

- The row is `index.js` imported with fishball-test-helpers/bind `rowModule` (its `@deepseek-ai/*`
  imports bound to the current DSH) and mounted as one Loader row, so a config change is a real
  Loader update (a volatile-only change is DSH's live commit, an invalid one is refused by the schema).
- The root context carries the services the row may read: a recording global `tools` registry (must
  stay empty), `profileContext` (a mkdtemp home shared by the worlds of one lab, so a restart keeps
  the focus), DSH's real `SessionStore` (its appends publish `session/event`), optionally `appReady`,
  and, per case, the compaction seam (`tokenMeter`, `agentPresets.serviceFor(agent, 'compaction')`,
  a host-plane `compaction`).
- fishball-core is a fake `fishballInstance` (apiVersion 2 unless the case says otherwise) on its own
  fiber: `manager.registerSetup` runs the setup on a manager agent context whose `tools.register` is
  fiber-owned; `manager.notify` records each heartbeat and (with `autoTurn`) runs the heartbeat turn
  real core would start.
- Turns are appended to the manager's real Session (turn/start, the step's claim of pending input,
  step/start, user/messages, step/end, turn/end); pending input is DSH's `agent/inbox/spliced` fold.
- Time is node:test MockTimers on `setTimeout` and `Date`; real time passes only while the world
  spins on `setImmediate` (not mocked) so the row's fs work and promise chains can finish.

Oracles: "a heartbeat" is one recorded `notify`; "no timer" is no `notify` over many intervals of
fake time; "the tool" is `heartbeat_focus` in the manager scope; "a compaction" is one recorded
`compactNow` call; "logged as a failure" is some warning or error line (never its text); "not
remounted" is the row's fiber passing through no state (cordis `internal/status`).

## Techniques

EP (config partitions, the core seam, the tool's callers and arguments, whose session counts, core's
event batches, the threshold's partitions), BVA (interval 0/1/max/max+1, max 0/1/2, focus 2000/2001
code points, the restart and firing edges, the late-timer tolerance, the delay cap, the threshold's
edges, "directly after" the compaction/end), DT (turn classification, cooling reason × size ×
engine, how a message became pending × what the turn admits), ST (the walk to the limit and back,
restart reconstruction, once per cooling, idle wait, disposal, caused ids forgotten), UC/INT (the
whole flow over a real Session, the incident of 2026-11-22).

## Not here

HB-LC-SC-02 (fishball-board's Config stays non-volatile) and HB-LC-EP-01 row 3 (DSH serves no
fishball-board namespace) read another package's Config: they are integration rows.
