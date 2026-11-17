# F-STATUS — use cases and test design

Source of truth: the F-STATUS brief relayed by the dev session (2026-11-16): R-FB-03, R-FB-04
(REM-DT-01), design §6.3a (Connect), R-BND-05 / TQ-17 (PLAT-DT-02, rewritten for board only),
HOST-DT-03 rule 10, Q-G1, R-FB-07 (withdrawn), R-FB-09 / design §5a.2, R-EXT-14, R-FB-10, and the
relayed exported surface (`createStatus`, `statusOf`, `STATUS_MODEL`, `STATUS_TEXT`, `stripView`).
The implementation under `packages/core/src/status/` and `packages/fishball-ui/src/status/` (the strip
view, moved from core's `ui/status/` by F-UI) was not read.

Actors: the **owner** (reads the strip on Fishball's page), **core's status** (`createStatus`),
its ports (core's link, Connect, the guard report, the bridge façade, the manager notice), DSH's
host services (`appReady`, `pluginManager`, `loader`, the two Cordis events).

## UC-STATUS-01 — The owner reads core's target status (main flow)

1. Core starts; F-WIRE calls `createStatus(ctx, ports)`.
2. The snapshot carries `fishball: on`, the link's `{state, code}` and a `line` derived by the
   line decision table (F-STATUS-DT-01 below).
3. The strip (`stripView`) shows the link line: its kind is the line's kind, its text names the
   code when there is one, in the chosen language (en default; an unknown language falls back to en).
4. Each change of an input (link, Connect, guards, bridge, app ready, `plugin-manager/changed`,
   `settings/document-updated`) that changes the snapshot emits it once to every listener.

- **A1 (remote target, no grant):** target usable, link not connected (any word), Connect
  `needs-authorization` / `failed` → the strip shows the **Connect** control (`connect`).
- **A2 (attempt pending):** Connect `authorizing` → line `authorizing` ("finish on the approval
  page"), control `cancel`.
- **A3 (no CIMD URL):** Connect `needs-configuration` with its code → line names the code; no control.
- **A4 (connected):** link `connected` → line `connected`, no control, whatever Connect says.
- **A5 (target changed in settings):** `settings/document-updated` → `target()` re-read; the line
  follows the new target's usability.
- **E1 (target refused by core):** target not usable (blank, `http:` to a non-loopback host, a
  userinfo, a non-http(s) scheme) → the link's own word (`target-unset` with `target-insecure` /
  `target-invalid` / null), no control.
- **E2 (target down / incompatible):** `target-unreachable` with `TARGET_UNREACHABLE` or
  `TARGET_INCOMPATIBLE` → the link line; with Connect `needs-authorization` / `failed` the control
  is `connect`, and a pending attempt shows `authorizing` + `cancel` (amended 2026-11-16: the old
  "unreachable → no control" rule is withdrawn).
- **E3 (credential refused):** `token-refused` with `TOKEN_REFUSED` or `token-revoked` → the word
  and the code are kept; with Connect present and not authorized, the control is `connect`.
- **E4 (a listener throws):** every other listener still gets the snapshot; status keeps working.
- Postconditions: reading status sends nothing (no Connect begin/cancel, no notice outside the
  guards rule, no plugin-manager or loader mutation, no network), writes nothing, and no token value
  or target URL appears in the snapshot or the strip. There is no token field anywhere.

## UC-STATUS-02 — Core reports a missing set member (R-BND-05, TQ-17; PLAT-DT-02 rewritten)

1. Until app ready, `set` is null.
2. At app ready core reads `pluginManager.listBundles()` and the loader's entries and computes `set`
   for the only checked member, `fishball-board`.
3. On each `plugin-manager/changed` it computes `set` again.

- **A1:** board not installed → `ok`, nothing reported. **A2:** board switched off by the owner →
  `ok`. **E1:** board enabled but skipped (its bundle carries `error.code`, e.g.
  `incompatible-version`) → `plugin-set-incomplete`, missing `{fishball-board, skipped, <code>}`.
  **E2:** board enabled, one of its rows failed to load (loader entry `fiber.state` FAILED = 3, or
  a live entry with no fiber once its import settled: the loader catches an import error) →
  missing `{fishball-board, failed, null}`. A row still loading (`_initTask` pending or fiber
  LOADING) when `plugin-manager/changed` fires is classified once it settles (amended 2026-11-16).
- The strip's set line names each missing member and its reason word, translated (en `skipped` /
  `failed to start`; zh differs).
- **A3:** no `pluginManager` service → `set` stays null.
- Never reported: `fishball-ui` (Q-G1), `fishball-hosted-settings` (HOST-DT-03 rule 10), any
  Watchdog (R-FB-07 withdrawn), any bundle that is not a checked member.

### PLAT-DT-02 (rewritten for board only)

| Rule | board | Core's `set` |
| --- | --- | --- |
| 1 | on, loaded | `ok`, missing `[]` |
| 2 | not installed (absent; or listed with installed false, enabled false) | `ok`, nothing reported |
| 3 | enabled but skipped (incompatible) | `plugin-set-incomplete`, names `fishball-board` (reason `skipped`, the manager's code) |
| 4 | enabled, a row failed to load (fiber FAILED, or no fiber after its import settled; classified after a pending load settles) | `plugin-set-incomplete` (reason `failed`, code null) |
| 5 | off (owner switched the bundle off; also while incompatible) | `ok`, nothing reported |
| 6 | enabled, its row switched off by the owner (entry disabled) | `ok`, nothing reported (F-STATUS-xx: "a member the owner switched off") |

Old columns fold-notify / Watchdog and old rules 3–4: **withdrawn**.

**PLAT-EP-04 row 3** (Watchdog only, no core): **withdrawn** with Watchdog (requirements 1.37);
no runnable case.

Added rows (dev session decision 2026-11-16, under R-BND-05 and design §8.2): a board selected in
the profile whose package cannot be resolved or read is "enabled but skipped" (DSH's boot skips it
too: `loadProfileDirectory` `skippedBundles`), reported with whatever `error.code` DSH gives.
"Not installed" means not selected (`enabled: false`) or not listed at all.

| Rule | board | Core's `set` |
| --- | --- | --- |
| 3 unresolved | selected, package not resolvable (`enabled: true, installed: false, error: not-bundle`) | `plugin-set-incomplete` (reason `skipped`, code `not-bundle`) |
| 3 unreadable | selected and installed, package unreadable (`enabled: true, installed: true, error: not-bundle`) | `plugin-set-incomplete` (reason `skipped`, code `not-bundle`) |
| 2 unselected unreadable | not selected, package unreadable (`enabled: false, error: not-bundle`) | `ok`, nothing reported |

## UC-STATUS-03 — Guards overridden (R-FB-09, design §5a.2)

1. The guard report becomes `guards-overridden` with a list.
2. The snapshot carries the report; the strip shows a `guards-overridden` line naming each guard.
3. The first such report sends ONE notice to Fishball's manager per DSH start, i.e. per process:
   `{pluginId: fishball-core, dedupeKey: fishball-status:guards:<one id per process>, text: guardsNotice(list joined by ', ')}`.
- **A1:** later reports (ok, or overridden again with another list) change only the strip.
- **A2 (amended 2026-11-16):** an HMR recompose re-runs `createStatus` in the same process: it uses
  the same dedupe key, and may notify again with it (the manager answers `duplicate`, so still one
  notice). A new process is a new start with another key (checked with a plain Node probe process,
  key-probe.mjs; not a DSH host).
- **E1 (amended 2026-11-16):** the notice rejects → logged, and retried with the same key at the next
  refresh that still sees `guards-overridden` (not on an ok one, never in a loop); never retried after
  an accepted notice. Status keeps working.
- **E2:** `close()` before the first overridden report → no notice.

## UC-STATUS-04 — Contributed tools (R-EXT-14)

`contributedTools` is the bridge's count (null without the bridge). Fishball's decision on review
item 7 (2026-11-16): R-EXT-14 literally, so the strip has a `contributed-tools` line, naming the number,
whenever the count is a number, 0 included; the line is absent only when `contributedTools` is null.
BVA: 0, 1, n.

## UC-STATUS-05 — Core off (R-FB-10)

Core disabled provides no status service; `statusOf(absent)` → frozen `{fishball: fishball-off}`;
`stripView` → one `fishball-off` line, no control.

## UC-STATUS-06 — Close

After `close()`: no emission, no notice, every port subscription disposed, no set recompute.
createStatus ties `close()` to `ctx.effect` when the context has one, so disposing the Cordis
plugin's fiber does the same (amended 2026-11-16).

The en contributed-tools line reads a count of 1 in the singular (amended 2026-11-16).

## Line decision table (F-STATUS-DT-01, amended by the dev session 2026-11-16; first match wins)

Design §6.3a step 1: "with a target set and no saved grant, the strip shows Connect". The old rule
"link `target-unreachable` → link line, no control" is withdrawn.

| Rule | Condition | line | control |
| --- | --- | --- | --- |
| 1 | link `connected`, or target not usable | link (`{connected, null}` / the link's `{state, code}`) | null |
| 2 | no Connect port, or Connect `authorized` | link | null |
| 3 | Connect `authorizing` | `{authorizing, null}` | `cancel` |
| 4 | Connect `needs-configuration` | `{needs-configuration, code}` | null |
| 5 unset | Connect `needs-authorization`/`failed`, link `target-unset` | `{connect.state, connect.code}` | `connect` |
| 5 other | Connect `needs-authorization`/`failed`, any other link word (`token-refused`, `token-revoked`, `target-unreachable` with `TARGET_UNREACHABLE` or `TARGET_INCOMPATIBLE`) | the link's `{state, code}` | `connect` |

Order rows check "first match wins": 1 over 3 and 4, and `target-unreachable` under 2, 3, 4 and 5.

## Techniques and ids

- Use cases: UC-STATUS-01…06 above (flows named in each test).
- Decision tables: REM-DT-01 rules 1–6 (display), F-STATUS-DT-01 rules 1–5 plus order rows,
  PLAT-DT-02 rules 1–6, HOST-DT-03 rule 10.
- EP / BVA: F-STATUS-EP-01 (target usability: usable https / loopback http names vs non-loopback
  http, 127.0.0.2, [::2], userinfo, blank, white space, other scheme, not a URL), F-STATUS-EP-02
  (bundles never reported), F-STATUS-BVA-01 (contributed count 0 / 1 / n), F-STATUS-BVA-02 (loader
  fiber state ACTIVE 2 vs FAILED 3).
- State transitions: F-STATUS-ST-01 (Connect: needs-authorization → authorizing → authorized /
  failed), F-STATUS-ST-02 (set across `plugin-manager/changed`), F-STATUS-ST-03 (notice: none →
  sent once → never again), F-STATUS-ST-04 (app ready: null → computed).

## Not runnable here (todo)

- Pressing the strip's Connect / cancel control calls `connect.begin()` / `connect.cancel()`: the
  relayed surface has no action method, so the press is the page's (E2E-CORE / F-UI).
- PLAT-DT-02 in a real standalone DSH (the status service provided by F-WIRE as `fishballStatus`):
  F-WIRE.
- Hosted mode (core in a hosted child: no Connect control): I-HOST; no child is launched here.

## UI-POLISH-F §2: `stripView(snapshot, lang).card`

Requirement: `.runtime/reports/ui-polish-f/SPEC.md` §2. `stripView` keeps `lines` and `control` and gains
`card: {state, title, badge, toolsHint, openApproval}` (constants.mjs `UI_CARD`).

| Id | Technique | Case |
| --- | --- | --- |
| UIPF-CARD-DT-01 `<kind>` (connected, target-unset, needs-authorization, authorizing, needs-configuration, target-unreachable, token-refused, failed, fishball-off, any other) | DT | The card exactly, en and zh: state, badge, title (`Target DSH` / `目标 DSH`, `Fishball` for off), toolsHint, openApproval |
| UIPF-CARD-DT-01 statusOf off, unknown lang | DT, EP | No core → off; unknown / absent lang → the en card |
| UIPF-CARD-DT-01 `<kind>` via status | DT (integration) | The real status's first line lands on its card state |
| UIPF-CARD-BVA-01 tools 0 / 1 / 2, no bridge | BVA | en `0 contributed tools` / `1 contributed tool` / `2 contributed tools`, zh `N 个贡献工具`; no bridge → no line |
| UIPF-CARD-EP-01 control labels | EP | Connect / 连接, Cancel / 取消 unchanged |
