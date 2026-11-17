# F-UI — use cases and test design (`fishball-ui.package`)

Source of truth (and only these): the user's words (requirements 1.38 Q-N2) "分离出一个fishball UI，core只负责做后端，
管理那个fishball session和preset，处理UI外的工作。让这个fishball UI插件来负责fishball中的UI改变，包括给embed UI暴露的那个会话窗口样式。";
v3-requirements R-FB-14, R-FB-01, R-FB-02, R-FB-09, R-FB-11, R-ARCH-08, R-ARCH-10; Q-G1 (core
without fishball-ui shows no hint), Q-G2 = A (fishball-ui without core logs `fishball-core-missing`
and changes nothing); design `design/v3` 9a531192 §1.0; and the interface the F-UI developer relayed
(2026-11-16, items 1–11, with two amendments: the browser chunks export part factories
`entriesPart(kit)` / `asksPart(kit)`, and the core-missing row writes its one line when it starts).
The implementation under `packages/fishball-ui/**` and the edited core files were not read.

Actors: the **owner** (installs, enables and disables bundles; may re-enable a guarded row); **DSH**
(composes bundle patches, evaluates a row's `!!js` `disabled` against the process's
`profileContext.startedBundles`, serves client entries, keeps a log); **fishball-core** (backend:
guards report, routes); **fishball-ui** (the UI bundle); **DSH's page** (loads `client.js` and its
package-local chunks).

## Use cases

| UC | Use case | Main flow | Alternatives / exceptions |
| --- | --- | --- | --- |
| UI-UC-01 | A Fishball DSH with core and fishball-ui | 1. Both bundles start. 2. fishball-ui's seven UI guard rows are disabled; the `fishball-ui`, `fishball-page` and `fishball-recommend-plugins` rows run; the core-missing row is off. 3. `fishballUiGuards.rows` is the seven ids, frozen, in patch order. 4. Core's guard report is `ok` and covers the UI rows. 5. The page serves fishball-ui's client entry, the page and the tab; the tab's route answers. | A1 the owner re-enables a UI row → `guards-overridden` naming `row:<id>`; restoring it → `ok`. A2 a core row and a UI row both re-enabled → core's row is named first. E1 no `fishball-core-missing` line anywhere. |
| UI-UC-02 | fishball-ui without core (Q-G2 = A) | 1. fishball-ui alone starts. 2. Exactly one warn line `fishball-core-missing` under logger `fishball-ui`. 3. No DSH row is disabled by fishball-ui (the seven UI rows stay on). 4. No fishball row runs (no `fishball-ui`, page or tab), no `fishballUiGuards`, no Fishball client entry, the tab's route is absent. | A1 the next start: again exactly one line in that process (once per start). |
| UI-UC-03 | core without fishball-ui (Q-G1) | 1. core alone starts. 2. It boots, the report is `ok`. 3. No row of fishball-ui's is reported even when such a DSH row is on; no `fishballUiGuards`. 4. No log line names fishball-ui or `fishball-core-missing`. | A1 fishball-ui is enabled later while DSH runs: `fishballUiGuards` appears and core re-checks: a UI row the owner keeps on is then reported. |
| UI-UC-04 | The page starts fishball-ui's browser half | 1. `client.js` registers module `fishball-ui` (no chunk). 2. Its plugin loads `./client.entries.js` and `./client.asks.js` and starts each `part(kit)`. 3. `kit.mountStyle(id, css)` adds one `<style id>`; its disposer removes it. | E1 one chunk fails to load: only its part is lost; the other starts; nothing fails. E2 both fail: nothing starts; the entry plugin itself does not fail. |
| UI-UC-05 | The two chunks on their own | Each chunk registers `{id: 'fishball-ui', chunk: <file>}` and exports its part factory; the factory returns a client plugin named `fishball-ui: entries` / `fishball-ui: asks` with an `inject` list and `apply`; it requires only the page's platform modules. | — |
| UI-UC-06 | The package and its boundary | fishball-ui is a root workspace and a DSH bundle (`dsh.bundle.patch`, `dsh.client.platform: web`), exports exactly `.`, `./client`, `./core-missing`, `./package.json`, depends on and bundles fishball-shared, ships every file its rows load. | E1 it names no DSH-side package (connector, connector-ui, instance, adapter, dsh-connector-shared) and never fishball-core, in any manifest field or import; core never names fishball-ui. |
| UI-UC-07 | The shared seam | `fishball-shared/ui-seam` exports `UI_SEAM`, `UI_GUARDS` and `SEAM_STATUS`, deeply frozen data; core's constants no longer export `UI_SEAM`. | E1 drift: `SEAM_STATUS.link/connect/guards` equal core's `LINK.state`, `CONNECT.state`, `GUARDS.status`. |
| UI-UC-08 | Core's patch after the split | core's patch keeps its own guard rows, shipped presets off, `preset-fishball` and its guards row `fishball-core-guards` (`./src/guards/row.js`); it holds none of the UI rows; core has no `ui/`, `client.asks.js` or `src/recommended.js`. | — |

## Techniques and case ids (cases.mjs)

