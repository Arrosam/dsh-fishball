# fishball-ui.connections: the Fishball page's ONE live connection

Requirements R1–R8 (the image-loop fix, relayed by the implementer 2026-11-22; the user's decision of
2026-11-21: every Fishball page data stream on one connection, the count CONSTANT however many panels or
amenities exist). Why: Chrome allows 6 HTTP/1.1 connections per host, shared by every tab of a profile;
each open EventSource holds one; DSH's own fetches queue behind them.

Level: **component** only ([page.mjs](page.mjs)): fishball-ui's real client and parts alone in the scripted
DSH page over the brand suite's scripted shell (../support/brand-shell.mjs), one EventSource stand-in for every
source; readers (brand, sidebar targets, ask dock, a direct `fishballPageStream` subscriber) are mounted and
unmounted as DSH renders them. Entry file: `../connections.test.mjs`.

**Integration rows (not here):** the Task board rows (CONN-TB-01…05) need fishball-taskboard's browser half
beside fishball-ui, and the system rows (CONN-SYS-*: the carrier route read from Node, DSH's real page in
Chromium, sends with every panel) need a booted DSH with fishball-core, fishball-ui and fishball-taskboard
installed. They belong to an integration package.

No product file was read; every value is the requirement's (ui-seam SEAM_PAGE_STREAM) or test data ([constants.mjs](constants.mjs)).

## Decision table CONN-DT-01: readers mounted → EventSources

| brand | sidebar | dock | carriers | other sources |
| --- | --- | --- | --- | --- |
| – | – | – | 0 | none |
| ✓ | – | – | 1 | none |
| – | ✓ | – | 1 | none |
| – | – | ✓ | 1 | none |
| ✓ | ✓ | ✓ | 1 (made once) | none |

"Other sources" = anything but the carrier, in particular the retired `/api/fishball/strip`,
`/api/fishball/asks/events`, `/api/fishball-taskboard/events`.

## Boundary values

| Boundary | Values | Expected | Rows |
| --- | --- | --- | --- |
| amenity topics | 0, 1, 5, 20 | one carrier, never reopened, none on the topics leaving | CONN-BVA-01 |
| readers | first subscribes / last leaves | opens / closes | CONN-ST-01, -02, -04 |

## Equivalence partitions

| Partition | Classes | Rows |
| --- | --- | --- |
| UI language | en / zh (URL `lang`) | CONN-EP-01, CONN-ST-05 |
| wire message for a member | valid {topic, frame} for its topic / not JSON / null / array / no topic / non-string topic / another topic | CONN-EP-02, CONN-EP-03 |
| budget warning (R8) | none | CONN-EP-04 |

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

The page's Reconnect control is the one a mounted reader draws (`[data-fishball-stream-retry]`); with only a
direct service subscriber no control is drawn, so the health rows mount every reader.
