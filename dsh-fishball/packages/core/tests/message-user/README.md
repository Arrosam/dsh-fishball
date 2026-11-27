# fishball-core tests: message-user

Core's manager-only `message_user` tool (MSG-USER spec items 1–3: its table, scope, guard entry and
model-facing result) and the persona's rules for it (item 4). Entry
[../message-user.test.mjs](<../message-user.test.mjs>); rows in [cases.mjs](<cases.mjs>), values in
[constants.mjs](<constants.mjs>).

| rows | technique | observed |
|---|---|---|
| MSG-TOOL-EP-01, -EP-02 | EP | core's message-tools.js text (import-free) and its contracts' GUARDS.coreTools |
| MSG-TOOL-EP-03..05, MSG-TOOL-DT-01 | EP, BVA, DT | a real standalone DSH with core ([../support/core-world.mjs](<../support/core-world.mjs>)): the manager's model request offers the tool; the tool-role result of each argument partition; an ordinary session is not offered it; the guard report |
| MSG-PERSONA-EP-01..07 | EP | PERSONA_ROLE as published, read sentence by sentence |

## Integration rows (moved out)

MSG-PAGE-*, MSG-PAGING-*, MSG-STREAM-* (items 5–7) draw fishball-ui's fishball-page in a headless
Chromium over the real DSH page: they need fishball-ui installed beside core.
