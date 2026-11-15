# F-SETTINGS black-box cases (`fishball-core.settings`)

Requirement (the user, 2026-11-16, requirements 1.34 item 4): "hosted setting去掉，fishball的setting留在fishball里的fishball core插件的设置页内。可以在fishball对外暴露的UI中打开dsh的自带设置，或者直接跳转到fishball core的设置。"
Also R-FB-03 and R-FB-02 as amended by 1.33 (Q-B2) and 1.34, design §5.4 and §6.3a, the
contracts `packages/core/contracts/{constants.js,connect.d.ts,link.d.ts}`, and the F-SETTINGS
acceptance criteria relayed by Fishball (2026-11-16, numbered 1–10 below as "req n"). R-HOST-11 is
withdrawn (1.34). Written from the requirements only: these cases never read
`packages/core/client.settings.js` or `packages/core/src/settings/**`.

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
| SET3-UC-05 | The Connect route answers the page | The page (DSH's fetch) | 1. `registerSettingsRoutes(ctx)` registers `{path, methods: [GET, POST], requestBody: 'buffered', fetch}`. 2. GET → `200 {state, code}` of `fishballInstance.ui.connect.status()`. 3. POST → `200` with `await begin()`. Every answer is JSON, `cache-control: no-store`. (req 5) | E1 no service, another `apiVersion`, no `ui.connect`: `503 {code: 'CONNECT_UNAVAILABLE'}`. E2 `status()` throws or `begin()` rejects: the same 503, no detail. Post: the service is looked up per request. |
| SET3-UC-06 | See the target the instance supplies | Owner of a hosted child | 1. The Host serves `dsh-instance-child` with a non-blank `targetUrl`. 2. The page shows that URL read-only as supplied by the instance. (req 6) | A1 not served, blank, or not a string: no such line. |
| SET3-UC-07 | Reach the settings from the Fishball page | Owner on the Fishball page | 1. The session header shows two actions, Fishball settings and DSH settings. 2. Fishball settings → `pluginNavigation.openBundle('fishball-core')`. 3. DSH settings → presses DSH's native Settings launcher. (req 7) | A1 no `pluginNavigation`: `layout.selectPanel('plugins')`. E1 no launcher on the page: an alert line, nothing else. |
| SET3-UC-08 | Arrive with `#view=settings` | The page load (PG-ORIGIN continuation) | 1. The page loads with `#view=settings`: core's settings page opens once. 2. `<html>` first gets `data-fishball-session`: it opens once more if the active panel is none or Plugins. (req 8) | A1 the owner navigated elsewhere first: no second open. A2 any other fragment: nothing. |
| SET3-UC-09 | The removed slim panel stays removed | Any page | The page has no `main` entry `fishball-settings`, no Read Only line, no Open Plugins link, and no `fishballSettingsSections` service. (req 9) | — |
| SET3-UC-10 | Load, locales, plugin shape | DSH's module loader | 1. The chunk registers `{id: 'fishball-core', chunk: 'client.settings.js'}` and exports `settingsPlugin` `{name, inject, apply}`. 2. Core's client starts it. 3. Dictionaries `en` and `zh` go through `ctx.locale.register`. (req 10) | A1 a missing inject: that plugin stays pending; nothing fails. |

## Techniques (case ids in cases.mjs)

- **Use Case**: SET3-UC-01 … SET3-UC-10, each test naming its flow step.
- **EP**: SET3-EP-01 form text partitions; SET3-EP-02 token text partitions; SET3-EP-03 Connect status
  answers (every `CONNECT.state`, and the unusable answers); SET3-EP-04 Connect begin answers;
  SET3-EP-05 fragment values; SET3-EP-06 `fishballInstance` partitions at the route; SET3-EP-07 the
  instance's `targetUrl` partitions.
- **BVA**: SET3-BVA-01 token trimming (`''`, one space, one character, a padded value); SET3-BVA-02
  `apiVersion` 0 / 1 / 2; SET3-BVA-03 counts: exactly five fields, two header actions, one
  `mutate` per Save, one `window.open` per approval, one re-read per focus.
- **Decision Table**: SET3-DT-01 Save (settings changed × token typed × Host answer × credential
  answer); SET3-DT-02 the Fishball-settings entry (navigation present / absent); SET3-DT-03 the DSH
  settings entry (launcher present / absent); SET3-DT-04 the second `view=settings` open (fragment ×
  active panel); SET3-DT-05 the route (method × service).
- **State Transition**: SET3-ST-01 the page entry (not served ↔ registered); SET3-ST-02 the token
  field (blank → staged → saved / failed); SET3-ST-03 the Connect control (read → shown → pressed →
  re-read; unavailable → recovered); SET3-ST-04 the continuation (loaded → session marked → marked
  again).

Rows for withdrawn behaviour elsewhere (the slim panel, its Read Only line and Open Plugins link,
the `fishballSettingsSections` service) are marked withdrawn where they live, citing requirements
1.34 item 4, R-HOST-11 withdrawn, F-SETTINGS.
