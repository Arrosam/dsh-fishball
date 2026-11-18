# F-SETTINGS black-box cases (`fishball-core.settings`)

Requirement (the user, 2026-11-16, requirements 1.34 item 4): "hosted setting去掉，fishball的setting留在fishball里的fishball core插件的设置页内。可以在fishball对外暴露的UI中打开dsh的自带设置，或者直接跳转到fishball core的设置。"
Also R-FB-03 and R-FB-02 as amended by 1.33 (Q-B2) and 1.34, design §5.4 and §6.3a, the
contracts `packages/core/contracts/{constants.js,connect.d.ts,link.d.ts}`, and the F-SETTINGS
acceptance criteria relayed by Fishball (2026-11-16, numbered 1–10 below as "req n"), and Fishball's
decision on target precedence (2026-11-16; SET3-UC-11, SET3-DT-06). R-HOST-11 is
withdrawn (1.34). Written from the requirements only: these cases never read
`packages/core/client.settings.js` or `packages/core/src/settings/**`.

Since F-UI (interface items 8–9, 2026-11-16) the two Fishball-page entries and the `view=settings`
continuation are fishball-ui's (`packages/fishball-ui/client.entries.js`, locale namespace
`fishball-ui-entries`); core's `client.settings.js` registers only core's settings page. The page
harness loads both clients by default (a Fishball DSH with fishball-ui) and core's alone for the
"core only" rows; every SET3-UC-07/08 row keeps its meaning.

Levels:
- **integration** (page.mjs): core's real `client.js` and `client.settings.js` in a scripted DSH page,
  applied by the SDK's own Cordis with their inject lists, DSH's own `SettingsFormModel` /
  `settingsTextField` cut from the SDK's web bundle (primitives.mjs), and fake DSH page services
  (`slots`, `configForms`, `remote`, `locale`, `layout`, optional `pluginNavigation`) modelled on
  DSH's public client contracts;
- **integration, Node** (route.mjs): `registerSettingsRoutes(ctx)` with a fake `ctx`, its handler
  called with real `Request` objects.
- Browser rendering on a real DSH (the Plugins page, the native Settings dialog) is E2E-UI's.

## Use Cases