- **Use Case**: UI-UC-01 … UI-UC-08, each test naming its flow step.
- **Decision table UI-DT-01** (interface item 2): row kind × core in `startedBundles` → `disabled`.

  | Row kind | core started | core not started |
  | --- | --- | --- |
  | UI guard row (7) | disabled | on (DSH's row runs) |
  | `fishball-ui`, `fishball-page`, `fishball-recommend-plugins` | on | disabled |
  | `fishball-ui-core-missing` | disabled | on |

  Evaluated with the SDK's own loader evaluator (one test per rule and row), and observed in real
  DSH processes (UI-UC-01, UI-UC-02).
- **EP / BVA UI-EP-01** over `startedBundles` (constants.mjs STARTED): empty (BVA 0 bundles), core
  alone (BVA 1), ui alone, core not first, core first, near names (`fishball-core-x`, a prefix,
  another case, a scoped name): only an exact `fishball-core` entry counts.
- **EP UI-EP-02** manifest fields: dependency fields × forbidden names; export map exactly.
- **EP UI-EP-03** the client chunk outcomes: real / failing / stand-in.
- **BVA UI-BVA-01** counts: exactly seven guard rows, exactly four inserted rows, exactly one
  core-missing line per start (0 with core), exactly one module registration per script, one style
  element per `mountStyle`, none after its disposer.
- **State transition UI-ST-01** the core-missing line per start (start → one line; next start → one
  more line in that process, never two). **UI-ST-02** fishball-ui enabled while core runs
  (absent → present → core re-checks). **UI-ST-03** `mountStyle` (none → mounted → disposed; dispose
  twice changes nothing).

Rows a later task owns are `todo` and name it: a hosted child does not place fishball-ui until I-HOST;
browser rendering is E2E-UI's; there is no frame-only window-style rule yet (interface item 11).

## E-FIX-3 (B7): no DSH Preview Notice in a hosted Fishball child

Requirement (relayed by Fishball, 2026-11-17): DSH's welcome step (dsh-client-ui-settings-models,
`settings.onboarding`) shows until the public setting `ui-settings-general.welcomeNoticeVersion`
equals DSH's copy version `2026-09-28.1`. fishball-ui's patch sets it only in a hosted child, and
changes nothing elsewhere. The value is resolved as DSH's Loader resolves a row's config: the SDK's
own `interpolate` (`evaluate` = `new Function('ctx','expr','with (ctx) { return eval(expr) }')`)
against a real Cordis Context of that SDK that provides `profileContext`.

**Amendment of UI-BVA-01 `guards` and UI-DT-01 `shape` (E-FIX-3, Fishball 2026-11-17).** The patch
now has a third kind of op besides the bare `{id, disabled}` guard rows and the `insert`: the
config row `{id: 'ui-settings-general', config: {welcomeNoticeVersion: !!js …}}`, with no
`disabled`. Re-baselined:
- UI-BVA-01 `guards`: the bare `{id, disabled}` ops are exactly the eight guard rows, in order,
  and the only other non-insert op is that config row (keys `id`, `config`).
- UI-DT-01 `shape`: every `disabled` condition is still a `!!js` expression. Only that config row
  has none.

**EFIX3-UI-DT-01** (the requirement's decision table; rows are rules 1–5):

| Rule | fishball-core in `startedBundles` | an overlay inserts `dsh-instance-child` | resolved `welcomeNoticeVersion` |
| --- | --- | --- | --- |
| 1 | yes | yes | `'2026-09-28.1'` |
| 2 | yes | no (standalone) | `undefined` |
| 3 | no | yes | `undefined` |
| 4 | no | no | `undefined` |
| 5 | no `profileContext` at all | — | `undefined` |

| Id | Technique | Case |
| --- | --- | --- |
| EFIX3-UI-SHAPE-01 row | EP | One op `{id, config}` whose config has only `welcomeNoticeVersion`. |
| EFIX3-UI-SHAPE-01 version drift | drift | The SDK's welcome step still compares with `2026-09-28.1`. |
| EFIX3-UI-SHAPE-01 composed | integration | Composed with DSH's layers and core's patch: the row exists and carries the config. |
| EFIX3-UI-EP-01 (6 rows) | EP / BVA | With core started, over `overlays`: none (BVA 0), the child insert alone, the child insert after other patches beside another row, other inserted rows only, a near id `dsh-instance-child-x`, and a non-insert patch of that id. Only an inserted row with exactly that id counts. |
| EFIX3-UI-EP-02 (9 rows) | EP / BVA | With the child insert, over UI-EP-01's `startedBundles` partitions: only an exact `fishball-core` counts. |
| EFIX3-UI-GUARD-01 | EP | `readUiGuardRows()` reads exactly the eight guard rows. The config row is not a guard row. |
| EFIX3-UI-OWNER-01 | integration | The owner's profile layer value wins over fishball-ui's. |
| EFIX3-UI-SYS-01 standalone | system | A real standalone DSH with core and fishball-ui (scenario BOTH): DSH's settings service describes `ui-settings-general` with no `welcomeNoticeVersion`, so the notice behaves as before. |
| EFIX3-UI-SYS-01 hosted | todo | Out of scope: rows that launch a hosted child. Rule 1 covers it with DSH's own evaluator. |
