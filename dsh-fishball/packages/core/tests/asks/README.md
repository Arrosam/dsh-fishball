# fishball-core tests: asks

Core's ask cards (F-ASKCARD, `src/asks/`; K3 `contracts/ask-card.d.ts`, `ui.d.ts` `asks`): the
`ask_user` tool per target, the card store over a dsh-storage-domain table, answers committed once as
`approval_answer`, settlement / retirement / re-offer by revision, startup reconciliation, MULTI-1
handles and voiding, the two owner-only routes (`/api/fishball/asks/events`, `/api/fishball/asks/answer`)
and the failed-write rule (RFIX-F12). The use cases and derived rows are in [USE-CASES.md](<USE-CASES.md>);
entry [../asks.test.mjs](<../asks.test.mjs>).

| file | rows |
|---|---|
| [cases.mjs](<cases.mjs>) | ASK-UC-01…03, -05…08, ASK-EP-01…07, ASK-BVA-01…03, ASK-DT-01…04, ASK-ST-01…03, PLAT-UC-07 |
| [multi.mjs](<multi.mjs>) | MULTI-ASK-EP-01, -DT-01, -ST-01, -ROUTE-01 |
| [rfix.mjs](<rfix.mjs>) | RFIX-F12-DT-01, RFIX-F12-ST-01 |

## How it is observed

[world.mjs](<world.mjs>): the module bound to the current DSH (`fishball-test-helpers/bind`) over a real cards
table (storage-domain on storage-json) and one fake link per target (K1 shapes from
`fishball-test-helpers/connector-contract/mcp-schema`); the system rows register `ask_user` in a real
DSH tool runtime and let a scripted model call it. Routes are driven with real `Request`/`Response`
objects over a fake Fetch registry. Handles and tool names are computed from the MULTI-0 freeze
(../support/targets-oracle.mjs), never read from the module. Time is node:test MockTimers.

## Not here

- ASK-UI-01 (the drawn card): it runs fishball-ui's `client.asks.js` in the scripted page; it needs
  fishball-ui present, so it is an integration row (fishball-ui + fishball-core).
- ASK-UC-04 main 1 and 2 check fishball-ui's chunk and its manifest's `files`: fishball-ui's own subject,
  which core's tests may not reach (integration, or fishball-ui's package tests). main 3 swept the
  main-DSH packages that left this repository in 6b7c53bf: retired.
- ASK-EP-07 'stored before F-FIX' was withdrawn by MULTI-0 (fresh install, no old-format reader).