| UC | Use case | Actor | Main flow | Alternatives / exceptions |
| --- | --- | --- | --- | --- |
| SET3-UC-01 | Open core's own settings page | Owner on DSH's Plugins page | 1. The Host serves namespace `fishball-core`. 2. Core registers a `plugins.bundle.config` entry keyed `fishball-core`. 3. The page renders it with `view: 'page'`: the form and the Connect control. (req 1) | A1 namespace not served: no entry. A2 served, then withdrawn: the entry goes; served again: it returns. A3 `view: 'summary'`: a one-liner or nothing, no form. A4 hosted child: the same page. |
| SET3-UC-02 | Edit and save core's settings | Owner | 1. The form shows `target.url`, the token field, `connect.clientMetadataUrl`, `identity.id`, `identity.name`, in that order, with the stored values. 2. The owner changes `target.url`. 3. Save sends one `mutate` with a `set` op on the nested path and the read revision. (req 2) | A1 clearing a stored field sends `unset`. A2 a field typed back to its stored value sends nothing. E1 the Host refuses: DSH's save-failed line; the staged text stays. E2 the write rejects: the same line. |
| SET3-UC-03 | Paste a token for connecting to a DSH | Owner | 1. The password field is blank. 2. The owner pastes a token and saves. 3. Core writes it with `remote.credentials.set('DSH_AGENT_TOKEN', trimmed value)`. 4. The field is blank again; the state label says a token is waiting. (req 3) | A1 blank or spaces only: nothing written. E1 the write is refused or rejects: the save-failed line. Post: the value is never rendered, logged, put in a URL or sent elsewhere; the label follows `describe(...).configured` only. |
| SET3-UC-04 | Connect | Owner | 1. The page reads `GET api/fishball/connect` and shows the state. 2. The owner presses Connect: `POST`. 3. `approval-url` opens the URL in a new browsing context (`noopener`). 4. The page re-reads the state. (req 4) | A1 `authorized`: re-read, nothing opened. A2 `needs-configuration`: the code's words. A3 window focus: re-read. E1 503, non-JSON or network failure: an "unavailable" line, nothing opened. |
| SET3-UC-05 | The Connect route answers the page | The page (DSH's fetch) | 1. `registerSettingsRoutes(ctx)` registers `{path, methods: [GET, POST], requestBody: 'buffered', fetch}`. 2. GET → `200 {state, code}` of `fishballInstance.ui.connect.status()`. 3. POST → `200` with `await begin()`. Every answer is JSON, `cache-control: no-store`. (req 5) | E1 no service, another `apiVersion`, no `ui.connect`: `503 {code: 'CONNECT_UNAVAILABLE'}`. E2 `status()` throws or `begin()` rejects: the same 503, no detail. E3 (F-FIX-3) such a throw (also of the `BEGIN_VIA` begin and of the Cancel route's `cancel()` / `status()`) also logs one `warn(LINK_SAVE.text.failed, CONNECT_ROUTE.connectFailed, code)` on `ctx.logger('fishball-link')`, `code` = `String(error.code ?? error.name ?? typeof error)`, nothing else of the failure; E1, `begin()` answering `undefined` or an unknown outcome, and a 200 log nothing; `status()` answering `undefined` (outside `ConnectStatus`) makes the route's read throw, so it warns with `TypeError`; a ctx without `logger` still answers. Post: the service is looked up per request. |
| SET3-UC-06 | See the target the instance supplies | Owner of a hosted child | 1. The Host serves `dsh-instance-child` with a non-blank `targetUrl`. 2. The page shows that URL read-only as supplied by the instance. (req 6) | A1 not served, blank, or not a string: no such line. |
| SET3-UC-07 | Reach the settings from the Fishball page | Owner on the Fishball page | 1. The session header shows two actions, Fishball settings and DSH settings. 2. Fishball settings → `pluginNavigation.openBundle('fishball-core')`. 3. DSH settings → presses DSH's native Settings launcher. (req 7) | A1 no `pluginNavigation`: `layout.selectPanel('plugins')`. E1 no launcher on the page: an alert line, nothing else. |
| SET3-UC-08 | Arrive with `#view=settings` | The page load (PG-ORIGIN continuation) | 1. The page loads with `#view=settings`: core's settings page opens once. 2. `<html>` first gets `data-fishball-session`: it opens once more if the active panel is none or Plugins. (req 8) | A1 the owner navigated elsewhere first: no second open. A2 any other fragment: nothing. |
| SET3-UC-09 | The removed slim panel stays removed | Any page | The page has no `main` entry `fishball-settings`, no Read Only line, no Open Plugins link, and no `fishballSettingsSections` service. (req 9) | — |
| SET3-UC-10 | Load, locales, plugin shape | DSH's module loader | 1. The chunk registers `{id: 'fishball-core', chunk: 'client.settings.js'}` and exports `settingsPlugin` `{name, inject, apply}`. 2. Core's client starts it. 3. Dictionaries `en` and `zh` go through `ctx.locale.register`. (req 10) | A1 a missing inject: that plugin stays pending; nothing fails. |
| SET3-UC-11 | Which target the link uses (target precedence) | Core in a hosted child; the owner on the page | 1. The instance serves `dsh-instance-child.targetUrl` (`HOSTED_IMPORT.targetSetting`) with a non-white-space string: `effectiveTarget({instance, user})` returns it unchanged; `hasInstanceTarget` is true. 2. The page's read-only line `[data-fishball-instance-target]` shows it and says it is in use; `target.url` stays editable, its hint says it is not used. (Fishball's decision, 2026-11-16) | A1 no instance value (not served, a non-string, or white space only, `''` included): the user's `target.url` is returned unchanged (blank or absent too); no line; the ordinary hint. A2 the instance is served, withdrawn or changes value: line and hint follow live. Post: the rule is pure (no trimming, no URL check; the link applies its own URL rule). |

## Techniques (case ids in cases.mjs)

