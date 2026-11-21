# Live settings (Fishball side): `packages/fishball-heartbeat/src/live-settings.js`

Black-box cases for requirement R1 (relayed by the lead, 2026-11-22). `packages/fishball-heartbeat/src/live-settings.js` was not read; the
cases import it as a module. Each test name is `<case id> <row> [SDK x] <title>`; it runs on DSH
0.2.1-rc.5, 0.2.2-rc.1 and 0.2.2-rc.3.

## World

A fixture row with Config `{count: natural 1..10 volatile, label: string volatile, mode: string
default 'fbtest-default'}` whose `apply` returns `runWithSettings(ctx, config, body)`, mounted as a
loader row on the SDK's real cordis + cordis-plugin-loader ([world.mjs](<world.mjs>)). A config change
is `loader.update(id, {config})`, so a volatile-only change is the Loader's own commit and
`loader/volatile-update`. Each body run is recorded with its settings and scope and registers one
effect whose disposer writes to a log; `applies` counts the row's own apply calls (a remount or a
restart runs it again, a live re-run does not).

## Use cases

- **LS-UC-01 first run:** body runs once with a frozen snapshot, as a child plugin of the row;
  `runWithSettings` settles with the first run and rejects with its error.
- **LS-ST-01 live change (state transitions):** running(v1) → volatile change → v1's child disposed
  → running(v2), the row fiber the same and active; repeated changes; unset → undefined; row
  disposed → child disposed, no run.

## Cases

| Id | Technique | Row(s) | What it proves |
| --- | --- | --- | --- |
| LS-EP-01 | EP | 1–6 | settingsSnapshot: volatile references → values, plain values pass through, undefined/null → empty frozen object, a snapshot does not follow a later commit |
| LS-UC-01 | UC | 1–4 | first run: values, frozen, child scope; resolves after an async first run; rejects with a sync or async first-run error |
| LS-ST-01 | ST | 1–5 | re-run after a volatile-only change: dispose before run, every effect disposed, no remount, latest values, unset field, row disposal |
| LS-BVA-01 | BVA | 1–5 | count 0 / 1 / 10 / 11 / 3.5: in-range re-runs, out-of-range and non-integer are refused (no re-run, old value stays) |
| LS-DT-01 | DT | 1–4 | change kind × outcome: re-run throws (sync/async) → row restarted with the new value; ordinary change → remount; equal values → no re-run |
| LS-EP-02 | EP | 1 | a change of one row does not re-run another row |

The module is fishball-heartbeat's own (the implementer's correction of R1, 2026-11-22: fishball-shared
holds only modules two packages use); its contract is the connector side's `dsh-connector-shared/live-settings`,
whose suite has the same rows.
