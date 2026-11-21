# fishball-ui.connections: the Fishball page's ONE live connection

Requirements R1–R8 (the image-loop fix, relayed by the implementer 2026-11-22, `.runtime/stream-tests-prompt.md`;
the user's decision of 2026-11-21: every Fishball page data stream on one connection, the count CONSTANT however
many panels or amenities exist). Why: Chrome allows 6 HTTP/1.1 connections per host, shared by every tab of a
profile; each open EventSource holds one; DSH's own fetches (session prompt, history page, upload) queue behind
them. The page used to hold 6, so a send stayed "sending" forever.

Levels:
- **component** ([page.mjs](page.mjs)): fishball-ui's real client and parts, and fishball-taskboard's real browser
  half, in the F-SETTINGS scripted page over the brand suite's scripted shell, one EventSource stand-in for every
  source; readers (brand, sidebar targets, ask dock, Task board tab, a direct `fishballPageStream` subscriber) are
  mounted and unmounted as DSH renders them;
- **system** ([system.mjs](system.mjs), [world-extension.mjs](world-extension.mjs)): the manager world (a real
  standalone DSH) with core, fishball-ui and fishball-taskboard installed as bundles; the carrier route read from
  Node (R3/R4); DSH's real web UI in LITE's headless Chromium, EventSources counted from DevTools
  (`Network.requestWillBeSent` type EventSource, minus `loadingFinished` / `loadingFailed`). Page rows skip
  without Chromium.

No product file was read; every value is the requirement's or DSH's public markup ([constants.mjs](constants.mjs)).

## Use cases

