# Fishball V3 · E2E round 1, second attempt

**3 pass · 2 fail · 4 not run to completion (9 use cases).** One failure is a product defect; the other is a mismatch between the requested 390px bottom bar and rc.1's documented drawer behavior. The signed-in browser reached the hosted Fishball and controlled a real worker. One P2 defect: the connector reported a failed rename while the connected Fishball already showed the new name. No release sign-off: in particular, this run did not settle a real permission request.

Tested 2026-11-19 (NZDT), on `http://127.0.0.1:7713`, profile `fishball`. Release under test: `1.0.0-alpha.1`, supplied build `e1324391`; connector detail showed `v1.0.0-alpha.1`, child Settings showed DSH `0.2.2-rc.1`. Used new tabs in the signed-in normal browser; closed the test window and its tabs. No product changes, install, uninstall or restart. The case count is for the requested subset, not all 73 plan cases. “Not run” below means an essential assertion was not verified; it does not discard the steps that succeeded.

## Use cases, in requested order

| # | Use case | Result | What the run established; missing assertion if any | Session shots |
|---|---|---|---|---|
| 1 | Open Fishball; check entry and five plugin badges | Pass | The sidebar fish opened `Fishball running` and the `Fishball chat` frame. Installed Plugins showed three distinct host badges and two child badges, with their switches on. | E1-01, 03–05, 14–15 |
| 2 | Pair local DSH; see status and expand target inline | Not run | The hosted parent was **already paired**. Connector showed `Paired as Fishball` and `connected`. Its target expanded in place to `Connected to this DSH.`, `3 contributed tools offered`, `Live name: updates as this DSH renames.`, `Address` and `Fishball settings`. No fresh authorization transition; the existing pairing was not revoked to manufacture one. | E1-02, 06 |
| 3 | Start, message, receive reply, redirect, stop | Pass | Fishball started `R1B Test`. Worker showed `Task message received` → `Completed` / `R1B-READY`; redirect interrupted a running wait and the next turn returned `R1B-REDIRECT`; another running wait ended `Stopped`. Checked worker turns, not just the manager's summary. | E1-07–08, 19 |
| 4 | Allow once, reject, grant; bare DSH name on approval page | Not run | The worker's three harmless `printf R1B-APPROVAL` calls raised no permission prompt under Workspace Write. No decision, grant or source label to inspect. The worker's question about how to proceed was **not** an approval. | E1-09–10 (question only) |
| 5 | Native ask, source DSH on Fishball card, answer | Not run | DSH's question card waited; submitting the recommended answer resumed the worker. Repeated with `R1B: red or blue?`: worker recorded `Chosen option: blue.` Fishball acknowledged the question but directed the tester to the worker card. Did not verify a Fishball-side card labeled with the source DSH. | E1-09–10 |
| 6 | Create reminder, see it fire, Stop drops it | Not run | A 10-second one-shot produced a separate `Automation task` turn, `Completed in 1s`, `R1B-FIRED`. A second, two-minute one-shot was explicitly deleted; the tool returned `deleted: true` and an empty list. Delete-before-due is **not** Stop dropping a due delivery. | No decisive shot; automation turn and tool results observed in the UI |
| 7 | Take back and hand over | Pass | On `R1B Test`, `Managed by Fishball` / `Take back` changed to `Hand over to Fishball` with a green online indicator. Confirming `Hand over` with no note restored the managed banner and `Take back`. | E1-11 |
| 8 | Live rename; confirm target deletion; conditional duplicate name | Fail | The live name changed and reverted without refreshing Fishball, but the connector reported the save failed (P2 below). Removing only the newly added `localhost` alias required confirmation; the original connected parent remained. Duplicate suffix not run: the alias had no discovered identity, so there were not two servers reporting the same name. | E1-13, 17–18 |
| 9 | English/Chinese, light/dark, 1440 sidebar / 390 navigation | Fail (literal bottom-bar criterion) | At 1440×900 the child showed its sidebar in English/dark and Chinese/light. At 390×844 the chat showed a top drawer opener, not a bottom bar. This is the documented rc.1 exception, not a layout defect. Not all eight language × theme × width combinations were verified. | E1-14–16, 20 |

## Defect · connector settings feedback

**P2 · DSH name field reports an unsuccessful save after the rename took effect (case 8).**

1. With the hosted parent connected, open Fishball in one test tab. In another, open Plugins → Fishball connector → its connector settings. Start with the `DSH name` field empty.
2. Enter `R1B-Live`, press Enter, then inspect the already-open Fishball target list without refreshing or reconnecting.
3. The target read **`R1B-Live-DSH` / `Connected`** (E1-17). Back in connector settings the field read **`R1B-Live`** (E1-18) and its adjacent alert read **`The settings were not saved.`** The alert was observed in the UI tree; it is outside the field crop. Clearing the field and blurring restored the original target name live; the alert was no longer present.

