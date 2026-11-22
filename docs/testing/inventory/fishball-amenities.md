# Old-test behaviour inventory: fishball-amenities

Generated from the baseline run of `integrate/2026-11-22-fixes` (0377153f) on DSH 0.2.1-rc.5 and 0.2.2-rc.1, before the restructure.
One row per case id of an old suite: the number of distinct behaviours (test names, SDK folded) it registered,
their baseline results, and one sample title. **Where now** is filled in by the port: the new test file, or
`retired: <reason>` (withdrawn, todo placeholder, subject moved to another repository), or `bug: <report id>`.

## test/v3/fishball-amenities/icons

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| PI-BVA-01 | 7 | pass 7 | PI-BVA-01 exactly max (256 KiB) DSH 0.2.1-rc.5 readPluginMeta of a synthetic plugin whose icon is 262144 bytes → its data URL |  |
| PI-CONSIST | 4 | pass 4 | PI-CONSIST fishball-amenities fishball-amenities: keeps the family base of fishball-core's icon (tile, fish, ring, chip, glyph frame) and draws its own glyph |  |
| PI-DT-01 | 6 | pass 6 | PI-DT-01 rule 1 fishball-amenities fishball-amenities is a plugin (it has a dsh field), so it is one of the icon rows |  |
| PI-DT-02 | 16 | pass 16 | PI-DT-02 <script> oracle: the self-contained rule flags an SVG with <script> |  |
| PI-DT-03 | 6 | pass 6 | PI-DT-03 black mark dark oracle: a black mark reads as invisible on the dark background |  |
| PI-EP-01 | 5 | pass 5 | PI-EP-01 fishball-amenities fishball-amenities: package.json icon is a relative .svg path with no scheme, a regular file inside the package after realpath |  |
| PI-EP-02 | 5 | pass 5 | PI-EP-02 fishball-amenities fishball-amenities: its "files" names the icon and npm pack --dry-run ships it |  |
| PI-EP-03 | 10 | pass 10 | PI-EP-03 fishball-amenities DSH 0.2.1-rc.5 readPluginMeta(fishball-amenities) → no error, a data:image/svg+xml;base64 icon whose bytes are the shipped file, ≤ 2 |  |
| PI-EP-04 | 5 | pass 5 | PI-EP-04 fishball-amenities fishball-amenities: the icon is well-formed XML with one <svg> root in the SVG namespace and a viewBox of four numbers, positive wid |  |
| PI-EP-05 | 5 | pass 5 | PI-EP-05 fishball-amenities fishball-amenities: the icon is self-contained for an <img>: no currentColor, no <script> or on* handler, no href / url() / @import  |  |
| PI-EP-06 | 1 | pass 1 | PI-EP-06 all icons the icons of fishball-amenities, fishball-board, fishball-heartbeat, fishball-taskboard, fishball-core, fishball-ui are pairwise different dr |  |
| PI-RENDER-01 | 10 | pass 10 | PI-RENDER-01 fishball-amenities dark fishball-amenities: DSH's data URL decodes in an <img> under the dark scheme and draws pixels at ≥ 3:1 against the page |  |