| UC | Flow | Rows |
| --- | --- | --- |
| CONN-UC-01 | The owner opens the Fishball page with every panel and the Task board; amenities add topics; the count stays 2 (DSH's `/plugins/events` + the carrier) | CONN-SYS-DT-01, CONN-SYS-ST-05 |
| CONN-UC-02 | The owner sends a message, then one with an image, with every panel mounted: the model gets it and the composer leaves "sending" within 5 s | CONN-SYS-UC-02, CONN-SYS-UC-03 |
| CONN-UC-03 | An amenity registers a topic on the Host and its frames reach its page part over the carrier | CONN-SYS-UC-01, CONN-SYS-ST-02, CONN-EP-02 |

## Decision table CONN-DT-01: readers mounted → EventSources (component)

| brand | sidebar | dock | board | carriers | other sources |
| --- | --- | --- | --- | --- | --- |
| – | – | – | – | 0 | none |
| ✓ | – | – | – | 1 | none |
| – | ✓ | – | – | 1 | none |
| – | – | ✓ | – | 1 | none |
| – | – | – | ✓ | 1 | none |
| ✓ | ✓ | ✓ | ✓ | 1 (made once) | none |

"Other sources" = anything but the carrier, in particular the retired `/api/fishball/strip`,
`/api/fishball/asks/events`, `/api/fishball-taskboard/events`.

## Decision table CONN-SYS-DT-01: page state → EventSources to the origin (system)

| state | Fishball's | total to the origin |
| --- | --- | --- |
| 0 amenity topics | 1 (the carrier) | 2 |
| 1 topic | 1 | 2 |
| 5 topics | 1 | 2 |
| Task board shown | 1 | 2 |
| after the text and image sends | 1 | 2 |
| Task board hidden (right sidebar collapsed) | 1 | 2 |
| topics withdrawn | 1 | 2 |

Over the whole run the carrier is opened once (CONN-SYS-ST-05).

## Boundary values

| Boundary | Values | Expected | Rows |
| --- | --- | --- | --- |
| amenity topics (component) | 0, 1, 5, 20 | one carrier, never reopened, none on the topics leaving | CONN-BVA-01 |
| amenity topics (system) | 0, 1, 5 | 2 EventSources to the origin | CONN-SYS-DT-01 |
| readers | first subscribes / last leaves | opens / closes | CONN-ST-01, -02, -04 |
| send time | 5000 ms (R7 "a few seconds") | received and composer idle within it | CONN-SYS-UC-02/03 |

## Equivalence partitions

| Partition | Classes | Rows |
| --- | --- | --- |
| UI language | en / zh (URL `lang`, strip frame language) | CONN-EP-01, CONN-ST-05, CONN-SYS-EP-07 |
| wire message for a member | valid {topic, frame} for its topic / not JSON / null / array / no topic / non-string topic / another topic | CONN-EP-02, CONN-EP-03 |
| topic argument | non-empty string / '' / number / null | CONN-SYS-EP-01, -02 |
| provider argument | {frame, onChange} / undefined / null / string / no frame / no onChange / frame not a function | CONN-SYS-EP-01, -03 |
| topic name | new / already registered (fake, asks, strip, fishball-taskboard) | CONN-SYS-EP-04 |
| provider frame() | answers / throws | CONN-SYS-ST-03 |
| Task board frame | a board / null / a string | CONN-TB-01, CONN-TB-04 |
| fishballPageStream | present (rides the carrier) / absent (own `/api/fishball-taskboard/events`) | CONN-TB-01, CONN-TB-05 |
| budget warning (R8) | none, in the component page and the real page | CONN-EP-04, CONN-SYS-EP-08 |

## State transitions

| Row | From | Event | To |
| --- | --- | --- | --- |
| CONN-ST-01 | no reader | readers mount one by one, leave one by one | one carrier throughout (one source), none after the last |
| CONN-ST-02 | carrier closed (last left) | a reader mounts | one new carrier |
| CONN-ST-03 | on the page | `<html data-fishball-page>` removed / back | closed / one carrier |
| CONN-ST-04 | no reader | a service subscriber / it leaves | opens / closes |
| CONN-ST-05 | carrier lang=en (zh) | UI language → zh (en) | old closed, exactly one on the new lang |
| CONN-ST-06 | frame arrived | a member joins late | gets the last frame at once, no new source |
| CONN-ST-07 | member subscribed | unsubscribes | no later frame or health |
| CONN-ST-08 | live | error CONNECTING / CLOSED | every member of every topic: stale / closed; a frame of any topic → live for all |
| CONN-ST-09 | closed | Reconnect | old closed, one fresh carrier, stale until a frame, then live |
| CONN-TB-02 | Task board shown | hidden, frame, shown | carrier kept (not reopened), the frame drawn |
| CONN-SYS-ST-01 | frame A sent | onChange with B / with B again | one message B / none |
| CONN-SYS-ST-02 | carrier open | a topic registered | its frame sent at once |
| CONN-SYS-ST-03 | topic X sends | X's frame() throws | X skipped; other topics continue; a new carrier opens without X |
| CONN-SYS-ST-04 | topic sends | disposed, then changed | nothing more |

## Wire rows (system, R3/R4)

CONN-SYS-UC-01: 200 `text/event-stream`, at open one `{topic, frame}` per registered topic. CONN-SYS-EP-05: the
built-in frames (asks `{managerSessionId: the manager, cards}`; fishball-taskboard = `GET /api/fishball-taskboard/board`;
strip with `on` and `brandStyle`). CONN-SYS-EP-06: `frame(url)` gets the carrier's request URL (path, lang, tz).

## Interpretations (no requirement conflict found)

1. "Within a few seconds" (R7) is asserted as 5 s; before the fix the send never completed (20 s), after it ~1 s.
2. R2's total "to the page origin" counts EventSources only (DSH's `/plugins/events` and the carrier); ordinary
   fetches are not long-lived connections.
3. A send has "reached the model" when a scripted-model request made after Enter carries the typed text.
4. The image send waits until DSH's Send control is enabled after attaching (the upload finished), as a user would.
5. The component page's Reconnect control is the one a mounted reader draws (`[data-fishball-stream-retry]`); with
   only a direct service subscriber no control is drawn, so the health rows mount every reader.
