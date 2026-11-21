# F-STATUS — use cases and test design

Source of truth: the F-STATUS brief relayed by the dev session (2026-11-16): R-FB-03, R-FB-04
(REM-DT-01), design §6.3a (Connect), R-BND-05 / TQ-17 (PLAT-DT-02, rewritten for board only, then emptied by
SHELVE-BOARD 2026-11-18),
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

**SHELVE-BOARD (the user, 2026-11-18):** "fishball-board先从这次release中移除，我要改的地方太多了。先封存，
留到下一批再说。所以不要预留在子实例的Fishball内。" fishball-board is shelved from 1.0.0-alpha.1. Core's
set check, whose only member was the board, now has **no member** (`STATUS_MODEL.members` is `[]`):
core never reports `fishball-board`, and after app ready `set` is always `{status: ok, missing: []}`,
whatever the board's state. The check's mechanism stays for a later member.

1. Until app ready, `set` is null.
2. At app ready core reads `pluginManager.listBundles()` and the loader's entries and computes `set`
   for the checked members: none now, so `ok`.
3. On each `plugin-manager/changed` it computes `set` again (still `ok`; an equal snapshot is not re-emitted).

- The board in any state is never reported and never named in the strip: absent, listed but not
  installed, on and loaded, switched off, enabled but skipped (any `error.code`: `incompatible-version`,
  `operation-error`, `not-bundle` for unresolved or unreadable), a row failed (fiber FAILED = 3, or no
  fiber once its import settled), a row still loading that then fails, an import that fails.
  *Before SHELVE-BOARD* the skipped and failed states were `plugin-set-incomplete` with missing
  `{fishball-board, skipped, <code>}` / `{fishball-board, failed, null}`.
- The strip's set line (kept for a later member) names each missing member and its reason word,
  translated (en `skipped` / `failed to start`; zh differs). With no member, the status never gives
  one; it is checked on a hand-built snapshot naming a made-up member (F-STATUS-STRIP set mechanism).
- **A3:** no `pluginManager` service → `set` stays null.
- Never reported: `fishball-ui` (Q-G1), `fishball-hosted-settings` (HOST-DT-03 rule 10), any
  Watchdog (R-FB-07 withdrawn), any bundle that is not a checked member (now every bundle).

The board in these rows is a stand-in (constants.mjs `BOARD`): a fake BundleInfo only named
`fishball-board`, with one row of that id, as F-WIRE's stand-in fixture (`wire/fixtures/fishball-board`)
has. `packages/board` is never read or loaded by this suite.

### PLAT-DT-02 (rewritten for board only; re-baselined by SHELVE-BOARD 2026-11-18)

| Rule | board | Core's `set` before SHELVE-BOARD | Core's `set` now |
| --- | --- | --- | --- |
| 1 | on, loaded | `ok` | `ok`, missing `[]` |
| 2 | not installed (absent; or listed with installed false, enabled false) | `ok` | `ok` |
| 3 | enabled but skipped (`incompatible-version`; other code `operation-error`) | `plugin-set-incomplete` (`skipped`, the code) | **`ok`, never reported** |
| 4 | enabled, a row failed to load (fiber FAILED, or no fiber after its import settled; classified after a pending load settles) | `plugin-set-incomplete` (`failed`, null) | **`ok`, never reported** |
| 5 | off (owner switched the bundle off; also while incompatible) | `ok` | `ok` |
| 6 | enabled, its row switched off by the owner (entry disabled) | `ok` | `ok` |

