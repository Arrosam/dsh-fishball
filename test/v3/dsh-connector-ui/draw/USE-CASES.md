# U-DRAW: use cases and derived tables

Written from the requirements alone (requirements 1.34, 1.38 Q-U1 / Q-U2, 1.41 Q-G3 / Q-G4 / Q-G5,
QD4, decided item #77; R-ARCH-04, R-UI-01/02/03/04/05/08/09/10/13, R-NAME-05/08, R-FN-01,
R-EXT-13, design §13.6), the observable contract the dev session relayed (2026-11-16), and its
correction of the same day (the V2 `dshConnector` fallback, `legacy`, stays until C-WIRE). Nothing
under `packages/dsh-connector-ui/src/**` or `packages/dsh-connector-ui/index.js` was read.
`cases.mjs` registers one test per row below, named `<id> <row> [SDK …] <title> (<spec rows>)`.

**Seams.** Real: each SDK's Cordis and plugin loader; C-EXT `createContributions`; C-UI-BACKEND
`createUiBackend` (its routes, stream, latch and notice); embed-UI's host half loaded as a loader
row by file URL (so C-EXT traces the namespace to its package); embed-UI's browser chunks run in a
`node:vm` page, applied by the SDK's Cordis. Fake: K3 `dshConnectorHandover` (the C-UI-BACKEND
suite's `FakeHandover`), K3 `dshInstanceChild`, `appReady`, DSH's `connection.fetch` (an in-process
route table the page's `fetch` and `EventSource` are answered from), and the client services
`slots`, `locale`, `configForms`, `pluginNavigation`, `layout`. React is the hook shim of
test/support/rp-recommend.mjs (no React is installed). No child DSH, no DSH home, no network.

**Actors.** The *owner* (the user at the main DSH page); an *agent* (any principal calling the
contributed tools through C-EXT); *embed-UI* (`dsh-connector-ui`, host half and browser half); the
*connector* (C-EXT and C-UI-BACKEND); the *instance* (`dshInstanceChild`).

## Use cases

### UDRAW-UC-01 Open the window onto the hosted child (R-UI-02, Q-G3, #77, R-UI-03 amended, §13.6; UIM-UC-01)
- Pre: C (UI backend + tools) + I (child ready) + U; the page is at a loopback host.
- Main: the sidebar has the `fishball` entry; mounting the `fishball` main view shows
  `section[data-fishball-embed]` with `[data-fishball-embed-state=ready]` and an iframe whose `src`
  is exactly the one-time `url` the admit route returned; mounting POSTs `opened` once.
- A1: the page host is not loopback → `[data-fishball-hostname-refused]` with "Open DSH at 127.0.0.1
  to use Fishball", no iframe.
- A2: the child is not ready → its state (and code) tag, a "Retry" link that calls
  `pluginNavigation.openBundle('dsh-instance')`; no iframe, no hint, no `[data-fishball-frame-retry]`.
- E1: no usable instance → the hint (UC-08).
- Post: no Retry route exists (`/api/dsh-connector-ui/child/retry` is not registered); the
  locator's `retry` is never called by embed-UI.

### UDRAW-UC-02 Hand over an unmanaged session (R-UI-10, R-UI-05, Q-G5, R-NAME-05/08; HAND-UC-01)
- Pre: C + U; one or more enabled, paired principals.
- Main (one target): the session header shows `[data-fishball-hand-over][data-fishball-target=<key>]`
  "Hand over to <name>" with a light; pressing it opens the note dialog; the owner types a note and
  confirms → POST `handOver {sessionId, principalKey, note}` → the hand-over service gets exactly
  those; the stream's next snapshot marks the session: the row shows "Managed by <name>", the header
  Take back.
- A1 (many targets): "Handover to…" opens a menu, one item per target (id = key); picking one opens
  the dialog; confirming hands over to that key.
- A2: the session row's "..." menu offers one item per target with the same label.
- E1: the backend refuses (`unknown-session`, `conflict`, `no-agent`, `operation-failed`) →
  `[role=alert][data-fishball-refusal=<code>]`; the session stays unmanaged.
- E2: no target → no Hand over control, in the header and in the row menu.
- UI-FIX-D (2026-11-18): "the session header" is DSH's two header seats. Hand over / Handover to… /
  Take back sit in the right-aligned `conversation.session.header.utilities` (to the left of DSH's
  own utilities); "Managed by <principal>" stays title-adjacent in `conversation.session.header.actions`.
  The rows mount both seats as one header; behaviour, hooks and routes are unchanged. Their real
  layout (no overlap with DSH's buttons at 320–1440 px) is test/v3/dsh-connector-ui/layout.

### UDRAW-UC-03 Take back a managed session (R-UI-05, R-UI-10; HAND-UC-02)
- Main: a managed session shows `[data-fishball-managed-by]` with the principal label and
  `[data-fishball-take-back]` "Take back"; one click POSTs `takeBack {sessionId}`; the mark goes and
  the Hand over control comes back, live.
- A1: the row menu offers Take back for a managed session.
- E1: refusal (`unknown-session`, `not-managed`, `operation-failed`) → alert with that code.

### UDRAW-UC-04 An agent notifies the owner (R-FN-01)
- Main: an agent calls `<alias>.notify {message}` → the overlay shows `[data-fishball-notice]` with the
  message as plain text and `[data-fishball-notice-count]` = 1; the fish is lit.
- A1: important → `[data-fishball-notice-important=true]` and the fish's important flag.
- A2: a newer notice → the text is replaced; the count is 2.
- A3: clicking the bubble POSTs `dismiss` → the bubble goes.
- A4: opening the window → the bubble goes.

### UDRAW-UC-05 The attention light (§13.6, R-UI-04; EXT-UC-04)
- Main: `<alias>.attention.signal {important: false}` → `[data-fishball-fish-light=on]`;
  `{important: true}` → also `[data-fishball-fish-important=true]`; opening the window → off.

### UDRAW-UC-06 The contribution (R-EXT-13 amended, R-FN-01, §13.6; EXT-UC-04)
- Main: with `dshConnectorUi` and `dshConnectorTools`, `tools/list` holds `<alias>.notify`,
  `<alias>.attention.signal`, `<alias>.attention.state`, `<alias>` = K2's alias of `dsh-connector-ui`.
- A1: embed-UI disabled → the three leave `tools/list`; latch and notice reset; enabled → back.
- E1: no `dshConnectorTools`, or no `dshConnectorUi` → the tools are absent.

### UDRAW-UC-07 Embed-UI without a local connector (Q-U1, R-UI-09 amended, R-ARCH-04)
- Main: neither `dshConnectorUi` (apiVersion 1) nor the V2 `dshConnector` → once the app is ready
  one `logger.error` line containing `connector-missing` and no `instance-missing`; GET services
  answers `{ok: true, connector: false, ui: {}}`; every other route answers 503
  `{ok: false, code: 'connector-missing'}`; the browser half registers nothing.
- A1 (correction 2026-11-16): only the V2 `dshConnector` → `legacy: true`, no `connector-missing`,
  no tools.

### UDRAW-UC-08 Connector without an instance (R-UI-01, R-UI-08 amended, QD4, Q-G3)
- Main: one `logger.warn` line containing `instance-missing`; the fish, the marks, Hand over, the
  prompt and the main view with the hint "No Fishball child instance is running here. Open your
  Fishball instance's own page." (no iframe, no state tag); the tools are contributed.

## Equivalence partitions

| Id | Rows |
| --- | --- |
| UDRAW-EP-01 availability (host) | 1 ui+tools+child v1; 2 ui+tools, no child; 3 ui+tools, child apiVersion 2; 4 ui+tools, child row disabled; 5 nothing; 6 child only; 7 tools + child, no ui; 8 ui apiVersion 2 + tools + child; 9 ui + child, no tools; 10 V2 `dshConnector` + child (legacy). Each row: services `{connector, page, legacy}`, the error / warn lines, the tools |
| UDRAW-EP-02 availability (browser) | 1 full → fish, main, overlay, marks seats; 2 no instance → the same seats, the main view is the hint; 3 no connector → nothing registered; 4 child only → nothing; 5 services read fails → nothing; 6 legacy → no marks seats (tested as UDRAW-UC-07 A1) |
| UDRAW-EP-03 child not ready | stopped, failed + `NATIVE_CHILD_EXITED`, starting, waiting, stopping, disabled + `NATIVE_DISABLED` → state tag (+ code tag), Retry link, no iframe, no hint |
| UDRAW-EP-04 refusal codes | handOver: `unknown-session`, `conflict`, `no-agent`, `operation-failed`; takeBack: `unknown-session`, `not-managed`, `operation-failed` → alert with that code |
| UDRAW-EP-05 principal labels (HAND-EP-02 rows 2, 2a, 3, 3a, 6, 8, 9) | 1 named online → "Hand over to Navigator", green, "online"; 2 named offline → red, "offline"; 3 nameless → "Hand over to ID: agent-x", `ID:` in `<strong>`; 4 named "ID: agent-y" → plain, no `<strong>`; 5 markup name → literal text, no element; 6 no principal named Fishball → no "Hand over to Fishball"; 7 a principal named Fishball → "Hand over to Fishball"; marks: "Managed by <name>" / "Managed by ID: <id>" |
| UDRAW-EP-06 page host | 1 `localhost` → frame; 2 tunnel name → refused text, no admit url |
| UDRAW-EP-07 withdrawn surfaces | 1 no `client.records.js`; 2 no `tool.call.toolview` / `conversation.chat.node` registration; 3 no Retry route (tested as UDRAW-UC-01 post); 4 no `[data-fishball-frame-retry]`; 5 locale namespace `fishball` in en and zh |

## Boundary values

| Id | Values |
| --- | --- |
| UDRAW-BVA-01 target count (HAND-EP-02 rows 1, 2, 4, 5) | 0 → no control; 1 → one button; 2 → dropdown of 2 in order; 3 → dropdown of 3 in `targets` order |
| UDRAW-BVA-02 notice count | 1 after the first notice; 2 after the second; none after the click; 1 again after the next |
| UDRAW-BVA-03 diagnostics | before `appReady` fires → 0 lines; after → exactly 1; without `appReady` → exactly 1 at once; a second activation of the row → at most one more |
| UDRAW-BVA-04 note | empty note → the service gets `''` or no note; a typed note → exactly that text |
| UDRAW-BVA-05 `opened` per mount | 1 after a mount; still 1 after re-renders; 2 after unmount + mount |

## Decision tables

**UDRAW-DT-01 the fish** (snapshot `light` → fish attributes)

| Rule | cause | light.on | light.important | `data-fishball-fish-light` | `data-fishball-fish-important` |
| --- | --- | --- | --- | --- | --- |
| 1 | nothing | false | false | off | absent |
| 2 | signal(false) | true | false | on | absent |
| 3 | signal(true) | true | true | on | true |
| 4 | notify | true | false | on | absent |
| 5 | notify(important) | true | true | on | true |

**UDRAW-DT-02 the main view** (page, child, page host → drawn)

| Rule | page | child | host | drawn |
| --- | --- | --- | --- | --- |
| 1 | false | – | loopback | hint, no iframe, no state tag |
| 2 | true | not ready | loopback | state tag, Retry link, no iframe, no hint |
| 3 | true | ready | loopback | iframe = admit url, no hint, no link |
| 4 | true | ready | not loopback | refused text, no iframe |

**UDRAW-DT-03 the session controls** (managed?, targets → header, row menu)

| Rule | managed | targets | header | row menu |
| --- | --- | --- | --- | --- |
| 1 | no | 0 | nothing | no Fishball item |
| 2 | no | 1 | one Hand over button | one Hand over item |
| 3 | no | 2 | "Handover to…" dropdown | two Hand over items |
| 4 | yes | any | managed-by + Take back | Take back item |

## State transitions

**UDRAW-ST-01 one session's control** (#1 is tested as UDRAW-UC-02 main, #2 as UDRAW-UC-03 main) — #1 Unmanaged –Hand over (confirm)→ Managed(P): mark, Take
back; #2 Managed(P) –Take back→ Unmanaged: Hand over back; #3 Unmanaged –another tab hands over
(backend change)→ Managed, no reload; #4 Hand over dialog –cancel / never confirmed→ no POST.

**UDRAW-ST-02 a target's light (HAND-ST-02 #1, 2, 3, 5, 8)** — #1 not listed –paired→ listed, red;
#2 offline –listens→ green; #3 online –disconnects→ red, row stays; #4 listed –disabled→ removed;
#5 listed –renamed→ new label; all without a reload.

**UDRAW-ST-03 the prompt** — #1 None –notify→ Shown(1); #2 Shown(1) –notify→ Shown(2), new text;
#3 Shown –click→ None (POST dismiss); #4 None –notify→ Shown(1); #5 Shown –window opened→ None.

**UDRAW-ST-04 the contribution** (#1–#3 are tested as UDRAW-UC-06 main and A1) — #1 loaded → three tools; #2 embed-UI disabled → none, latch and
notice reset; #3 re-enabled → three; #4 the connector row disabled → none; #5 the connector row
loaded after embed-UI → three.

**UDRAW-ST-05 the window follows the child** — #1 failed (state tag, link) –child becomes ready→
iframe, no reload (UIM-UC-01 E1, amended by #77: the retry itself is on the instance's page).

## UI-POLISH-D (polish-cases.mjs)

Written from the UI-POLISH-D requirements relayed 2026-11-18 (and the developer's notes of that day:
the window's fish glyphs are decorative and carry no `data-fishball-mark`; the bubble sits level
with the fish's top). One test per row; ids `UIPD-DRAW-*`.

| Id | Technique | Rows |
|---|---|---|
| UIPD-DRAW-HINT | EP (language) | en / zh: no instance → lead `noInstanceTitle` ("Fishball isn't running here" / "Fishball 不在这里运行") above the unchanged hint `[data-fishball-no-instance]`; a decorative fish glyph; no `data-fishball-mark` in the window; not the warning icon |
| UIPD-DRAW-NOTREADY | EP (K3 not-ready state × language) | disabled, waiting, starting, stopping, stopped, failed × en / zh → lead "Fishball isn't ready (<state words>)." / "Fishball 尚未就绪（<state words>）。" above "State <code>state</code>" (and "Code <code>code</code>" when there is one); the state tag holds a StateDot before its words |
| UIPD-DRAW-CHROME | UC | the ready window's header: a decorative fish before "Fishball"; the ready tag's StateDot; Refresh keeps its word and has a refresh icon |
| UIPD-DRAW-PLACE | ST / EP | fish visible → `data-fishball-notice-place=mark`, left = fish right + 8, top = fish top; fish hidden (width 0) → `corner`, left = bottom = 16; visible again → `mark`. No fish on the page → `corner`; the bubble stays a button in a `role=status` region with its hooks and aria-label |

## UDRAW-VIS — host snapshot EventSource lifecycle (visibility-cases.mjs)

| Row | Action and observable result |
|---|---|
| EP: visible / visibility unsupported | Mount the sidebar fish and notice overlay. Both render a live backend notice from one snapshot source. |
| DT: initially hidden | Mount both components in the background: no source. Change the backend, reveal: the notice appears and there is one live source. |
| ST / BVA: one → zero → one | Hide, change the notice, show; repeat with a second notice. Each hide releases the socket; each reveal restores the latest notice and one shared source. A retired source's late message/error cannot replace that state or duplicate the connection. |
| ST: resumed, first snapshot delayed | Start with a notice and a managed session; replace the notice and take back the session while hidden. Before the held replacement frame arrives the old notice and Take back must not be actionable. Release it: new notice and Hand over are available. |
| ST: terminal error, still visible | Let reconnect run without prescribing the retry interval: one replacement stream and a subsequent backend notice delivered live. |
| ST: last unsubscribe → hidden → shown → remount | After a noninitial notice, unmount both consumers. Hidden changes and reveal do not open a source without a subscriber; the remounted overlay receives the latest notice. |
| ST: error → hidden → retry comes due → visible | A transport failure just before hiding does not open another connection while hidden; on reveal the current notice and a single live source return. The retry interval and catch-up mechanism are not prescribed. |

## R-FIX-CUI (cui-cases.mjs)

From the requirements relayed for R-FIX-CUI (2026-11-18; `.runtime/reports/review-x-dsh-connector-ui.md`
UI-01 marks, UI-06, UI-07). The FakeHandover's `parents` map resolves a child to its root as the real K3
service does (C-ROUTE's RFC-UI01 rows test that service); the page's chunk loads can be held and its
animation frames and window events are scripted (world.mjs). The header gets DSH's `useSessions` over
`{byId: {[id]: {id, origin: 'subagent', parentId}}}`.

| Id | Technique | Rows |
|---|---|---|
| RFC-UI01 | DT (header of child / grandchild / root × root managed × useSessions), ST | root managed → the child's and grandchild's headers show "Managed by Navigator" and Take back, no Hand over; Take back there → nothing managed, Hand over back; root unmanaged → Hand over in the child's header manages the root, the header turns to Take back; without useSessions the child's own id is used (Hand over, no "Managed by"); the root's header as before |
| RFC-UI06 | ST | window mounted while client.attention.js is held → no `opened`; the chunk registers → exactly one; rerenders → one; remount → two; a pending notice is cleared once the chunk registers |
| RFC-UI07 | ST, EP | bubble beside the fish; fish hidden (no new notification) → after one animation frame / one window `resize` → corner (16, 16); fish moved → beside it (right + 8, top); hidden → visible → beside again; while shown a resize listener and a queued frame; clicked away or unmounted → no listener, frames stop |