- **Use Case**: SET3-UC-01 … SET3-UC-11, each test naming its flow step.
- **EP**: SET3-EP-01 form text partitions; SET3-EP-02 token text partitions; SET3-EP-03 Connect status
  answers (every `CONNECT.state`, and the unusable answers); SET3-EP-04 Connect begin answers;
  SET3-EP-05 fragment values; SET3-EP-06 `fishballInstance` partitions at the route; SET3-EP-07 the
  instance's `targetUrl` partitions; SET3-EP-08 the same instance partitions as SET3-DT-06 on the
  page (line present or not, `target.url` hint "not used" or ordinary, en and zh); SET3-EP-09 (F-FIX-3)
  the thrown value → the code logged: an Error with `code` (`'EFBTEST_FIX3'`, and the nullish edge
  `0`, `''`, `null`), with `name` only, a plain Error, a thrown string, `undefined`, `null`, a plain
  object, a number (rows 1–11 on `status()`; row 12 every partition on every member, thrown, and
  rejected by both begins). Every thrown value carries fresh secrets (token, client secret, a URL
  with both) in its message, `url`, `cause`; no logged argument may hold any of them.
- **BVA**: SET3-BVA-01 token trimming (`''`, one space, one character, a padded value); SET3-BVA-02
  `apiVersion` 0 / 1 / 2; SET3-BVA-03 counts: exactly five fields, two header actions, one
  `mutate` per Save, one `window.open` per approval, one re-read per focus; SET3-BVA-04 the instance
  value's white-space edge (one space, tab+newline, one character, one padded character);
  SET3-BVA-05 (F-FIX-3) warnings per failing request: 0, 1, 2, 3 requests → as many warnings.
- **Decision Table**: SET3-DT-01 Save (settings changed × token typed × Host answer × credential
  answer); SET3-DT-02 the Fishball-settings entry (navigation present / absent); SET3-DT-03 the DSH
  settings entry (launcher present / absent); SET3-DT-04 the second `view=settings` open (fragment ×
  active panel); SET3-DT-05 the route (method × service); SET3-DT-06 target precedence, below;
  SET3-DT-07 (F-FIX-3) the routes' warning (route GET / POST / POST via the web callback / cancel ×
  the member answers, throws, rejects (begins only: `status()` and `cancel()` are synchronous in
  `connect.d.ts`), answers `undefined` or an unknown outcome × service present / absent / another
  `apiVersion` / no `ui.connect` × ctx with / without `logger`): rules 1–13 and 19 one member each
  (rule 3: `status()` → `undefined` warns `TypeError`; rules 7 and 19: `begin()` → `undefined` or an
  unknown outcome warn nothing), 14–16 no compatible service on all three routes (no warning), 17–18
  no `logger` (503 / 200 unchanged, nothing thrown).
- **State Transition**: SET3-ST-01 the page entry (not served ↔ registered); SET3-ST-02 the token
  field (blank → staged → saved / failed); SET3-ST-03 the Connect control (read → shown → pressed →
  re-read; unavailable → recovered); SET3-ST-04 the continuation (loaded → session marked → marked
  again); SET3-ST-05 the instance line and `target.url` hint (not served → served → withdrawn →
  served, en and zh; value A → value B; URL → blank → URL); SET3-ST-06 (F-FIX-3) one route over a
  service that throws → answers → is withdrawn → throws another value: one warning per throw, each
  with its own code, none for the 200 or the withdrawn service.

### SET3-DT-06: target precedence (`effectiveTarget` / `hasInstanceTarget`)

Conditions: the instance value (`dsh-instance-child.targetUrl`) × the user's `target.url`. Rules are
numbered row by row, the user's column varying fastest (rules 1–24). "Unchanged" = the same value,
untrimmed. `I` = the instance's value, `U` = the user's value.

