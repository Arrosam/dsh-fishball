# R-FIX-FUI F3 (stream health) and F9 (ask-card time locale)

Requirement: the R-FIX-FUI brief F3 and F9 (lead, 2026-11-18), with the review additions (Reconnect
reopens every fishball-ui stream; a stream closed and then re-subscribed reads stale). The user asked
(2026-11-18) to keep the strip rows minimal (it is being redesigned) and put the depth in the ask and
pairing cards; the pairing card's own health rows are in `../pairing`.

All rows are component level: every fishball-ui `conversation.input.dock` entry mounted for Fishball's
own conversation in the F-SETTINGS scripted page, over one EventSource stand-in with real
`readyState` (`event-source.mjs`).

| Id | Technique | Expected outcome |
| --- | --- | --- |
| HEALTH-ST-00 | ST | No frame, no error → no notice, no stale mark |
| HEALTH-DT-01 strip stale | DT | `[data-fishball-strip-stale=stale]`, badge = stale word, no cached lines / chip / control, stale notice |
| HEALTH-ST-01 strip closed | ST | `closed` mark and notice, Reconnect; pressing closes the old EventSource and opens a new one |
| HEALTH-ST-02 | ST | Strip stale → valid frame → live again |
| HEALTH-ST-03 | ST | No frame ever + CLOSED → strip card with closed notice and Reconnect |
| HEALTH-DT-01 asks | DT (health × lang) | Notice in the asks dock, cards readable, every choice and the reason box disabled; Reconnect on closed |
| HEALTH-ST-04 | ST | Asks stale → valid frame re-enables |
| HEALTH-EP-01 | EP | Not JSON / null / no cards array / an array do not count as fresh |
| HEALTH-ST-05 | ST | Closed → Reconnect → stale → frame → live |
| HEALTH-ST-06 | ST | Re-baselined (MULTI-3 D): one Reconnect reopens the asks stream, stale until its frame (sidebar + asks: TGT-SB-ST-06) |
| HEALTH-ST-07 | ST | Closed, unmount, remount → stale (not closed) |
| HEALTH-ST-08 | ST | Unmount closes every EventSource |
| TIME-DT-01 en / zh | DT (UI language × runtime default) | The time is `new Date(askedAt).toLocaleString('en' | 'zh-CN')`, never the realm's forced default |

**Re-baselined (MULTI-3 requirement D):** the strip card is withdrawn, so HEALTH-DT-01 strip and
HEALTH-ST-01 / 02 / 03 stay listed as skipped. The sidebar list's health rows are
`../model-dialog` TGT-SB-ST-06. The ask-card fixtures carry MULTI-0's `handle` and `source`.
