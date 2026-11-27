# Old-test behaviour inventory: fishball-ui

Generated from the baseline run of `integrate/2026-11-22-fixes` (0377153f) on DSH 0.2.1-rc.5 and 0.2.2-rc.1, before the restructure.
One row per case id of an old suite: the number of distinct behaviours (test names, SDK folded) it registered,
their baseline results, and one sample title. **Where now** is filled in by the port: the new test file, or
`retired: <reason>` (withdrawn, todo placeholder, subject moved to another repository), or `bug: <report id>`.

## test/v2-page-cases

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| PAGE | 36 | todo 36 | PAGE PAGE-DT-01 [0.2.1-rc.5] Keep failed-page focus and list recovery GET-only with null — owner PAGE: PAGE owner: document an independent native-page driver an | retired: todo catalogue of page.test.mjs (port-ui-a: placeholders with no planned subject) |
| PG-ORIGIN | 56 | todo 56 | PG-ORIGIN ORIGIN-BVA-01 [0.2.1-rc.5] Enforce native browser cookie expiry equality — owner PG-ORIGIN: PG-ORIGIN: no documented runnable isolated-admission/lifec | retired: todo placeholder naming a fixture/driver no task in this repository plans (V2 PAGE/PG-ORIGIN/READY lifecycle of the dsh-instance child, which left in 6b7c53bf; the ensure route itself is fishball-core's) |
| READY | 48 | todo 48 | READY READY-BVA-01 [0.2.1-rc.5] Handle zero waiters at the ready boundary — owner READY: READY owner: document an independent fixture that controls actual child | retired: todo placeholder naming a fixture/driver no task in this repository plans (V2 PAGE/PG-ORIGIN/READY lifecycle of the dsh-instance child, which left in 6b7c53bf; the ensure route itself is fishball-core's) |

## test/v2-page-cases/lite

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| LITE | 88 | fail 32, pass 44, todo 10, skip 8 | LITE [0.2.1-rc.5] > LITE B3-EP-01 [0.2.1-rc.5] R4 reload: DSH already restored the manager in the main view and openSession(manager) rejects → no status line, n | packages/core/ui/tests/page.test.mjs (LITE-UC-03, LITE-EP-13 and LITE-EP-12's main-composition half retired: they composed dsh-instance's launch overlay, gone in 6b7c53bf; the residual todos and the withdrawn slim-settin |

## test/v2-page-cases/page

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| PAGE-EP-01 | 2 | todo 2 | PAGE-EP-01 \| 0.2.1-rc.5 \| Read an existing HTTP manager identity | retired: todo placeholder naming a fixture/driver no task in this repository plans (V2 PAGE/PG-ORIGIN/READY lifecycle of the dsh-instance child, which left in 6b7c53bf; the ensure route itself is fishball-core's) |
| PAGE-EP-02 | 2 | todo 2 | PAGE-EP-02 \| 0.2.1-rc.5 \| Observe unavailable identity HTTP refusal | retired: todo placeholder naming a fixture/driver no task in this repository plans (V2 PAGE/PG-ORIGIN/READY lifecycle of the dsh-instance child, which left in 6b7c53bf; the ensure route itself is fishball-core's) |
| PAGE-EP-03 | 2 | todo 2 | PAGE-EP-03 \| 0.2.1-rc.5 \| Observe unavailable ensure HTTP refusal | retired: todo placeholder naming a fixture/driver no task in this repository plans (V2 PAGE/PG-ORIGIN/READY lifecycle of the dsh-instance child, which left in 6b7c53bf; the ensure route itself is fishball-core's) |
| PAGE-EP-04 | 2 | todo 2 | PAGE-EP-04 \| 0.2.1-rc.5 \| Refuse unsupported PUT with documented Allow | retired: todo placeholder naming a fixture/driver no task in this repository plans (V2 PAGE/PG-ORIGIN/READY lifecycle of the dsh-instance child, which left in 6b7c53bf; the ensure route itself is fishball-core's) |
| PAGE-EP-05 | 2 | todo 2 | PAGE-EP-05 \| 0.2.1-rc.5 \| Refuse unsupported HEAD with documented Allow | retired: todo placeholder naming a fixture/driver no task in this repository plans (V2 PAGE/PG-ORIGIN/READY lifecycle of the dsh-instance child, which left in 6b7c53bf; the ensure route itself is fishball-core's) |
| PAGE-UC-01 | 2 | todo 2 | PAGE-UC-01 \| 0.2.1-rc.5 \| Observe fresh ready HTTP identity then idempotent ensure | retired: todo placeholder naming a fixture/driver no task in this repository plans (V2 PAGE/PG-ORIGIN/READY lifecycle of the dsh-instance child, which left in 6b7c53bf; the ensure route itself is fishball-core's) |

## test/v2-recommendation

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| 0 | 2 | pass 2 | 0 distinct installed | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| 1 | 2 | pass 2 | 1 distinct installed | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| 2 | 2 | pass 2 | 2 distinct installed | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| application | 1 | pass 1 | application failure + listing present: Installed, no inferred absence | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| check | 1 | pass 1 | check failure (refused) + absent: alert, Install remains, no handoff or retry | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| en | 4 | pass 4 | en meow-memory absent | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| explicit | 1 | pass 1 | explicit settlement: native change + inventory present | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| inspect | 4 | pass 4 | T-RP \| RV-04 \| SDK=0.2.1-rc.5 \| inspect transport failure, throw and rejection each show an alert and keep Install enabled > inspect rejects | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| inspection | 1 | pass 1 | inspection transport error + absent: alert, Install remains | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| installed=false | 6 | pass 6 | T-RP \| RV-06 \| SDK=0.2.1-rc.5 \| presence requires declared AND available files (decision table over installed x availability x enabled) > installed=false ava | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| installed=true | 8 | pass 8 | T-RP \| RV-06 \| SDK=0.2.1-rc.5 \| presence requires declared AND available files (decision table over installed x availability x enabled) > installed=true avai | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| inventory | 1 | pass 1 | inventory listing fails: alert, no row claims Installed | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| list | 2 | pass 2 | list request rejects (network): alert | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| missing | 2 | pass 2 | T-RP \| RV-07 \| SDK=0.2.1-rc.5 \| files missing <-> available transitions follow the inventory after plugin-manager/changed > missing -> profile + changed(inst | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| native | 1 | pass 1 | native removal then reinstall: Installed -> Install -> Installed (ST8/ST9) | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| package | 1 | pass 1 | package failure + listing absent: Install follows absence | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| profile | 2 | pass 2 | T-RP \| RV-07 \| SDK=0.2.1-rc.5 \| files missing <-> available transitions follow the inventory after plugin-manager/changed > profile -> files missing + change | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| R1 | 1 | fail 1 | R1 main context: no main-side source names the tab or its module | retired: scanned packages/dsh-connector and dsh-connector-ui (main-side absence), which left this repository in 6b7c53bf |
| R2 | 2 | pass 2 | R2 child bundle row not declared (installed:false) | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| R3 | 2 | pass 2 | R3 child count 1, disabled | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| reconnect | 1 | pass 1 | reconnect (connection/reset): inventory re-read | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| T-RP | 88 | pass 44, todo 38, fail 6 | T-RP \| RV-01 \| SDK=0.2.1-rc.5 \| accepted inspection with registry:null hands off a target with no registry field | packages/core/ui/tests/recommended.test.mjs (TC-20…34 and RV-01…10; the 19 TC-01…19 post-merge-e2e todo rows retired: no planned task; TC-31/TC-32's dsh-instance and dsh-connector halves retired, gone in 6b7c53bf) |
| transport | 2 | pass 2 | T-RP \| RV-04 \| SDK=0.2.1-rc.5 \| inspect transport failure, throw and rejection each show an alert and keep Install enabled > transport failure {ok:false} | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| two | 1 | pass 1 | two rapid invocations before the inspection answers | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| unresolved | 1 | pass 1 | unresolved (no settlement): never optimistic Installed | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |
| zh | 4 | pass 4 | T-RP \| RV-08 \| SDK=0.2.1-rc.5 \| rows show only a Loading status, no button, until the first inventory read answers (en, zh) > zh | packages/core/ui/tests/recommended.test.mjs (a subtest of a T-RP case) |

## test/v3/fishball-ui/brand

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| AVATAR-EP-01 | 11 | pass 11 | AVATAR-EP-01 absent stored brandStyle absent -> <html data-fishball-page-brand="fishball"> while the page is mounted | packages/core/ui/tests/brand.test.mjs |
| AVATAR-EP-02 | 5 | pass 5 | AVATAR-EP-02 absent stored brandStyle absent: the reply avatar is the fishball drawing (fish body mask in the label colour, #EC0A6E eye layer) | packages/core/ui/tests/brand.test.mjs |
| AVATAR-EP-03 | 1 | pass 1 | AVATAR-EP-03 unchanged in both themes the name label ::after stays "Fishball" with the same box, the row box is the same, and rows that are not Fishball replies | packages/core/ui/tests/brand.test.mjs |
| AVATAR-EP-04 | 2 | pass 2 | AVATAR-EP-04 settings hook deepseek with a settings-section-like [data-fishball-brand] element in the same document (stored deepseek, a live change and back, th | packages/core/ui/tests/brand.test.mjs |
| AVATAR-EP-05 | 1 | pass 1 | AVATAR-EP-05 expanded reply plain in both themes an expanded assistant-step reply has no avatar, no "Fishball" label and no bubble (its content box is the unsty | packages/core/ui/tests/brand.test.mjs |
| AVATAR-ST-01 | 3 | pass 3 | AVATAR-ST-01 deepseek -> fishball a form notification deepseek -> fishball -> deepseek flips <html data-fishball-page-brand> live, without reinstalling the page | packages/core/ui/tests/brand.test.mjs |
| AVATAR-ST-02 | 2 | pass 2 | AVATAR-ST-02 deepseek -> fishball the drawn avatar follows a live change deepseek -> fishball -> deepseek, with no reload | packages/core/ui/tests/brand.test.mjs |
| AVATAR-ST-03 | 1 | pass 1 | AVATAR-ST-03 teardown unmounting the page removes <html data-fishball-page-brand>, stops following the form (no listener left), and a later change writes nothin | packages/core/ui/tests/brand.test.mjs |
| BRAND-BVA-01 | 4 | pass 4 | BRAND-BVA-01 row 0 0 open cards → badge undefined (0: no badge; 1..99: the number; 100: 99+) and the matching status text | packages/core/ui/tests/brand.test.mjs |
| BRAND-DT-01 | 8 | pass 8 | BRAND-DT-01 attention deepseek attention (deepseek): state attention, text "Waiting for you (2)", light warning, theme deepseek, description = the status text,  | packages/core/ui/tests/brand.test.mjs |
| BRAND-DT-02 | 5 | pass 5 | BRAND-DT-02 absent while deepseek, a strip frame with brandStyle absent reads fishball (the default) and draws the fish again | packages/core/ui/tests/brand.test.mjs |
| BRAND-DT-03 | 6 | pass 6 | BRAND-DT-03 Enter manager Enter on the brand button with a manager known → uiWorkspace.openSession(managerId) once; the shell's New Session handler never runs | packages/core/ui/tests/brand.test.mjs |
| BRAND-DT-04 | 1 | pass 1 | BRAND-DT-04 manager retry the manager id is known but not yet in the sessions list; the first openSession rejects "unknown session" (the click is consumed, no s | packages/core/ui/tests/brand.test.mjs |
| BRAND-DT-05 | 2 | pass 2 | BRAND-DT-05 shown panel mouse mouse: the manager is the current uiSession key and a panel is open → layout.selectPanel(null), no openSession | packages/core/ui/tests/brand.test.mjs |
| BRAND-DT-06 | 1 | pass 1 | BRAND-DT-06 keyboard repeat a held Space (keydown repeat:true) is prevented and consumed but calls openSession only once; Enter and Space still work from the no | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-01 | 2 | pass 2 | BRAND-EP-01 wide deepseek the wide brand row (deepseek theme): a 24px mark, the wordmark "FISHBALL", the tag "Deepseek Harness" beneath it, a status text and li | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-02 | 2 | pass 2 | BRAND-EP-02 art deepseek the deepseek theme renders DSH's own FishLogo primitive (the mark DSH's official brand plugin slots), not a Fishball-drawn whale: no dr | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-03 | 1 | pass 1 | BRAND-EP-03 two drawings the two themes draw different art (Fishball's fish vs DSH's FishLogo, not one reused drawing) | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-04 | 1 | pass 1 | BRAND-EP-04 priority fishball-ui fills both brand slots at priority -1, below the shell's 0 | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-05 | 1 | pass 1 | BRAND-EP-05 no ensure the logo sends no request of its own: no POST (no ensure), only the one page connection (server-sent) | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-06 | 1 | pass 1 | BRAND-EP-06 rail in the collapsed rail the mark is inside the shell's own toggle button; the mark is decorative, the toggle keeps its name, and pressing it togg | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-07 | 4 | pass 4 | BRAND-EP-07 answered one answered card → connected, no badge | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-08 | 1 | pass 1 | BRAND-EP-08 drawer row rc.1 below 768px draws the same wide brand row in the drawer: the mark, wordmark and tag are the same occupants, and the manager button s | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-09 | 1 | pass 1 | BRAND-EP-09 wordmark the wordmark FISHBALL is drawn bold (>= 700) and larger than the Deepseek Harness tag beneath it, in both themes | packages/core/ui/tests/brand.test.mjs |
| BRAND-EP-10 | 2 | pass 2 | BRAND-EP-10 accent dark (DSH dark) the accent: fishball keeps magenta (a magenta tag shadow, count pill rgb(212, 0, 99)); deepseek is DeepSeek blue (a tag shado | packages/core/ui/tests/brand.test.mjs |
| BRAND-MOTION-01 | 1 | pass 1 | BRAND-MOTION-01 fish working, Fishball theme, no reduced-motion preference → the fish wags (a running CSS animation); with (prefers-reduced-motion: reduce) → no | packages/core/ui/tests/brand.test.mjs |
| BRAND-MOTION-02 | 1 | pass 1 | BRAND-MOTION-02 whale working, DeepSeek theme, no reduced-motion preference → the whale swims (its own animation, different from the fish); with reduce → static | packages/core/ui/tests/brand.test.mjs |
| BRAND-MOTION-03 | 1 | pass 1 | BRAND-MOTION-03 idle connected-idle → no animation in either theme | packages/core/ui/tests/brand.test.mjs |
| BRAND-NS-01 | 2 | pass 2 | BRAND-NS-01 en (en) hide both native New Session actions until the wide brand is owned, including after shell replacement | packages/core/ui/tests/brand.test.mjs |
| BRAND-NS-02 | 1 | pass 1 | BRAND-NS-02 slot anchors preserve the mark-only Open sidebar rail toggle, but a name outlet alone does not make a New Session action safe | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-01 | 5 | pass 5 | BRAND-ST-01 strip topic a number the page connection live, the strip topic sends a frame that is a number → the brand stays connected and keeps its last good st | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-02 | 1 | pass 1 | BRAND-ST-02 asks closed connected → asks error with CLOSED → offline (the status light turns error-like); a frame reconnects it | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-03 | 1 | pass 1 | BRAND-ST-03 core off strip frame on:false with the asks stream live → offline; on:true again → connected | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-04 | 1 | pass 1 | BRAND-ST-04 manager absent an asks frame without a manager id is offline although both streams live and core on; a frame with the id is connected again | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-05 | 1 | pass 1 | BRAND-ST-05 manager empty an asks frame whose manager id is the empty string is "no manager id" → offline (reported ambiguity: the implementation reads it as pr | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-06 | 1 | pass 1 | BRAND-ST-06 working follows sessions the sessions list running flag drives working ↔ idle without touching the streams | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-07 | 1 | pass 1 | BRAND-ST-07 live theme the strip frame changes the art live: fishball → deepseek → fishball, with no reload and no new stream | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-08 | 2 | pass 2 | BRAND-ST-08 rerender en the shell's own "New session" label is written over the brand button on every rerender; a MutationObserver scoped to the button restores | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-09 | 1 | pass 1 | BRAND-ST-09 title while mounted the shell button's title is the current status text (and follows every status change); the shell's aria-keyshortcuts is removed | packages/core/ui/tests/brand.test.mjs |
| BRAND-ST-10 | 2 | pass 2 | BRAND-ST-10 connection closed connected → the one page connection errors with CLOSED → offline (error light); a fresh asks frame → connected | packages/core/ui/tests/brand.test.mjs |
| BRAND-TEAR-01 | 1 | pass 1 | BRAND-TEAR-01 brand part unmounting the brand part unregisters both slots, closes both streams, removes its styles, restores the shell button's previous aria-la | packages/core/ui/tests/brand.test.mjs |
| BRAND-TEAR-02 | 1 | pass 1 | BRAND-TEAR-02 page root removing <html data-fishball-page> unregisters the brand slots, closes its streams, restores the label/description, and disconnects the  | packages/core/ui/tests/brand.test.mjs |
| LOGO-FIX | 12 | pass 12 | LOGO-FIX deferred sidebar.brand.mark real SDK registry releases both declaration waits, all entries and all declaration effects | packages/core/ui/tests/brand.test.mjs |

## test/v3/fishball-ui/connections

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| CONN-BVA-01 | 4 | pass 4 | CONN-BVA-01 row 0 topics every reader mounted plus 0 amenity topic subscriber(s) of fishballPageStream → still exactly one carrier, never reopened | packages/core/ui/tests/connections.test.mjs |
| CONN-EP-01 | 2 | pass 2 | CONN-EP-01 url en (en) the carrier is page-relative api/fishball/page/events?lang=en&tz=<the browser's IANA zone> | packages/core/ui/tests/connections.test.mjs |
| CONN-EP-02 | 2 | pass 2 | CONN-EP-02 every member of a topic two members of one topic each get each frame | packages/core/ui/tests/connections.test.mjs |
| CONN-EP-03 | 6 | pass 6 | CONN-EP-03 a non-string topic a wire message that is a non-string topic gives the member nothing; its last good frame stays and the carrier stays open | packages/core/ui/tests/connections.test.mjs |
| CONN-EP-04 | 1 | pass 1 | CONN-EP-04 no budget warning every reader, 20 topics, a language change and a Reconnect → nothing logs a connection-budget warning | packages/core/ui/tests/connections.test.mjs |
| CONN-ST-03 | 1 | pass 1 | CONN-ST-03 leaving the Fishball page brand and sidebar targets mounted; <html data-fishball-page> removed (the page left) → the carrier closes; the mark back →  | packages/core/ui/tests/connections.test.mjs |
| CONN-ST-04 | 1 | pass 1 | CONN-ST-04 service alone no reader mounted; one fishballPageStream subscriber → the carrier opens; it unsubscribes → the carrier closes | packages/core/ui/tests/connections.test.mjs |
| CONN-ST-05 | 2 | pass 2 | CONN-ST-05 language en → zh every reader mounted, UI language en → zh: the old carrier is closed and exactly one carrier is open on lang=zh | packages/core/ui/tests/connections.test.mjs |
| CONN-ST-06 | 1 | pass 1 | CONN-ST-06 late joiner a member joining after the topic's frame arrived gets that last frame at once, and no source is opened for it | packages/core/ui/tests/connections.test.mjs |
| CONN-ST-07 | 1 | pass 1 | CONN-ST-07 unsubscribed member a member that unsubscribed gets no later frame and no later health | packages/core/ui/tests/connections.test.mjs |
| CONN-ST-08 | 2 | pass 2 | CONN-ST-08 closed the carrier errors with readyState CLOSED → every member of every topic is told 'closed'; the next frame of any topic → 'live' to all | packages/core/ui/tests/connections.test.mjs |
| CONN-ST-09 | 1 | pass 1 | CONN-ST-09 Reconnect closed → Reconnect ([data-fishball-stream-retry]): the old source closed, one fresh carrier open, members read stale (not closed) until the | packages/core/ui/tests/connections.test.mjs |
| CONN-SYS-DT-01 | 1 | pass 1 | CONN-SYS-DT-01 constant count DSH's real Fishball page with every panel: 0, 1, 5 amenity topics, the Task board shown, after two sends, the Task board hidden, t | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-EP-01 | 1 | pass 1 | CONN-SYS-EP-01 face ctx.get('fishballInstance') is apiVersion 2 with page.register a function; register answers a dispose function | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-EP-02 | 3 | pass 3 | CONN-SYS-EP-02 topic empty a topic that is the empty string → TypeError | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-EP-03 | 6 | pass 6 | CONN-SYS-EP-03 provider frameNotFn a provider that is frameNotFn (not {frame(url), onChange(fn)}) → TypeError | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-EP-04 | 1 | pass 1 | CONN-SYS-EP-04 duplicate registering a topic name already registered throws (a fake topic twice, and each built-in name) | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-EP-05 | 1 | pass 1 | CONN-SYS-EP-05 built-in frames asks frame is {managerSessionId: the manager, cards: []}; fishball-taskboard frame equals GET /api/fishball-taskboard/board; stri | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-EP-06 | 1 | pass 1 | CONN-SYS-EP-06 frame(url) a provider is asked frame(url) with the carrier's request URL: its path and the lang and tz it was opened with | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-EP-07 | 1 | pass 1 | CONN-SYS-EP-07 strip in the language the strip frame is drawn in the carrier's language: the zh carrier's strip frame differs from the en one | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-EP-08 | 1 | pass 1 | CONN-SYS-EP-08 no budget warning the page logs no connection-budget warning | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-ST-01 | 1 | pass 1 | CONN-SYS-ST-01 change, no repeat onChange with a new value → one message with it; onChange with the same value (told twice) → no message | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-ST-02 | 1 | pass 1 | CONN-SYS-ST-02 registered while open a topic registered while the carrier is open is sent to it at once | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-ST-03 | 1 | pass 1 | CONN-SYS-ST-03 a throwing provider a provider whose frame() throws: that topic is skipped, the carrier stays and another topic's change still arrives; a carrier | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-ST-04 | 1 | pass 1 | CONN-SYS-ST-04 disposed topic after its dispose a topic sends nothing more, while another still does | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-ST-05 | 1 | pass 1 | CONN-SYS-ST-05 never reopened over the whole page life (topics registered and withdrawn, Task board opened and hidden, sends) the carrier was opened once, and n | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-UC-01 | 1 | pass 1 | CONN-SYS-UC-01 open GET /api/fishball/page/events?lang&tz → 200 text/event-stream; at open exactly one {topic, frame} message per registered topic (asks, strip, | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-UC-02 | 1 | pass 1 | CONN-SYS-UC-02 send every panel mounted and the Task board tab open: a text send from DSH's composer reaches the model and the composer leaves its sending state | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-SYS-UC-03 | 1 | pass 1 | CONN-SYS-UC-03 send with an image the same with an image attached through the composer's file input: the model receives it and the composer leaves its sending s | integration: a booted DSH with fishball-core, fishball-ui and fishball-taskboard installed (the carrier route from Node, DSH's real page in Chromium, sends with every panel) |
| CONN-TB-01 | 1 | pass 1 | CONN-TB-01 rides the carrier with fishballPageStream present the Task board tab opens no connection of its own and draws the board the carrier's fishball-taskbo | integration: fishball-taskboard's browser half beside fishball-ui on one scripted page (its tab rides fishball-ui's carrier / falls back to its own stream) |
| CONN-TB-02 | 1 | pass 1 | CONN-TB-02 no visibility gating the Task board tab alone, hidden (tab.visible false, sidebar collapsed) → the carrier stays open and is not reopened; a frame se | integration: fishball-taskboard's browser half beside fishball-ui on one scripted page (its tab rides fishball-ui's carrier / falls back to its own stream) |
| CONN-TB-03 | 1 | pass 1 | CONN-TB-03 two tabs two Task board tabs mounted → one carrier; both draw each frame | integration: fishball-taskboard's browser half beside fishball-ui on one scripted page (its tab rides fishball-ui's carrier / falls back to its own stream) |
| CONN-TB-04 | 2 | pass 2 | CONN-TB-04 invalid frame a string a fishball-taskboard frame that is a string keeps the last good board drawn | integration: fishball-taskboard's browser half beside fishball-ui on one scripted page (its tab rides fishball-ui's carrier / falls back to its own stream) |
| CONN-TB-05 | 1 | pass 1 | CONN-TB-05 standalone fallback without fishball-ui (no fishballPageStream) the Task board tab opens its own /api/fishball-taskboard/events and no carrier; unmou | integration: fishball-taskboard's browser half beside fishball-ui on one scripted page (its tab rides fishball-ui's carrier / falls back to its own stream) |

## test/v3/fishball-ui/contrast

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| RESHOOT-ASKBADGE-DT-01 | 8 | pass 8 | RESHOOT-ASKBADGE-DT-01 open ask en dark (en, dark) an open ask card's badge reads "Fishball is waiting for your answer" in a warning DSH Tag; its text has at le | packages/core/ui/tests/contrast.test.mjs |
| RESHOOT-ASKBADGE-ST-01 | 4 | skip 4 | RESHOOT-ASKBADGE-ST-01 answered dark (dark) a card moved to answered: its badge is a neutral DSH Tag | retired: withdrawn (f24f814a: finished ask cards are no longer drawn in the dock) |
| UIFF-ASK-DT-01 | 8 | pass 8 | UIFF-ASK-DT-01 ask en dark (en, dark) an open ask card's reason textarea shows "Reason"; its placeholder has at least 4.5:1 against the textarea's own fill | packages/core/ui/tests/contrast.test.mjs |
| UIFF-ORACLE-BVA-01 | 7 | pass 7 | UIFF-ORACLE-BVA-01 #767676 on white (just above 4.5) the WCAG oracle: #767676 on white (just above 4.5) | retired: duplicate of fishball-test-helpers HLP-WCAG-BVA-01/EP-01..03 (the WCAG oracle moved to the helpers) |
| UIFF-ORACLE-CTRL-01 | 4 | pass 3, skip 1 | UIFF-ORACLE-CTRL-01 placeholder dark (dark) control: DSH's default placeholder token --dsw-alias-label-dimmed over the same textarea fill is below 4.5:1 | packages/core/ui/tests/contrast.test.mjs (placeholder ×2, warning Tag light); "success tone light" retired: withdrawn with the status card (MULTI-3 D03) |
| UIFF-STRIP-DT-01 | 4 | skip 4 | UIFF-STRIP-DT-01 connected en dark (en, dark) connected status badge contrast | retired: withdrawn (MULTI-3 D03: no status card) |
| UIFF-TOKENS-EP-01 | 6 | pass 6 | UIFF-TOKENS-EP-01 ask card dark (dark) the ask card: every colour declaration of Fishball's own sheets on the measured elements uses DSH tokens, no hard-coded c | packages/core/ui/tests/contrast.test.mjs |

## test/v3/fishball-ui/guards

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| PLAT-DT-04 | 18 | pass 18 | PLAT-DT-04 row 1 core last, HMR off: guards apply from the first start; dsh-instance never started; report ok | integration: booted standalone DSH with fishball-core + its ./ui component (fishball-test-helpers/dsh-world) + stand-in bundles (probe row, dsh-instance stand-in, other, deselected); HMR on/off; core self-reorder and gua |
| PLAT-UC-04 | 38 | pass 33, todo 4, skip 1 | PLAT-UC-04 A1 a shipped preset switched back on is also reported as agent-presets (a preset other than core's is offered) | integration: booted standalone DSH with fishball-core + its ./ui component (fishball-test-helpers/dsh-world) + stand-in bundles + scripted model (manager session, presets, overrides, report); 33 rows. Retired: 4 todo (F- |
| UIM-DT-01 | 6 | pass 4, todo 2 | UIM-DT-01 all rows R-ARCH-02: no other plugin is refused, hidden or disabled because core is present (the deselected stand-in only by its owner) | integration: booted standalone DSH with fishball-core + its ./ui component (fishball-test-helpers/dsh-world) + stand-in dsh-instance (rows 9, 10b, 14, all rows); retired: todo rows 9 "manual token" (F-LINK) and 10b "real |

## test/v3/fishball-ui/model-dialog

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| CAT-BVA-01 | 1 | pass 1 | CAT-BVA-01 one read per opening two openings → exactly two reads; re-renders and window focus while open read nothing more | packages/core/ui/tests/model-dialog.test.mjs |
| CAT-EP-01 | 5 | pass 5 | CAT-EP-01 refused en (en) the read refused → the failed alert and a [data-fishball-model-retry] button "Try again"; pressing it reads again; its success shows t | packages/core/ui/tests/model-dialog.test.mjs |
| CAT-ST-01 | 1 | pass 1 | CAT-ST-01 A then B open (catalog A) → closed → opened again with DSH now answering catalog B: B's models, none of A's | packages/core/ui/tests/model-dialog.test.mjs |
| CAT-ST-02 | 1 | pass 1 | CAT-ST-02 reopen paints loading catalog A shown → reopened, the new read pending: the first paint is loading, no model of A | packages/core/ui/tests/model-dialog.test.mjs |
| CAT-ST-03 | 1 | pass 1 | CAT-ST-03 pending → loading while the first read is pending the dialog shows loading and no choice | packages/core/ui/tests/model-dialog.test.mjs |
| CAT-ST-04 | 2 | pass 2 | CAT-ST-04 late answer after close read pending → the dialog closes (page closed) → the read answers: nothing changes (no dialog, no state update of an unmounted | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-BVA-01 | 2 | pass 2 | MODEL-BVA-01 en zero catalog models explains and opens DSH Settings | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-EP-01 | 2 | pass 2 | MODEL-EP-01 en unset model prompts with all catalog models | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-EP-02 | 2 | pass 2 | MODEL-EP-02 en configured core model does not prompt | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-ST-01 | 2 | pass 2 | MODEL-ST-01 en choose writes core model path | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-ST-02 | 2 | pass 2 | MODEL-ST-02 en dismiss stays dismissed in page; fresh page prompts | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-ST-03 | 1 | pass 1 | MODEL-ST-03 HMR disable core removes core and its UI component rows; picker restored, no strip or Connect | integration: booted standalone DSH with fishball-core + its ./ui component (fishball-test-helpers/dsh-world) + HMR disable of fishball-core: UI rows go, picker restored, strip 404, Connect 404/503 |
| MODEL-ST-04 | 2 | pass 2 | MODEL-ST-04 en page not open (no data-fishball-page) with unset model: no dialog | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-ST-05 | 2 | pass 2 | MODEL-ST-05 en closed → data-fishball-page set: dialog shows | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-ST-06 | 2 | pass 2 | MODEL-ST-06 en dismiss → page closed → page opened again: dialog shows again | packages/core/ui/tests/model-dialog.test.mjs |
| MODEL-SYS-01 | 1 | pass 1 | MODEL-SYS-01 composer picker off with core | integration: booted standalone DSH with fishball-core + its ./ui component (fishball-test-helpers/dsh-world): ui-model-selection row disabled |
| SES-SB-DT-01 | 3 | pass 3 | SES-SB-DT-01 no session no session → no sessions list | packages/core/ui/tests/model-dialog.test.mjs |
| SES-SB-EP-01 | 2 | pass 2 | SES-SB-EP-01 shown en (en) a connected target with running sessions → its list under the row without a press, named "Running sessions", one item per session wit | packages/core/ui/tests/model-dialog.test.mjs |
| SES-SB-EP-02 | 1 | pass 1 | SES-SB-EP-02 markup title a markup-looking title is drawn as text: no element from it | packages/core/ui/tests/model-dialog.test.mjs |
| SES-SB-ST-01 | 1 | pass 1 | SES-SB-ST-01 sessions end one running → shown; the next frame with none → the list is gone | packages/core/ui/tests/model-dialog.test.mjs |
| SES-SB-ST-02 | 1 | pass 1 | SES-SB-ST-02 stream lost the stream fails → the list is hidden (the rows stay); a live frame again → shown | packages/core/ui/tests/model-dialog.test.mjs |
| SES-SB-ST-03 | 1 | pass 1 | SES-SB-ST-03 details unaffected pressing the row opens and closes its details as before; the sessions list stays in both states | packages/core/ui/tests/model-dialog.test.mjs |
| SES-VIEW-BVA-01 | 3 | pass 3 | SES-VIEW-BVA-01 row 0 sessions 0 running session(s) → sessions has 0 entries {sessionId, title} in core's order | packages/core/ui/tests/model-dialog.test.mjs |
| SES-VIEW-EP-01 | 3 | pass 3 | SES-VIEW-EP-01 unknown absent runningSessions absent → sessions [] | packages/core/ui/tests/model-dialog.test.mjs |
| SES-VIEW-EP-02 | 4 | pass 4 | SES-VIEW-EP-02 state connecting a connecting target with a known list → sessions [] (never a stale claim) | packages/core/ui/tests/model-dialog.test.mjs |
| SES-VIEW-EP-03 | 2 | pass 2 | SES-VIEW-EP-03 untitled en (en) an empty title reads "Untitled session"; words.sessions is "Running sessions" | packages/core/ui/tests/model-dialog.test.mjs |
| SES-VIEW-EP-04 | 1 | pass 1 | SES-VIEW-EP-04 markup title verbatim a markup-looking or RTL title stays the same string | packages/core/ui/tests/model-dialog.test.mjs |
| STRIP-DT-01 | 1 | skip 1 | STRIP-DT-01 K3a routes controls use core Connect and cancel routes | retired: withdrawn (MULTI-0 review S6, 1249c517: K3a /api/fishball/connect routes removed) |
| STRIP-DT-02 | 1 | todo 1 | STRIP-DT-02 target Connect route answers per SEAM_TARGETS.http | integration: fishball-core's /api/fishball/targets/connect in a booted DSH (old todo; core serves it since MULTI-1) — subject is core's route |
| STRIP-SYS-01 | 2 | pass 2 | STRIP-SYS-01 en immediate SSE frame contract | integration: booted standalone DSH with fishball-core + its ./ui component (fishball-test-helpers/dsh-world): first SSE frame of /api/fishball/strip (now the page connection) with core status |
| TGT-ASK-DT-01 | 4 | pass 4 | TGT-ASK-DT-01 network an answer answered network → a role=alert in the card | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-ASK-EP-01 | 4 | pass 4 | TGT-ASK-EP-01 source en (en) the card shows the hidden prefix "DSH:" and card.source.name as text; data-fishball-ask = handle | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-ASK-EP-02 | 1 | pass 1 | TGT-ASK-EP-02 post by handle Reject → POST /api/fishball/asks/answer with exactly {handle, choice, text}; no approvalId | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-ASK-EP-03 | 1 | pass 1 | TGT-ASK-EP-03 equal approvalId two cards with the same approvalId from two targets → two cards, each posting its own handle | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-ASK-ST-01 | 2 | pass 2 | TGT-ASK-ST-01 voided en (en) a voided card dismisses from the composer dock (finished cards do not render) | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-DOCK-EP-01 | 2 | pass 2 | TGT-DOCK-EP-01 no pairing card no dock entry draws [data-fishball-pairing] or opens the pairing stream | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-BVA-01 | 3 | pass 3 | TGT-SB-BVA-01 row 1 rows 1 target(s) → 1 row buttons with aria-expanded=false, each showing its name and badge; no URL in a closed row | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-DT-01 | 6 | pass 6 | TGT-SB-DT-01 cancel en (en) cancel in the details → POST /api/fishball/targets/cancel {targetId}; never the withdrawn K3a routes | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-DT-02 | 11 | pass 11 | TGT-SB-DT-02 connect 200 ok Connect answered 200 ok → no refused alert | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-DT-03 | 3 | pass 3 | TGT-SB-DT-03 pairing 200 ok a pairing choice answered 200 ok → no pairing alert | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-DT-04 | 2 | pass 2 | TGT-SB-DT-04 needs-configuration en (en) Connect answers 200 {outcome: needs-configuration, code} → the refused alert reads "Connect needs configuration in Fish | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-EP-01 | 1 | pass 1 | TGT-SB-EP-01 priority fishball-ui registers sidebar.workspaces at a priority below fishball-page's Empty (-1) and DSH's (0) | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-EP-02 | 2 | pass 2 | TGT-SB-EP-02 stream url en (en) the sidebar opens one source, /api/fishball/page/events?lang=en&tz=<the browser zone> | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-EP-03 | 2 | pass 2 | TGT-SB-EP-03 placeholders en (en) name null: a row with no URL shows "Not set", a row with a URL "Name unavailable" | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-EP-04 | 3 | pass 3 | TGT-SB-EP-04 name long a long name is drawn as plain text, verbatim; no element from it | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-EP-05 | 2 | pass 2 | TGT-SB-EP-05 empty zero targets → the empty text and a Fishball settings button [data-fishball-target-settings] that opens core's settings | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-EP-06 | 2 | pass 2 | TGT-SB-EP-06 no pluginNavigation the details' Fishball settings link → layout.selectPanel('plugins') | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-ST-01 | 2 | pass 2 | TGT-SB-ST-01 mark set later <html data-fishball-page> set after load → the target list appears; removed → it goes | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-ST-02 | 2 | pass 2 | TGT-SB-ST-02 expand/collapse row A: aria-expanded false → press → true with why, Address and the URL in [data-fishball-target-url], tools and identity inline →  | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-ST-03 | 2 | pass 2 | TGT-SB-ST-03 select sends nothing opening and closing rows sends no request and writes no setting (Q09) | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-ST-04 | 3 | pass 3 | TGT-SB-ST-04 approval en (en) Connect answers {outcome: approval-url, url} → window.open(url) in a new tab and a link "Open the approval page" to it | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-ST-05 | 2 | pass 2 | TGT-SB-ST-05 pairing other choice warn-match: new-token-and-id unticked → POST pairing {targetId, choice: new-token-and-id, confirmed: false} | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-ST-06 | 3 | pass 3 | TGT-SB-ST-06 closed stream closed → the list marked stale, every action control disabled, the pairing warning still readable, the shared Reconnect | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-SB-ST-07 | 4 | pass 4 | TGT-SB-ST-07 latest press opens two Connect presses on A, the first answering after the second → only the second's approval URL is opened | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-BVA-01 | 4 | pass 4 | TGT-VIEW-BVA-01 row 0 targets en (en) fishball on, zero targets → empty is a non-empty text starting "No DSH target yet"; targets [] | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-BVA-02 | 5 | pass 5 | TGT-VIEW-BVA-02 tools 0 contributedTools 0 → one contributed-tools line showing 0 | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-DT-01 | 6 | pass 6 | TGT-VIEW-DT-01 core absent en (en) core absent → on false, notices [{kind: fishball-off}], targets [], empty null | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-DT-02 | 4 | pass 4 | TGT-VIEW-DT-02 ok, incomplete guards × set ok, incomplete → notice kinds ["plugin-set-incomplete"], each with a non-empty text | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-DT-03 | 35 | pass 35 | TGT-VIEW-DT-03 connected name null url absent en (en) connected, name null, url absent → name null, placeholder "Not set"; nothing URL-derived | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-DT-04 | 11 | pass 11 | TGT-VIEW-DT-04 control cancel connecting en (en) control cancel in connecting → {action: cancel, label "Cancel"}; retry none | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-EP-01 | 2 | pass 2 | TGT-VIEW-EP-01 order and identity targets keep the snapshot order; targetId, kind and url are the TargetView's | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-EP-02 | 10 | pass 10 | TGT-VIEW-EP-02 badges en (en) the four states have four different badges; en and zh differ | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-EP-03 | 8 | pass 8 | TGT-VIEW-EP-03 absent brandStyle absent → fishball | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-EP-04 | 19 | pass 19 | TGT-VIEW-EP-04 why authorizing en (en) why line kind authorizing (known) → translated: not the raw word, en ≠ zh | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-EP-05 | 2 | pass 2 | TGT-VIEW-EP-05 identity en (en) identity pending / live / unsupported / stale → one identity line each, four different texts | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-EP-06 | 8 | pass 8 | TGT-VIEW-EP-06 pairing need-token en (en) pairing need-token → exactly pairingView(target.pairing, en, tz) | packages/core/ui/tests/model-dialog.test.mjs |
| TGT-VIEW-EP-07 | 1 | pass 1 | TGT-VIEW-EP-07 title and words en/zh title and words are non-empty and differ between en and zh | packages/core/ui/tests/model-dialog.test.mjs |
| UIPF-MODEL-BVA-01 | 1 | pass 1 | UIPF-MODEL-BVA-01 one group a catalog of one group with one model → one heading, one choice "<group> / <model>" | packages/core/ui/tests/model-dialog.test.mjs |
| UIPF-MODEL-EP-01 | 4 | pass 4 | UIPF-MODEL-EP-01 aria-labels en (en) every choice button's aria-label is "<group> / <model>" or "<group> / <model> · <effort>"; one per model, one per effort | packages/core/ui/tests/model-dialog.test.mjs |
| UIPF-MODEL-EP-02 | 2 | pass 2 | UIPF-MODEL-EP-02 headings each provider (group) name is shown once as a heading, before its choices; a choice comes after its own group's heading and before the | packages/core/ui/tests/model-dialog.test.mjs |
| UIPF-MODEL-EP-03 | 2 | pass 2 | UIPF-MODEL-EP-03 none an empty catalog → no choice, and the Open DSH settings button | packages/core/ui/tests/model-dialog.test.mjs |
| UIPF-STRIP-DT-01 | 20 | skip 20 | UIPF-STRIP-DT-01 authorizing en (en) first line authorizing: root [role=status][data-fishball-strip-state=connecting], heading = card.title, badge "Connecting"  | retired: withdrawn (MULTI-3 D03 / requirement D: no chat-top status card) |
| UIPF-STRIP-DT-02 | 6 | skip 6 | UIPF-STRIP-DT-02 cancel en (en) control cancel → one button[data-fishball-strip-control=cancel] "Cancel" with the outline look | retired: withdrawn (MULTI-3 D03 / requirement D: no chat-top status card) |
| UIPF-STRIP-EP-01 | 2 | skip 2 | UIPF-STRIP-EP-01 tools chip en (en) the contributed-tools line is a chip: data-fishball-strip-line=contributed-tools, tabIndex 0, Tooltip label = toolsHint, ari | retired: withdrawn (MULTI-3 D03 / requirement D: no chat-top status card) |
| UIPF-STRIP-ST-01 | 3 | skip 3 | UIPF-STRIP-ST-01 approval en (en) connect pressed, Connect answers an approval URL, then control cancel → the approval link: href and title the URL, target _bla | retired: withdrawn (MULTI-3 D03 / requirement D: no chat-top status card) |

## test/v3/fishball-ui/package

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| EFIX3-UI-DT-01 | 3 | pass 3 | EFIX3-UI-DT-01 rule 1 the hosted child row inserted → welcomeNoticeVersion resolves to "2026-09-28.1" | integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) + DSH interpolate (notice row is core's) |
| EFIX3-UI-EP-01 | 6 | pass 6 | EFIX3-UI-EP-01 an overlay inserting a near id (dsh-instance-child-x) core started, overlays an overlay inserting a near id (dsh-instance-child-x) → undefined | integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) + DSH interpolate |
| EFIX3-UI-EP-02 | 1 | pass 1 | EFIX3-UI-EP-02 startedBundles the notice row no longer reads startedBundles: an empty list with the child row still resolves the version | integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) + DSH interpolate |
| EFIX3-UI-GUARD-01 | 3 | pass 3 | EFIX3-UI-GUARD-01 gone fishball-ui has no src/guards.js and no peer dependency on @deepseek-ai/dsh-app-boot | packages/core/ui/tests/package.test.mjs (gone); uiRows / rows → integration: fishball-core src/guards/intended.js readIntendedGuards() vs core's patch |
| EFIX3-UI-OWNER-01 | 1 | pass 1 | EFIX3-UI-OWNER-01 owner layer the owner's profile layer setting ui-settings-general.config.welcomeNoticeVersion still wins over core's (composed by DSH after th | integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) + owner layer |
| EFIX3-UI-SHAPE-01 | 3 | pass 3 | EFIX3-UI-SHAPE-01 composed composed with DSH's own layers and core's patch: the ui-settings-general row exists and carries the notice config | integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) (row, composed) + DSH welcome-step version drift |
| EFIX3-UI-SYS-01 | 2 | todo 1, pass 1 | EFIX3-UI-SYS-01 hosted a hosted child resolves welcomeNoticeVersion to 2026-09-28.1 in a real process — TODO out of scope for E-FIX-3 tests (the parent excluded | integration: booted standalone DSH with fishball-core + its ./ui component (fishball-test-helpers/dsh-world) (standalone row); hosted todo retired (hosted child out of scope, covered by EFIX3-UI-DT-01 rule 1) |
| first | 1 | pass 1 | first visit | packages/core/ui/tests/package.test.mjs (R3B-07 reload subtest "first visit") |
| FRAME-READY | 3 | pass 3 | FRAME-READY child/known-parent the installed page sends only one nonsecret marker per loaded framed document to its direct parent | packages/core/ui/tests/package.test.mjs |
| LOGO-FIX-3 | 3 | pass 3 | LOGO-FIX-3 interrupt fade reopening before settle preserves the original owned brand after the collapse deadline | packages/core/ui/tests/package.test.mjs |
| MULTI-BAR-BVA-01 | 1 | pass 1 | MULTI-BAR-BVA-01 page 481px Fishball's page, 481px (just outside max-width: 480px) → DSH's sidebar exactly as without Fishball's rules | packages/core/ui/tests/package.test.mjs |
| MULTI-BAR-BVA-02 | 2 | pass 2 | MULTI-BAR-BVA-02 one entry one entry at 390px → the bar, the entry and Settings shown, nothing scrolls | packages/core/ui/tests/package.test.mjs |
| MULTI-BAR-CTRL-01 | 1 | pass 1 | MULTI-BAR-CTRL-01 no page rules control: the same frame at 390px without fishball-page's rules has no bottom bar, so a pass above is not an artefact | packages/core/ui/tests/package.test.mjs |
| MULTI-BAR-DT-01 | 17 | pass 17 | MULTI-BAR-DT-01 not the page 1280px not Fishball's page (no <html data-fishball-page>), 1280px → DSH's sidebar exactly as without Fishball's rules | packages/core/ui/tests/package.test.mjs |
| MULTI-BAR-EP-01 | 2 | pass 2 | MULTI-BAR-EP-01 entries and settings the bar shows every panel entry (DSH's and a third-party one) with its own icon, inside the bar, and the Settings seat; the | packages/core/ui/tests/package.test.mjs |
| MULTI-DRAWER-DT-01 | 2 | pass 2 | MULTI-DRAWER-DT-01 mid width rc.1, Fishball's page, 600px (drawer, outside the narrow query) → DSH's drawer exactly as without Fishball's rules | packages/core/ui/tests/package.test.mjs |
| MULTI-NAV-DT-01 | 1 | pass 1 | MULTI-NAV-DT-01 shortcut remaps the gate edits no sidebar.left.toggle binding; the session / workspace shortcuts are still remapped (session.new, session.search | packages/core/ui/tests/package.test.mjs |
| MULTI-NAV-EP-01 | 1 | pass 1 | MULTI-NAV-EP-01 no tray no nav.fishball-page-navigation, no page-owned nav element and no Plugins button of the page (the real sidebar's Plugins row is the one) | packages/core/ui/tests/package.test.mjs |
| MULTI-NAV-EP-02 | 2 | pass 2 | MULTI-NAV-EP-02 status visible 1280px 1280px: the unavailable status and Retry are drawn (not in a hidden subtree) | packages/core/ui/tests/package.test.mjs |
| MULTI-NAV-EP-03 | 1 | pass 1 | MULTI-NAV-EP-03 empty shadow fishball-page registers sidebar.workspaces at priority -1, below DSH's 0, and draws no workspace or session control there | packages/core/ui/tests/package.test.mjs |
| MULTI-NAV-ST-01 | 2 | pass 2 | MULTI-NAV-ST-01 no forced close 1280px 1280px: loading the page calls layout.toggleSidebar() zero times | packages/core/ui/tests/package.test.mjs |
| MULTI-SHEET-EP-01 | 1 | pass 1 | MULTI-SHEET-EP-01 expanded sheet gutter rc.5, Fishball's page, 390px, the sidebar expanded → a sheet from the left edge leaving a 48px gutter of the frame on th | packages/core/ui/tests/package.test.mjs |
| MULTI-SHEET-EP-02 | 2 | pass 2 | MULTI-SHEET-EP-02 rightbar column bar rc.5, Fishball's page, 390px (bar) → [data-rightbar-col] stays in grid column 3 | packages/core/ui/tests/package.test.mjs |
| MULTI-SHEET-ST-01 | 1 | todo 1 | MULTI-SHEET-ST-01 gutter / Escape close, focus in rc.5 ≤480px: a pointerdown in the gutter or Escape (focus in the sheet or body, not handled) closes the sheet; | retired: todo owned by E2E-UI (needs DSH's live layout DOM) |
| NARROW-KEY-01 | 2 | pass 2 | NARROW-KEY-01 Enter Tab to all original nav actions; activate an initially offscreen plugin | packages/core/ui/tests/package.test.mjs |
| NARROW-RESIZE-01 | 1 | pass 1 | NARROW-RESIZE-01 same mounted page resize across both breakpoints and return to the narrow original sidebar | packages/core/ui/tests/package.test.mjs |
| NARROW-TOGGLE-01 | 2 | pass 2 | NARROW-TOGGLE-01 row 390px native open → expanded sidebar → native close restores the initial layout | packages/core/ui/tests/package.test.mjs |
| NOCORE-ARCH | 2 | pass 2 | NOCORE-ARCH core composition core's patch with DSH's own layers: the UI rows are inserted and the UI guard rows are plain disabled:true | packages/core/ui/tests/package.test.mjs (no UI patch, merged into UI-BVA-01); core composition → integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) |
| NOCORE-GUARDS | 1 | pass 1 | NOCORE-GUARDS intended readIntendedGuards(): uiRows is empty and rows holds the UI guard ids as plain rows | integration: fishball-core src/guards/intended.js readIntendedGuards() |
| NOCORE-NOTICE | 2 | pass 2 | NOCORE-NOTICE hosted core's notice row resolves welcomeNoticeVersion to 2026-09-28.1 when the hosted child row is inserted | integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) + DSH interpolate |
| NOCORE-OLD | 1 | todo 1 | NOCORE-OLD (a)-(d) the old "fishball-ui alone / core alone / UI selected or started" rows are gone — TODO fishball-ui is core's ./ui/ component since 117cb2a2:  | retired: todo of a withdrawn subject (117cb2a2: no DSH with fishball-ui but no core) |
| R3B-07 | 4 | pass 4 | R3B-07 late child after the English landing, native Chinese survives a replacement page on the same document | packages/core/ui/tests/package.test.mjs |
| reload | 1 | pass 1 | reload | packages/core/ui/tests/package.test.mjs (R3B-07 reload subtest "reload") |
| SHOT-TARGET-URL-EP-01 | 1 | pass 1 | SHOT-TARGET-URL-EP-01 desktop duplicate names the expanded Night-Build address fits, ellipsizes, or wraps without an orphaned URL suffix | packages/core/ui/tests/package.test.mjs |
| SHOT-TARGET-URL-EP-02 | 1 | pass 1 | SHOT-TARGET-URL-EP-02 desktop overlong segment the expanded address ellipsizes on one line and preserves the full URL as text and title | packages/core/ui/tests/package.test.mjs |
| UI-BVA-01 | 2 | pass 2 | UI-BVA-01 inserted core's patch inserts fishball-ui, fishball-page and fishball-recommend-plugins (and no core-missing row) | packages/core/ui/tests/package.test.mjs (no UI patch); inserted → integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) |
| UI-DT-01 | 2 | pass 2 | UI-DT-01 composed composed with DSH's own layers and core's patch: every UI guard row exists | integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) |
| UI-EP-01 | 1 | todo 1 | UI-EP-01 startedBundles the old core-started partitions no longer gate the UI rows — TODO 117cb2a2: the UI rows are core's component rows, inserted unconditiona | retired: todo of a withdrawn subject (117cb2a2: UI rows no longer gated by startedBundles) |
| UI-EP-02 | 6 | pass 6 | UI-EP-02 exports the export map is exactly ., ./client, ./core-missing, ./package.json, each a shipped file | packages/core/ui/tests/package.test.mjs (exports, manifest ×2, imports ×2); reverse → integration: fishball-core's shipped files and manifest never name fishball-ui |
| UI-EP-03 | 1 | pass 1 | UI-EP-03 component rows the UI guard rows are disabled for every startedBundles list; there is no per-bundle condition | integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishball-ui) (UI guard rows disabled for every startedBundles) |
| UI-ST-01 | 1 | todo 1 | UI-ST-01 next start fishball-ui alone: one core-missing line per process — TODO fishball-ui is core's ./ui/ component since 117cb2a2; there is no separate UI bu | retired: todo of a withdrawn subject (117cb2a2: no separate UI bundle) |
| UI-ST-02 | 1 | todo 1 | UI-ST-02 enabled live fishball-ui enabled while core runs — TODO fishball-ui is core's ./ui/ component since 117cb2a2; there is no separate UI bundle to disable | retired: todo of a withdrawn subject (117cb2a2: no separate UI bundle) |
| UI-ST-03 | 1 | pass 1 | UI-ST-03 mountStyle kit.mountStyle(id, css): none → one <style id> with that text → its disposer removes it; a second dispose changes nothing | packages/core/ui/tests/package.test.mjs |
| UI-UC-01 | 10 | pass 9, todo 1 | UI-UC-01 A1 the owner re-enables a UI row: guards-overridden naming row:<id> (R-FB-09); restoring it clears the report | integration: booted standalone DSH with fishball-core + its ./ui component (fishball-test-helpers/dsh-world) (9 rows: rows, fishballUiGuards, report, client graph, recommended route, override A1/A2, no core-missing line) |
| UI-UC-02 | 3 | todo 3 | UI-UC-02 main 2 fishball-ui alone: the core-missing warning — TODO fishball-ui is core's ./ui/ component since 117cb2a2; there is no separate UI bundle to disab | retired: todo of a withdrawn subject (117cb2a2: fishball-ui cannot run without core) |
| UI-UC-03 | 3 | todo 3 | UI-UC-03 main 2 core alone: it boots and the report is ok — TODO fishball-ui is core's ./ui/ component since 117cb2a2; there is no separate UI bundle to disable | retired: todo of a withdrawn subject (117cb2a2: core always carries its ./ui component) |
| UI-UC-04 | 9 | pass 8, todo 1 | UI-UC-04 E1 client.asks.js fails to load: only its part is lost; client.entries.js, client.strip.js, client.brand.js, client.model.js still start; nothing fails | packages/core/ui/tests/package.test.mjs (main 1, main 2, E1 ×5, E2); e2e todo retired (E2E-UI, no subject here) |
| UI-UC-05 | 5 | pass 5 | UI-UC-05 client.asks.js client.asks.js registers {id: fishball-ui, chunk: client.asks.js} and exports asksPart(kit) → a plugin named "fishball-ui: asks" {inject | packages/core/ui/tests/package.test.mjs |
| UI-UC-06 | 16 | pass 11, todo 5 | UI-UC-06 main 1 fishball-ui exists at packages/core/ui as core's component package | packages/core/ui/tests/package.test.mjs (main 1, main 2, main 3 deps, rows ×2 nested packages, moved ×3); rows ×3 path rows → integration: fishball-core's cordis.patch.yml composed/evaluated by DSH (fishball-core + fishb |
| UI-UC-07 | 8 | pass 8 | UI-UC-07 data only ui-seam imports nothing (a data-only module both sides load) | fishball-shared's own tests (packages/shared/tests: UI_SEAM, UI_GUARDS, SEAM_STATUS, data only, ./ui-seam export); E1 drift ×3 → integration: fishball-shared ui-seam vs fishball-core contracts/constants.js |
| UI-UC-08 | 7 | pass 7 | UI-UC-08 client core's client.js still registers fishball-core and loads only client.settings.js | integration: fishball-core's patch, client.js and contracts (core's own package facts; 7 rows) |
| UIPF-NAV-BVA-01 | 5 | pass 5 | UIPF-NAV-BVA-01 settingsOpen false → true aria-expanded follows a re-render from false to true | packages/core/ui/tests/package.test.mjs |
| UIPF-NAV-DT-01 | 6 | pass 6 | UIPF-NAV-DT-01 failed en (en) failed: one [data-fishball-nav-status=failed] reading "Fishball shortcut protection unavailable" (text or accessible name) with a  | packages/core/ui/tests/package.test.mjs |
| UIPF-NAV-EP-01 | 12 | skip 6, pass 6 | UIPF-NAV-EP-01 fishball en (en) fishball: icon only | packages/core/ui/tests/package.test.mjs (settings ×2, retry ×2, settings hooks, no status); order/fishball/plugins ×6 retired: withdrawn (MULTI-3 F: no tray) |
| UIPF-NAV-ST-01 | 6 | skip 4, pass 2 | UIPF-NAV-ST-01 fishball onFocus fishball: tooltip on onFocus | packages/core/ui/tests/package.test.mjs (settings ×2); fishball/plugins ×4 retired: withdrawn (MULTI-3 F: no tray) |
| UIPF-NAV-ST-02 | 1 | pass 1 | UIPF-NAV-ST-02 pending → protected pending (config loading) → the config is read: the status and Retry go | packages/core/ui/tests/package.test.mjs |
| UIPF-NAV-UC-01 | 5 | skip 3, pass 2 | UIPF-NAV-UC-01 fishball after drift pressing fishball after drift | packages/core/ui/tests/package.test.mjs (settings, retry); fishball ×2 / plugins retired: withdrawn (MULTI-3 F: no tray) |

## test/v3/fishball-ui/pairing

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| PAIR-BVA-01 | 6 | pass 6 | PAIR-BVA-01 lastSeenAt 0 (epoch) en (en) lastSeenAt 0 (epoch) → Intl medium/short in the zone | packages/core/ui/tests/pairing.test.mjs |
| PAIR-BVA-02 | 1 | pass 1 | PAIR-BVA-02 core absent view undefined (core absent) → no lines, no choices, no confirm | packages/core/ui/tests/pairing.test.mjs |
| PAIR-DT-01 | 14 | pass 14 | PAIR-DT-01 id-mismatch en (en) id-mismatch: title, lines, confirm, choices and failed as the requirement's table | packages/core/ui/tests/pairing.test.mjs |
| PAIR-DT-02 | 32 | pass 32 | PAIR-DT-02 name-invalid named need-id en (en) nameIssue name-invalid (a name) in need-id → one more line kind name-invalid | packages/core/ui/tests/pairing.test.mjs |
| PAIR-DT-03 | 7 | skip 7 | PAIR-DT-03 answer not-confirmed POST {choice, confirmed: true} → choose(choice, {confirmed: true}) once; 200 with its result {"ok":false,"code":"not-confirmed"} | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-DT-04 | 13 | skip 13 | PAIR-DT-04 continue ticked, not-saved en (en) press continue (ticked) → POST {choice, confirmed: true}; the failed alert with the frame's failed text | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-EP-01 | 1 | pass 1 | PAIR-EP-01 frozen the result is deeply frozen and has exactly state, title, lines, confirm, choices, failed (and key) | packages/core/ui/tests/pairing.test.mjs |
| PAIR-EP-02 | 5 | pass 5 | PAIR-EP-02 lang "" lang "" → the en copy | packages/core/ui/tests/pairing.test.mjs |
| PAIR-EP-03 | 5 | pass 5 | PAIR-EP-03 zone "" an invalid or absent zone "" → the process default zone, no throw | packages/core/ui/tests/pairing.test.mjs |
| PAIR-EP-04 | 2 | pass 2 | PAIR-EP-04 nameless en (en) a nameless bound pair is shown as "ID: <id>" in the warning | packages/core/ui/tests/pairing.test.mjs |
| PAIR-EP-05 | 1 | pass 1 | PAIR-EP-05 key key is a string; it is the same for equal views and differs when state, warning or nameIssue changes | packages/core/ui/tests/pairing.test.mjs |
| PAIR-EP-06 | 2 | skip 2 | PAIR-EP-06 apiVersion 2 a fishballInstance with apiVersion 2 counts as absent: a frame with no lines; choose → 503 pairing-unavailable | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-EP-07 | 5 | skip 5 | PAIR-EP-07 confirmed "true" POST confirmed "true" → choose(choice, {confirmed: false}) | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-EP-08 | 9 | skip 9 | PAIR-EP-08 a string POST body a string → 400 {ok:false, code:'invalid-arguments'}; core's choose not called | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-HEALTH-01 | 4 | skip 4 | PAIR-HEALTH-01 closed en (en) error with readyState CLOSED → the closed notice, the cached lines still readable, the checkbox and every choice disabled, a Recon | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-HEALTH-02 | 2 | skip 2 | PAIR-HEALTH-02 fresh frame stale → a fresh valid frame: no notice, choices enabled again (continue per its tick) | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-HEALTH-03 | 1 | skip 1 | PAIR-HEALTH-03 unmount unmounting the card closes its EventSource | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-INT-00 | 1 | pass 1 | PAIR-INT-00 routes removed fishball-ui's row registers neither /api/fishball/pairing nor /api/fishball/pairing/choose | packages/core/ui/tests/pairing.test.mjs |
| PAIR-INT-01 | 1 | skip 1 | PAIR-INT-01 routes the row registers GET /api/fishball/pairing and POST /api/fishball/pairing/choose on ctx.connection.fetch | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-INT-02 | 3 | skip 3 | PAIR-INT-02 first frame en (en) GET ?lang=en&tz=<zone>: 200 text/event-stream, one frame at once = pairingView(core's view, en, zone) | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-ST-01 | 1 | skip 1 | PAIR-ST-01 change core view changes → one new frame per change; an identical consecutive view sends no frame | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-ST-02 | 1 | skip 1 | PAIR-ST-02 absent → provided → replaced → removed no core: a frame with no lines; core provided: its frame; replaced: the new one's frame and the old listener d | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-ST-03 | 2 | skip 2 | PAIR-ST-03 abort a request abort closes that stream and drops its listener on core | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-ST-04 | 2 | skip 2 | PAIR-ST-04 failed → ok clears failed alert shown → a later ok answer shows no error | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-ST-05 | 2 | skip 2 | PAIR-ST-05 new warning resets ticked and failed → a new warn-match for another bound pair: the box unticked, continue disabled, the alert gone | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-UI-01 | 1 | skip 1 | PAIR-UI-01 stream url the card opens the pairing stream with lang (UI locale) and tz (the browser zone) | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-UI-02 | 2 | skip 2 | PAIR-UI-02 warn-match en (en) warn-match: root [state], one line per frame line, the confirm checkbox with the confirm text, continue and new-token-and-id butto | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-UI-03 | 4 | skip 4 | PAIR-UI-03 id-mismatch id-mismatch: the line, no confirm checkbox, choices [] | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |
| PAIR-UI-04 | 4 | skip 4 | PAIR-UI-04 core absent core absent: a frame with no lines draws nothing | retired: withdrawn by MULTI-3 requirement D (the pairing dock card and /api/fishball/pairing routes removed; pairing lives in the sidebar target details, TGT-SB-ST-05 / TGT-SB-DT-03); registered as skip |

## test/v3/fishball-ui/stream

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| HEALTH-DT-01 | 6 | pass 4, skip 2 | HEALTH-DT-01 asks closed en (en) ask cards, error CLOSED → the closed notice in the asks dock, [data-fishball-asks-stale=closed], the cards still readable, ever | packages/core/ui/tests/stream.test.mjs (the 2 strip rows retired: withdrawn by MULTI-3 requirement D) |
| HEALTH-EP-01 | 4 | pass 4 | HEALTH-EP-01 asks an array asks stale → a frame that is an array keeps the notice and the disabled controls | packages/core/ui/tests/stream.test.mjs |
| HEALTH-ST-00 | 1 | pass 1 | HEALTH-ST-00 initial no frame yet and no error: no notice anywhere | packages/core/ui/tests/stream.test.mjs |
| HEALTH-ST-01 | 2 | skip 2 | HEALTH-ST-01 strip closed → Reconnect en (en) strip, error with CLOSED | retired: withdrawn by MULTI-3 requirement D (no strip card); registered as skip |
| HEALTH-ST-02 | 1 | skip 1 | HEALTH-ST-02 strip recovery strip stale → a fresh valid frame | retired: withdrawn by MULTI-3 requirement D (no strip card); registered as skip |
| HEALTH-ST-03 | 1 | skip 1 | HEALTH-ST-03 initial closed no frame ever, error with CLOSED → the strip card | retired: withdrawn by MULTI-3 requirement D (no strip card); registered as skip |
| HEALTH-ST-04 | 1 | pass 1 | HEALTH-ST-04 asks recovery asks stale → a fresh valid frame re-enables every choice and the reason box; the notice goes | packages/core/ui/tests/stream.test.mjs |
| HEALTH-ST-05 | 1 | pass 1 | HEALTH-ST-05 asks closed → Reconnect → stale → live asks closed → Reconnect: the notice is stale (not closed) until a frame arrives, then gone | packages/core/ui/tests/stream.test.mjs |
| HEALTH-ST-06 | 1 | pass 1 | HEALTH-ST-06 Reconnect reopens the asks stream asks closed → one Reconnect press closes the old EventSource and opens one new asks stream, stale until its frame | packages/core/ui/tests/stream.test.mjs |
| HEALTH-ST-07 | 1 | pass 1 | HEALTH-ST-07 remount after closed a stream closed, then every card unmounted and mounted again → it reads stale (not closed) until a frame | packages/core/ui/tests/stream.test.mjs |
| HEALTH-ST-08 | 1 | pass 1 | HEALTH-ST-08 unmount closes unmounting every card closes every EventSource | packages/core/ui/tests/stream.test.mjs |
| TIME-DT-01 | 2 | pass 2 | TIME-DT-01 UI en UI en, runtime default zh-CN → the card time is new Date(askedAt).toLocaleString('en'), the browser's zone | packages/core/ui/tests/stream.test.mjs |