| Instance value | `hasInstanceTarget` | user absent | user blank (`'   '`) | user URL |
| --- | --- | --- | --- | --- |
| absent / not served (1–3) | false | `undefined` | U `'   '` | U |
| `''` (4–6) | false | `undefined` | U `'   '` | U |
| `'   '` (7–9) | false | `undefined` | U `'   '` | U |
| number `443` (10–12) | false | `undefined` | U `'   '` | U |
| `null` (13–15) | false | `undefined` | U `'   '` | U |
| object `{url}` (16–18) | false | `undefined` | U `'   '` | U |
| URL string (19–21) | true | I | I | I |
| padded URL string (22–24) | true | I, padding kept | I, padding kept | I, padding kept |

Page rows for the same partitions are SET3-EP-08 (line + "in use" / no line; hint "not used" /
ordinary, told apart by their visible text, not by exact wording) and SET3-ST-05.

Rows for withdrawn behaviour elsewhere (the slim panel, its Read Only line and Open Plugins link,
the `fishballSettingsSections` service) are marked withdrawn where they live, citing requirements
1.34 item 4, R-HOST-11 withdrawn, F-SETTINGS.

## E-FIX-3 (B5): the model catalog under Cordis's inject rule (`model-catalog.mjs`)

Requirement (relayed by Fishball, 2026-11-17): in a real DSH the "Fishball's model" select always
said "The models could not be read.", because the page plugin read `ctx.remote.session` without
injecting `remote.session`, and Cordis (both SDKs) throws on that read. The old scripted `remote`
answered any namespace, so it could not see the bug. With `createWorld({remoteSession})` the page's
Remote carries Cordis's own `remote` service tracker, and `remote.session` is provided by its own
plugin fiber, as DSH's gateway mounts a namespace. The SDK's real Cordis then applies the rule:
`ctx.remote.session` is the `remote.session` service only for a plugin that injected it.
`ctx.get('remote.session')` answers it or `undefined`. A namespace DSH does not mount is absent.
`chunkFiles` loads another copy of `client.settings.js`, which the mutating-test row uses.

| Id | Technique | Case |
| --- | --- | --- |
| EFIX3-SET-RULE-01 | precondition | The harness enforces the rule with the SDK's Cordis: reading without inject throws, reading with inject gives the face, and `ctx.get` gives the face. |
| EFIX3-SET-UC-01 main en / zh | Use Case | A catalog of two groups, plain models and a model with two efforts gives one option per model and one per effort. No "could not be read" / "无法读取模型。". |
| EFIX3-SET-BVA-01 1 model / 0 groups | BVA | One model gives exactly one option. `groups: []` gives "No model is configured in this DSH yet.". |
| EFIX3-SET-DT-01 rules 1–3 (en, zh) | Decision Table | No `remote.session`, `{ok:false}`, or a rejection: the page still registers and renders and says "could not be read". |
| EFIX3-SET-DT-01 rule 4 | Decision Table | A catalog: listed, and the rest of the page (the setting fields) is there. |
| EFIX3-SET-MUT-01 | mutating test | `client.settings.js` at `c4845000` (read with `git show` into a scratch folder) in the same world does NOT list the catalog and says "could not be read". The bug is reproduced, so the harness tells the two apart. |

"Not required to register" is DT rule 1: with no `remote.session` the page still registers.

## UI-POLISH-F §5 and §7 (`polish-cases.mjs`)

Requirement: `.runtime/reports/ui-polish-f/SPEC.md` §5 (icon header entries) and §7 (core's page
sections). `primitives.mjs` gained faithful stand-ins for DSH's Tooltip, StateDot, Tag and icons,
and the Button stand-in keeps `variant` as `data-fbtest-variant`.

| Id | Technique | Case |
| --- | --- | --- |
| UIPF-ENTRY-EP-01 fishball / dsh × en / zh | EP | A button, icon only (one aria-hidden svg, no text), aria-label `Fishball settings` / `DSH settings` (zh `Fishball 设置` / `DSH 设置`), Tooltip label = aria-label, side bottom; glyph sliders (Fishball) / gear (DSH) |
| UIPF-ENTRY-EP-01 dsh haspopup | EP | `aria-haspopup="dialog"` kept |
| UIPF-ENTRY-ST-01 tooltip | ST | Hover → one tooltip with the label → leave → none |
| UIPF-CORE-EP-01 sections en / zh | EP | `section[data-fishball-model]`, `section[data-fishball-connect]` |
| UIPF-CORE-EP-01 connect heading en / zh | EP | Visible `h3` `Connect` / `连接` naming the section (`aria-labelledby`, no `aria-label`), a StateDot |
| UIPF-CORE-DT-01 `<state>` (every CONNECT.state, unavailable) | DT | Heading and StateDot in every state; the Connect button primary in needs-authorization and failed, outline otherwise |

