# dsh-connector-amenities: the members' settings pages

Black-box cases for R4 (the umbrella's client pages) and R5 (manifests), relayed by the lead on
2026-11-22 with the lead's addition on the adapter list rules, and the page's public hooks the
implementer relayed the same day (dictionary keys `hint`, `summary.<row>`, `field.<field>`,
`field.<list>.<item>`, `save`, `add`, `remove`, `unavailable`…; data attributes
`data-amenities-setting`, `data-amenities-list`, `data-amenities-list-item`; `role="alert"` errors).
`client.js` was not read. Names: `<case id> <row> [SDK x] <title>`; DSH 0.2.1-rc.5, 0.2.2-rc.1 and
0.2.2-rc.3.

## World ([page.mjs](<page.mjs>))

- client.js runs as a classic script in a node:vm page (`dsh-connector-test-helpers/page/browser-sandbox`); its plugin is
  applied by the SDK's real cordis Context with `slots` and `locale` (`pageServices`, `dsh-connector-test-helpers/page/services`),
  a scripted `configForms` and `settingsSchema` (rehydrate = `new Schema(json)` of the SDK's
  schemastery, validate) built from DSH's dsh-client-ui-settings contracts; `whileServed` is DSH's own
  algorithm over the scripted mirror.
- React is the repo's hook shim (`dsh-connector-test-helpers/page/react-shim`). The primitives are DSH's own
  SettingsForm, SettingsValueField, settingsNumberField, settingsTextField and SettingsFormModel,
  read from the installed 0.2.2-rc.3 web frontend's source map ([primitives.mjs](<primitives.mjs>));
  Button and Input are pass-through fakes.
- The Host model: per namespace, the view DSH's own dsh-settings serves for the member's real Config
  (`servedNamespace`, `dsh-connector-test-helpers/dsh/settings-schema`); `mutate(ops, rev)` is refused on a stale revision, when not
  writable, when told to refuse, or when the result fails the Config; otherwise it stores the user
  layer, bumps the revision and re-serves.

Configurable rows: `dsh-connector-adapter`, `dsh-connector-watchdog`; never: `preset-watchdog`, `dsh-connector-amenities`.

## Use cases

- **PG-UC: the user opens a component's page and saves:** typed values are staged and written by
  the form's Save in one `mutate` at the revision read when editing began; a number is written as a
  Number; an emptied field is an `unset`.
- **PG-LS-UC: the user edits the connector list:** Add, edit, Remove, then the list's own Save
  writes the whole list in one `set` at the revision read when editing began.

## Cases

| Id | Technique | What it proves |
| --- | --- | --- |
| PG-EP-01 | EP | one module, the plugin's inject, only React and DSH's primitives required |
| PG-EP-02 | EP | the bundle hint stays, keyed by the package name, says to open a component |
| PG-DT-01 | DT | served namespaces (all / none / each one / excluded rows) × configure entries; one whileServed per row |
| PG-ST-01 | ST | not served → served → withdrawn → served; plugin disposed → entries gone |
| PG-EP-03 | EP | summary view: one non-empty line, no controls |
| PG-EP-04 | EP | page view: one control per top-level served field: scalar fields in schema order, then list fields in schema order (the requirement owner's correction of R4, 2026-11-22: the form's one Save follows its scalar fields, a list has its own Save); also with an appended scalar field |
| PG-EP-05 | EP | labels from the dictionary (en, zh), hint = the schema description |
| PG-EP-06 | EP | a field with no label renders under its name |
| PG-UC-01/02/03/04 | UC | number set as a Number at the read revision; two fields in one Save; emptied → unset; a text field sets its string |
| PG-BVA-01 | BVA | each number field at min / max accepted; min−1, max+1, a fraction and text block Save |
| PG-ST-02/03 | ST | ready → unavailable shows the message instead of controls; writable false disables every control |
| PG-LS-EP-01 | EP | one item per stored server with labelled serverName / url inputs; no list Save before an edit |
| PG-LS-UC-01..04 | UC | Add (empty item) + fill + Save writes the whole list at the read revision; Remove; edit; empty list |
| PG-LS-DT-01 | DT/BVA | refused items block Save (empty / bad / 33-character serverName, missing url, duplicate serverName and non-https / off-loopback / ftp / non-URL url marked aria-invalid); accepted: a 32-character name, http on 127.0.0.1, [::1], localhost |
| PG-LS-ST-01 | ST | a refused save shows an error and keeps the draft, the retry lands; a stale revision is refused, the draft kept |
| PG-MF-01/02 | EP | the umbrella's dsh.client.inject includes @deepseek-ai/dsh-client-ui-settings; dsh-connector-adapter, dsh-connector-watchdog and dsh-connector-amenities depend on and bundle dsh-connector-shared |
