# Coverage: the new tests against the inventory

Step 2 of the test restructure: every behaviour in [inventory.md](<inventory.md>) is checked against
the new tests. How it was checked (2026-11-27): each package and each integration package was run on
its own (`node scripts/test-package.mjs <folder>`), and each inventory case's `<ID> <part>` was
matched with the new case names of those runs. Cases keep their old ID and part where the behaviour
is the same; where a behaviour was renamed, split or merged, the row says so.

## Result

The table below records the original rewrite at `fab3837` before the staging merge. The inventory
rows also describe that comparison, not the additional staging cases.

| | Cases |
| --- | --- |
| Inventory (old cases, counted once, not per SDK) | 786 |
| Covered by a new case | 755 |
| Retired, with the reason in inventory.md (a requirement withdrew it, or it checked another repository's files) | 30 |
| Not covered | 1 (placement.25, below) |

New tests (each case runs once per SDK, 0.2.1-rc.5 and 0.2.2-rc.1, so the counts are twice the case count):

| Package | Tests | Pass | Skipped | Todo |
| --- | --- | --- | --- | --- |
| packages/dsh-instance | 1312 | 1312 | 0 | 0 |
| integration/hosted-child | 176 | 160 | 0 | 16 |
| integration/connector | 12 | 12 | 0 | 0 |
| integration/fishball-core | 22 | 20 | 2 | 0 |
| integration/release | 72 | 68 | 2 | 2 |
| **total** | **1594** | **1572** | **4** | **18** |

None fails. Skipped and todo cases, per package:

- integration/fishball-core: `LITE-UC-03 hosted` (the private Skills exception needs a live child
  agent turn in a browser) — skipped with that reason.
- integration/release: `PINST-UC-01 main` (the registry path needs fishball-core published at the
  instance's version) — skipped; `REL-ST-01 tamper` — todo, real bug BUG-1.
- integration/hosted-child: three real bugs (BUG-2, BUG-3, BUG-4, todo) and five cases not observable
  from outside a running DSH, kept as todo with the reason in the case: `CP-R8 stopped`,
  `CP-R3 cancel, connection open`, `IREADY-SYSTEM operations`, `IREADY-SYSTEM publish-dispose`,
  `HOST-DT-01 row 7`. Three of them were todo in the old suite too. For current status (including
  the fixed checksum case), see [bugs.md](<bugs.md>).

## Not covered

- **placement.25**, `PLAT-DT-01 row 8`: "a toggle while the child runs takes effect at the next
  restart; the UI says 'restart required'". It was a todo in the old suite too (owner: E2E-UI). The
  rule that a switch takes effect at the next start is covered by `PLAT-DT-01 rows 3 and 4`; the UI
  line is not, because no page shows that text today.

## Expectations rewritten as outdated

A case is rewritten only when a later, recorded decision changed the requirement:

| Old case | Decision | Now |
| --- | --- | --- |
| host.37 HOST-EP-01 row 4, host.226–238 UIPD-INST-* | 8fdd0ef moved the settings page from `plugins.row.config` to `plugins.bundle.config` keyed by the package name (DSH's plugin-manager README, "Configuration pages") | the page registers at `plugins.bundle.config` key `dsh-instance`; the UIPD cases only needed the harness to look there |
| host.169, 170, 183 ROUTES status / retry / secret | fafbb5f added `busy()` and `restart()` to the route service contract and `busy` to the status answer | status is `{state, code, detail, notice, busy}`; the token sweep covers restart too |
| host.185, 186, 188 PLACE Q1/Q2, placement.40 SHELVE compose, placement-install.1, 2, 4, 6, 12 | 8fdd0ef: fishball-ui merged into fishball-core and retired (`PLACEMENT.retiredBundle`) | the Fishball bundles are fishball-core alone, last; fishball-ui is never placed |
| placement.36, 37 HOST-EP-03 row 7 | the same merge (dsh-fishball 117cb2a2) | core's patch inserts the page, Recommended and child-plugins rows itself |
| succession.9 ISUCC-DT-01 row 6 | README: the instance has no remote-target override | extra target credentials in the child do not stop the parent's pending succession |
| HOST-ST-01 K (K3 declaration) | MULTI-0 withdrew the `target-remote` refusal | four refusal codes, not five |
| PLAT-EP-07 row 5 | since the split (a9c8832) this repository packs one tarball | the instance bundles every dependency it lists; its bundled fishball-core carries fishball-shared |

**Staging merge (`22912fb`).** Placement tests now expect `fishball-amenities` before
`fishball-core`. Board, heartbeat and taskboard are amenities rather than independent enabled
bundles; Fishball UI still ships in core. The merge also moved staging's plugin toggle, Cordis
proxy regression, onboarding, directory-permission, HMR-barrier and remote embedding coverage
from `test/v3` into the package suite.

## Every inventory case

| Old case | Behaviour (old name) | New package | New case (ID part) | Note |
| --- | --- | --- | --- | --- |
| child-plugins.1 | CPB-RESTART ready status {"state":"ready","code":null} → Restart enabled | packages/dsh-instance | CPB-RESTART ready |  |
| child-plugins.2 | CPB-RESTART failed status {"state":"failed","code":"NATIVE_CHILD_EXITED"} → Restart enabled | packages/dsh-instance | CPB-RESTART failed |  |
| child-plugins.3 | CPB-RESTART stopped status {"state":"stopped","code":null} → Restart enabled | packages/dsh-instance | CPB-RESTART stopped |  |
| child-plugins.4 | CPB-RESTART starting status {"state":"starting","code":null} → Restart disabled | packages/dsh-instance | CPB-RESTART starting |  |
| child-plugins.5 | CPB-RESTART stopping status {"state":"stopping","code":null} → Restart disabled | packages/dsh-instance | CPB-RESTART stopping |  |
| child-plugins.6 | CPB-RESTART disabled status {"state":"disabled","code":null} → Restart hidden | packages/dsh-instance | CPB-RESTART disabled |  |
| child-plugins.7 | CPB-RESTART ready, plugin change running status {"state":"ready","code":null,"busy":true} → Restart disabled | packages/dsh-instance | CPB-RESTART ready, plugin change running |  |
| child-plugins.8 | CPB-CONFIRM en en: Restart asks first ("Restart Fishball? Running work in Fishball stops and the Fishball window reloads."), posts nothing until confirmed, then posts restart once | packages/dsh-instance | CPB-CONFIRM en |  |
| child-plugins.9 | CPB-CONFIRM zh zh: Restart asks first (translated), posts nothing until confirmed, then posts restart once | packages/dsh-instance | CPB-CONFIRM zh |  |
| child-plugins.10 | CPB-DETAIL row 1 in Fishball, has source fbtest-dt-one: in Fishball true, official shipped false, source true → Uninstall from Fishball | packages/dsh-instance | CPB-DETAIL row 1 in Fishball, has source |  |
| child-plugins.11 | CPB-DETAIL row 2 in Fishball, official shipped @deepseek-ai/dsh-experimental-session-search: in Fishball true, official shipped true, source false → Uninstall from Fishball | packages/dsh-instance | CPB-DETAIL row 2 in Fishball, official shipped |  |
| child-plugins.12 | CPB-DETAIL row 3 official shipped @deepseek-ai/dsh-experimental-session-search: in Fishball false, official shipped true, source false → Use in Fishball | packages/dsh-instance | CPB-DETAIL row 3 official shipped |  |
| child-plugins.13 | CPB-DETAIL row 4 has install source fbtest-dt-four: in Fishball false, official shipped false, source true → Install to Fishball | packages/dsh-instance | CPB-DETAIL row 4 has install source |  |
| child-plugins.14 | CPB-DETAIL row 5 official shipped and has source @deepseek-ai/dsh-experimental-tool-worktree: in Fishball false, official shipped true, source true → Use in Fishball | packages/dsh-instance | CPB-DETAIL row 5 official shipped and has source |  |
| child-plugins.15 | CPB-DETAIL row 6 none fbtest-dt-six: in Fishball false, official shipped false, source false → nothing | packages/dsh-instance | CPB-DETAIL row 6 none |  |
| child-plugins.16 | CPB-DETAIL row 7 dsh-instance dsh-instance: in Fishball false, official shipped false, source true → nothing | packages/dsh-instance | CPB-DETAIL row 7 dsh-instance |  |
| child-plugins.17 | CPB-DETAIL row 8 fishball-core in Fishball fishball-core: in Fishball true, official shipped false, source true → nothing | packages/dsh-instance | CPB-DETAIL row 8 fishball-core in Fishball |  |
| child-plugins.18 | CPB-DETAIL row 9 fishball-ui fishball-ui: in Fishball false, official shipped false, source true → nothing | packages/dsh-instance | CPB-DETAIL row 9 fishball-ui |  |
| child-plugins.19 | CPB-DETAIL row 10 item subject an official-plugin (item) page → nothing | packages/dsh-instance | CPB-DETAIL row 10 item subject |  |
| child-plugins.20 | TR-PLACE top row ready: one Restart in the tab top row beside Install for Fishball | packages/dsh-instance | TR-PLACE top row |  |
| child-plugins.21 | TR-STATE ready state ready, not busy → Restart enabled | packages/dsh-instance | TR-STATE ready |  |
| child-plugins.22 | TR-STATE failed state failed, not busy → Restart enabled | packages/dsh-instance | TR-STATE failed |  |
| child-plugins.23 | TR-STATE stopped state stopped, not busy → Restart enabled | packages/dsh-instance | TR-STATE stopped |  |
| child-plugins.24 | TR-STATE starting state starting, not busy → Restart disabled | packages/dsh-instance | TR-STATE starting |  |
| child-plugins.25 | TR-STATE stopping state stopping, not busy → Restart disabled | packages/dsh-instance | TR-STATE stopping |  |
| child-plugins.26 | TR-STATE disabled state disabled, not busy → Restart hidden | packages/dsh-instance | TR-STATE disabled |  |
| child-plugins.27 | TR-STATE waiting state waiting, not busy → Restart hidden | packages/dsh-instance | TR-STATE waiting |  |
| child-plugins.28 | TR-STATE unavailable state unavailable, not busy → Restart hidden | packages/dsh-instance | TR-STATE unavailable |  |
| child-plugins.29 | TR-STATE fbtest-unknown-state state fbtest-unknown-state, not busy → Restart hidden | packages/dsh-instance | TR-STATE fbtest-unknown-state |  |
| child-plugins.30 | TR-NOANSWER held before any status answer (status request never answered) → no Restart | packages/dsh-instance | TR-NOANSWER held |  |
| child-plugins.31 | TR-DT ready busy false state ready × busy false → Restart enabled | packages/dsh-instance | TR-DT ready busy false |  |
| child-plugins.32 | TR-DT ready busy true state ready × busy true → Restart disabled | packages/dsh-instance | TR-DT ready busy true |  |
| child-plugins.33 | TR-DT failed busy false state failed × busy false → Restart enabled | packages/dsh-instance | TR-DT failed busy false |  |
| child-plugins.34 | TR-DT failed busy true state failed × busy true → Restart disabled | packages/dsh-instance | TR-DT failed busy true |  |
| child-plugins.35 | TR-DT stopped busy false state stopped × busy false → Restart enabled | packages/dsh-instance | TR-DT stopped busy false |  |
| child-plugins.36 | TR-DT stopped busy true state stopped × busy true → Restart disabled | packages/dsh-instance | TR-DT stopped busy true |  |
| child-plugins.37 | TR-DT starting busy false state starting × busy false → Restart disabled | packages/dsh-instance | TR-DT starting busy false |  |
| child-plugins.38 | TR-DT starting busy true state starting × busy true → Restart disabled | packages/dsh-instance | TR-DT starting busy true |  |
| child-plugins.39 | TR-DT stopping busy false state stopping × busy false → Restart disabled | packages/dsh-instance | TR-DT stopping busy false |  |
| child-plugins.40 | TR-DT stopping busy true state stopping × busy true → Restart disabled | packages/dsh-instance | TR-DT stopping busy true |  |
| child-plugins.41 | TR-DT disabled busy false state disabled × busy false → Restart hidden | packages/dsh-instance | TR-DT disabled busy false |  |
| child-plugins.42 | TR-DT disabled busy true state disabled × busy true → Restart hidden | packages/dsh-instance | TR-DT disabled busy true |  |
| child-plugins.43 | TR-BUSY absent ready, busy absent → Restart enabled (only busy === true disables) | packages/dsh-instance | TR-BUSY absent |  |
| child-plugins.44 | TR-BUSY false ready, busy false → Restart enabled (only busy === true disables) | packages/dsh-instance | TR-BUSY false |  |
| child-plugins.45 | TR-BUSY true ready, busy true → Restart disabled (only busy === true disables) | packages/dsh-instance | TR-BUSY true |  |
| child-plugins.46 | TR-BUSY string true ready, busy string true → Restart enabled (only busy === true disables) | packages/dsh-instance | TR-BUSY string true |  |
| child-plugins.47 | TR-BUSY number 1 ready, busy number 1 → Restart enabled (only busy === true disables) | packages/dsh-instance | TR-BUSY number 1 |  |
| child-plugins.48 | TR-LIVE polled states the status answer alone moves Restart: ready → starting → disabled → failed → ready+busy → ready | packages/dsh-instance | TR-LIVE polled states |  |
| child-plugins.49 | TR-POLL visibility status polled while mounted and visible (≥ 2 GETs in 2500 ms); none while hidden or unmounted | packages/dsh-instance | TR-POLL visibility |  |
| child-plugins.50 | TR-FLOW en en: click → confirm dialog (nothing posted) → Cancel (nothing) → click → confirm → "Restarting…" disabled until answered → Restart | packages/dsh-instance | TR-FLOW en |  |
| child-plugins.51 | TR-FLOW zh zh: click → confirm dialog (nothing posted) → Cancel (nothing) → click → confirm → "Restarting…" disabled until answered → Restart | packages/dsh-instance | TR-FLOW zh |  |
| child-plugins.52 | TR-REFUSE instance-disabled restart answers refused instance-disabled → its refusal text in role=alert | packages/dsh-instance | TR-REFUSE instance-disabled |  |
| child-plugins.53 | TR-REFUSE busy restart answers refused busy → its refusal text in role=alert | packages/dsh-instance | TR-REFUSE busy |  |
| child-plugins.54 | TR-REFUSE other code restart answers refused fbtest-other-refusal → no refusal text | packages/dsh-instance | TR-REFUSE other code |  |
| child-plugins.55 | TR-REFUSE none restart answers without refused → no refusal text | packages/dsh-instance | TR-REFUSE none |  |
| child-plugins.56 | TR-SAME rest of tab the tab without Restart renders the same whether Restart is hidden (disabled) or shown (ready) | packages/dsh-instance | TR-SAME rest of tab |  |
| child-plugins.57 | CP-R10 baseline before any child operation: DSH's own pluginManager lists the MAIN profile; the main detail-file route answers [integration] | integration/hosted-child | CP-R10 baseline |  |
| child-plugins.58 | CP-R9 malformed not JSON POST use with body {nope → HTTP 400 [integration] | integration/hosted-child | CP-R9 malformed not JSON |  |
| child-plugins.59 | CP-R9 malformed JSON array POST use with body [] → HTTP 400 [integration] | integration/hosted-child | CP-R9 malformed JSON array |  |
| child-plugins.60 | CP-R9 malformed JSON string POST use with body "x" → HTTP 400 [integration] | integration/hosted-child | CP-R9 malformed JSON string |  |
| child-plugins.61 | CP-R9 malformed field missing POST use with body {} → HTTP 400 [integration] | integration/hosted-child | CP-R9 malformed field missing |  |
| child-plugins.62 | CP-R9 malformed wrong type POST use with body {"name":7} → HTTP 400 [integration] | integration/hosted-child | CP-R9 malformed wrong type |  |
| child-plugins.63 | CP-R9 malformed empty name POST use with body {"name":""} → HTTP 400 [integration] | integration/hosted-child | CP-R9 malformed empty name |  |
| child-plugins.64 | CP-R9 cross-origin install POST install from https://evil.example → 403; nothing written [integration] | integration/hosted-child | CP-R9 cross-origin install |  |
| child-plugins.65 | CP-R9 cross-origin use POST use from https://evil.example → 403; nothing written [integration] | integration/hosted-child | CP-R9 cross-origin use |  |
| child-plugins.66 | CP-R9 no owner GET list without the owner cookie → not answered 200 [integration] | integration/hosted-child | CP-R9 no owner |  |
| child-plugins.67 | CP-R9 size big POST use with a 1048576-byte body → refused (4xx) [integration] | integration/hosted-child | CP-R9 size big |  |
| child-plugins.68 | CP-R9 size small POST use with a valid body padded to 512 bytes → not refused for size (200) [integration] | integration/hosted-child | CP-R9 size small |  |
| child-plugins.69 | CP-R2 list GET list → ok; none of the protected bundles is listed [integration] | integration/hosted-child | CP-R2 list |  |
| child-plugins.70 | CP-R1 install install a local tarball → child deps + bundles have it; MAIN profile untouched; applied restarting; the child restarts [integration] | integration/hosted-child | CP-R1 install |  |
| child-plugins.71 | CP-R5 use shipped use @deepseek-ai/dsh-experimental-session-search → ok; added to the child bundles; no pnpm run (deps and lockfile unchanged) [integration] | integration/hosted-child | CP-R5 use shipped |  |
| child-plugins.72 | CP-R5 use not shipped fbtest-not-shipped-anywhere use fbtest-not-shipped-anywhere (not shipped by the installation) → refused; child bundles unchanged [integration] | integration/hosted-child | CP-R5 use not shipped fbtest-not-shipped-anywhere |  |
| child-plugins.73 | CP-R5 use not shipped fbtest-only use fbtest-only (not shipped by the installation) → refused; child bundles unchanged [integration] | integration/hosted-child | CP-R5 use not shipped fbtest-only |  |
| child-plugins.74 | CP-R2 protected uninstall @deepseek-ai/dsh-base uninstall {name: @deepseek-ai/dsh-base} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected uninstall @deepseek-ai/dsh-base |  |
| child-plugins.75 | CP-R2 protected use @deepseek-ai/dsh-base use {name: @deepseek-ai/dsh-base} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected use @deepseek-ai/dsh-base |  |
| child-plugins.76 | CP-R2 protected uninstall @deepseek-ai/dsh-web-app uninstall {name: @deepseek-ai/dsh-web-app} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected uninstall @deepseek-ai/dsh-web-app |  |
| child-plugins.77 | CP-R2 protected use @deepseek-ai/dsh-web-app use {name: @deepseek-ai/dsh-web-app} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected use @deepseek-ai/dsh-web-app |  |
| child-plugins.78 | CP-R2 protected uninstall fishball-core uninstall {name: fishball-core} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected uninstall fishball-core |  |
| child-plugins.79 | CP-R2 protected use fishball-core use {name: fishball-core} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected use fishball-core |  |
| child-plugins.80 | CP-R2 protected uninstall fishball-ui uninstall {name: fishball-ui} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected uninstall fishball-ui |  |
| child-plugins.81 | CP-R2 protected use fishball-ui use {name: fishball-ui} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected use fishball-ui |  |
| child-plugins.82 | CP-R2 protected uninstall dsh-instance uninstall {name: dsh-instance} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected uninstall dsh-instance |  |
| child-plugins.83 | CP-R2 protected use dsh-instance use {name: dsh-instance} → protected; child manifest unchanged [integration] | integration/hosted-child | CP-R2 protected use dsh-instance |  |
| child-plugins.84 | CP-R6 uninstall uninstall the installed fixture → its dependency and its bundle are both gone [integration] | integration/hosted-child | CP-R6 uninstall |  |
| child-plugins.85 | CP-R6 remove fails pnpm remove fails (child manifest made unresolvable) → remove-failed; bundle list unchanged [integration] | integration/hosted-child | CP-R6 remove fails |  |
| child-plugins.86 | CP-R8 ready restart while ready → the status shape; the child is ready again on a new launch [integration] | integration/hosted-child | CP-R8 ready |  |
| child-plugins.87 | CP-R8 queued two restarts at once → both answer the status shape; ends ready with one live launch [integration] | integration/hosted-child | CP-R8 queued |  |
| child-plugins.88 | CP-R8 failed a failed child: restart is allowed (status shape, not instance-disabled); with the cause removed it comes back ready [integration] | integration/hosted-child | CP-R8 failed |  |
| child-plugins.89 | CP-R8 stopped restart while stopped (instance on) is allowed [integration] — TODO no public way to bring an enabled child to "stopped" without implementation details | integration/hosted-child | CP-R8 stopped |  |
| child-plugins.90 | CP-R3 busy an install held on a registry that never answers; then install/use/uninstall → each busy [integration] | integration/hosted-child | CP-R3 busy |  |
| child-plugins.91 | CP-R3 cancel cancel {requestId}, registry drops its connection after 5000 ms → answers within 150000 ms (measured ~70 s after the drop) with one of DSH's cancel outcomes; the held install ends refused; the next operation is not busy [integration] | integration/hosted-child | CP-R3 cancel |  |
| child-plugins.92 | CP-R3 cancel, connection open cancel answers while the registry keeps its connection open [integration] — TODO DSH's cancelInstall waits for the stuck pnpm run (measured: answer ~70 s after the registry closes) | integration/hosted-child | CP-R3 cancel, connection open |  |
| child-plugins.93 | CP-R7 off restart instance switched off: restart → instance-disabled [integration] | integration/hosted-child | CP-R7 off restart |  |
| child-plugins.94 | CP-R7 off use instance switched off: use {shipped official} → ok, applied next-start; written to the child bundles [integration] | integration/hosted-child | CP-R7 off use |  |
| child-plugins.95 | CP-R7 off uninstall instance switched off: uninstall {that bundle} → ok, applied next-start; dropped from the list [integration] | integration/hosted-child | CP-R7 off uninstall |  |
| child-plugins.96 | CP-R10 after after child operations: DSH's own listBundles is still the MAIN profile's; detail-file answers as before [integration] | integration/hosted-child | CP-R10 after |  |
| child-plugins.97 | CP-R4 not-ready install no child profile yet (runtime removed while DSH was down, instance off): install → not-ready; nothing created [integration] | integration/hosted-child | CP-R4 not-ready install |  |
| child-plugins.98 | CP-R4 not-ready use no child profile yet (runtime removed while DSH was down, instance off): use → not-ready; nothing created [integration] | integration/hosted-child | CP-R4 not-ready use |  |
| child-plugins.99 | CP-R4 not-ready uninstall no child profile yet (runtime removed while DSH was down, instance off): uninstall → not-ready; nothing created [integration] | integration/hosted-child | CP-R4 not-ready uninstall |  |
| host.1 | HOST-UC-01 main 2–3 no credential in the child (blank target, connector usable) → exactly one createHosted(instanceId), its value imported once on the wire | packages/dsh-instance | HOST-UC-01 main 2–3 |  |
| host.2 | HOST-UC-01 main 3 the child-side receiver writes exactly ctx.credentials.set('DSH_AGENT_TOKEN', value) and nothing else | packages/dsh-instance | HOST-UC-01 main 3 |  |
| host.3 | HOST-UC-01 main 2 the presence question is DSH's own: describe(DSH_AGENT_TOKEN) and/or describeRecord(fishball-core/hosted-agent); no value is resolved | packages/dsh-instance | HOST-UC-01 main 2 |  |
| host.4 | HOST-UC-01 main 2 the entry key is recorded only after the child answered saved (store write before the record add) | packages/dsh-instance | HOST-UC-01 main 2 |  |
| host.5 | HOST-UC-01 main 6 after the first start the locator reports target status connected (blank target, last entry enabled) | packages/dsh-instance | HOST-UC-01 main 6 |  |
| host.6 | HOST-UC-01 main 2 the hosted record file is <mainHome>/fishball/hosted.json, mode 0600, {format: 1, instanceId, entries: [entryKey], runtime}, and holds no token value | packages/dsh-instance | HOST-UC-01 main 2 |  |
| host.7 | HOST-UC-01 E1 a blocked start reports {state: failed, code: PROFILE_INCOMPATIBLE, plugin: <the bundle>} through the locator | packages/dsh-instance | HOST-UC-01 E1 |  |
| host.8 | HOST-UC-01 main 4–5 core authenticates with its own identity.id, pairs, and the hosted entry becomes the default designated agent | integration/hosted-child | HOST-UC-01 main 4–5 |  |
| host.9 | HOST-UC-01 E2 fishball-core disabled: the child starts anyway (no fishball-off from the instance, Q4) | integration/hosted-child | HOST-UC-01 E2 |  |
| host.10 | HOST-UC-02 main a child restart (new wire, credential present) → no createHosted, no import frame | integration/hosted-child | HOST-UC-02 main |  |
| host.11 | HOST-UC-02 main a crash and restart after core saved its copy (reference unset, record present) → no createHosted, no import frame | integration/hosted-child | HOST-UC-02 main |  |
| host.12 | HOST-UC-02 A1 a host DSH restart (a new wire again) → no createHosted, no import frame | packages/dsh-instance, integration/hosted-child | HOST-UC-02 A1 |  |
| host.13 | HOST-UC-02 main a reconnect of the link (the wire drops and comes back, credential present) → no createHosted, no import frame | integration/hosted-child | HOST-UC-02 main |  |
| host.14 | HOST-UC-02 main Retry while the child is ready → no createHosted, no import frame | integration/hosted-child | HOST-UC-02 main |  |
| host.15 | HOST-UC-02 post the connector has exactly the entries it had before the restarts (one) | packages/dsh-instance | HOST-UC-02 post |  |
| host.16 | HOST-UC-04 main disabled → targetStatus token-refused / token-revoked; a restart and a Retry create no replacement | packages/dsh-instance | HOST-UC-04 main disabled |  |
| host.17 | HOST-UC-04 main disabled then re-enabled → connected again, with the same entry (no replacement) | packages/dsh-instance | HOST-UC-04 main disabled |  |
| host.18 | HOST-UC-04 A1 deleted → no automatic createHosted; Retry creates none either (R6 = B) and records the notice hosted-entry-deleted | packages/dsh-instance | HOST-UC-04 A1 deleted |  |
| host.19 | HOST-UC-04 A1 after a delete, Reconnect (one click) creates exactly one new entry and imports it once; the notice clears | packages/dsh-instance | HOST-UC-04 A1 reconnect |  |
| host.20 | HOST-UC-04 E1 a delete is never a reinstall: Retry and Reconnect call no retire (no succession) | packages/dsh-instance | HOST-UC-04 E1 |  |
| host.21 | HOST-UC-05 post (MULTI-2) an extra remoteTarget field cannot suppress actual-parent first-start provisioning | packages/dsh-instance | HOST-UC-05 post (MULTI-2) |  |
| host.22 | HOST-UC-05 E1 (MULTI-2) an extra remoteTarget field cannot replace the reserved actual-parent target status | packages/dsh-instance | HOST-UC-05 E1 (MULTI-2) |  |
| host.23 | HOST-UC-05 main (MULTI-2) Reconnect always provisions actual parent; removed remote override cannot cause target-remote refusal | packages/dsh-instance | HOST-UC-05 main (MULTI-2) |  |
| host.24 | HOST-UC-06 A1 a crashed child reports its code; Retry restarts it (failed → starting) | packages/dsh-instance | HOST-UC-06 A1 |  |
| host.25 | HOST-UC-06 main the child starts only after the host app ready; when the host exits, the child stops | integration/hosted-child | HOST-UC-06 main |  |
| host.26 | HOST-UC-06 A2 uninstall removes the child runtime and never touches the connector's hosted entries (Q-B3 B) | integration/hosted-child | HOST-UC-06 A2 |  |
| host.27 | HOST-UC-06 A2 uninstall offers the board archive export first |  | — | retired: withdrawn by an earlier requirement (withdrawn: the board archive export no longer exists (board_export and the uninstall expor) |
| host.28 | HOST-UC-06 post the overlay inserts dsh-instance-child with config exactly {targetUrl} for a blank target | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| host.29 | HOST-UC-06 post the overlay inserts dsh-instance-child with config exactly {targetUrl} for the host connector URL | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| host.30 | HOST-UC-06 post the overlay inserts dsh-instance-child with config exactly {targetUrl} for a remote target | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| host.31 | HOST-UC-06 post no overlay row config holds admissionKey or any 64-hex secret (the key derives from the lifecycle secret) | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| host.32 | HOST-UC-06 post the overlay carries no planted token value, whatever the child row is given | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| host.33 | HOST-EP-01 row 3 the host row's inject list names no session, approval, question or prompt service | packages/dsh-instance | HOST-EP-01 row 3 |  |
| host.34 | HOST-EP-01 row 2 dshConnectorTokens is looked up at runtime, not listed in inject (an optional service must not gate the row) | packages/dsh-instance | HOST-EP-01 row 2 |  |
| host.35 | HOST-EP-01 R-HOST-05 (MULTI-2) the host Config removes targetUrl override entirely and still has no token or credential-reference field | packages/dsh-instance | HOST-EP-01 R-HOST-05 (MULTI-2) |  |
| host.36 | HOST-EP-01 row 4 the instance's browser code is its own settings page only (QD1 = B): dsh.client web, ./client export, client.js + its two chunks shipped | packages/dsh-instance | HOST-EP-01 row 4 shipped |  |
| host.37 | HOST-EP-01 row 4 the settings page registers at plugins.row.config only (no other host-DSH slot) | packages/dsh-instance | HOST-EP-01 row 4 slots | outdated: 8fdd0ef moved the page to plugins.bundle.config |
| host.38 | HOST-EP-01 row 4 the settings page shows no token field: its code sends no token or credential reference | packages/dsh-instance | HOST-EP-01 row 4 no token | now behaviour, not a source grep |
| host.39 | HOST-EP-02 row 1, 7 the planted value is in the child credential store and on the mcp-credential channel (one import frame) only | packages/dsh-instance | HOST-EP-02 row 1, 7 |  |
| host.40 | HOST-EP-02 row 3 never in the hosted record, the host's files, the locator's answers, the notice or the replies | packages/dsh-instance | HOST-EP-02 row 3 |  |
| host.41 | HOST-EP-02 row 5 never in a log line or an error the credential client or receiver produces | packages/dsh-instance | HOST-EP-02 row 5 |  |
| host.42 | HOST-EP-02 row 2, 4, 5 child home files other than its credential store, child argv and environment, temp dirs and logs of a running child | integration/hosted-child | HOST-EP-02 row 2, 4, 5 |  |
| host.43 | HOST-ST-03 row 1 none → first start → imported once; the child store holds it | packages/dsh-instance | HOST-ST-03 row 1 |  |
| host.44 | HOST-ST-03 row 2 imported → core saves its copy (reference unset, record present) → restart: present by describeRecord, nothing created | packages/dsh-instance | HOST-ST-03 row 2 |  |
| host.45 | HOST-ST-03 row 3 saved → reinstall (child home gone) → a first start again: one new createHosted, imported once | packages/dsh-instance | HOST-ST-03 row 3 |  |
| host.46 | HOST-ST-03 row 4 saved → the user deletes the entry → Retry: no token, notice hosted-entry-deleted; targetStatus token-refused/token-revoked | packages/dsh-instance | HOST-ST-03 row 4 |  |
| host.47 | HOST-ST-03 row 5 notice → Reconnect → a new entry imported once, recorded last; the notice clears; nothing retired | packages/dsh-instance | HOST-ST-03 row 5 |  |
| host.48 | HOST-ST-03 row 6 a working entry → Reconnect (rotate in one click): one createHosted, one import; the old entry stays recorded (replacing moves nothing) | packages/dsh-instance | HOST-ST-03 row 6 |  |
| host.49 | HOST-ST-03 row 7 disabled → Retry → nothing (no notice, no token) | packages/dsh-instance | HOST-ST-03 row 7 |  |
| host.50 | HOST-DT-01 row 1 blank, connector, no credential, no entry, first start → create one | packages/dsh-instance | HOST-DT-01 row 1 |  |
| host.51 | HOST-DT-01 row 2 blank, connector, credential present (reference), entry enabled, start → nothing | packages/dsh-instance, integration/hosted-child | HOST-DT-01 row 2 |  |
| host.52 | HOST-DT-01 row 2b blank, connector, credential present (saved record only), start → nothing | packages/dsh-instance | HOST-DT-01 row 2b |  |
| host.53 | HOST-DT-01 row 3 blank, connector, credential present, entry disabled, start → nothing | packages/dsh-instance | HOST-DT-01 row 3 |  |
| host.54 | HOST-DT-01 row 4 blank, connector, stale credential, entry deleted, no Retry (start) → nothing | packages/dsh-instance | HOST-DT-01 row 4 |  |
| host.55 | HOST-DT-01 row 5 blank, connector, stale credential, entry deleted, Retry → nothing, a notice (R6 = B) | packages/dsh-instance | HOST-DT-01 row 5 |  |
| host.56 | HOST-DT-01 row 8 blank, no connector, no credential, start → nothing | packages/dsh-instance | HOST-DT-01 row 8 |  |
| host.57 | HOST-DT-01 row 8b blank, a connector with another apiVersion (unusable), no credential, start → nothing | packages/dsh-instance | HOST-DT-01 row 8b |  |
| host.58 | HOST-DT-01 row 9 MULTI-2 unrelated remote field, parent connector, no credential, start → one parent import | packages/dsh-instance | HOST-DT-01 row 9 |  |
| host.59 | HOST-DT-01 row 9b MULTI-2 unrelated remote field, reserved credential present, Retry → no replacement | packages/dsh-instance | HOST-DT-01 row 9b |  |
| host.60 | HOST-DT-01 row 6 child reinstalled with the old entry enabled → create, pair, then succession (I-SUCCEED, W5) |  | — | covered by succession (see note) |
| host.61 | HOST-DT-01 row 7 pair answers already-paired → create another new entry | integration/hosted-child | HOST-DT-01 row 7 |  |
| host.62 | HOST-DT-01 probe a probe with no answer (the channel is unavailable) is not "absent": nothing is created | packages/dsh-instance | HOST-DT-01 probe |  |
| host.63 | HOST-DT-01 store the child cannot store the value → the entry key is not recorded | packages/dsh-instance | HOST-DT-01 store |  |
| host.64 | HOST-DT-targetStatus row 1 MULTI-2 extra remote field cannot replace absent actual parent entry | packages/dsh-instance | HOST-DT-targetStatus row 1 |  |
| host.65 | HOST-DT-targetStatus row 1b MULTI-2 one-character extra field cannot replace absent actual parent entry | packages/dsh-instance | HOST-DT-targetStatus row 1b |  |
| host.66 | HOST-DT-targetStatus row 2 blank, no usable dshConnectorTokens → target-unset / null | packages/dsh-instance | HOST-DT-targetStatus row 2 |  |
| host.67 | HOST-DT-targetStatus row 2b blank, dshConnectorTokens apiVersion 2 (unusable) → target-unset / null | packages/dsh-instance | HOST-DT-targetStatus row 2b |  |
| host.68 | HOST-DT-targetStatus row 3 blank, connector, no recorded entry → target-unset / null | packages/dsh-instance | HOST-DT-targetStatus row 3 |  |
| host.69 | HOST-DT-targetStatus row 4 last entry deleted → token-refused / token-revoked | packages/dsh-instance | HOST-DT-targetStatus row 4 |  |
| host.70 | HOST-DT-targetStatus row 5 last entry disabled → token-refused / token-revoked | packages/dsh-instance | HOST-DT-targetStatus row 5 |  |
| host.71 | HOST-DT-targetStatus row 6 last entry enabled → connected / null | packages/dsh-instance | HOST-DT-targetStatus row 6 |  |
| host.72 | HOST-DT-targetStatus row 7 an older entry deleted, the newest enabled → connected (the LAST entry decides) | packages/dsh-instance | HOST-DT-targetStatus row 7 |  |
| host.73 | HOST-DT-targetStatus BVA targetUrl of spaces only ('   ') counts as blank (→ target-unset, not remote) | packages/dsh-instance | HOST-DT-targetStatus BVA |  |
| host.74 | HOST-DT-reconnect row 1 child not ready → not-ready, nothing created | packages/dsh-instance | HOST-DT-reconnect row 1 |  |
| host.75 | HOST-DT-reconnect row 2 no usable dshConnectorTokens → connector-missing | packages/dsh-instance | HOST-DT-reconnect row 2 |  |
| host.76 | HOST-DT-reconnect row 2b dshConnectorTokens apiVersion 2 → connector-missing | packages/dsh-instance | HOST-DT-reconnect row 2b |  |
| host.77 | HOST-DT-reconnect row 3 MULTI-2 extra remote field cannot refuse actual-parent reconnect | packages/dsh-instance | HOST-DT-reconnect row 3 |  |
| host.78 | HOST-DT-reconnect row 4 createHosted rejects → operation-failed; nothing imported or recorded | packages/dsh-instance | HOST-DT-reconnect row 4 |  |
| host.79 | HOST-DT-reconnect row 5 the child cannot store it → credentials-unwritable; not recorded | packages/dsh-instance | HOST-DT-reconnect row 5 |  |
| host.80 | HOST-DT-reconnect row 6 no answer on the channel → credentials-unwritable | packages/dsh-instance | HOST-DT-reconnect row 6 |  |
| host.81 | HOST-DT-reconnect row 7 ready, blank, connector, writable → ok, one createHosted | packages/dsh-instance | HOST-DT-reconnect row 7 |  |
| host.82 | HOST-ST-01 row 4 Running → crash → Failed with the crash code; origin null | packages/dsh-instance | HOST-ST-01 row 4 |  |
| host.83 | HOST-ST-01 row 5 Failed → Retry → Starting | packages/dsh-instance | HOST-ST-01 row 5 |  |
| host.84 | HOST-ST-01 row 6 Running → restart → Starting: origin null and admit not-ready until ready again | packages/dsh-instance | HOST-ST-01 row 6 |  |
| host.85 | HOST-ST-01 row 6 onChange fires on a lifecycle change and its dispose stops it (idempotent) | packages/dsh-instance | HOST-ST-01 row 6 onChange |  |
| host.86 | HOST-ST-01 row 7 Running → host exits → Stopped: origin null, admit not-ready | packages/dsh-instance | HOST-ST-01 row 7 |  |
| host.87 | HOST-ST-01 row 8 Running (core disabled is not visible to the instance): the locator never reports fishball-off (Q4) | packages/dsh-instance | HOST-ST-01 row 8 |  |
| host.88 | HOST-ST-01 row 9 Stopped → Retry before host ready → Stopped (nothing restarts, nothing created) | packages/dsh-instance | HOST-ST-01 row 9 |  |
| host.89 | HOST-ST-01 row 10 Running → uninstall → Removed | integration/hosted-child | HOST-ST-01 row 10 |  |
| host.90 | HOST-ST-01 row 10 the export is offered first |  | — | retired: withdrawn by an earlier requirement (withdrawn: the board archive export no longer exists (board_export and the uninstall expor) |
| host.91 | HOST-ST-01 K the K3 locator declares apiVersion, status, onChange, origin, admit, retry, reconnect, targetStatus, agentEntry, providerSync; reconnect() is asynchronous with the five refusal codes | packages/dsh-instance, integration/connector | HOST-ST-01 K | outdated: MULTI-0 withdrew target-remote (four refusal codes) |
| host.92 | HOST-ST-01 K the real locator object is the K3 service: apiVersion 1 and every member | packages/dsh-instance, integration/connector | HOST-ST-01 K |  |
| host.93 | UIM-EP-02 row 1 origin(127.0.0.1) is http://127.0.0.1:<child port> while ready | packages/dsh-instance | UIM-EP-02 row 1 |  |
| host.94 | UIM-EP-02 row 1 admit under 127.0.0.1 resolves {url} = http://127.0.0.1:<port>/api/dsh-instance/admit?ticket=… and nothing else | packages/dsh-instance | UIM-EP-02 row 1 |  |
| host.95 | UIM-EP-02 row 1 admit under 127.0.0.1 asks for a ticket with audience 127.0.0.1:<port>, the view and the lang | packages/dsh-instance | UIM-EP-02 row 1 |  |
| host.96 | UIM-EP-02 row 2 origin(localhost) is http://localhost:<child port> while ready | packages/dsh-instance | UIM-EP-02 row 2 |  |
| host.97 | UIM-EP-02 row 2 admit under localhost resolves {url} = http://localhost:<port>/api/dsh-instance/admit?ticket=… and nothing else | packages/dsh-instance | UIM-EP-02 row 2 |  |
| host.98 | UIM-EP-02 row 2 admit under localhost asks for a ticket with audience localhost:<port>, the view and the lang | packages/dsh-instance | UIM-EP-02 row 2 |  |
| host.99 | UIM-EP-02 row 3 [::1] (Q5 = A): origin null and admit rejects not-ready, even while ready | packages/dsh-instance | UIM-EP-02 row 3 |  |
| host.100 | UIM-EP-02 row 4 a non-loopback name "fishball.example.com" → admit rejects hostname-refused; origin null | packages/dsh-instance | UIM-EP-02 row 4 |  |
| host.101 | UIM-EP-02 row 4 a non-loopback name "192.168.1.20" → admit rejects hostname-refused; origin null | packages/dsh-instance | UIM-EP-02 row 4 |  |
| host.102 | UIM-EP-02 row 4 a non-loopback name "127.0.0.2" → admit rejects hostname-refused; origin null | packages/dsh-instance | UIM-EP-02 row 4 |  |
| host.103 | UIM-EP-02 row 4 a non-loopback name "0.0.0.0" → admit rejects hostname-refused; origin null | packages/dsh-instance | UIM-EP-02 row 4 |  |
| host.104 | UIM-EP-02 row 4 a non-loopback name "" → admit rejects hostname-refused; origin null | packages/dsh-instance | UIM-EP-02 row 4 |  |
| host.105 | UIM-EP-02 row 4 a non-loopback name is refused even while the child is not ready (hostname is checked first: hostname-refused) | packages/dsh-instance | UIM-EP-02 row 4 |  |
| host.106 | UIM-EP-02 input a view outside K3 under a served hostname → admit rejects invalid-request (child.d.ts) | packages/dsh-instance | UIM-EP-02 input |  |
| host.107 | UIM-EP-02 input a lang outside K3 under a served hostname → admit rejects invalid-request (child.d.ts) | packages/dsh-instance | UIM-EP-02 input |  |
| host.108 | UIM-EP-02 mint a ticket that cannot be minted (the child left) → admit rejects not-ready | packages/dsh-instance | UIM-EP-02 mint |  |
| host.109 | UIM-EP-02 one-time two admits give two different tickets (one per frame navigation) | packages/dsh-instance | UIM-EP-02 one-time |  |
| host.110 | TICKET constants TICKET = {ttlMs: 30000, param: ticket, path: /api/dsh-instance/admit} | packages/dsh-instance | TICKET constants |  |
| host.111 | TICKET BVA-0 verify at mint + 0 ms → claims | packages/dsh-instance | TICKET BVA-0 |  |
| host.112 | TICKET BVA-29999 verify at mint + 29999 ms → claims | packages/dsh-instance | TICKET BVA-29999 |  |
| host.113 | TICKET BVA-30000 verify at mint + 30000 ms → null (expired) | packages/dsh-instance | TICKET BVA-30000 |  |
| host.114 | TICKET BVA-30001 verify at mint + 30001 ms → null (expired) | packages/dsh-instance | TICKET BVA-30001 |  |
| host.115 | TICKET audience verify with another hostname (localhost vs 127.0.0.1) → null | packages/dsh-instance | TICKET audience |  |
| host.116 | TICKET audience verify with the port + 1 → null | packages/dsh-instance | TICKET audience |  |
| host.117 | TICKET audience verify with the port - 1 → null | packages/dsh-instance | TICKET audience |  |
| host.118 | TICKET generation verify with another child generation (a restart) → null | packages/dsh-instance | TICKET generation |  |
| host.119 | TICKET key a ticket minted under another lifecycle secret does not verify; a tampered ticket does not verify | packages/dsh-instance | TICKET key |  |
| host.120 | TICKET key admissionKey(secret) is deterministic, 32 bytes, differs per secret and is not the secret itself | packages/dsh-instance | TICKET key |  |
| host.121 | TICKET secret the ticket text carries neither the lifecycle secret nor the key | packages/dsh-instance | TICKET secret |  |
| host.122 | TICKET replay the redeemer answers the claims once; a second redemption of the same ticket is null (use 1 / use 2) | packages/dsh-instance | TICKET replay |  |
| host.123 | TICKET replay a ticket replayed under another loopback hostname is refused (UIM-EP-02 row 6) | packages/dsh-instance | TICKET replay |  |
| host.124 | TICKET BVA-30000 the redeemer refuses at mint + 30000 ms and accepts at 29999 | packages/dsh-instance | TICKET BVA-30000 |  |
| host.125 | ADMIT-ROUTE ok GET under 127.0.0.1:<port> with a fresh ticket → 303 to /#view=<v>&lang=<l>, the child's own Set-Cookie, no-store, no-referrer | packages/dsh-instance | ADMIT-ROUTE ok |  |
| host.126 | ADMIT-ROUTE ok GET under localhost:<port> with a fresh ticket → 303 to /#view=<v>&lang=<l>, the child's own Set-Cookie, no-store, no-referrer | packages/dsh-instance | ADMIT-ROUTE ok |  |
| host.127 | ADMIT-ROUTE route the admission is a raw exact web route at /api/dsh-instance/admit | packages/dsh-instance | ADMIT-ROUTE route |  |
| host.128 | ADMIT-ROUTE replay the same ticket a second time → 403 (single use) | packages/dsh-instance | ADMIT-ROUTE replay |  |
| host.129 | ADMIT-ROUTE refused a ticket for 127.0.0.1 presented under localhost → 403, no cookie | packages/dsh-instance | ADMIT-ROUTE refused |  |
| host.130 | ADMIT-ROUTE refused a Host header with the port + 1 → 403, no cookie | packages/dsh-instance | ADMIT-ROUTE refused |  |
| host.131 | ADMIT-ROUTE refused a Host header [::1]:<port> (not served) → 403, no cookie | packages/dsh-instance | ADMIT-ROUTE refused |  |
| host.132 | ADMIT-ROUTE refused a non-loopback Host header → 403, no cookie | packages/dsh-instance | ADMIT-ROUTE refused |  |
| host.133 | ADMIT-ROUTE refused a ticket of another child generation → 403, no cookie | packages/dsh-instance | ADMIT-ROUTE refused |  |
| host.134 | ADMIT-ROUTE expired a ticket minted 30001 ms ago → 403; 1 ms ago → 303 | packages/dsh-instance | ADMIT-ROUTE expired |  |
| host.135 | ADMIT-ROUTE refused no ticket parameter → 403; a POST → 405 | packages/dsh-instance | ADMIT-ROUTE refused |  |
| host.136 | ADMIT-ROUTE login DSH's login issues no cookie → 403 (never a 303 without the child's own cookie) | packages/dsh-instance | ADMIT-ROUTE login |  |
| host.137 | ADMIT-ROUTE secret the launch token never reaches the browser: not in Location, the body or any header | packages/dsh-instance | ADMIT-ROUTE secret |  |
| host.138 | ADMIT-ROUTE refused every refusal answers no-store with no Location | packages/dsh-instance | ADMIT-ROUTE refused |  |
| host.139 | WIRE probe probe() with nothing stored → false | packages/dsh-instance | WIRE probe |  |
| host.140 | WIRE probe probe() with DSH_AGENT_TOKEN configured → true | packages/dsh-instance | WIRE probe |  |
| host.141 | WIRE probe probe() with only fishball-core/hosted-agent configured → true | packages/dsh-instance | WIRE probe |  |
| host.142 | WIRE probe probe() with both configured → true | packages/dsh-instance | WIRE probe |  |
| host.143 | WIRE frames frames are JSON {id, op} / {id, op: import, value}; replies {id, ok: true, present?} — the probe frame carries no value | packages/dsh-instance | WIRE frames |  |
| host.144 | WIRE import importToken(value) → {ok: true}; the child store holds it under DSH_AGENT_TOKEN | packages/dsh-instance | WIRE import |  |
| host.145 | WIRE import a store that cannot write → {ok: false, code: credentials-unwritable} | packages/dsh-instance | WIRE import |  |
| host.146 | WIRE invalid the receiver answers an import with an empty value with {ok: false, code: invalid-request} and writes nothing | packages/dsh-instance | WIRE invalid |  |
| host.147 | WIRE invalid the receiver answers an import with a non-string value with {ok: false, code: invalid-request} and writes nothing | packages/dsh-instance | WIRE invalid |  |
| host.148 | WIRE invalid the receiver answers an import with no value with {ok: false, code: invalid-request} and writes nothing | packages/dsh-instance | WIRE invalid |  |
| host.149 | WIRE invalid the receiver answers an unknown op with {ok: false, code: invalid-request} and writes nothing | packages/dsh-instance | WIRE invalid |  |
| host.150 | WIRE invalid malformed JSON is ignored: no reply, no write | packages/dsh-instance | WIRE invalid |  |
| host.151 | WIRE timeout probe() with no reply within timeoutMs rejects CREDENTIAL_CHANNEL_UNAVAILABLE | packages/dsh-instance | WIRE timeout |  |
| host.152 | WIRE close probe() pending when the transport closes rejects CREDENTIAL_CHANNEL_UNAVAILABLE | packages/dsh-instance | WIRE close |  |
| host.153 | WIRE closed probe() after close() rejects CREDENTIAL_CHANNEL_UNAVAILABLE | packages/dsh-instance | WIRE closed |  |
| host.154 | WIRE timeout importToken() with no reply within timeoutMs rejects CREDENTIAL_CHANNEL_UNAVAILABLE | packages/dsh-instance | WIRE timeout |  |
| host.155 | WIRE close importToken() pending when the transport closes rejects CREDENTIAL_CHANNEL_UNAVAILABLE | packages/dsh-instance | WIRE close |  |
| host.156 | WIRE closed importToken() after close() rejects CREDENTIAL_CHANNEL_UNAVAILABLE | packages/dsh-instance | WIRE closed |  |
| host.157 | WIRE timeout a reply just inside timeoutMs resolves (BVA: the wait is not shorter than asked) | packages/dsh-instance | WIRE timeout |  |
| host.158 | TARGET-URL row 1 childTargetUrl({"instanceTargetUrl":"","hostOrigin":"http://127.0.0.1:47000","connectorUsable":true}) → "http://127.0.0.1:47000/api/agent/mcp" | packages/dsh-instance | TARGET-URL row 1 |  |
| host.159 | TARGET-URL row 2 childTargetUrl({"instanceTargetUrl":"","hostOrigin":"http://127.0.0.1:47000","connectorUsable":false}) → "" | packages/dsh-instance | TARGET-URL row 2 |  |
| host.160 | TARGET-URL row 3 childTargetUrl({"instanceTargetUrl":"https://remote.example/api/agent/mcp","hostOrigin":"http://127.0.0.1:47000","connectorUsable":true}) → "http://127.0.0.1:47000/api/agent/mcp" | packages/dsh-instance | TARGET-URL row 3 |  |
| host.161 | TARGET-URL row 4 childTargetUrl({"instanceTargetUrl":"https://remote.example/api/agent/mcp","hostOrigin":"http://127.0.0.1:47000","connectorUsable":false}) → "" | packages/dsh-instance | TARGET-URL row 4 |  |
| host.162 | TARGET-URL row 5 childTargetUrl({"instanceTargetUrl":"   ","hostOrigin":"http://127.0.0.1:47000","connectorUsable":true}) → "http://127.0.0.1:47000/api/agent/mcp" | packages/dsh-instance | TARGET-URL row 5 |  |
| host.163 | TARGET-URL row 6 childTargetUrl({"instanceTargetUrl":"","connectorUsable":true}) → "" | packages/dsh-instance | TARGET-URL row 6 |  |
| host.164 | TARGET-URL row 7 childTargetUrl({"instanceTargetUrl":"x","hostOrigin":"http://127.0.0.1:47000","connectorUsable":true}) → "http://127.0.0.1:47000/api/agent/mcp" | packages/dsh-instance | TARGET-URL row 7 |  |
| host.165 | RECORD missing a missing file is no entries and is written at once with a new instanceId; add() keeps {format: 1, instanceId, entries} mode 0600, newest last | packages/dsh-instance | RECORD missing |  |
| host.166 | RECORD damaged a damaged record (not JSON) rejects INVALID_HOSTED_RECORD | packages/dsh-instance | RECORD damaged |  |
| host.167 | RECORD damaged a damaged record (another format) rejects INVALID_HOSTED_RECORD | packages/dsh-instance | RECORD damaged |  |
| host.168 | RECORD damaged a damaged record (entries not an array) rejects INVALID_HOSTED_RECORD | packages/dsh-instance | RECORD damaged |  |
| host.169 | ROUTES status GET /api/dsh-instance/status → 200 JSON no-store {state, code, detail, notice} | packages/dsh-instance | ROUTES status | outdated: fafbb5f added busy() and restart to the route contract |
| host.170 | ROUTES retry POST /api/dsh-instance/retry runs one retry and answers the status shape after it | packages/dsh-instance | ROUTES retry | outdated: fafbb5f added busy() and restart to the route contract |
| host.171 | ROUTES reconnect POST /api/dsh-instance/reconnect answers reconnect()'s result as it is | packages/dsh-instance | ROUTES reconnect |  |
| host.172 | ROUTES open POST open {lang: zh} under Host 127.0.0.1:49321 → {ok: true, url}; open was asked for hostname 127.0.0.1 and lang zh | packages/dsh-instance | ROUTES open |  |
| host.173 | ROUTES open POST open {lang: zh} under Host localhost:49321 → {ok: true, url}; open was asked for hostname localhost and lang zh | packages/dsh-instance | ROUTES open |  |
| host.174 | ROUTES open POST open {lang: zh} under Host LOCALHOST:49321 → {ok: true, url}; open was asked for hostname localhost and lang zh | packages/dsh-instance | ROUTES open |  |
| host.175 | ROUTES open POST open under a non-loopback Host fishball.example.com → {ok: false, code: hostname-refused}; no URL | packages/dsh-instance | ROUTES open |  |
| host.176 | ROUTES open POST open under a non-loopback Host 192.168.1.20 → {ok: false, code: hostname-refused}; no URL | packages/dsh-instance | ROUTES open |  |
| host.177 | ROUTES open POST open with body {"lang":"fr"} → refused, no admission asked | packages/dsh-instance | ROUTES open |  |
| host.178 | ROUTES open POST open with body {} → refused, no admission asked | packages/dsh-instance | ROUTES open |  |
| host.179 | ROUTES open POST open with body {"lang":"zh","view":"settings"} → refused, no admission asked | packages/dsh-instance | ROUTES open |  |
| host.180 | ROUTES open POST open with body "not json" → refused, no admission asked | packages/dsh-instance | ROUTES open |  |
| host.181 | ROUTES open the locator behind Open uses view chat (Q7: Fishball's page) through one admission | packages/dsh-instance | ROUTES open |  |
| host.182 | ROUTES models the models/check and models/add routes keep their V2 paths under /api/dsh-instance/ | packages/dsh-instance | ROUTES models |  |
| host.183 | ROUTES secret no route answer carries a token: status, retry, reconnect, open | packages/dsh-instance | ROUTES secret | outdated: fafbb5f added busy() and restart to the route contract |
| host.184 | ROUTES connector-ui dsh-connector-ui no longer registers child/models/* routes nor draws the instance card (no client.instance.js) |  | — | retired here: another repository's file layout |
| host.185 | PLACE Q2 PLACEMENT.bundles is fishball-ui, fishball-core (core last), with no fishball-board entry; fishball-ui's directory is fishball-ui | packages/dsh-instance | PLACE Q2 | outdated: 8fdd0ef, the set is fishball-core alone |
| host.186 | PLACE Q2 the composed child profile's Fishball bundles are exactly fishball-ui, fishball-core, and they end the list | packages/dsh-instance | PLACE Q2 | outdated: 8fdd0ef, the set is fishball-core alone |
| host.187 | PLACE SHELVE first start and a second start on the same home: no fishball-board in vendor/, node_modules/, dependencies, bundles, the placement record or an install spec | packages/dsh-instance | PLACE SHELVE |  |
| host.188 | PLACE Q1 fishball-ui is placed (a copy in vendor/), and its fishball-shared is placed once | packages/dsh-instance | PLACE Q1 | outdated: 8fdd0ef, the set is fishball-core alone |
| host.189 | MOVED present dsh-instance/src/child/provider-sync-target.js exists | packages/dsh-instance | MOVED present |  |
| host.190 | MOVED present dsh-instance/child-row.js exists | packages/dsh-instance | MOVED present |  |
| host.191 | MOVED present dsh-instance/client.js exists | packages/dsh-instance | MOVED present |  |
| host.192 | MOVED present dsh-instance/client.status.js exists | packages/dsh-instance | MOVED present |  |
| host.193 | MOVED present dsh-instance/client.models.js exists | packages/dsh-instance | MOVED present |  |
| host.194 | MOVED present fishball-core/src/session/route.js exists |  | — | retired here: another repository's file layout |
| host.195 | MOVED present dsh-agent-connector/host-services/ui.d.ts exists |  | — | retired here: another repository's file layout |
| host.196 | MOVED absent fishball-core/src/slim/child/admin.js is gone |  | — | retired here: another repository's file layout |
| host.197 | MOVED absent fishball-core/src/slim/child/provider-sync-target.js is gone |  | — | retired here: another repository's file layout |
| host.198 | MOVED absent dsh-instance/src/native-runtime/session-route.js is gone | packages/dsh-instance | MOVED absent |  |
| host.199 | MOVED absent dsh-instance/src/child-settings is gone | packages/dsh-instance | MOVED absent |  |
| host.200 | MOVED absent dsh-connector-ui/src/client/client.instance.js is gone |  | — | retired here: another repository's file layout |
| host.201 | MOVED absent dsh-connector-ui/src/client/client.status.js is gone |  | — | retired here: another repository's file layout |
| host.202 | MOVED absent fishball-shared/admin-protocol.js is gone |  | — | retired here: another repository's file layout |
| host.203 | MOVED absent fishball-shared/provider-sync.js is gone |  | — | retired here: another repository's file layout |
| host.204 | MOVED absent fishball-shared/provider-sync-codec.js is gone |  | — | retired here: another repository's file layout |
| host.205 | MOVED absent fishball-shared/provider-sync-host.js is gone |  | — | retired here: another repository's file layout |
| host.206 | MOVED absent fishball-shared/redact.js is gone |  | — | retired here: another repository's file layout |
| host.207 | MOVED core core's patch has no fishball-native-admin / fishball-native-provider-sync rows and core exports neither ./slim/admin nor ./slim/provider-sync-target | packages/dsh-instance | MOVED core |  |
| host.208 | MOVED session fishball-core publishes the manager-session route itself: row fishball-core-session → fishball-core/session-route → src/session/route.js (registerSessionRoute) |  | — | retired here: another repository's file layout |
| host.209 | MOVED session the instance's native-web row no longer serves /api/fishball/session | packages/dsh-instance | MOVED session |  |
| host.210 | MOVED admin — withdrawn by I-READY: admin relay deleted |  | — | retired: withdrawn by an earlier requirement (SKIP) |
| host.211 | MOVED sync-target the moved provider-sync target keeps its exports (createProviderSyncTarget, createProviderSyncTargetEndpoint, PROVIDER_SYNC_TARGET, ProviderSyncTargetError, createProviderSyncCodec, providerSyncIdentity) | packages/dsh-instance | MOVED sync-target |  |
| host.212 | MOVED child-row child-row.js is row dsh-instance-child (id and name), with config targetUrl | packages/dsh-instance | MOVED child-row |  |
| host.213 | BOUNDARY R-ARCH-10 no packages/dsh-instance file imports fishball-core, fishball-ui, fishball-board or fishball-shared | packages/dsh-instance | BOUNDARY R-ARCH-10 | failed on the old harness (git ls-files in a copy); now scans the package itself and passes |
| host.214 | BOUNDARY R-ARCH-10 the instance's manifest names no Fishball-side package in any dependency field | packages/dsh-instance | BOUNDARY R-ARCH-10 |  |
| host.215 | BOUNDARY R-ARCH-10 fishball-shared no longer holds admin-protocol, provider-sync, provider-sync-codec, provider-sync-host or redact (no export, no file) |  | — | retired here: another repository's file layout |
| host.216 | BOUNDARY packed the packed instance ships child-row.js and the settings page, and no Fishball-side package copy | packages/dsh-instance | BOUNDARY packed | failed on the old harness (git ls-files in a copy); now scans the package itself and passes |
| host.217 | SYNC names provider-sync-host uses the neutral names dsh-sync-default, dsh-sync-default-model and logger dsh-provider-sync | packages/dsh-instance | SYNC names |  |
| host.218 | SYNC Q-G7 the provider-sync target writes no default model and switches no session model (it names neither agent-default-model nor applyModel) | packages/dsh-instance, integration/hosted-child, integration/connector | SYNC Q-G7 |  |
| host.219 | SYNC Q-G7 K3 documents that model sync copies the provider and model lists only, never a default or session model | packages/dsh-instance, integration/hosted-child, integration/connector | SYNC Q-G7 |  |
| host.220 | SYNC Q-G7 a check and add from the instance's page leave the child's default model and the running session's model unchanged | packages/dsh-instance, integration/hosted-child, integration/connector | SYNC Q-G7 |  |
| host.221 | K3-UI freeze host-services/ui.d.ts declares dshConnectorUi with apiVersion 1, its six routes and the snapshot {marks, targets, attention, notice, light} |  | — | retired here: the connector's own contract (dsh-connector repo) |
| host.222 | K3-UI freeze README and index.d.ts list dshConnectorUi |  | — | retired here: the connector's own contract (dsh-connector repo) |
| host.223 | K3-UI freeze child.d.ts retry() text says Retry never creates a token (R6 = B) |  | — | retired here: the connector's own contract (dsh-connector repo) |
| host.224 | HOST-UC-01 wire the host asks over mcp-credential after each start's authenticated wire (host.js apply in a host DSH) | integration/hosted-child | HOST-UC-01 wire |  |
| host.225 | HOST-UC-01 overlay a real start writes dsh-instance-child {targetUrl: <host origin>/api/agent/mcp} with a same-DSH connector | integration/hosted-child | HOST-UC-01 overlay |  |
| host.226 | UIPD-INST-SECTIONS en headings Fishball / Model for Fishball / Launch remain; MULTI-2 removes remote target editor entirely; Open Fishball has an icon | packages/dsh-instance | UIPD-INST-SECTIONS en | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.227 | UIPD-INST-SECTIONS zh headings Fishball / Fishball 的模型 / 启动 remain; MULTI-2 removes remote target editor entirely; Open Fishball has an icon | packages/dsh-instance | UIPD-INST-SECTIONS zh | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.228 | UIPD-INST-RETRY disabled status disabled → no Retry; the status tag holds a StateDot | packages/dsh-instance | UIPD-INST-RETRY disabled | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.229 | UIPD-INST-RETRY waiting status waiting → no Retry; the status tag holds a StateDot | packages/dsh-instance | UIPD-INST-RETRY waiting | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.230 | UIPD-INST-RETRY starting status starting → no Retry; the status tag holds a StateDot | packages/dsh-instance | UIPD-INST-RETRY starting | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.231 | UIPD-INST-RETRY ready status ready → no Retry; the status tag holds a StateDot | packages/dsh-instance | UIPD-INST-RETRY ready | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.232 | UIPD-INST-RETRY stopping status stopping → no Retry; the status tag holds a StateDot | packages/dsh-instance | UIPD-INST-RETRY stopping | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.233 | UIPD-INST-RETRY stopped status stopped → no Retry; the status tag holds a StateDot | packages/dsh-instance | UIPD-INST-RETRY stopped | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.234 | UIPD-INST-RETRY failed status failed → Retry shown, variant primary; pressing it POSTs retry once; the status tag holds a StateDot | packages/dsh-instance | UIPD-INST-RETRY failed | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.235 | UIPD-INST-SYNC listed Check → each missing provider is a DSH Checkbox, ticked, labelled with its name in <strong> | packages/dsh-instance | UIPD-INST-SYNC listed | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.236 | UIPD-INST-SYNC untick one untick the second provider → Add posts {checkId, ids} with exactly the first and third | packages/dsh-instance | UIPD-INST-SYNC untick one | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.237 | UIPD-INST-SYNC untick, tick untick then tick a provider again → Add posts all three ids | packages/dsh-instance | UIPD-INST-SYNC untick, tick | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.238 | UIPD-INST-SYNC none ticked untick every provider → Add is disabled and nothing is posted | packages/dsh-instance | UIPD-INST-SYNC none ticked | outdated harness: the old page harness looked up plugins.row.config, moved by 8fdd0ef; the behaviour is unchanged and passes |
| host.239 | RFI-F01 remote, cleared (MULTI-2) extra remote field at launch/cleared live → actual-parent launch, first import and reconnect preserved | packages/dsh-instance | RFI-F01 remote, cleared (MULTI-2) |  |
| host.240 | RFI-F01 local, set remote F01 launched local, live setting set to remote → Reconnect still imports a local token ({ok:true}); targetStatus follows the local entry | packages/dsh-instance | RFI-F01 local, set remote |  |
| host.241 | RFI-F01 next start (MULTI-2) off/on after extra remote field still launches/reconnects actual parent | packages/dsh-instance | RFI-F01 next start (MULTI-2) |  |
| host.242 | RFI-F01 before launch (MULTI-2) before launch extra remote field never replaces the absent actual-parent entry | packages/dsh-instance | RFI-F01 before launch (MULTI-2) |  |
| host.243 | RFI-F01 first start local → remote F01 the setting changes between the launch and the first-start import: the launched target decides (1 import) | packages/dsh-instance | RFI-F01 first start local → remote |  |
| host.244 | RFI-F01 first start remote → blank (MULTI-2 extra field ignored) F01 the setting changes between the launch and the first-start import: the launched target decides (1 import) | packages/dsh-instance | RFI-F01 first start remote → blank (MULTI-2 extra field ignored) |  |
| host.245 | RFI-F01 wire replaced, reconnect F01 reconnect: the credential client is replaced while createHosted is in flight → the value reaches neither client; nothing recorded; not-ready | packages/dsh-instance | RFI-F01 wire replaced, reconnect |  |
| host.246 | RFI-F01 wire replaced, firstStart F01 firstStart: the credential client is replaced while createHosted is in flight → the value reaches neither client; nothing recorded | packages/dsh-instance | RFI-F01 wire replaced, firstStart |  |
| host.247 | RFI-F05 promise F05 close() returns a Promise; with nothing running it settles | packages/dsh-instance | RFI-F05 promise |  |
| host.248 | RFI-F05 drain F05 close() during a Reconnect whose record write is pending settles only after that write finished | packages/dsh-instance | RFI-F05 drain |  |
| host.249 | RFI-F05 after close F05 steps after close do nothing: reconnect → not-ready, firstStart creates nothing, nothing imported | packages/dsh-instance | RFI-F05 after close |  |
| host.250 | RFI-F05 reload F05 a host-row reload while the predecessor's Reconnect record write is pending: hosted.json ends with the successor's entry | packages/dsh-instance | RFI-F05 reload |  |
| host.251 | RFI-F06 present, unanswered F06 Reconnect: old credential present, import unanswered → {"ok":false,"code":"credentials-unwritable"}; one import, no retry; recorded [] | packages/dsh-instance | RFI-F06 present, unanswered |  |
| host.252 | RFI-F06 absent, unanswered F06 Reconnect: old credential absent, import unanswered → {"ok":false,"code":"credentials-unwritable"}; one import, no retry; recorded [] | packages/dsh-instance | RFI-F06 absent, unanswered |  |
| host.253 | RFI-F06 present, ok F06 Reconnect: old credential present, import {"ok":true} → {"ok":true}; one import, no retry; recorded ["fbtest-entry-1"] | packages/dsh-instance | RFI-F06 present, ok |  |
| host.254 | RFI-F06 absent, ok F06 Reconnect: old credential absent, import {"ok":true} → {"ok":true}; one import, no retry; recorded ["fbtest-entry-1"] | packages/dsh-instance | RFI-F06 absent, ok |  |
| host.255 | RFI-F06 present, refused F06 Reconnect: old credential present, import {"ok":false,"code":"credentials-unwritable"} → {"ok":false,"code":"credentials-unwritable"}; one import, no retry; recorded [] | packages/dsh-instance | RFI-F06 present, refused |  |
| host.256 | RFI-F06 notice kept F06 an unanswered Reconnect import keeps the hosted-entry-deleted notice and records nothing | packages/dsh-instance | RFI-F06 notice kept |  |
| host.257 | RFI-F06 first start unanswered F06 the first-start import unanswered: one import (no retry), recorded [] | packages/dsh-instance | RFI-F06 first start unanswered |  |
| host.258 | RFI-F06 first start ok F06 the first-start import ok: one import (no retry), recorded ["fbtest-entry-1"] | packages/dsh-instance | RFI-F06 first start ok |  |
| host.259 | RFI-F06 first start refused F06 the first-start import refused: one import (no retry), recorded [] | packages/dsh-instance | RFI-F06 first start refused |  |
| host.260 | RFI-F07 off-on F07 off while the appReady start is in progress stops at once; on again before its cleanup ends → a second start, ready | packages/dsh-instance | RFI-F07 off-on |  |
| host.261 | RFI-F08 alias, enabled true F08 main home is a symlink (enabled true): no hosted.json or fishball folder anywhere; warn "hosted record unreadable (%s)" with INVALID_MAIN_HOME; Reconnect not-ready | packages/dsh-instance | RFI-F08 alias, enabled true |  |
| host.262 | RFI-F08 alias, enabled false F08 main home is a symlink (enabled false): no hosted.json or fishball folder anywhere; warn "hosted record unreadable (%s)" with INVALID_MAIN_HOME; Reconnect not-ready | packages/dsh-instance | RFI-F08 alias, enabled false |  |
| host.263 | RFI-F08 ancestor, enabled true F08 main home under a symlinked ancestor (enabled true): no hosted.json or fishball folder anywhere; warn "hosted record unreadable (%s)" with INVALID_MAIN_HOME; Reconnect not-ready | packages/dsh-instance | RFI-F08 ancestor, enabled true |  |
| host.264 | RFI-F08 ancestor, enabled false F08 main home under a symlinked ancestor (enabled false): no hosted.json or fishball folder anywhere; warn "hosted record unreadable (%s)" with INVALID_MAIN_HOME; Reconnect not-ready | packages/dsh-instance | RFI-F08 ancestor, enabled false |  |
| host.265 | RFI-F08 fishball link F08 <home>/fishball is a symlink to an outside folder: nothing written there; warn with UNSAFE_DIRECTORY; Reconnect not-ready | packages/dsh-instance | RFI-F08 fishball link |  |
| host.266 | RFI-F08 canonical F08 a canonical main home keeps working: hosted.json is created under <home>/fishball | packages/dsh-instance | RFI-F08 canonical |  |
| host.267 | RFI-F08 fishballDirectory canonical, no fishball F08 fishballDirectory: canonical, no fishball → <home>/fishball, nothing created | packages/dsh-instance | RFI-F08 fishballDirectory canonical, no fishball |  |
| host.268 | RFI-F08 fishballDirectory canonical, fishball dir F08 fishballDirectory: canonical, fishball dir → <home>/fishball, nothing created | packages/dsh-instance | RFI-F08 fishballDirectory canonical, fishball dir |  |
| host.269 | RFI-F08 fishballDirectory fishball a symlink F08 fishballDirectory: fishball a symlink → UNSAFE_DIRECTORY | packages/dsh-instance | RFI-F08 fishballDirectory fishball a symlink |  |
| host.270 | RFI-F08 fishballDirectory fishball a file F08 fishballDirectory: fishball a file → UNSAFE_DIRECTORY | packages/dsh-instance | RFI-F08 fishballDirectory fishball a file |  |
| host.271 | RFI-F08 fishballDirectory alias F08 fishballDirectory: a main home that is a symlink → INVALID_MAIN_HOME, nothing created | packages/dsh-instance | RFI-F08 fishballDirectory alias |  |
| host.272 | RFI-F08 fishballDirectory ancestor F08 fishballDirectory: a main home under a symlinked ancestor → INVALID_MAIN_HOME, nothing created | packages/dsh-instance | RFI-F08 fishballDirectory ancestor |  |
| host.273 | MULTI-2 host DT H2/H3/H4 absent extra remote credentials neither satisfy hosted probe nor alter actual-parent import policy | packages/dsh-instance | MULTI-2 host DT H2/H3/H4 absent |  |
| host.274 | MULTI-2 host DT H2/H3/H4 reference extra remote credentials neither satisfy hosted probe nor alter actual-parent import policy | packages/dsh-instance | MULTI-2 host DT H2/H3/H4 reference |  |
| host.275 | MULTI-2 host DT H2/H3/H4 record extra remote credentials neither satisfy hosted probe nor alter actual-parent import policy | packages/dsh-instance | MULTI-2 host DT H2/H3/H4 record |  |
| host.276 | MULTI-2 host ST import/core-save/restart/reconnect extra credentials survive first import, core save, restart and explicit reconnect | packages/dsh-instance | MULTI-2 host ST import/core-save/restart/reconnect |  |
| host.277 | MULTI-2 host wire EP reserved-only probe real credential receiver answers absent for extra target references/records and writes import only to reserved parent | packages/dsh-instance | MULTI-2 host wire EP reserved-only probe |  |
| host.278 | AGENT-ENTRY K3 child.d.ts declares dshInstanceChild.agentEntry() with no parameters, returning string \| null | integration/connector | AGENT-ENTRY K3 |  |
| host.279 | AGENT-ENTRY member the real locator has agentEntry() as a function | packages/dsh-instance | AGENT-ENTRY member |  |
| host.280 | AGENT-ENTRY row 0 no hosted entry recorded yet (before any start) → null | packages/dsh-instance | AGENT-ENTRY row 0 |  |
| host.281 | AGENT-ENTRY row 0 (no connector) a start with no connector records nothing → still null | packages/dsh-instance | AGENT-ENTRY row 0 (no connector) |  |
| host.282 | AGENT-ENTRY row 1 the first start records one entry → agentEntry() is that entry key | packages/dsh-instance | AGENT-ENTRY row 1 |  |
| host.283 | AGENT-ENTRY row 2 a reconnect records a second entry → agentEntry() is the newest, not the first | packages/dsh-instance | AGENT-ENTRY row 2 |  |
| host.284 | AGENT-ENTRY seeded a record from an earlier run [k-old, k-new] → agentEntry() is k-new, before any start | packages/dsh-instance | AGENT-ENTRY seeded |  |
| host.285 | AGENT-ENTRY ST null --first start--> e1 --reconnect--> e2 --reconnect--> e3; a refused reconnect (credentials-unwritable) keeps e3 | packages/dsh-instance | AGENT-ENTRY ST |  |
| host.286 | AGENT-ENTRY ST a refused first start (the child cannot store the value) records nothing → null | packages/dsh-instance | AGENT-ENTRY ST |  |
| host.287 | AGENT-ENTRY announce the first recorded entry (first start) is announced (changed fires) and agentEntry() answers it | packages/dsh-instance | AGENT-ENTRY announce first |  |
| host.288 | AGENT-ENTRY announce a newly recorded entry (reconnect) is announced (changed fires) and agentEntry() answers the new key | packages/dsh-instance | AGENT-ENTRY announce reconnect |  |
| host.289 | AGENT-ENTRY secret agentEntry() is the entry key only: it never carries the token value | packages/dsh-instance | AGENT-ENTRY secret |  |
| host.290 | AGENT-ENTRY file the file-backed record: null when missing; the newest key after a start; a reopened record over the same file answers the same key | packages/dsh-instance | AGENT-ENTRY file |  |
| placement-install.1 | PINST-ST-01 first fresh child profile, registry dead → the bundled fallback places the set: vendor tarballs, dependencies, versions, bundles fishball-ui, fishball-core (core last) | integration/release | PINST-ST-01 first | outdated: 8fdd0ef, the set is fishball-core alone |
| placement-install.2 | PINST-SHELVE first after the first placement the child profile holds nothing of fishball-board (vendor, node_modules, dependencies, bundles, undefined, install spec); its bundles end fishball-ui, fishball-core | integration/release | PINST-SHELVE first | outdated: 8fdd0ef, the set is fishball-core alone |
| placement-install.3 | PINST-ST-01 skip second run with all 2 installed at the instance version → nothing installed: package.json and pnpm-lock.yaml byte-identical | integration/release | PINST-ST-01 skip |  |
| placement-install.4 | PINST-ST-01 disable fishball-ui fishball-ui disabled by the owner (bundles edited while the child is down) → the next run keeps it off and the others on (R-BND-02) | integration/release | PINST-ST-01 disable fishball-core | outdated: 8fdd0ef, fishball-ui is not placed; the rule is the fishball-core row |
| placement-install.5 | PINST-ST-01 disable fishball-core fishball-core disabled by the owner (bundles edited while the child is down) → the next run keeps it off and the others on (R-BND-02) | integration/release | PINST-ST-01 disable fishball-core |  |
| placement-install.6 | PINST-DT-01 stale fishball-ui installed fishball-ui at 1.0.0-alpha.0 (just below the instance version) → the next run installs again: the whole set back at the instance version | integration/release | PINST-DT-01 stale fishball-core | outdated: 8fdd0ef, as above |
| placement-install.7 | PINST-DT-01 stale fishball-core installed fishball-core at 1.0.0-alpha.0 (just below the instance version) → the next run installs again: the whole set back at the instance version | integration/release | PINST-DT-01 stale fishball-core |  |
| placement-install.8 | PINST-DT-01 missing installed installed fishball-core removed from node_modules → the next run installs it again | integration/release | PINST-DT-01 missing installed |  |
| placement-install.9 | PINST-DT-01 tampered first registry dead, bundled fishball-core-1.0.0-alpha.1.tgz with its first byte flipped → PLACEMENT_INSTALL_FAILED (fresh main home) | integration/release | PINST-DT-01 tampered first |  |
| placement-install.10 | PINST-DT-01 tampered middle registry dead, bundled fishball-core-1.0.0-alpha.1.tgz with its middle byte flipped → PLACEMENT_INSTALL_FAILED (fresh main home) | integration/release | PINST-DT-01 tampered middle |  |
| placement-install.11 | PINST-DT-01 tampered last registry dead, bundled fishball-core-1.0.0-alpha.1.tgz with its last byte flipped → PLACEMENT_INSTALL_FAILED (fresh main home) | integration/release | PINST-DT-01 tampered last |  |
| placement-install.12 | PINST-DT-01 missing fishball-ui registry dead, bundled fishball-ui-1.0.0-alpha.1.tgz missing → PLACEMENT_INSTALL_FAILED (fresh main home) | integration/release | PINST-DT-01 missing fishball-core | outdated: 8fdd0ef, no fishball-ui tarball in bundled/ |
| placement-install.13 | PINST-DT-01 missing fishball-core registry dead, bundled fishball-core-1.0.0-alpha.1.tgz missing → PLACEMENT_INSTALL_FAILED (fresh main home) | integration/release | PINST-DT-01 missing fishball-core |  |
| placement-install.14 | RFI-F02 vendor symlink F02 the fallback's vendor/ is a symlink to an outside folder with a same-named tarball → UNSAFE_DIRECTORY; the outside file keeps its bytes | integration/release | RFI-F02 vendor symlink |  |
| placement-install.15 | PINST-UC-01 main a reachable registry: DSH's plugin-manager add of fishball-ui@1.0.0-alpha.1, fishball-core@1.0.0-alpha.1 places the set (no vendor fallback) — TODO REL-PUBLISH (the registry spec path needs fishball-ui and fishball-core published at the instance version; nothing is published yet) | integration/release | PINST-UC-01 main |  |
| placement.1 | HOST-UC-06 post the launch overlay inserts only required fishball-native-child and dsh-instance-child (I-READY) | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| placement.2 | HOST-UC-06 post the launch overlay disables nothing but hmr: no guarded row, no shipped preset, no dsh-instance | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| placement.3 | HOST-UC-06 post the launch overlay touches only the allowed rows: hmr, origin and port, admission, target, and the isolation rows | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| placement.4 | HOST-UC-06 post the composed child keeps every shipped preset disabled: true, the isolation config ops included | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| placement.5 | HOST-UC-06 post the launch overlay carries no token (only the non-secret entry key) — TODO I-HOST (W4: the dshInstanceChild locator, Retry, lifecycle codes such as fishball-off) | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post | was a todo in the old suite; now a real case |
| placement.6 | HOST-UC-06 post a real start: the written launch.patch.yml holds the same shape (the two runtime rows, nothing disabled but hmr) and is removed when the child stops [integration] | packages/dsh-instance, integration/hosted-child, integration/fishball-core | HOST-UC-06 post |  |
| placement.7 | HOST-EP-03 row 6 isolation the overlay sets agent-instructions projectRootMarkers to [] wherever it touches the row | packages/dsh-instance | HOST-EP-03 row 6 isolation |  |
| placement.8 | HOST-EP-03 row 6 isolation the overlay limits skill-filesystem to the child runtime with includeDefaultRoots false wherever it is composed | packages/dsh-instance | HOST-EP-03 row 6 isolation |  |
| placement.9 | HOST-EP-03 row 6 isolation the isolation edits are config only: no isolation row is disabled or inserted by the overlay | packages/dsh-instance | HOST-EP-03 row 6 isolation |  |
| placement.10 | HOST-UC-08 main 1 the child's profile holds the set members (fishball-ui, core), all on, core last [integration] | integration/hosted-child | HOST-UC-08 main 1 |  |
| placement.11 | HOST-UC-08 main 1 the child's plugin list (DSH's own profile reader) lists the set members as installed bundles, all enabled [integration] | integration/hosted-child | HOST-UC-08 main 1 |  |
| placement.12 | HOST-UC-08 A3 core ships the generic panel as the flat chunk client.settings.js beside its client.js, and in its files |  | — | retired here: another repository's file layout (fishball-core) |
| placement.13 | HOST-UC-08 A3 core drops ui/fishball-settings (the panel is not a separate client package) |  | — | retired here: another repository's file layout (fishball-core) |
| placement.14 | HOST-ST-01 row 1 Stopped → host app ready → Starting, then (row 2) Running: ready with the origin set [integration] | integration/hosted-child | HOST-ST-01 row 1 |  |
| placement.15 | HOST-ST-01 row 3 Starting → an enabled incompatible member → Failed, PROFILE_INCOMPATIBLE naming it [integration] | integration/hosted-child | HOST-ST-01 row 3 |  |
| placement.16 | PLAT-DT-01 row 1 first placement: every member placed, on, recorded, core last [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 1 |  |
| placement.17 | PLAT-DT-01 row 1 the placement record is the owner's only (mode 0600) [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 1 |  |
| placement.18 | PLAT-DT-01 row 2 recorded, present, on → stays on [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 2 |  |
| placement.19 | PLAT-DT-01 row 3 recorded, present, off → stays off (a disable survives the restart) [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 3 |  |
| placement.20 | PLAT-DT-01 row 4 recorded, deleted while off → placed again, off [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 4 |  |
| placement.21 | PLAT-DT-01 row 5 recorded, deleted while on → placed again, on [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 5 |  |
| placement.22 | PLAT-DT-01 row 7 fishball-ui off and incompatible → the start is not blocked (only enabled bundles block) [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 7 |  |
| placement.23 | PLAT-DT-01 row 6 fishball-ui on and incompatible → the child start is blocked; the status names it (PROFILE_INCOMPATIBLE) [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 6 |  |
| placement.24 | PLAT-DT-01 row 6 core on and incompatible blocks the start too (R-FB-10: core follows the same rules) — TODO I-HOST (W4: the dshInstanceChild locator, Retry, lifecycle codes such as fishball-off) | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 6 | was a todo in the old suite; now a real case |
| placement.25 | PLAT-DT-01 row 8 a toggle while the child runs takes effect at the next restart; the UI says "restart required" — TODO U-SHELL / E2E-UI (the "restart required" line in the UI) |  | — | NOT COVERED: the "restart required" UI line (old todo, owner E2E-UI); the next-start rule itself is PLAT-DT-01 rows 3 and 4 |
| placement.26 | PLAT-DT-01 row 1 core disabled by the owner: the instance starts the child anyway and reports fishball-off |  | — | retired: withdrawn by an earlier requirement (withdrawn by I-HOST (Q4 = A, R-FB-10 amended by 1.39): the instance never reports fishball) |
| placement.27 | PLAT-DT-01 row 9 the instance's own manifest selects no set member or library as a bundle or dependency of the host | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 9 |  |
| placement.28 | PLAT-DT-01 row 9 a running hosted setup: the host's plugin list holds no set member [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 9 |  |
| placement.29 | PLAT-DT-01 row 9 a running hosted setup: the host's boot graph serves no client entry of the set [integration] | packages/dsh-instance, integration/hosted-child | PLAT-DT-01 row 9 |  |
| placement.30 | PLAT-DT-04 row 1 hosted (HMR off): the instance writes the child profile with core last; guards apply from the first start [integration] | integration/hosted-child | PLAT-DT-04 row 1 |  |
| placement.31 | PLAT-DT-04 row 1 hosted: no dsh-instance is ever started in the child (no nested child) [integration] | integration/hosted-child | PLAT-DT-04 row 1 |  |
| placement.32 | HOST-UC-08 A3 a real hosted child serves fishball-page, fishball-recommend-plugins, fishball-core and fishball-ui, and no fishball-settings entry [integration] — TODO I-HOST (the instance places fishball-ui in the hosted child; until then the child has core only, so no page, Recommended tab or UI guard row) | integration/hosted-child | HOST-UC-08 A3 |  |
| placement.33 | HOST-EP-03 row 6 no settings row: the overlay inserts no panel row | packages/dsh-instance | HOST-EP-03 row 6 |  |
| placement.34 | HOST-EP-03 row 6 no overlay row points into core (core is a placed bundle; its rows come from its own patch) | packages/dsh-instance | HOST-EP-03 row 6 |  |
| placement.35 | HOST-EP-03 row 7 core's patch has no path row whose nearest package.json is fishball-core's, except its guards row fishball-core-guards | integration/hosted-child, integration/fishball-core | HOST-EP-03 row 7 |  |
| placement.36 | HOST-EP-03 row 7 core's patch inserts neither fishball-page nor fishball-recommend-plugins (they are fishball-ui's since F-UI) | integration/hosted-child, integration/fishball-core | HOST-EP-03 row 7 | outdated: 8fdd0ef / dsh-fishball 117cb2a2, fishball-ui merged into core |
| placement.37 | HOST-EP-03 row 7 a hosted child places fishball-ui, whose page and tab rows are path rows into their own packages — TODO I-HOST (the instance places fishball-ui in the hosted child; until then the child has core only, so no page, Recommended tab or UI guard row) | integration/hosted-child, integration/fishball-core | HOST-EP-03 row 7 | outdated: 8fdd0ef / dsh-fishball 117cb2a2, fishball-ui merged into core |
| placement.38 | HOST-EP-03 row 7 core's patch inserts no slim child row (fishball-native-session-tools, fishball-native-approvals, fishball-native-app, fishball-native-inbox) and its main row fishball-core is the fishball-core/main subpath | integration/hosted-child, integration/fishball-core | HOST-EP-03 row 7 |  |
| placement.39 | HOST-EP-03 row 7 the child profile and the placement record hold the set members (fishball-ui, core), and nothing else of Fishball [integration] | integration/hosted-child, integration/fishball-core | HOST-EP-03 row 7 |  |
| placement.40 | HOST-EP-03 SHELVE compose a fresh compose and a second compose on the same home: no fishball-board copy, dependency, bundle, placement-record entry or install spec; the Fishball bundles are exactly fishball-ui, fishball-core | packages/dsh-instance | PLACE SHELVE | outdated: 8fdd0ef, merged; the Fishball bundles are fishball-core alone |
| placement.41 | HOST-EP-03 SHELVE first after the first start: no fishball-board in vendor/ or node_modules/, the profile's dependencies or bundles, the placement record (not even disabled) or an install spec [integration] | integration/hosted-child | HOST-EP-03 SHELVE first |  |
| placement.42 | HOST-EP-03 SHELVE restart after a restart: no fishball-board in vendor/ or node_modules/, the profile's dependencies or bundles, the placement record (not even disabled) or an install spec [integration] | integration/hosted-child | HOST-EP-03 SHELVE restart |  |
| placement.43 | HOST-EP-03 row 7 both libraries (dsh-connector-shared, fishball-shared) and the contract-only connector sit beside core in the child, never as a profile bundle [integration] | integration/hosted-child, integration/fishball-core | HOST-EP-03 row 7 |  |
| placement.44 | HOST-EP-03 row 7 the child's copy of core carries contracts/constants.js without a generated schema (F-OWN-SCHEMA), and exactly core's files plus package.json [integration] | integration/hosted-child, integration/fishball-core | HOST-EP-03 row 7 |  |
| placement.45 | LITE-UC-03 hosted effective read-only in a hosted child's composed profile (core's patch last + the launch overlay), shipped presets off | integration/hosted-child, integration/fishball-core | LITE-UC-03 hosted |  |
| placement.46 | LITE-EP-13 hosted no ordinary child creation: every guarded row the composition has is disabled, every shipped preset off, /permission read-only only | integration/fishball-core | LITE-EP-13 hosted |  |
| placement.47 | SET-EP-12 hosted the overlay patches no sandbox-policy; the effective sandbox is core's read-only | integration/fishball-core | SET-EP-12 hosted |  |
| placement.48 | SET-EP-12 hosted a stored wider sandbox in the owner's profile layer wins (Q20 'can override'); core then reports it | integration/fishball-core | SET-EP-12 hosted |  |
| placement.49 | LITE-UC-03 hosted a real hosted child: no guarded row or shipped preset runs (the core patch applied over the placed bundles) [integration] | integration/hosted-child, integration/fishball-core | LITE-UC-03 hosted |  |
| placement.50 | LITE-UC-03 hosted the private Skills exception and a live child agent refused child creation and write — TODO E2E-UI (W6 browser flows; no browser in this suite) | integration/hosted-child, integration/fishball-core | LITE-UC-03 hosted |  |
| placement.51 | K3 settings sections unmount close panel open → mount once; panel close → unmount exactly once, with the same host [integration] |  | — | retired: withdrawn by an earlier requirement (withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core's settings are) |
| placement.52 | K3 settings sections unmount withdraw withdrawal (the disposer) while mounted → unmount once; the section leaves no trace; disposing again changes nothing [integration] |  | — | retired: withdrawn by an earlier requirement (withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core's settings are) |
| placement.53 | K3 settings sections unmount dispose the registering plugin disposed while mounted → unmount once (plugin disposal is a withdrawal) [integration] |  | — | retired: withdrawn by an earlier requirement (withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core's settings are) |
| placement.54 | K3 settings sections unmount throws a mount that threw is never unmounted (close, withdrawal or disposal); its "could not be loaded" line stays its own [integration] |  | — | retired: withdrawn by an earlier requirement (withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core's settings are) |
| placement.55 | K3 settings sections unmount reopen close then reopen → a second mount; its own unmount at the next close (once per mount, not once per section) [integration] |  | — | retired: withdrawn by an earlier requirement (withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core's settings are) |
| placement.56 | PLAT-EP-07 row 5 every importer's tarball carries a real copy of its side's library (P-1 mechanism B) | integration/release | PLAT-EP-07 row 5 | rewritten for this repository's single tarball |
| placement.57 | HOST-ST-01 row 10 Running → uninstall → Removed, the export offered first — TODO I-HOST (HOST-ST-01 row 10: uninstall with the export offer, Q-23) | integration/hosted-child | HOST-ST-01 row 10 |  |
| ready.1 | INITSYNC-DT-01 existing marker suppresses even a failing check across new coordinator instances | packages/dsh-instance | INITSYNC-DT-01 existing |  |
| ready.2 | INITSYNC-DT-02 check-refused refused check stops before add and leaves no marker | packages/dsh-instance | INITSYNC-DT-02 check-refused |  |
| ready.3 | INITSYNC-DT-03 row 0 successful check with 0/1/many missing providers adds exactly all ids or skips add | packages/dsh-instance | INITSYNC-DT-03 row 0 |  |
| ready.4 | INITSYNC-DT-03 row 1 successful check with 0/1/many missing providers adds exactly all ids or skips add | packages/dsh-instance | INITSYNC-DT-03 row 1 |  |
| ready.5 | INITSYNC-DT-03 row 3 successful check with 0/1/many missing providers adds exactly all ids or skips add | packages/dsh-instance | INITSYNC-DT-03 row 3 |  |
| ready.6 | INITSYNC-DT-04 row 1 refused add leaves no marker and logs only its code | packages/dsh-instance | INITSYNC-DT-04 row 1 |  |
| ready.7 | INITSYNC-DT-04 row 3 refused add leaves no marker and logs only its code | packages/dsh-instance | INITSYNC-DT-04 row 3 |  |
| ready.8 | INITSYNC-DT-05 added successful add records completion even for failed provider items | packages/dsh-instance | INITSYNC-DT-05 added |  |
| ready.9 | INITSYNC-DT-05 skipped successful add records completion even for failed provider items | packages/dsh-instance | INITSYNC-DT-05 skipped |  |
| ready.10 | INITSYNC-DT-05 failed successful add records completion even for failed provider items | packages/dsh-instance | INITSYNC-DT-05 failed |  |
| ready.11 | INITSYNC-DT-06 mixed-items all offered ids are submitted once despite mixed per-provider outcomes | packages/dsh-instance | INITSYNC-DT-06 mixed-items |  |
| ready.12 | INITSYNC-EP-01 check-SYNC_THROWN thrown errors resolve false with code-only diagnostics and no marker | packages/dsh-instance | INITSYNC-EP-01 check-SYNC_THROWN |  |
| ready.13 | INITSYNC-EP-01 check-uncoded thrown errors resolve false with code-only diagnostics and no marker | packages/dsh-instance | INITSYNC-EP-01 check-uncoded |  |
| ready.14 | INITSYNC-EP-01 add-SYNC_THROWN thrown errors resolve false with code-only diagnostics and no marker | packages/dsh-instance | INITSYNC-EP-01 add-SYNC_THROWN |  |
| ready.15 | INITSYNC-EP-01 add-uncoded thrown errors resolve false with code-only diagnostics and no marker | packages/dsh-instance | INITSYNC-EP-01 add-uncoded |  |
| ready.16 | INITSYNC-ST-01 check no marker → refusal → next attempt succeeds → durable marker suppresses later start | packages/dsh-instance | INITSYNC-ST-01 check |  |
| ready.17 | INITSYNC-ST-01 add no marker → refusal → next attempt succeeds → durable marker suppresses later start | packages/dsh-instance | INITSYNC-ST-01 add |  |
| ready.18 | INITSYNC-ST-02 true concurrent run calls share one pending attempt and result | packages/dsh-instance | INITSYNC-ST-02 true |  |
| ready.19 | INITSYNC-ST-02 false concurrent run calls share one pending attempt and result | packages/dsh-instance | INITSYNC-ST-02 false |  |
| ready.20 | INITSYNC-ST-03 pending-add marker is absent until the successful add completes | packages/dsh-instance | INITSYNC-ST-03 pending-add |  |
| ready.21 | INITSYNC-ST-04 reinstall removing runtime marker allows a reinstalled coordinator to sync again | packages/dsh-instance | INITSYNC-ST-04 reinstall |  |
| ready.22 | INITSYNC-WIRE-01 start start schedules automatic sync after ready without awaiting it | packages/dsh-instance | INITSYNC-WIRE-01 start |  |
| ready.23 | INITSYNC-SYSTEM-01 real-child first real child start syncs once and a restart does not | integration/hosted-child | INITSYNC-SYSTEM-01 real-child |  |
| ready.24 | IREADY-EP-01 https unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 https |  |
| ready.25 | IREADY-EP-01 remote unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 remote |  |
| ready.26 | IREADY-EP-01 localhost unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 localhost |  |
| ready.27 | IREADY-EP-01 ipv6 unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 ipv6 |  |
| ready.28 | IREADY-EP-01 no-port unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 no-port |  |
| ready.29 | IREADY-EP-01 path unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 path |  |
| ready.30 | IREADY-EP-01 username unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 username |  |
| ready.31 | IREADY-EP-01 password unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 password |  |
| ready.32 | IREADY-EP-01 query unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 query |  |
| ready.33 | IREADY-EP-01 fragment unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 fragment |  |
| ready.34 | IREADY-EP-01 number unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 number |  |
| ready.35 | IREADY-EP-01 object unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 object |  |
| ready.36 | IREADY-EP-01 null unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 null |  |
| ready.37 | IREADY-EP-01 empty unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 empty |  |
| ready.38 | IREADY-EP-01 port-above-range unsafe origin is fatal | packages/dsh-instance | IREADY-EP-01 port-above-range |  |
| ready.39 | IREADY-BVA-01 http://127.0.0.1:1 explicit loopback port boundaries and root slash accepted | packages/dsh-instance | IREADY-BVA-01 http://127.0.0.1:1 |  |
| ready.40 | IREADY-BVA-01 http://127.0.0.1:65535 explicit loopback port boundaries and root slash accepted | packages/dsh-instance | IREADY-BVA-01 http://127.0.0.1:65535 |  |
| ready.41 | IREADY-BVA-01 http://127.0.0.1:43129/ explicit loopback port boundaries and root slash accepted | packages/dsh-instance | IREADY-BVA-01 http://127.0.0.1:43129/ |  |
| ready.42 | IREADY-DT-01 row 0 services=false, appReady=false, published=false, listening=false, stopped=false | packages/dsh-instance | IREADY-DT-01 row 0 |  |
| ready.43 | IREADY-DT-01 row 1 services=true, appReady=false, published=false, listening=false, stopped=false | packages/dsh-instance | IREADY-DT-01 row 1 |  |
| ready.44 | IREADY-DT-01 row 2 services=false, appReady=true, published=false, listening=false, stopped=false | packages/dsh-instance | IREADY-DT-01 row 2 |  |
| ready.45 | IREADY-DT-01 row 3 services=true, appReady=true, published=false, listening=false, stopped=false | packages/dsh-instance | IREADY-DT-01 row 3 |  |
| ready.46 | IREADY-DT-01 row 4 services=false, appReady=false, published=true, listening=false, stopped=false | packages/dsh-instance | IREADY-DT-01 row 4 |  |
| ready.47 | IREADY-DT-01 row 5 services=true, appReady=false, published=true, listening=false, stopped=false | packages/dsh-instance | IREADY-DT-01 row 5 |  |
| ready.48 | IREADY-DT-01 row 6 services=false, appReady=true, published=true, listening=false, stopped=false | packages/dsh-instance | IREADY-DT-01 row 6 |  |
| ready.49 | IREADY-DT-01 row 7 services=true, appReady=true, published=true, listening=false, stopped=false | packages/dsh-instance | IREADY-DT-01 row 7 |  |
| ready.50 | IREADY-DT-01 row 8 services=false, appReady=false, published=false, listening=true, stopped=false | packages/dsh-instance | IREADY-DT-01 row 8 |  |
| ready.51 | IREADY-DT-01 row 9 services=true, appReady=false, published=false, listening=true, stopped=false | packages/dsh-instance | IREADY-DT-01 row 9 |  |
| ready.52 | IREADY-DT-01 row 10 services=false, appReady=true, published=false, listening=true, stopped=false | packages/dsh-instance | IREADY-DT-01 row 10 |  |
| ready.53 | IREADY-DT-01 row 11 services=true, appReady=true, published=false, listening=true, stopped=false | packages/dsh-instance | IREADY-DT-01 row 11 |  |
| ready.54 | IREADY-DT-01 row 12 services=false, appReady=false, published=true, listening=true, stopped=false | packages/dsh-instance | IREADY-DT-01 row 12 |  |
| ready.55 | IREADY-DT-01 row 13 services=true, appReady=false, published=true, listening=true, stopped=false | packages/dsh-instance | IREADY-DT-01 row 13 |  |
| ready.56 | IREADY-DT-01 row 14 services=false, appReady=true, published=true, listening=true, stopped=false | packages/dsh-instance | IREADY-DT-01 row 14 |  |
| ready.57 | IREADY-DT-01 row 15 services=true, appReady=true, published=true, listening=true, stopped=false | packages/dsh-instance | IREADY-DT-01 row 15 |  |
| ready.58 | IREADY-DT-01 row 16 services=false, appReady=false, published=false, listening=false, stopped=true | packages/dsh-instance | IREADY-DT-01 row 16 |  |
| ready.59 | IREADY-DT-01 row 17 services=true, appReady=false, published=false, listening=false, stopped=true | packages/dsh-instance | IREADY-DT-01 row 17 |  |
| ready.60 | IREADY-DT-01 row 18 services=false, appReady=true, published=false, listening=false, stopped=true | packages/dsh-instance | IREADY-DT-01 row 18 |  |
| ready.61 | IREADY-DT-01 row 19 services=true, appReady=true, published=false, listening=false, stopped=true | packages/dsh-instance | IREADY-DT-01 row 19 |  |
| ready.62 | IREADY-DT-01 row 20 services=false, appReady=false, published=true, listening=false, stopped=true | packages/dsh-instance | IREADY-DT-01 row 20 |  |
| ready.63 | IREADY-DT-01 row 21 services=true, appReady=false, published=true, listening=false, stopped=true | packages/dsh-instance | IREADY-DT-01 row 21 |  |
| ready.64 | IREADY-DT-01 row 22 services=false, appReady=true, published=true, listening=false, stopped=true | packages/dsh-instance | IREADY-DT-01 row 22 |  |
| ready.65 | IREADY-DT-01 row 23 services=true, appReady=true, published=true, listening=false, stopped=true | packages/dsh-instance | IREADY-DT-01 row 23 |  |
| ready.66 | IREADY-DT-01 row 24 services=false, appReady=false, published=false, listening=true, stopped=true | packages/dsh-instance | IREADY-DT-01 row 24 |  |
| ready.67 | IREADY-DT-01 row 25 services=true, appReady=false, published=false, listening=true, stopped=true | packages/dsh-instance | IREADY-DT-01 row 25 |  |
| ready.68 | IREADY-DT-01 row 26 services=false, appReady=true, published=false, listening=true, stopped=true | packages/dsh-instance | IREADY-DT-01 row 26 |  |
| ready.69 | IREADY-DT-01 row 27 services=true, appReady=true, published=false, listening=true, stopped=true | packages/dsh-instance | IREADY-DT-01 row 27 |  |
| ready.70 | IREADY-DT-01 row 28 services=false, appReady=false, published=true, listening=true, stopped=true | packages/dsh-instance | IREADY-DT-01 row 28 |  |
| ready.71 | IREADY-DT-01 row 29 services=true, appReady=false, published=true, listening=true, stopped=true | packages/dsh-instance | IREADY-DT-01 row 29 |  |
| ready.72 | IREADY-DT-01 row 30 services=false, appReady=true, published=true, listening=true, stopped=true | packages/dsh-instance | IREADY-DT-01 row 30 |  |
| ready.73 | IREADY-DT-01 row 31 services=true, appReady=true, published=true, listening=true, stopped=true | packages/dsh-instance | IREADY-DT-01 row 31 |  |
| ready.74 | IREADY-DT-02 https published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 https |  |
| ready.75 | IREADY-DT-02 remote published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 remote |  |
| ready.76 | IREADY-DT-02 localhost published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 localhost |  |
| ready.77 | IREADY-DT-02 ipv6 published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 ipv6 |  |
| ready.78 | IREADY-DT-02 no-port published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 no-port |  |
| ready.79 | IREADY-DT-02 path published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 path |  |
| ready.80 | IREADY-DT-02 username published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 username |  |
| ready.81 | IREADY-DT-02 password published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 password |  |
| ready.82 | IREADY-DT-02 query published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 query |  |
| ready.83 | IREADY-DT-02 fragment published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 fragment |  |
| ready.84 | IREADY-DT-02 number published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 number |  |
| ready.85 | IREADY-DT-02 object published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 object |  |
| ready.86 | IREADY-DT-02 null published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 null |  |
| ready.87 | IREADY-DT-02 empty published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 empty |  |
| ready.88 | IREADY-DT-02 port-above-range published but unsafe origin cannot satisfy readiness | packages/dsh-instance | IREADY-DT-02 port-above-range |  |
| ready.89 | IREADY-EP-02 each-base-service each missing service independently fails appReady validation | packages/dsh-instance | IREADY-EP-02 each-base-service |  |
| ready.90 | IREADY-ST-01 withdraw starting → ready → withdrawn publication → starting |  | — | retired: withdrawn by an earlier requirement (named in the case) |
| ready.91 | IREADY-ST-02 stop starting → stop → late ready signals never ready | packages/dsh-instance | IREADY-ST-02 stop |  |
| ready.92 | IREADY-EP-03 capabilities host rejects every missing base service and missing admission independently | packages/dsh-instance | IREADY-EP-03 capabilities |  |
| ready.93 | IREADY-EP-04 https ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 https |  |
| ready.94 | IREADY-EP-04 remote ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 remote |  |
| ready.95 | IREADY-EP-04 localhost ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 localhost |  |
| ready.96 | IREADY-EP-04 ipv6 ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 ipv6 |  |
| ready.97 | IREADY-EP-04 no-port ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 no-port |  |
| ready.98 | IREADY-EP-04 path ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 path |  |
| ready.99 | IREADY-EP-04 username ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 username |  |
| ready.100 | IREADY-EP-04 password ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 password |  |
| ready.101 | IREADY-EP-04 query ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 query |  |
| ready.102 | IREADY-EP-04 fragment ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 fragment |  |
| ready.103 | IREADY-EP-04 number ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 number |  |
| ready.104 | IREADY-EP-04 object ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 object |  |
| ready.105 | IREADY-EP-04 null ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 null |  |
| ready.106 | IREADY-EP-04 empty ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 empty |  |
| ready.107 | IREADY-EP-04 port-above-range ready health with invalid origin is UNSAFE_CHILD_ORIGIN | packages/dsh-instance | IREADY-EP-04 port-above-range |  |
| ready.108 | IREADY-EP-05 package no removed modules, connector peer or native-web package entry | packages/dsh-instance | IREADY-EP-05 package |  |
| ready.109 | IREADY-EP-06 imports production code contains no V2 readiness probe or connector import | packages/dsh-instance | IREADY-EP-06 imports |  |
| ready.110 | IREADY-EP-07 host host has no migration, storageDomain injection or removed native routes | packages/dsh-instance | IREADY-EP-07 host |  |
| ready.111 | IREADY-EP-09 no-core-status readiness never consults core status or performs HTTP probes | packages/dsh-instance | IREADY-EP-09 no-core-status |  |
| ready.112 | IREADY-EP-08 snapshot lifecycle snapshot excludes native-web | packages/dsh-instance | IREADY-EP-08 snapshot |  |
| ready.113 | IREADY-WIRE-01 control removed payload channel closes authenticated connection | packages/dsh-instance | IREADY-WIRE-01 control |  |
| ready.114 | IREADY-WIRE-01 admin removed payload channel closes authenticated connection | packages/dsh-instance | IREADY-WIRE-01 admin |  |
| ready.115 | IREADY-WIRE-01 instance-settings removed payload channel closes authenticated connection | packages/dsh-instance | IREADY-WIRE-01 instance-settings |  |
| ready.116 | IREADY-WIRE-01 unknown removed payload channel closes authenticated connection | packages/dsh-instance | IREADY-WIRE-01 unknown |  |
| ready.117 | IREADY-WIRE-02 provider-sync retained transport receives payload without closing | packages/dsh-instance | IREADY-WIRE-02 provider-sync |  |
| ready.118 | IREADY-WIRE-02 mcp-credential retained transport receives payload without closing | packages/dsh-instance | IREADY-WIRE-02 mcp-credential |  |
| ready.119 | IREADY-SYSTEM operations removed native-access/control operations return lifecycle error; attach publishes retained transports | integration/hosted-child | IREADY-SYSTEM operations |  |
| ready.120 | IREADY-SYSTEM fatal missing base service at appReady logs CHILD_FAILED and exits 1 | integration/hosted-child | IREADY-SYSTEM fatal |  |
| ready.121 | IREADY-SYSTEM publish-dispose nativeRuntime.publishWeb dispose withdraws lifecycle health readiness | integration/hosted-child | IREADY-SYSTEM publish-dispose |  |
| ready.122 | IREADY-SYSTEM stop real lifecycle stop never returns ready on late publication | integration/hosted-child | IREADY-SYSTEM stop |  |
| ready.123 | IREADY-SYSTEM origin attached generation childOrigin is the authenticated health origin | integration/hosted-child | IREADY-SYSTEM origin |  |
| shipped-files.1 | SHIP-DT-01 folder × none folder entry, no exclusion: ["ui/"] ships ["ui/a.js","ui/b.css","ui/tests/a.test.js","ui/tests/deep/b.test.js","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × none |  |
| shipped-files.2 | SHIP-DT-01 folder × folderSlash × before folder entry, folder with slash, exclusion before: ["!ui/tests/","ui/"] ships ["ui/a.js","ui/b.css","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × folderSlash × before |  |
| shipped-files.3 | SHIP-DT-01 folder × folderSlash × after folder entry, folder with slash, exclusion after: ["ui/","!ui/tests/"] ships ["ui/a.js","ui/b.css","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × folderSlash × after |  |
| shipped-files.4 | SHIP-DT-01 folder × folderNoSlash × before folder entry, folder without slash, exclusion before: ["!ui/tests","ui/"] ships ["ui/a.js","ui/b.css","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × folderNoSlash × before |  |
| shipped-files.5 | SHIP-DT-01 folder × folderNoSlash × after folder entry, folder without slash, exclusion after: ["ui/","!ui/tests"] ships ["ui/a.js","ui/b.css","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × folderNoSlash × after |  |
| shipped-files.6 | SHIP-DT-01 folder × file × before folder entry, single file, exclusion before: ["!ui/tests/a.test.js","ui/"] ships ["ui/a.js","ui/b.css","ui/tests/deep/b.test.js","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × file × before |  |
| shipped-files.7 | SHIP-DT-01 folder × file × after folder entry, single file, exclusion after: ["ui/","!ui/tests/a.test.js"] ships ["ui/a.js","ui/b.css","ui/tests/deep/b.test.js","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × file × after |  |
| shipped-files.8 | SHIP-DT-01 folder × missing × before folder entry, nonexistent path, not refused, exclusion before: ["!ui/ghost/","ui/"] ships ["ui/a.js","ui/b.css","ui/tests/a.test.js","ui/tests/deep/b.test.js","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × missing × before |  |
| shipped-files.9 | SHIP-DT-01 folder × missing × after folder entry, nonexistent path, not refused, exclusion after: ["ui/","!ui/ghost/"] ships ["ui/a.js","ui/b.css","ui/tests/a.test.js","ui/tests/deep/b.test.js","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × missing × after |  |
| shipped-files.10 | SHIP-DT-01 folder × prefix × before folder entry, prefix of sibling names, exclusion before: ["!ui/test","ui/"] ships ["ui/a.js","ui/b.css","ui/tests/a.test.js","ui/tests/deep/b.test.js","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × prefix × before |  |
| shipped-files.11 | SHIP-DT-01 folder × prefix × after folder entry, prefix of sibling names, exclusion after: ["ui/","!ui/test"] ships ["ui/a.js","ui/b.css","ui/tests/a.test.js","ui/tests/deep/b.test.js","ui/tests-helper.js","ui/testsuite/x.js","ui/sub/c.js"] | packages/dsh-instance | SHIP-DT-01 folder × prefix × after |  |
| shipped-files.12 | SHIP-DT-01 file × none file entry, no exclusion: ["ui/tests/a.test.js","ui/tests-helper.js"] ships ["ui/tests/a.test.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × none |  |
| shipped-files.13 | SHIP-DT-01 file × folderSlash × before file entry, folder with slash, exclusion before: ["!ui/tests/","ui/tests/a.test.js","ui/tests-helper.js"] ships ["ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × folderSlash × before |  |
| shipped-files.14 | SHIP-DT-01 file × folderSlash × after file entry, folder with slash, exclusion after: ["ui/tests/a.test.js","ui/tests-helper.js","!ui/tests/"] ships ["ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × folderSlash × after |  |
| shipped-files.15 | SHIP-DT-01 file × folderNoSlash × before file entry, folder without slash, exclusion before: ["!ui/tests","ui/tests/a.test.js","ui/tests-helper.js"] ships ["ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × folderNoSlash × before |  |
| shipped-files.16 | SHIP-DT-01 file × folderNoSlash × after file entry, folder without slash, exclusion after: ["ui/tests/a.test.js","ui/tests-helper.js","!ui/tests"] ships ["ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × folderNoSlash × after |  |
| shipped-files.17 | SHIP-DT-01 file × file × before file entry, single file, exclusion before: ["!ui/tests/a.test.js","ui/tests/a.test.js","ui/tests-helper.js"] ships ["ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × file × before |  |
| shipped-files.18 | SHIP-DT-01 file × file × after file entry, single file, exclusion after: ["ui/tests/a.test.js","ui/tests-helper.js","!ui/tests/a.test.js"] ships ["ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × file × after |  |
| shipped-files.19 | SHIP-DT-01 file × missing × before file entry, nonexistent path, not refused, exclusion before: ["!ui/ghost/","ui/tests/a.test.js","ui/tests-helper.js"] ships ["ui/tests/a.test.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × missing × before |  |
| shipped-files.20 | SHIP-DT-01 file × missing × after file entry, nonexistent path, not refused, exclusion after: ["ui/tests/a.test.js","ui/tests-helper.js","!ui/ghost/"] ships ["ui/tests/a.test.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × missing × after |  |
| shipped-files.21 | SHIP-DT-01 file × prefix × before file entry, prefix of sibling names, exclusion before: ["!ui/test","ui/tests/a.test.js","ui/tests-helper.js"] ships ["ui/tests/a.test.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × prefix × before |  |
| shipped-files.22 | SHIP-DT-01 file × prefix × after file entry, prefix of sibling names, exclusion after: ["ui/tests/a.test.js","ui/tests-helper.js","!ui/test"] ships ["ui/tests/a.test.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 file × prefix × after |  |
| shipped-files.23 | SHIP-DT-01 wildcard × none wildcard entry, no exclusion: ["ui/*.js","ui/tests/*.js"] ships ["ui/a.js","ui/tests-helper.js","ui/tests/a.test.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × none |  |
| shipped-files.24 | SHIP-DT-01 wildcard × folderSlash × before wildcard entry, folder with slash, exclusion before: ["!ui/tests/","ui/*.js","ui/tests/*.js"] ships ["ui/a.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × folderSlash × before |  |
| shipped-files.25 | SHIP-DT-01 wildcard × folderSlash × after wildcard entry, folder with slash, exclusion after: ["ui/*.js","ui/tests/*.js","!ui/tests/"] ships ["ui/a.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × folderSlash × after |  |
| shipped-files.26 | SHIP-DT-01 wildcard × folderNoSlash × before wildcard entry, folder without slash, exclusion before: ["!ui/tests","ui/*.js","ui/tests/*.js"] ships ["ui/a.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × folderNoSlash × before |  |
| shipped-files.27 | SHIP-DT-01 wildcard × folderNoSlash × after wildcard entry, folder without slash, exclusion after: ["ui/*.js","ui/tests/*.js","!ui/tests"] ships ["ui/a.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × folderNoSlash × after |  |
| shipped-files.28 | SHIP-DT-01 wildcard × file × before wildcard entry, single file, exclusion before: ["!ui/tests/a.test.js","ui/*.js","ui/tests/*.js"] ships ["ui/a.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × file × before |  |
| shipped-files.29 | SHIP-DT-01 wildcard × file × after wildcard entry, single file, exclusion after: ["ui/*.js","ui/tests/*.js","!ui/tests/a.test.js"] ships ["ui/a.js","ui/tests-helper.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × file × after |  |
| shipped-files.30 | SHIP-DT-01 wildcard × missing × before wildcard entry, nonexistent path, not refused, exclusion before: ["!ui/ghost/","ui/*.js","ui/tests/*.js"] ships ["ui/a.js","ui/tests-helper.js","ui/tests/a.test.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × missing × before |  |
| shipped-files.31 | SHIP-DT-01 wildcard × missing × after wildcard entry, nonexistent path, not refused, exclusion after: ["ui/*.js","ui/tests/*.js","!ui/ghost/"] ships ["ui/a.js","ui/tests-helper.js","ui/tests/a.test.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × missing × after |  |
| shipped-files.32 | SHIP-DT-01 wildcard × prefix × before wildcard entry, prefix of sibling names, exclusion before: ["!ui/test","ui/*.js","ui/tests/*.js"] ships ["ui/a.js","ui/tests-helper.js","ui/tests/a.test.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × prefix × before |  |
| shipped-files.33 | SHIP-DT-01 wildcard × prefix × after wildcard entry, prefix of sibling names, exclusion after: ["ui/*.js","ui/tests/*.js","!ui/test"] ships ["ui/a.js","ui/tests-helper.js","ui/tests/a.test.js"] | packages/dsh-instance | SHIP-DT-01 wildcard × prefix × after |  |
| shipped-files.34 | SHIP-EP-01 nested a deeper exclusion "!ui/tests/deep/" keeps ui/tests/a.test.js: ["ui/","!ui/tests/deep/"] | packages/dsh-instance | SHIP-EP-01 nested |  |
| shipped-files.35 | SHIP-EP-01 nested a deeper exclusion without slash "!ui/tests/deep" keeps ui/tests/a.test.js: ["ui/","!ui/tests/deep"] | packages/dsh-instance | SHIP-EP-01 nested |  |
| shipped-files.36 | SHIP-EP-01 equal the exclusion equals the positive folder "!ui/": nothing of it ships: ["ui/","!ui/"] | packages/dsh-instance | SHIP-EP-01 equal |  |
| shipped-files.37 | SHIP-EP-01 equal the exclusion names the positive folder without slash "!ui": nothing of it ships: ["ui/","!ui"] | packages/dsh-instance | SHIP-EP-01 equal |  |
| shipped-files.38 | SHIP-EP-01 parent a parent-folder exclusion drops the whole ui tree, another entry (src/) still ships: ["ui/","src/","!ui"] | packages/dsh-instance | SHIP-EP-01 parent |  |
| shipped-files.39 | SHIP-EP-01 later positive a positive file entry AFTER the exclusion, inside the excluded folder, stays out: ["ui/","!ui/tests/","ui/tests/a.test.js"] | packages/dsh-instance | SHIP-EP-01 later positive |  |
| shipped-files.40 | SHIP-EP-01 later positive a positive folder entry AFTER the exclusion, inside the excluded folder, stays out: ["ui/","!ui/tests","ui/tests/"] | packages/dsh-instance | SHIP-EP-01 later positive |  |
| shipped-files.41 | SHIP-EP-01 only exclusion a list of only an existing exclusion ships package.json alone: ["!ui/tests/"] | packages/dsh-instance | SHIP-EP-01 only exclusion |  |
| shipped-files.42 | SHIP-EP-01 only exclusion a list of only a nonexistent exclusion ships package.json alone and is not refused: ["!ghost.js"] | packages/dsh-instance | SHIP-EP-01 only exclusion |  |
| shipped-files.43 | SHIP-EP-01 several two exclusions in one list both apply: ["ui/","!ui/tests/","!ui/sub"] | packages/dsh-instance | SHIP-EP-01 several |  |
| shipped-files.44 | SHIP-EP-01 top-level file a top-level file exclusion "!README.md" drops that file only: ["README.md","src/","!README.md"] | packages/dsh-instance | SHIP-EP-01 top-level file |  |
| shipped-files.45 | SHIP-EP-01 file prefix an exclusion one character short of a file name ("!ui/a.j") keeps ui/a.js: ["ui/a.js","!ui/a.j"] | packages/dsh-instance | SHIP-EP-01 file prefix |  |
| shipped-files.46 | SHIP-EP-01 file prefix an exclusion one character longer than a file name ("!ui/a.jsx", nonexistent) keeps ui/a.js: ["ui/a.js","!ui/a.jsx"] | packages/dsh-instance | SHIP-EP-01 file prefix |  |
| shipped-files.47 | SHIP-EP-02 missing positive a missing positive entry is still refused beside an exclusion: ["ui/","ghost/","!ui/tests/"] rejects PLACEMENT_SOURCE_UNAVAILABLE | packages/dsh-instance | SHIP-EP-02 missing positive |  |
| shipped-files.48 | SHIP-EP-02 symlink a symlink in a shipped part of the tree is refused beside an exclusion: ["ui/","!ui/tests/"] rejects UNSAFE_PLACEMENT_SOURCE | packages/dsh-instance | SHIP-EP-02 symlink |  |
| shipped-files.49 | SHIP-UC-01 main the real fishball-core (/Volumes/SSD1/GitHub/dsh-fishball/packages/core) ships ui/client.js and nothing under ui/tests/ | integration/fishball-core | SHIP-UC-01 main |  |
| stderr-log.1 | STDERR-UC-01 F4 report fix F4's reproduction: no fragment of the split token in either file, [truncated] written | packages/dsh-instance | STDERR-UC-01 F4 report |  |
| stderr-log.2 | STDERR-UC-01 F4 report, then a line after the discarded newline the next line is written normally | packages/dsh-instance | STDERR-UC-01 F4 report, then a line |  |
| stderr-log.3 | STDERR-EP-01 one line a newline-terminated line is written as it is | packages/dsh-instance | STDERR-EP-01 one line |  |
| stderr-log.4 | STDERR-EP-01 held to the newline text without a newline is held until the newline | packages/dsh-instance | STDERR-EP-01 held to the newline |  |
| stderr-log.5 | STDERR-EP-01 token split across chunks a token split across chunks but ended by a newline is masked whole | packages/dsh-instance | STDERR-EP-01 token split across chunks |  |
| stderr-log.6 | STDERR-EP-01 several lines in one chunk every complete line is redacted; the unterminated rest waits | packages/dsh-instance | STDERR-EP-01 several lines in one chunk |  |
| stderr-log.7 | STDERR-EP-01 Authorization line a header line is masked to its end, the next line kept | packages/dsh-instance | STDERR-EP-01 Authorization line |  |
| stderr-log.8 | STDERR-EP-02 remainder buffered text is written with a newline at the end | packages/dsh-instance | STDERR-EP-02 remainder |  |
| stderr-log.9 | STDERR-EP-02 remainder with a secret the remainder is redacted | packages/dsh-instance | STDERR-EP-02 remainder with a secret |  |
| stderr-log.10 | STDERR-EP-02 nothing buffered ending after a full line writes nothing more | packages/dsh-instance | STDERR-EP-02 nothing buffered |  |
| stderr-log.11 | STDERR-EP-02 no data a stream that ends with no data leaves the log empty | packages/dsh-instance | STDERR-EP-02 no data |  |
| stderr-log.12 | STDERR-BVA-01 cap-1 63 buffered bytes: never force-flushed | packages/dsh-instance | STDERR-BVA-01 cap-1 |  |
| stderr-log.13 | STDERR-BVA-01 cap 64 buffered bytes: never force-flushed; the 65-byte final write keeps its 52-byte head and the mark | packages/dsh-instance | STDERR-BVA-01 cap |  |
| stderr-log.14 | STDERR-BVA-01 cap+1 65 buffered bytes: the prefix to the last whitespace, then the mark; the end adds nothing | packages/dsh-instance | STDERR-BVA-01 cap+1 |  |
| stderr-log.15 | STDERR-BVA-01 cap over chunks, then +1 cap bytes over two chunks stay buffered; one more byte cuts | packages/dsh-instance | STDERR-BVA-01 cap over chunks, then +1 |  |
| stderr-log.16 | STDERR-BVA-01 cap+1, no whitespace no whitespace at all: only the mark | packages/dsh-instance | STDERR-BVA-01 cap+1, no whitespace |  |
| stderr-log.17 | STDERR-BVA-01 cap+1, whitespace first only the leading whitespace survives | packages/dsh-instance | STDERR-BVA-01 cap+1, whitespace first |  |
| stderr-log.18 | STDERR-BVA-01 cap+1, tab is whitespace a tab is a whitespace character to cut at | packages/dsh-instance | STDERR-BVA-01 cap+1, tab is whitespace |  |
| stderr-log.19 | STDERR-BVA-02 two-byte at cap 32 two-byte characters (64 bytes): kept buffered; the final write is 26 of them and the mark (64 bytes) | packages/dsh-instance | STDERR-BVA-02 two-byte at cap |  |
| stderr-log.20 | STDERR-BVA-02 two-byte cap+2 33 two-byte characters (66 bytes): cut, no whitespace → only the mark | packages/dsh-instance | STDERR-BVA-02 two-byte cap+2 |  |
| stderr-log.21 | STDERR-BVA-02 two-byte, space, next chunk 63 bytes (32 characters) stay; one more ü (65 bytes) cuts after the space | packages/dsh-instance | STDERR-BVA-02 two-byte, space, next chunk |  |
| stderr-log.22 | STDERR-BVA-02 three-byte 21 three-byte characters (63 bytes) stay; 22 (66 bytes) cut | packages/dsh-instance | STDERR-BVA-02 three-byte |  |
| stderr-log.23 | STDERR-BVA-06 remainder after a newline the cut fires on what follows a newline in the same chunk | packages/dsh-instance | STDERR-BVA-06 remainder after a newline |  |
| stderr-log.24 | STDERR-BVA-06 whitespace past the head prefix a whitespace after the first 52 bytes is not a cut point | packages/dsh-instance | STDERR-BVA-06 whitespace past the head prefix |  |
| stderr-log.25 | STDERR-BVA-06 whitespace at the last prefix byte whitespace at byte 52: the head is the whole prefix (64 bytes with the mark) | packages/dsh-instance | STDERR-BVA-06 whitespace at the last prefix byte |  |
| stderr-log.26 | STDERR-BVA-06 whitespace one past the prefix whitespace at byte 53: no whitespace in the prefix, only the mark | packages/dsh-instance | STDERR-BVA-06 whitespace one past the prefix |  |
| stderr-log.27 | STDERR-BVA-06 prefix ends mid character two-byte text across the prefix end: cut at the last whitespace, no partial character | packages/dsh-instance | STDERR-BVA-06 prefix ends mid character |  |
| stderr-log.28 | STDERR-BVA-06 redaction lengthens the head the redacted head is cut again so head and mark fit the limit | packages/dsh-instance | STDERR-BVA-06 redaction lengthens the head |  |
| stderr-log.29 | STDERR-BVA-06 second cut mid character the second cut backs off to a character boundary too | packages/dsh-instance | STDERR-BVA-06 second cut mid character |  |
| stderr-log.30 | STDERR-BVA-06 head ends inside a container string the head is cut after its last whitespace, redacted alone (the string runs to its end), then the mark | packages/dsh-instance | STDERR-BVA-06 head ends inside a container string |  |
| stderr-log.31 | STDERR-BVA-06 review probe, cap 40 the head is redacted on its own; the next line rotates head and mark together | packages/dsh-instance | STDERR-BVA-06 review probe, cap 40 |  |
| stderr-log.32 | STDERR-BVA-06 head and mark rotate together head and mark are one write: they rotate together and sit in the same file | packages/dsh-instance | STDERR-BVA-06 head and mark rotate together |  |
| stderr-log.33 | STDERR-BVA-06 review probe, cap 65536 a 131072-character line: head and mark rotate together, then the next line rotates them whole into .1 | packages/dsh-instance | STDERR-BVA-06 review probe, cap 65536 |  |
| stderr-log.34 | STDERR-BVA-04 head cut mid two-byte the head backs off to a character boundary (51 of 52 bytes) | packages/dsh-instance | STDERR-BVA-04 head cut mid two-byte |  |
| stderr-log.35 | STDERR-BVA-04 head cut mid four-byte the head backs off to a character boundary (50 of 52 bytes) | packages/dsh-instance | STDERR-BVA-04 head cut mid four-byte |  |
| stderr-log.36 | STDERR-BVA-04 limit 13 a 13-byte limit: a one-byte head and the mark | packages/dsh-instance | STDERR-BVA-04 limit 13 |  |
| stderr-log.37 | STDERR-BVA-04 limit 12 a 12-byte limit: no room for a head, only the mark | packages/dsh-instance | STDERR-BVA-04 limit 12 |  |
| stderr-log.38 | STDERR-BVA-04 limit 11 a limit below the mark (11): the final write is exactly the mark | packages/dsh-instance | STDERR-BVA-04 limit 11 |  |
| stderr-log.39 | STDERR-BVA-04 limit 4, two-byte limit 4, "éé" (at the cap) then the end: exactly the mark | packages/dsh-instance | STDERR-BVA-04 limit 4, two-byte |  |
| stderr-log.40 | STDERR-BVA-04 limit 4, over the cap limit 4, "ééé" then the end: exactly the mark (the F4 cut, no whitespace) | packages/dsh-instance | STDERR-BVA-04 limit 4, over the cap |  |
| stderr-log.41 | STDERR-BVA-05 block at the limit a 64-byte line in one chunk is written whole | packages/dsh-instance | STDERR-BVA-05 block at the limit |  |
| stderr-log.42 | STDERR-BVA-05 block one past a 65-byte line keeps its last 64 bytes | packages/dsh-instance | STDERR-BVA-05 block one past |  |
| stderr-log.43 | STDERR-BVA-05 three-byte block 30 three-byte characters and a newline in one chunk: the last 21 and the newline (64 bytes) | packages/dsh-instance | STDERR-BVA-05 three-byte block |  |
| stderr-log.44 | STDERR-BVA-05 two-byte block, mid character 40 two-byte characters and a newline: the tail starts on a boundary (31 of them, 63 bytes) | packages/dsh-instance | STDERR-BVA-05 two-byte block, mid character |  |
| stderr-log.45 | STDERR-BVA-05 ascii block a 105-byte line keeps its newest 64 bytes | packages/dsh-instance | STDERR-BVA-05 ascii block |  |
| stderr-log.46 | STDERR-BVA-05 over the limit before redaction only the limit applies after redaction: a masked line that fits is written whole | packages/dsh-instance | STDERR-BVA-05 over the limit before redaction only |  |
| stderr-log.47 | STDERR-DT-01 secret in the prefix the prefix before the cut is redacted | packages/dsh-instance | STDERR-DT-01 secret in the prefix |  |
| stderr-log.48 | STDERR-DT-01 secret after the last space a credential after the last whitespace is discarded, not written in any form | packages/dsh-instance | STDERR-DT-01 secret after the last space |  |
| stderr-log.49 | STDERR-ST-01 discard lasts to the newline later chunks with no newline are discarded too, with no second mark | packages/dsh-instance | STDERR-ST-01 discard lasts to the newline |  |
| stderr-log.50 | STDERR-ST-01 two cut lines in a row normal → cut → newline → normal → cut → newline → normal → end | packages/dsh-instance | STDERR-ST-01 two cut lines in a row |  |
| stderr-log.51 | STDERR-ST-01 cut right after a cut a new over-cap line straight after the discarding newline is cut again | packages/dsh-instance | STDERR-ST-01 cut right after a cut |  |
| stderr-log.52 | STDERR-ST-01 buffering after a discard text after the discarding newline is buffered normally and written at the end | packages/dsh-instance | STDERR-ST-01 buffering after a discard |  |
| stderr-log.53 | STDERR-ST-01 end while discarding the stream ends while discarding: nothing more is written | packages/dsh-instance | STDERR-ST-01 end while discarding |  |
| stderr-log.54 | STDERR-EP-03 null stream a null stream is a no-op: no throw, no file | packages/dsh-instance | STDERR-EP-03 null stream |  |
| stderr-log.55 | STDERR-EP-03 undefined stream a undefined stream is a no-op: no throw, no file | packages/dsh-instance | STDERR-EP-03 undefined stream |  |
| stderr-log.56 | STDERR-EP-03 missing root errors are swallowed: a root that does not exist throws nothing, now or on write | packages/dsh-instance | STDERR-EP-03 missing root |  |
| stderr-log.57 | STDERR-BVA-03 at the limit two 32-byte lines fill the file to exactly 64 bytes: no rotation | packages/dsh-instance | STDERR-BVA-03 at the limit |  |
| stderr-log.58 | STDERR-BVA-03 past the limit a third line would pass 64: the file becomes child-stderr.log.1, the line starts a new file | packages/dsh-instance | STDERR-BVA-03 past the limit |  |
| stderr-log.59 | STDERR-BVA-03 one byte past two 33-byte lines (66 bytes): the second rotates the first | packages/dsh-instance | STDERR-BVA-03 one byte past |  |
| stderr-log.60 | STDERR-ST-02 second rotation one rotation only: a second one replaces child-stderr.log.1 | packages/dsh-instance | STDERR-ST-02 second rotation |  |
| stderr-log.61 | RFI-F03-LOG probe F03 the probe in three writes: the log is exactly "credentials: [redacted]\n" and never holds "small-secret" | packages/dsh-instance | RFI-F03-LOG probe |  |
| stderr-log.62 | RFI-F03-LOG RFI-F03-probe F03 the probe: a three-line object: one write per line (fast and slow) logs exactly what one write of the whole text logs | packages/dsh-instance | RFI-F03-LOG RFI-F03-probe |  |
| stderr-log.63 | RFI-F03-LOG RFI-F03-nested F03 depth 2+: an array holding an array and an object; later lines redacted normally: one write per line (fast and slow) logs exactly what one write of the whole text logs | packages/dsh-instance | RFI-F03-LOG RFI-F03-nested |  |
| stderr-log.64 | RFI-F03-LOG RFI-F03-inspect F03 util.inspect style: a nested object with a '…' string holding }: one write per line (fast and slow) logs exactly what one write of the whole text logs | packages/dsh-instance | RFI-F03-LOG RFI-F03-inspect |  |
| stderr-log.65 | RFI-F03-LOG RFI-F03-json F03 a pretty-printed JSON member with a quoted key: one write per line (fast and slow) logs exactly what one write of the whole text logs | packages/dsh-instance | RFI-F03-LOG RFI-F03-json |  |
| stderr-log.66 | RFI-F03-LOG RFI-F03-two F03 two containers one after the other, plain lines between: one write per line (fast and slow) logs exactly what one write of the whole text logs | packages/dsh-instance | RFI-F03-LOG RFI-F03-two |  |
| stderr-log.67 | RFI-F03-LOG still open F03 a container never closed: one write per line logs what one write does; no later line is written | packages/dsh-instance | RFI-F03-LOG still open |  |
| stderr-log.68 | RFI-F03-LOG open → close F03 open container: lines written inside it add nothing; after it closes the next line is logged | packages/dsh-instance | RFI-F03-LOG open → close |  |
| stderr-log.69 | RFI-F03-LOG cut while open F03 a line over the cap is cut while a container is open: the stream is sealed with one "[redacted: rest of stream]\n" and nothing after it | packages/dsh-instance | RFI-F03-LOG cut while open |  |
| stderr-log.70 | RFI-F03-LOG seal probe F03 the fixer's probe (cap 100): a cut whose dropped rest opens a container seals the stream; "small-secret" never logged | packages/dsh-instance | RFI-F03-LOG seal probe |  |
| stderr-log.71 | RFI-F03-LOG plain cut F03 a cut whose dropped rest has no opener does not seal: the next line is logged as usual | packages/dsh-instance | RFI-F03-LOG plain cut |  |
| stderr-log.72 | RFI-F04 within F04 a synchronous burst of exactly 1024 bytes (64 lines, limit 1024): every line written, no "[dropped]\n" | packages/dsh-instance | RFI-F04 within |  |
| stderr-log.73 | RFI-F04 over F04 a synchronous burst of 256 lines (limit 1024): logging does not throw; the log ends with the newest line, holds "[dropped]\n" before the first line after the gap, and keeps order | packages/dsh-instance | RFI-F04 over |  |
| stderr-log.74 | RFI-F04 huge F04 a synchronous burst of 60000 lines (limit 1024): logging does not throw; the log ends with the newest line, holds "[dropped]\n" before the first line after the gap, and keeps order | packages/dsh-instance | RFI-F04 huge |  |
| stderr-log.75 | RFI-F04 heap F04 retained heap after a 60000-line burst is within 524288 bytes of a 64-line burst's | packages/dsh-instance | RFI-F04 heap |  |
| succession.1 | MULTI-2 host ST succession with extra credentials reinstall provisions actual parent and retires its predecessor while extra target credentials remain isolated | packages/dsh-instance | MULTI-2 host ST succession with extra credentials |  |
| succession.2 | ISUCC-DT-02 K3 the retire answers this suite scripts are exactly K3 RetireRefusalCode | packages/dsh-instance | ISUCC-DT-02 K3 |  |
| succession.3 | ISUCC-DT-01 row 1 (BVA 0) first-ever install: record empty, no credential → one new entry; no succession, retire never called | packages/dsh-instance | ISUCC-DT-01 row 1 (BVA 0) |  |
| succession.4 | ISUCC-DT-01 row 2 (BVA 1) reinstall: record lists E1, no credential → E2 created; retire(E1, E2) | packages/dsh-instance | ISUCC-DT-01 row 2 (BVA 1) |  |
| succession.5 | ISUCC-DT-01 row 3 (BVA 2) reinstall: record lists E1, E2 → E3 created; old = the newest listed before (E2): retire(E2, E3) | packages/dsh-instance | ISUCC-DT-01 row 3 (BVA 2) |  |
| succession.6 | ISUCC-DT-01 row 2 (record) the reinstall records the pending succession in hosted.json: the old entry until retire answers | packages/dsh-instance | ISUCC-DT-01 row 2 (record) |  |
| succession.7 | ISUCC-DT-01 row 4 restart (child holds its credential), nothing pending → creates nothing, retire not called (HOST-DT-02 row 5) | packages/dsh-instance | ISUCC-DT-01 row 4 |  |
| succession.8 | ISUCC-DT-01 row 5 restart (child holds its credential), succession pending → creates nothing; retire(old, newest) retried | packages/dsh-instance | ISUCC-DT-01 row 5 |  |
| succession.9 | ISUCC-DT-01 row 6 (MULTI-2) extra remote field cannot suppress actual-parent pending succession retry | packages/dsh-instance | ISUCC-DT-01 row 6 (MULTI-2) | outdated: README, the instance has no remote-target override |
| succession.10 | ISUCC-DT-01 row 7 a hand-edited record whose newest entry is the pending old one → the pending succession is dropped; retire not called | packages/dsh-instance | ISUCC-DT-01 row 7 |  |
| succession.11 | ISUCC-DT-02 row 1 ok → pending cleared; never retried (a connector change and a restart call nothing) | packages/dsh-instance | ISUCC-DT-02 row 1 |  |
| succession.12 | ISUCC-DT-02 row 2 successor-unpaired → stays pending; retried when the connector's onChange fires | packages/dsh-instance | ISUCC-DT-02 row 2 |  |
| succession.13 | ISUCC-DT-02 row 3 operation-failed → stays pending; a pair change does NOT retry it (S4: only the next start / Reconnect, row 3b) | packages/dsh-instance | ISUCC-DT-02 row 3 |  |
| succession.14 | ISUCC-DT-02 row 4 retire rejects → stays pending, like operation-failed: no retry on a pair change | packages/dsh-instance | ISUCC-DT-02 row 4 |  |
| succession.15 | ISUCC-DT-02 row 5 unknown-entry (the user deleted an entry) → pending dropped; never retried | packages/dsh-instance | ISUCC-DT-02 row 5 |  |
| succession.16 | ISUCC-DT-02 row 6 not-hosted (a user-made entry) → pending dropped; never retried | packages/dsh-instance | ISUCC-DT-02 row 6 |  |
| succession.17 | ISUCC-DT-02 row 1b ok, then the next start → no retire | packages/dsh-instance | ISUCC-DT-02 row 1b |  |
| succession.18 | ISUCC-DT-02 row 2b successor-unpaired, then the next start → retried (R-HOST-09 "at its next start") | packages/dsh-instance | ISUCC-DT-02 row 2b |  |
| succession.19 | ISUCC-DT-02 row 3b operation-failed, then the next start → retried | packages/dsh-instance | ISUCC-DT-02 row 3b |  |
| succession.20 | ISUCC-DT-02 row 4b a rejection, then the next start → retried | packages/dsh-instance | ISUCC-DT-02 row 4b |  |
| succession.21 | ISUCC-DT-02 row 5b unknown-entry, then the next start → no retire, nothing created | packages/dsh-instance | ISUCC-DT-02 row 5b |  |
| succession.22 | ISUCC-DT-02 row 6b not-hosted, then the next start → no retire, nothing created | packages/dsh-instance | ISUCC-DT-02 row 6b |  |
| succession.23 | ISUCC-DT-02 row 2c successor-unpaired twice, then ok on the second onChange → cleared; a third change calls nothing | packages/dsh-instance | ISUCC-DT-02 row 2c |  |
| succession.24 | HOST-ST-02 row 1–2 Old(E1) → reinstall → Old + New provisional → succession ok → New only (pending none) | packages/dsh-instance | HOST-ST-02 row 1–2 |  |
| succession.25 | HOST-ST-02 row 3–4 succession fails → still pending (hosted.json) → host-row restart (record reopened) → retried at the next start → ok | packages/dsh-instance | HOST-ST-02 row 3–4 |  |
| succession.26 | ISUCC-ST-01 reconnect, none nothing pending → Reconnect creates and imports one entry, moves nothing: retire never called, even after a connector change | packages/dsh-instance | ISUCC-ST-01 reconnect, none |  |
| succession.27 | ISUCC-ST-01 reconnect, pending pending(E1 → E2) → Reconnect creates E3 → the succession retargets to the newest: retire(E1, E3); no retire(E1, E2) after it (Q2) | packages/dsh-instance | ISUCC-ST-01 reconnect, pending |  |
| succession.28 | ISUCC-ST-01 second reinstall pending(E1 → E2) → a second reinstall creates E3 → retire(E1, E3): the original old kept, the intermediate E2 left alone | packages/dsh-instance | ISUCC-ST-01 second reinstall |  |
| succession.29 | HOST-DT-02 row 4 user delete + Retry: Retry creates no token and starts no succession (R-HOST-10) | packages/dsh-instance | HOST-DT-02 row 4 |  |
| succession.30 | HOST-DT-02 row 4 (Reconnect) user delete + Retry + Reconnect: a new entry, nothing pending, no retire (replacing moves nothing, Q-B1 B) | packages/dsh-instance | HOST-DT-02 row 4 (Reconnect) |  |
| succession.31 | ISUCC-ST-01 close close() disposes the onChange subscription: a connector change afterwards calls no retire | packages/dsh-instance | ISUCC-ST-01 close |  |
| succession.32 | ISUCC-ST-01 one listener host-row restarts (close, reopen) leave at most one onChange subscription: one change → one retire | packages/dsh-instance | ISUCC-ST-01 one listener |  |
| succession.33 | ISUCC-EP-01 row 1 through reinstall, a refused and a retried retire, Reconnect and a host restart: no token value in hosted.json, the warnings or the retire arguments | packages/dsh-instance | ISUCC-EP-01 row 1 |  |
| succession.34 | ISUCC-EP-01 row 2 each value is passed once, to the child's import only (one import frame per created entry) | packages/dsh-instance | ISUCC-EP-01 row 2 |  |
| succession.35 | ISUCC-EP-02 none no connector: first start, restart and Reconnect do not throw; nothing is retired | packages/dsh-instance | ISUCC-EP-02 none |  |
| succession.36 | ISUCC-EP-02 no retire a connector without retire (or onChange): the reinstall creates and imports, and nothing throws | packages/dsh-instance | ISUCC-EP-02 no retire |  |
| succession.37 | ISUCC-EP-02 no onChange a connector with retire but without onChange: successor-unpaired → retried at each start (no prompt retry) | packages/dsh-instance | ISUCC-EP-02 no onChange |  |
| succession.38 | ISUCC-INT-01 HOST-UC-03 reinstall → retire refused successor-unpaired → the successor pairs → onChange → the retried retire moves the session and the name; the old entry is gone | integration/connector | ISUCC-INT-01 HOST-UC-03 | failed on the old harness (the connector's SDK imports did not resolve); rebuilt on a real host DSH and passes |
| succession.39 | ISUCC-INT-01 restart a restart with the successor already paired: no new entry; the pending retire runs at the start | integration/connector | ISUCC-INT-01 restart | failed on the old harness (the connector's SDK imports did not resolve); rebuilt on a real host DSH and passes |
| succession.40 | ISUCC-DT-03 row 1 earlier R1, now R2 (uninstall / runtime reset) → succession: retire(E1, E2) | packages/dsh-instance | ISUCC-DT-03 row 1 |  |
| succession.41 | ISUCC-DT-03 row 2 earlier R1, now R1 (core dropped its copy: a Connect in the child) → no succession (R-HOST-10: never a replace) | packages/dsh-instance | ISUCC-DT-03 row 2 |  |
| succession.42 | ISUCC-DT-03 row 3 earlier runtime not recorded (a pre-I-SUCCEED record), now R2 → succession | packages/dsh-instance | ISUCC-DT-03 row 3 |  |
| succession.43 | ISUCC-DT-03 row 4 earlier R1, runtimeId() now undefined → no succession | packages/dsh-instance | ISUCC-DT-03 row 4 |  |
| succession.44 | ISUCC-DT-03 row 4b earlier runtime not recorded, runtimeId() now undefined → no succession | packages/dsh-instance | ISUCC-DT-03 row 4b |  |
| succession.45 | ISUCC-DT-03 row 5 (record) the new entry's runtime is always recorded: the first install, a same-runtime first start and a reinstall each leave the runtime now in hosted.json | packages/dsh-instance | ISUCC-DT-03 row 5 (record) |  |
| succession.46 | ISUCC-DT-03 row 6 (Reconnect) Reconnect under a new runtime id records it and starts no succession; a first start under that runtime then starts none either | packages/dsh-instance | ISUCC-DT-03 row 6 (Reconnect) |  |
| succession.47 | ISUCC-DT-03 row 7 (no runtime id at install) runtimeId() undefined throughout: first install and a later first start → two entries, no succession | packages/dsh-instance | ISUCC-DT-03 row 7 (no runtime id at install) |  |
| succession.48 | ISUCC-ST-02 row 1 write fails → no retire while the successor is unrecorded, not even on a pair change; hosted.json still lists E1 only | packages/dsh-instance | ISUCC-ST-02 row 1 |  |
| succession.49 | ISUCC-ST-02 row 2 (next start) writes recover → the next start replays the add (E2, its pending succession) before retire(E1, E2); nothing new is created | packages/dsh-instance | ISUCC-ST-02 row 2 (next start) |  |
| succession.50 | ISUCC-ST-02 row 2 (pair change) writes recover → a pair change replays the add (E2, its pending succession) before retire(E1, E2); nothing new is created | packages/dsh-instance | ISUCC-ST-02 row 2 (pair change) |  |
| succession.51 | ISUCC-ST-02 row 2 (replay first) the replayed add reaches hosted.json before retire is called (the successor is recorded when retire runs) | packages/dsh-instance | ISUCC-ST-02 row 2 (replay first) |  |
| succession.52 | ISUCC-ST-02 row 3 (Reconnect) writes recover → Reconnect replays E2 first, then records its own E3, in creation order; the succession keeps old E1 and targets the newest E3 | packages/dsh-instance | ISUCC-ST-02 row 3 (Reconnect) |  |
| succession.53 | ISUCC-ST-02 row 4 (queue) two unrecorded entries (the reinstall's E2, then a Reconnect's E3 while writes still fail) → once writes succeed both are written in creation order; pending old E1, successor E3 | packages/dsh-instance | ISUCC-ST-02 row 4 (queue) |  |
| succession.54 | ISUCC-ST-02 row 5 the settle write fails after retire ok → nothing is created then, nor at the next start (the child holds its credential, R-HOST-05) | packages/dsh-instance | ISUCC-ST-02 row 5 |  |
| succession.55 | ISUCC-ST-03 row 1 close() while retire is in flight → when it answers ok, nothing more is written to hosted.json and no retire follows | packages/dsh-instance | ISUCC-ST-03 row 1 |  |
| succession.56 | ISUCC-ST-03 row 2 close() with a pair-change retry queued behind an in-flight retire → the queued step calls no retire and writes nothing | packages/dsh-instance | ISUCC-ST-03 row 2 |  |
| succession.57 | ISUCC-DT-02 row 3c (Reconnect) operation-failed → no retry on a pair change; the next Reconnect retries it, retargeted to its new entry: retire(E1, E3) | packages/dsh-instance | ISUCC-DT-02 row 3c (Reconnect) |  |
| succession.58 | ISUCC-DT-02 row 3d (then unpaired) operation-failed, then at the next start successor-unpaired → a pair change retries again | packages/dsh-instance | ISUCC-DT-02 row 3d (then unpaired) |  |
| succession.59 | ISUCC-ST-01 subscribe first the onChange subscription exists when retire is first called | packages/dsh-instance | ISUCC-ST-01 subscribe first |  |
| succession.60 | ISUCC-ST-01 pair during the call a pair change that lands while retire is in flight (answered successor-unpaired) is not missed: retire is called again | packages/dsh-instance | ISUCC-ST-01 pair during the call |  |
| succession.61 | ISUCC-DT-01 row 8 (no entries) a record with a pending succession but no entries → the pending one is dropped; no retire(old, undefined) | packages/dsh-instance | ISUCC-DT-01 row 8 (no entries) |  |
| succession.62 | RFI-F06 unanswered F06 pending(E1 → E2), old credential present, Reconnect's import: the wire closes while the store write hangs (no answer) → credentials-unwritable; E3 not recorded; no retire aimed at E3; the pending old entry kept | packages/dsh-instance | RFI-F06 unanswered |  |
| succession.63 | RFI-F06 refused F06 pending(E1 → E2), old credential present, Reconnect's import: the child answers its own refusal → credentials-unwritable; E3 not recorded; no retire aimed at E3; the pending old entry kept | packages/dsh-instance | RFI-F06 refused |  |
| succession.64 | HOST-UC-03 main 1 a real reinstalled child DSH pairs nameless (name-taken), then takes the old name in the succession — TODO E2E: needs a real hosted child DSH launch (HOST-UC-03 main 1) | integration/hosted-child | HOST-UC-03 main 1 |  |
| succession.65 | HOST-DT-01 row 7 pair answers already-paired → create another new entry — TODO E2E: needs a real hosted child DSH launch (HOST-DT-01 rule 7: the pair answer comes from core in a running child) | integration/hosted-child | HOST-DT-01 row 7 |  |
| uninstall.1 | UNINST-DT alive: exit 0, pid listed a recorded child whose ps probe ends "alive: exit 0, pid listed" → refused CHILD_RUNNING, nothing removed | packages/dsh-instance | UNINST-DT alive: exit 0, pid listed |  |
| uninstall.2 | UNINST-DT dead: exit 1, empty output a recorded child whose ps probe ends "dead: exit 1, empty output" → the tree is removed | packages/dsh-instance | UNINST-DT dead: exit 1, empty output |  |
| uninstall.3 | UNINST-DT cannot spawn: spawn throws a recorded child whose ps probe ends "cannot spawn: spawn throws" → refused CHILD_STATE_UNKNOWN, nothing removed | packages/dsh-instance | UNINST-DT cannot spawn: spawn throws |  |
| uninstall.4 | UNINST-DT cannot spawn: error event a recorded child whose ps probe ends "cannot spawn: error event" → refused CHILD_STATE_UNKNOWN, nothing removed | packages/dsh-instance | UNINST-DT cannot spawn: error event |  |
| uninstall.5 | UNINST-DT fails: exit 2 a recorded child whose ps probe ends "fails: exit 2" → refused CHILD_STATE_UNKNOWN, nothing removed | packages/dsh-instance | UNINST-DT fails: exit 2 |  |
| uninstall.6 | UNINST-DT unreadable: exit 0, empty output a recorded child whose ps probe ends "unreadable: exit 0, empty output" → refused CHILD_STATE_UNKNOWN, nothing removed | packages/dsh-instance | UNINST-DT unreadable: exit 0, empty output |  |
| uninstall.7 | UNINST-DT unreadable: exit 0, garbage a recorded child whose ps probe ends "unreadable: exit 0, garbage" → refused CHILD_STATE_UNKNOWN, nothing removed | packages/dsh-instance | UNINST-DT unreadable: exit 0, garbage |  |
| uninstall.8 | UNINST-DT unreadable: exit 1, output a recorded child whose ps probe ends "unreadable: exit 1, output" → refused CHILD_STATE_UNKNOWN, nothing removed | packages/dsh-instance | UNINST-DT unreadable: exit 1, output |  |
| uninstall.9 | UNINST-DT no pid record an active record with no pid record for it → refused CHILD_STATE_UNKNOWN, nothing removed | packages/dsh-instance | UNINST-DT no pid record |  |
| uninstall.10 | UNINST-DT no recorded child a tree with no active record → removed | packages/dsh-instance | UNINST-DT no recorded child |  |
| uninstall.11 | UNINST-CLI no tree no runtime tree → "Nothing to remove", exit 0 | packages/dsh-instance | UNINST-CLI no tree |  |
| uninstall.12 | UNINST-CLI state unknown: ps cannot be run ps cannot be run → exit 1 with CHILD_STATE_UNKNOWN and the message for that cause; nothing removed | packages/dsh-instance | UNINST-CLI state unknown: ps cannot be run |  |
| uninstall.13 | UNINST-CLI state unknown: no pid record no pid record → exit 1 with CHILD_STATE_UNKNOWN and the message for that cause; nothing removed | packages/dsh-instance | UNINST-CLI state unknown: no pid record |  |