## MULTI-1: the page is a list of targets (PLAN-MULTI §3.1; SEAM_TARGETS; Q01, Q04, Q07)

The page reads `GET api/fishball/targets` and acts through SEAM_TARGETS' POST routes by `targetId`
(page.mjs answers them from `world.targets` / `world.targetAnswers`). Markers are the implementer's
relayed ones (`MULTI_SET.mark`). DSH's `Modal` stand-in (primitives.mjs) renders title, description,
children and footer while open, as DSH's bundle does.

| Row | Technique | Oracle |
| --- | --- | --- |
| MULTI-SET-EP-01 empty / one / parent and two | EP (list size) | the list read (GET, same-origin, no-store); one card per target in list order; Add field and control |
| MULTI-SET-EP-02 | EP (parent vs remote) | parent: no Remove, no URL field; remote: both; both have Connect, Retry and a token field |
| MULTI-SET-EP-03 | EP (unnamed, Q01) | no URL-derived name outside the URL field |
| MULTI-SET-ST-01 | ST (list 503 → available) | no card, nothing fails; after focus the cards appear |
| MULTI-SET-UC-01 remote / parent / two cards | EP (which card) | token written only to that target's reference (`FISHBALL_TARGET_TOKEN_<id>__<epoch>`, or `DSH_AGENT_TOKEN` for the parent), trimmed; blank again; never rendered, logged, fetched or put in settings |
| MULTI-SET-BVA-01 empty / one space | BVA (token text) | nothing written |
| MULTI-SET-UC-02 connect / retry / cancel / approval url | EP (action) | `{targetId}` of that card only to the action's route; approval-url opened once with `_blank`, `noopener` |
| MULTI-SET-ST-02 add accepted / duplicate / insecure | ST (list → add → list) | `{url}` posted; accepted → the new card after a re-read; refused → an alert, no card |
| MULTI-SET-DT-01 remove / url × confirmed / cancelled | DT (Q07) | DSH's confirmation dialog first; `{confirmed: true}` only after confirming, for that target only; cancel posts none |

Withdrawn (registered skipped, reason MULTI_SET.withdrawn; list in constants.mjs WITHDRAWN_MULTI):
every SET3 row whose oracle was the scalar `target.url` field, the page's one `DSH_AGENT_TOKEN`
field, the single Connect block over `/api/fishball/connect`, `registerSettingsRoutes` /
`registerConnectCancelRoute` / `effectiveTarget`, or the instance line beside a user URL; and the
UIPF-CORE Connect-section rows. Kept unchanged: SET3-UC-01 main 1-2 / main 3 (namespace) / A1 / A3,
SET3-UC-02 main 3 / A1 / E2, SET3-EP-01 6-7, SET3-DT-01 6, SET3-ST-01 1-2, the entries
(UC-07/08, DT-02/03/04, EP-05, ST-04, BVA-03 entries), UC-09, UC-10 and the model catalog rows.
## R-FIX-FUI F5 / F6 (`connect-cases.mjs`): the Connect control's races and press notices

Every Connect GET / POST is held and answered by the case. CONNECT-ST-01 (an older read never
publishes after a newer one), ST-02 (a read started before a press is ignored), ST-03 (after unmount:
no window.open, no GET, no state update), ST-04 (only the latest press opens its page and publishes its
notice), CONNECT-DT-01 (press refusal × statuses after it, en and zh: the alert stays while (state,
code) is unchanged, goes when it changes). Run against the pre-task chunk, 17 of the 20 rows fail.
