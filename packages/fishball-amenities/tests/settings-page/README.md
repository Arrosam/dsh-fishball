# fishball-amenities: the members' settings pages

Black-box cases for R4 (the umbrella's client pages) and R5 (manifests), relayed by the lead on
2026-11-22 with the lead's addition on the adapter list rules, and the page's public hooks the
implementer relayed the same day (dictionary keys `hint`, `summary.<row>`, `field.<field>`,
`field.<list>.<item>`, `save`, `add`, `remove`, `unavailable`…; data attributes
`data-amenities-setting`, `data-amenities-list`, `data-amenities-list-item`; `role="alert"` errors).
`client.js` was not read. Names: `<case id> <row> [DSH <v>] <title>`, on the current DSH.
Ported from `test/v3/fishball-amenities/settings-page` (2026-11-22, the test restructure): 40 cases.

## World ([page.mjs](<page.mjs>))

- client.js runs unread in `fishball-test-helpers/scripted-page` (`clients: [{id: 'fishball-amenities', file}]`); its
  plugin is applied by the current DSH's real Cordis with the page's `slots` and `locale`, plus this area's scripted
  `configForms` and `settingsSchema` (rehydrate = `new Schema(json)` of the current DSH's schemastery, validate),
  built from DSH's dsh-client-ui-settings contracts (config-form.d.ts, settings-mirror.d.ts); `whileServed` is DSH's
  own algorithm over the scripted mirror.
- React is `fishball-test-helpers/react-shim`. The primitives are DSH's own SettingsForm, SettingsValueField,
  settingsNumberField, settingsTextField and SettingsFormModel, read from the current DSH's web frontend source map
  ([primitives.mjs](<primitives.mjs>)); Button and Input are pass-through fakes. (`fishball-test-helpers/dsh-primitives`
  has the real form model but a stand-in SettingsForm and no settingsNumberField, so this area keeps its own reader.)
- The Host model: per namespace, the view DSH's own dsh-settings serves for the member's real Config
  (`fishball-test-helpers/settings` `servedNamespace`; the Config is fishball-heartbeat's published export, a
  dependency of this package); `mutate(ops, rev)` is refused on a stale revision, when not writable, when told to
  refuse, or when the result fails the Config; otherwise it stores the user layer, bumps the revision and re-serves.
- LIMIT: the primitives come from a frontend source map, which DSH ships from 0.2.2-rc.3 on (not 0.2.1-rc.5 or
  0.2.2-rc.1). On a version without one the newest installed version that has one serves (as the old suite pinned
  0.2.2-rc.3's for every SDK); Cordis, schemastery and dsh-settings are still the DSH under test.

Configurable rows: `fishball-heartbeat`; never: `fishball-board`, `fishball-taskboard`, `fishball-amenities`.

## Use cases

- **PG-UC: the user opens a component's page and saves:** typed values are staged and written by
  the form's Save in one `mutate` at the revision read when editing began; a number is written as a
  Number; an emptied field is an `unset`.

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
| PG-UC-01/02/03 | UC | number set as a Number at the read revision; two fields in one Save; emptied → unset |
| PG-BVA-01 | BVA | each number field at min / max accepted; min−1, max+1, a fraction and text block Save |
| PG-ST-02/03 | ST | ready → unavailable shows the message instead of controls; writable false disables every control |
| PG-MF-01/02 | EP | the umbrella's dsh.client.inject includes @deepseek-ai/dsh-client-ui-settings; fishball-heartbeat depends on and bundles fishball-shared |
The old suite's list-editor rows (PG-LS-*), text-field row (PG-UC-04) and labelled-extra row (PG-EP-06 by name)
registered nothing (the one configurable row has three number fields, no list, no text field); their loops are not
ported. They come back with a configurable member that has such a field.