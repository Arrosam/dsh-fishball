# dsh-connector-watchdog: live settings

Black-box cases for R2 (every user setting `.volatile()`, type/default/bounds/description kept) and
R3 (a live settings change re-applies Watchdog: the patrol uses the current
`minCheckIntervalSeconds`, a stored unpaused brief is re-armed with it), relayed by the lead on
2026-11-22, and the row surface the implementer relayed the same day. `index.js` and
`src/config.js` were not read. Each test name is `<case id> <row> [SDK x] <title>`; the suite runs on
DSH 0.2.1-rc.5, 0.2.2-rc.1 and 0.2.2-rc.3.

## World ([world.mjs](<world.mjs>))

- The real row, bound to the SDK under test, mounted as a loader row on the SDK's real cordis +
  cordis-plugin-loader; a settings change is `loader.update(id, {config})` (what DSH's settings
  service commits).
- Root services: `sessionController` (required, unread), `profileContext` over a temp home (briefs.json),
  fake `dshConnectorSessions` (the fixture principal manages every session; `read` records its call and
  answers no messages; `stop` records) and `dshConnectorTools` (records the registered tools).
- node:test MockTimers on setTimeout and Date. A patrol is one recorded `sessions.read`.
- The served namespace: DSH's own `dsh-settings` `SettingsForms.describe()` over a scripted
  configEditor with one running entry of the row's Config ([settings-schema.mjs](<../../../../dsh-connector/packages/dsh-connector-test-helpers/src/dsh/settings-schema.mjs>)).

## Use case

Fishball has briefed Watchdog on a session; the user opens dsh-connector-watchdog on the umbrella's
plugin page and changes the patrol interval. The change applies at once: the next patrol comes one
new interval after the change, without a DSH restart and without remounting the row.

## Cases

| Id | Technique | Rows | What it proves |
| --- | --- | --- | --- |
| WD-LC-SC-01 | EP | order, model, one per limit field | `model` (volatile object `{provider, model, reasoningEffort}`) followed by the four natural limit fields, in order, with defaults, bounds and descriptions |
| WD-LC-BVA-01 | BVA | one per field | min and max accepted, min−1, max+1 and a fraction refused, unset → default |
| WD-LC-SC-02 | EP | 1 | DSH's settings service serves the namespace with `model` and all four limit fields and the user layer |
| WD-LC-ST-01 | ST | 1–4 | armed(600) → change(900) → patrol 900 s after the change, not at 600; then every 900 s; a shorter interval too; same fiber, tools and brief kept |
| WD-LC-EP-01 | EP | 1–2 | the read bounds changed live reach the next patrol; defaults 1740 s / 8 / 8192 (when a model is configured) |
| WD-LC-BVA-02 | BVA | 1–5 | live 60 and 86400 applied; 59, 86401 and 600.5 refused (old interval stands, row active) |
| WD-LC-DT-01 | DT | 1–3 | stored unpaused brief re-armed, stored paused brief not; a brief paused before the change stays unarmed and resumes at the new interval; no brief → nothing armed |
| WD-LC-MODEL-01 | EP/DT | 5 | empty / incomplete / whitespace `model` keeps Watchdog disabled (row stays active for settings, no tools, no delegate, no patrol even with stored brief) |
| WD-LC-MODEL-02 | ST | 1 | live toggle via `model`: unset → set enables (tools, delegate, stored brief armed) on the same fiber; model switch keeps Watchdog active; set → unset disables cleanly on the same fiber |