Expected: a committed rename and its save indicator agree. The `-DSH` suffix in the **MCP target** is expected; it is not evidence about the bare name on an approval page. User impact: the operator cannot tell whether to retry a change already in effect. Likely investigation point: [connector scalar commit and error handling](../../../packages/dsh-connector/client.js#L517-L575), particularly the Enter and blur paths. No request tracing or causal claim about a duplicate write. Disk persistence across restart was not tested.

## In-session screenshot index

IDs below identify browser attachments from this run, **not image files in Git**. Short attachment digests disambiguate the identically named captures. Text is limited to the relevant controls; local device names are withheld. For sensitive screens the index describes only the safe region. A crop does not prove text or actions outside it.

| Shot | Step | Visible text, state or layout | What the shot establishes |
|---|---|---|---|
| E1-01 `8b592dfd` | Host entry | Fish glyph on host navigation | Entry icon present; not a connection check |
| E1-02 `76f63ccc` | Local target | Green `Connected` indicator | Connected state, not pairing ceremony |
| E1-03 `0bb815df` | Child Plugins | `fishball-core` | Package name legible; compare badge in E1-14 |
| E1-04 `72eb297b` | Child Plugins | `fishball-ui` | Package name legible; compare badge in E1-14 |
| E1-05 `799c5c5a` | Host Installed | `Fishball connector`, `Fishball connector UI`, `Fishball instance`; distinct badges and on switches | Host badge check passes |
| E1-06 `08e25cd3` | Expand local row | `Fishball settings` action in detail | Action visible; inline placement checked in UI tree |
| E1-07 `d1ebfb8f` | Manager turn | `Completed in 1s` header | Completion only; not proof the worker received a message |
| E1-08 `936cffc1` | Stop check | Clipped crop; no reliably legible stop outcome | Inconclusive; see E1-19 and worker transcript |
| E1-09 `f1a56206` | Worker waits | Amber dot, `R1B Test`, `Answer` | Pending question on the host row, not a permission decision |
| E1-10 `dee9d767` | Native question | `Use bash approval flow (Recommended)` option | Native option visible, not evidence of Allow once |
| E1-11 `1177b220` | After take-back | Green indicator, `Hand over to Fishball` | Handover is available; return to managed state checked separately |
| E1-12 `2f18364c` | Core model setting | Dark selector, `ollama / deepseek-v4.1-flash:1017` | Selected catalog entry legible |
| E1-13 `f1889ed0` | Disposable alias removal | `Remove` action in dialog | Confirmation control only; subsequent single-parent list checked live |
| E1-14 `8667482c` | Desktop 1440×900 | English/dark; target sidebar, connected row, both child plugin badges and on switches | Desktop list and badges present |
| E1-15 `b70cccfd` | Desktop 1440×900 | Chinese/light; `DSH 目标`, `已连接`, sidebar and child plugin list | Translated list and theme visible |
| E1-16 `f7fb0c2b` | Mobile 390×844 | Chinese/light Plugins page; sidebar hidden, open control | Plugins only; not a chat-navigation assertion |
| E1-17 `2da91849` | Live rename | `R1B-Live-DSH`, green dot and `Connected` | Changed identity visible in other tab |
| E1-18 `7c4f4946` | Connector after Enter | `R1B-Live` in text field | Field value only; accompanying alert independently observed |
| E1-19 `61f96db5` | Worker transcript | `Stopped` | Worker stopped turn; transcript distinguishes the interrupted and explicitly stopped turns |
| E1-20 `67fc06f7` | Mobile 390×844, actual chat | English/dark; `Fishball`, `running`, `Chat`, `Trajectory`; top sidebar opener, bottom composer and usage strip | Native mobile drawer layout, no separate bottom navigation |

## Earlier B1–B8: what is fixed, and on what evidence?

| Finding | Disposition |
|---|---|
| B1 · hosted parent has no target/session tools | **Verified fixed for the installed hosted path.** Parent is connected and the manager actually started, redirected and stopped its worker. Not a first-pair or cold-start test. |
| B2 · existing pnpm store conflict | **Previously verified, not rerun.** The separate installation record (`install-7713-alpha1.md`, lines 50–60) records the separate-store path; release INSTALL lines 23–32 document it. No install this round. |
| B3 · stale tool/publication wording | **Fixed in release text.** Repacked root README lines 35 and 242–246 remove the stale connector tool/publication claims. Not a registry-state check. |
| B4 · stale package copy | **Fixed for the inspected release copy.** Repacked core README line 10, instance README line 9 and connector UI manifest description line 4; the core detail rendered the current version. Board manifest wording corrected, but Board is excluded and was not an installed-UI test. |
| B5 · core model catalog unreadable | **Verified for the installed catalog.** Core settings exposed a native selector with `This DSH's default model` and the named `ollama` entry selected, not merely a saved text field; no model-read error. No model change was needed. |
| B6 · missing install guidance | **Fixed in release documentation.** Repacked INSTALL lines 9–15 and 97–104 cover preparation, expected warnings and the standalone alternative. Instructions reviewed, not executed. |
| B7 · first-open Preview Notice | **Not verified.** This child already had an established conversation. Normal re-entry does not exercise first open. |
| B8 · misleading uninstall diagnostic | **Fixed in inspected source/docs; runtime not verified.** Repacked instance native-runtime lines 147–159 and 181–189 distinguish an inconclusive process check from a running child; INSTALL lines 137–141 document it. No uninstall or process fault injection. |

The accepted cosmetic KI-1 (component row titled with a resolved path) is not a new defect. No local paths are reproduced here.

## Boundaries and next retest

Use cases drove the run. Equivalence partitions: hosted vs unpaired alias, English vs Chinese, light vs dark. Boundaries: one → two → one target, 390 and 1440 CSS pixels. Decision table: auto-permitted command ≠ allow once, reject or standing grant; native question answer ≠ approval. State transitions: worker running → interrupted/completed/stopped, managed → taken back → managed, and reminder scheduled → fired vs scheduled → explicitly deleted.

For the next run: use an authorized disposable pairing fixture, a harmless operation known to trigger a **real** permission request, and an observable due reminder held for Stop. Confirm the Fishball-side source label before answering. Complete the remaining locale/theme combinations using the [rc.1 drawer exception](../../../DESIGN.md#L2210-L2211) as the mobile oracle. No public-HTTPS CIMD, second real DSH, restart, registry publication, or install/uninstall scenario was run.