Every rule also checks that neither language's strip has a `plugin-set-incomplete` line or mentions the
board (REL-PACK's board-mention rule). Old columns fold-notify / Watchdog and old rules 3–4: **withdrawn**.

**PLAT-EP-04 row 3** (Watchdog only, no core): **withdrawn** with Watchdog (requirements 1.37);
no runnable case.

Added rows (dev session decision 2026-11-16, under R-BND-05 and design §8.2): a board selected in
the profile whose package cannot be resolved or read is "enabled but skipped" (DSH's boot skips it
too: `loadProfileDirectory` `skippedBundles`). "Not installed" means not selected (`enabled: false`)
or not listed at all.

| Rule | board | before SHELVE-BOARD | now |
| --- | --- | --- | --- |
| 3 unresolved | selected, package not resolvable (`enabled: true, installed: false, error: not-bundle`) | incomplete (`skipped`, `not-bundle`) | **`ok`, never reported** |
| 3 unreadable | selected and installed, package unreadable (`enabled: true, installed: true, error: not-bundle`) | incomplete (`skipped`, `not-bundle`) | **`ok`, never reported** |
| 2 unselected unreadable | not selected, package unreadable (`enabled: false, error: not-bundle`) | `ok` | `ok` |
| 4 fiber loading / import running ends 3 | still loading at `plugin-manager/changed`, then FAILED | incomplete (`failed`) | **`ok`; no emitted set other than `ok`** |
| 4 fiber loading / import running ends 2 | still loading, then ACTIVE | `ok` | `ok` |
| 4 import failed | import running, then no fiber | incomplete (`failed`) | **`ok`; no emitted set other than `ok`** |

### Other rows re-baselined by SHELVE-BOARD (the user, 2026-11-18)

| Id | Before | Now |
| --- | --- | --- |
| F-STATUS-00 surface | `STATUS_MODEL.members` is `[fishball-board]` | `[]` |
| F-STATUS-BVA-02 fiber | ACTIVE (2) loaded → ok, FAILED (3) → failed | both `ok`, the board never reported |
| F-STATUS-EP-02 ×3 | the other bundle is never reported; the skipped board alone is | neither is reported: `ok` |
| F-STATUS-ST-02 changed | `ok → skipped → failed → ok`, each emitted | the board goes loaded → skipped → failed → loaded, the set stays `ok`, nothing re-emitted |
| F-STATUS-STRIP order | link, guards, set, tools (board skipped) | link, guards, tools: the skipped board gives no set line |
| F-STATUS-STRIP never | the strip names none of fishball-ui, Watchdog, hosted-settings | also: no set line and no board mention |
| F-STATUS-STRIP set mechanism skipped / failed (**added**) | (reached through board rules 3/4) | a hand-built snapshot missing a made-up member: link, guards, set, tools; the set line names the member, en reason word, zh differs |

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
  PLAT-DT-02 rules 1–6 (all `ok` since SHELVE-BOARD), HOST-DT-03 rule 10.
- EP / BVA: F-STATUS-EP-01 (target usability: usable https / loopback http names vs non-loopback
  http, 127.0.0.2, [::2], userinfo, blank, white space, other scheme, not a URL), F-STATUS-EP-02
  (bundles never reported), F-STATUS-BVA-01 (contributed count 0 / 1 / n), F-STATUS-BVA-02 (loader
  fiber state ACTIVE 2 vs FAILED 3 of the board's row: both `ok` since SHELVE-BOARD).
- State transitions: F-STATUS-ST-01 (Connect: needs-authorization → authorizing → authorized /
  failed), F-STATUS-ST-02 (set across `plugin-manager/changed`: stays `ok` since SHELVE-BOARD), F-STATUS-ST-03 (notice: none →
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

## MULTI-1 re-baseline (MULTI-0 `StatusSnapshot`; the lead's instruction, 2026-11-18)

Seam (relayed 2026-11-18): `createStatus(ctx, {targets: {list, onChange}, guards, notify})`; the
snapshot is `{fishball, guards, set, targets, brand: {style}}` (LOGO-BUTTON adds the normalized logo theme). The scalar `link` / `target` / `connect` / `bridge`
ports and the snapshot's scalar `link`, `connect`, `line`, `control`, `contributedTools` are
withdrawn; each `TargetView` carries its own `line` = core's `stripLine(link, url, connect).line`
(targets.d.ts). Core rows no longer assert fishball-ui's `stripView` output (fishball-ui's own suites do).

| Row | Technique | Oracle |
| --- | --- | --- |
| F-STATUS-01 | EP (shape) | exactly `{fishball, guards, set, targets, brand}`; no withdrawn member; targets `{version: 1, targets: []}` with an empty port; absent stored logo theme → `brand.style: fishball` |
| MULTI-STATUS-EP-01 ×3 | EP (one / two with zero tools / connected) | `snapshot.targets` equals the port's `list()` |
| MULTI-STATUS-ST-01 | ST (list change / equal list) | one emission per change, none for an equal list |
| REM-DT-01, F-STATUS-DT-01, F-STATUS-EP-01, F-STATUS-ST-01 | DT / EP / ST | the same F-STATUS rule tables, now on the pure per-target `stripLine` |
| set, guards, notice, close, fishball-off rows | unchanged | as before; close/ctx-disposed check the targets and guards ports' listeners |
| Withdrawn (skipped, reason given) | — | UC-STATUS-01 A5 and main 4, F-STATUS-DT-01 "sends nothing" (no target port; successors named), F-STATUS-BVA-01 (contributedTools is a TargetView field), F-STATUS-STRIP and UIPF-CARD rows (fishball-ui's strip) |

## UC-STATUS-07 — The manager's extra tools, announced once (GENTLE-TOOLS, the lead's relayed requirement B, 2026-11-21)

K3 `GuardReport` gains `extraManagerTools` (sorted, unique; `[]` with none, also when `ok`). The
status reads `ctx.get('profileContext')` (`{home, name}`) and keeps what it announced in
`<home>/fishball/manager-tools.json`, one JSON line `{"announced": [sorted]}` + `\n`, written after
notify resolves (the union of what was announced and the current extras). Refinement (the lead, same
day): `manager-tools` leaves the guards notice only when the report names extras.

1. A report names a tool not announced before → ONE notice `{pluginId: fishball-core, dedupeKey:
   <STATUS_MODEL.notice.toolsKeyPrefix>…, text: toolsNotice(ALL current extras joined by ', ')}`. The text
   names them and is gentle: no "overridden", no "weaker" / "guarantees".
2. Then the record is written. The same set, a subset, or a re-added announced name → no notice; a new
   name → one more notice listing all current extras (another dedupe key).
- **A1 (restart):** a new status over the same home honours the record (also a record from another process).
- **A2 (no profileContext, or no home):** memory only, per status instance; nothing is written.
- **E1:** a malformed or unreadable record counts as nothing announced; no throw (a warning may be logged).
- **E2:** notify rejects → nothing recorded; retried at the next refresh that still sees an unannounced
  name (not on a report without it, never in a loop). While one is in flight, no second notice.

Cases: `tools-notice.mjs` (registered from cases.mjs, so on both SDKs).

| Id | Technique | Checks |
| --- | --- | --- |
| TOOLS-00 text | EP | toolsNotice names 1 and 3 tools, is gentle, differs from guardsNotice |
| TOOLS-UC-01 main one / three | UC, BVA 1 / 3 | one notice with the exact pluginId, prefix and text; the record's exact bytes; no repeat |
| TOOLS-BVA-01 zero | BVA 0 | ok and manager-tools with `[]`: no tools notice, no record |
| TOOLS-ST-01 announced set | ST | a → a → a,b → b → ok → a → a,b,c: notices only at the new names, the record is the union each step, distinct keys |
| TOOLS-ST-02 restart / at start | ST | a new status over the same home: same set / subset no notice, one new tool one notice; a known report at creation no notice |
| TOOLS-EP-01 seeded / another home | EP | a pre-written record is honoured; another home's record is not |
| TOOLS-EP-02 ×6 malformed, unreadable | EP | not JSON, empty, announced not a list, no member, a JSON list, null, a directory: one notice, no throw, rewritten |
| TOOLS-ST-03 rejected / always rejected | ST | nothing recorded on reject; no retry on ok; one retry per refresh that sees the name; no repeat once accepted |
| TOOLS-ST-04 in flight | ST | a held notify: no second notice, no record until it resolves |
| TOOLS-EP-03 ×2 | EP | no profileContext / no home: memory only, no file |
| TOOLS-DT-01 rules 1–13 | DT | overridden codes × extras × missingManagerTools → guards notice list / tools notice (below), each once; snapshot = report |
| TOOLS-ST-05 ×7 | ST | a new name arriving while a tools notice is in flight: after the first is accepted / rejected, exactly one more notice listing all current extras with no further report (also after two refreshes: the latest extras); the first refresh finds nothing new (recorded name, then a new one at once; also at start); close() in flight (accepted / rejected): nothing more |
| TOOLS-EP-04 snapshot | EP | `snapshot().guards` deep-equals the report, extraManagerTools and missingManagerTools included |

### TOOLS-DT-01

Review fix (the user, 2026-11-21): K3 `GuardReport` gains `missingManagerTools` (the defaults
`GUARDS.managerTools` some live manager lacks; sorted, unique, `[]` when none, always `[]` when ok).
`manager-tools` leaves the guards notice only when extras are non-empty AND missing is empty or absent;
a missing default keeps it there, and the extras still get one tools notice.

| Rule | overridden | extras | missing | guards notice | tools notice |
| --- | --- | --- | --- | --- | --- |
| 1 | none (ok) | [] | [] | none | none |
| 2 extras only | only manager-tools | some | [] | **none** | one |
| 3 neither | only manager-tools | [] | [] | `manager-tools` (as before) | none |
| 4 manager-tools absent | other codes | [] | [] | the other codes | none |
| 5 extras only | other codes + manager-tools | some | [] | the other codes only | one |
| 6 neither | other codes + manager-tools | [] | [] | the other codes + `manager-tools` | none |
| 7 missing only | only manager-tools | [] | one | `manager-tools` | none |
| 8 missing only | other codes + manager-tools | [] | all four | the other codes + `manager-tools` | none |
| 9 both | only manager-tools | some | one | `manager-tools` | one |
| 10 both | other codes + manager-tools | some | all four | the other codes + `manager-tools` | one |
| 11 missing absent | only manager-tools | some | (no member) | none | one |
| 12 missing absent | other codes + manager-tools | some | (no member) | the other codes only | one |
| 13 manager-tools absent | other codes | [] | (no member) | the other codes | none |

### Re-baselined by GENTLE-TOOLS

| Id | Before | Now |
| --- | --- | --- |
| F-STATUS-00 surface | `STATUS_MODEL.notice` deep-equals `{pluginId, guardsKeyPrefix}` | the same without the new `toolsKeyPrefix`, which is checked as a non-empty string other than the guards prefix |
| GUARD fixtures (constants.mjs) | reports `{status, overridden}` | also `extraManagerTools` and `missingManagerTools` (`[]` unless given), as K3 now shapes every report |

The other F-STATUS guards-notice rows are unchanged: their reports carry `extraManagerTools: []`, so
`manager-tools` (GUARD.second) stays in the guards notice by rule 3.