## test/v3/fishball-amenities/packages

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| AM-BVA-01 | 4 | pass 4 | AM-BVA-01 fishball-amenities the umbrella fishball-amenities's version is exactly 1.0.0-alpha.1 |  |
| AM-DT-01 | 4 | pass 4 | AM-DT-01 fishball-amenities the umbrella fishball-amenities has browser code: dsh.client (platform web), exports ./client and ships client.js |  |
| AM-DT-02 | 3 | pass 3 | AM-DT-02 fishball-board the umbrella's fishball-board row equals the row fishball-board's own patch inserts |  |
| AM-EP-01 | 12 | pass 12 | AM-EP-01 fishball-amenities bundle the umbrella fishball-amenities declares dsh.bundle.patch naming an existing patch file |  |
| AM-EP-02 | 3 | pass 3 | AM-EP-02 fishball-board fishball-board's own patch inserts exactly one row, id fishball-board, named by the package fishball-board (no path row) |  |
| AM-EP-03 | 3 | pass 3 | AM-EP-03 no path row the umbrella's patch names no row by a ./, ../, / or file: path |  |
| AM-EP-04 | 4 | pass 4 | AM-EP-04 fishball-board the umbrella lists fishball-board in dependencies at exactly 1.0.0-alpha.1 and in bundleDependencies |  |
| AM-EP-05 | 3 | pass 3 | AM-EP-05 fishball-board fishball-board lists fishball-shared in dependencies at exactly 1.0.0-alpha.1 and in bundleDependencies |  |
| AM-EP-06 | 2 | pass 2 | AM-EP-06 files the umbrella's files list no member folder (fishball-board, fishball-heartbeat, fishball-taskboard or their old board/, heartbeat/, taskboard/) |  |
| AM-EP-07 | 5 | pass 5 | AM-EP-07 fishball-amenities the root workspaces list packages/fishball-amenities |  |
| AM-EP-08 | 1 | pass 1 | AM-EP-08 exports fishball-shared exports ./instance-follower (an existing file) and still ./ui-seam |  |
| AM-SC-01 | 3 | pass 3 | AM-SC-01 fishball-board no file under packages/fishball-board imports a path outside its own package root |  |
| AM-SC-02 | 3 | pass 3 | AM-SC-02 fishball-board fishball-board imports no other member (by name or path) and its manifest names none |  |
| AM-SC-03 | 3 | pass 3 | AM-SC-03 fishball-board fishball-board takes the fishballInstance follower from fishball-shared/instance-follower |  |

## test/v3/fishball-amenities/settings-page

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| PG-BVA-01 | 14 | pass 14 | PG-BVA-01 compactThresholdTokens -1 compactThresholdTokens = -1 (refused by its schema): Save is blocked, nothing is written |  |
| PG-DT-01 | 5 | pass 5 | PG-DT-01 all served ["fishball-heartbeat"] → plugins.row.config entries exactly for those rows |  |
| PG-EP-01 | 1 | pass 1 | PG-EP-01 row 1 client.js registers one module fishball-amenities whose plugin injects slots, locale, configForms, settingsSchema |  |
| PG-EP-02 | 1 | pass 1 | PG-EP-02 row 1 the plugins.bundle.config hint stays, keyed by the umbrella's package name, and tells the user to open a component to configure it |  |
| PG-EP-03 | 1 | pass 1 | PG-EP-03 fishball-heartbeat fishball-heartbeat {view: 'summary'}: one short line of text |  |
| PG-EP-04 | 2 | pass 2 | PG-EP-04 fishball-heartbeat appended fishball-heartbeat: a scalar field appended to the served schema renders after the other scalar fields and before any list  |  |
| PG-EP-05 | 2 | pass 2 | PG-EP-05 fishball-heartbeat en fishball-heartbeat in en: each label is the umbrella dictionary's, each hint the field's schema description |  |
| PG-EP-06 | 1 | pass 1 | PG-EP-06 fishball-heartbeat fishball-heartbeat: a served field the dictionary has no label for still renders, labelled with its name |  |
| PG-MF-01 | 1 | pass 1 | PG-MF-01 fishball-amenities fishball-amenities's dsh.client.inject includes @deepseek-ai/dsh-client-ui-settings |  |
| PG-MF-02 | 1 | pass 1 | PG-MF-02 fishball-heartbeat fishball-heartbeat depends on ["fishball-shared"] and bundles ["fishball-shared"] |  |
| PG-ST-01 | 2 | pass 2 | PG-ST-01 dispose disposing the client plugin withdraws every entry it registered |  |
| PG-ST-02 | 1 | pass 1 | PG-ST-02 fishball-heartbeat fishball-heartbeat: status 'unavailable' shows the unavailable message instead of controls |  |
| PG-ST-03 | 1 | pass 1 | PG-ST-03 fishball-heartbeat fishball-heartbeat: writable false disables every control |  |
| PG-UC-01 | 3 | pass 3 | PG-UC-01 compactThresholdTokens compactThresholdTokens: typed 0 and saved → mutate([{op: 'set', path: ['compactThresholdTokens'], value: 0}]) with a Number, at  |  |
| PG-UC-02 | 1 | pass 1 | PG-UC-02 fishball-heartbeat fishball-heartbeat: two fields staged are written together by one Save (one mutate, two ops) |  |
| PG-UC-03 | 3 | pass 3 | PG-UC-03 compactThresholdTokens compactThresholdTokens set by the user, emptied and saved → mutate([{op: 'unset', path: ['compactThresholdTokens']}]) |  |
