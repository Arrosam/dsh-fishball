# Fishball LIVE session-list activity — independent RED test design

Date: 2026-11-09 (Pacific/Auckland). Baseline: `test/list-bump`, main `5eb4c58885222fcae3841bc8c917fa232d77314f`. Test author is independent of the implementation author. No connector implementation read. No commit by test author; parent reviews, runs final checks and commits.

The direct request authorizes writing **and running RED now**; it overrides the webtesting skill's default case-signoff stop. Exactly these five techniques, in this order: **Use Case first, EP, BVA, Decision Table, State Transition**. No Error Guessing or additional technique.

## 1. Use Case FIRST

A connected user has automatic recent-activity ordering, with old target S1 below newer peer S2. Fishball successfully messages S1. The connector emits `ctx.emit('api-session/activity', S1, timestamp)`. The connected list consumes that event, advances S1's cached `updatedAt`, and shows S1 above S2 **without reload**. A durable rewrite and relabeling Fishball as a human are not acceptable substitutes.

**TC-01 is declared and executed first.** Real H-STUB connector delivery and real host-bus observation feed a small explicitly test-owned live-list contract model. The resulting order is a **fixture-modeled UI result, not real browser/UI verification**.

## 2. Numbered acceptance criteria

1. **AC1** Successful connector `session.message`, `session.start` first-message delivery, and `session.redirect` replacement delivery emit `api-session/activity(sessionId, timestamp)` for that target. On the ordinary later-clock scenario this can advance the cached row and automatic activity order live.
2. **AC2** Failed delivery emits no activity. Unknown and archived targets emit none. `session.stop` alone is not a message/start/redirect delivery.
3. **AC3** Fishball delivery keeps the unchanged text and existing `{kind:'agent-message', form:'relay', via:'message'|'redirect', senderSessionId:<attached Fishball session>}` source, using `redirect` for redirect and `message` otherwise. Never relabel as user. Public existing `messaging-outbound` OUT-11 and `rev11h-stop` ORG-01 establish unchanged redirect tool origin.
4. **AC4** Approval provenance remains Fishball for the turn; a human-started session stays human-started and a Fishball-started session stays Fishball-started. Fishball text is not the latest human message.
5. **AC5** Known client acceptance boundary: only timestamp **greater than** cached `updatedAt` advances it; equal/less do not. This criterion does **not** choose the connector's timestamp algorithm under ties/backward clock or promise globally highest time across peers.
6. **AC6** No authoritative session `updatedAt`/projection/cache bump to persist the live event; reload/reconnect/restart may return to persisted DSH ordering. Durable manual workspace session order and pins are unchanged.
7. **AC7** Same focused cases run on safe installed DSH **0.2.1-rc.5** and **0.2.2-rc.1**, no real profile/model/GUI/server/credentials. Parent clarified that the existing disposable H-STUB DSH boot + scripted model is allowed.

## 3. Harness and explicit limits

Reuse existing `test/support/{host,worker,constants,util}.mjs`, `bootStub`, existing start fault probe and approval helpers. Those shared harness files are unmodified. A feature-owned opt-in fixture observes the real host bus and uses public `sessionController.list`, `workspaceRegistry.pinSession`, and `Workspace.insertSessionBefore` APIs. It never emits a synthetic activity, overrides the clock, mutates a projection/cache, or changes a production source.

- Every success test uses normal real time later than the observed cached baseline. No assertion that event time equals `Date.now()`, no requirement for consecutive timestamps, no global peer maximum algorithm.
- BVA uses a deterministic fixture clock and the **exact installed DSH pure `applyMutation` reducer**, bounded-extracted from the installed manager and evaluated in an empty VM context, with unique-declaration, top-level-end, size and activity-branch guards. Parent's complete `SessionManager` import smoke failed due to missing client-only dependency `@deepseek-ai/dsh-client-store`; nothing was installed or changed. This verifies the actual reducer function in isolation, **not complete manager wiring or browser UI**. The tiny automatic-order/reconnect wrapper remains explicitly fixture-modeled.
- Remotes allowlisting and strict-greater reducer are supplied evidence, not new browser/network verification. No actual connected browser, remote event stream, pixels, client sorting component, or HMR verified.
- TC-22 observes authoritative host list `updatedAt` before/after a relay; this is a focused non-mutation invariant, **not byte-identity of every projection cache file**, which legitimately changes for real session events.
- TC-23 observes durable manual order and pin metadata, not browser drag/drop or visual precedence. The live contract model intentionally models automatic order only.
- TC-26 performs a genuine disposable safe-host restart and checks authoritative `updatedAt`; TC-21 models reload/reconnect baseline re-seeding, not real socket reconnection. No persistent recent-activity guarantee is asserted.
- Message/start failures use the existing throwing `agent.steer` boundary. Redirect uses a feature-scoped throwing `agent.followup` on one known target, restored in `finally` and fixture disposal; a reached-call count proves the replacement delivery actually failed. These prove no activity on known unsuccessful delivery, without inventing a half-made start exception-response policy.
- A finite quiet observation cannot rule out arbitrarily late unsolicited events. Here it follows terminal replies, and successes additionally settle the target.
- No `.npmrc`, secrets or credential files read. H-STUB uses temporary test homes and fake model, not the user's live DSH. Test-only public contract import uses source-run link preparation, not dependency installation.

## 4. EP partitions

| Domain | Partition | Representative | Canonical coverage |
| --- | --- | --- | --- |
| delivery operation | message / start / redirect | public contract requests | TC-01/02/03, TC-11–16 |
| target lifecycle | live managed / cold resumable / unknown / archived | fresh per case; absent id `session-fbtest-list-activity-missing` | TC-01/25/07+09/08+10 |
| delivery outcome | delivered / throwing delivery boundary | existing `startProbe({steer:true})` for message/start; scoped followup throw for redirect | TC-01–06 |
| source/provenance | Fishball message vs human origin preserved | exact relay; prior human text `first words` | TC-11–16 |
| durability/order | automatic live / persisted baseline / manual order and pins | two list rows; reversed workspace order; second pinned | TC-01/22/23/26 |

## 5. BVA — three-value boundary

One identified boundary, incoming timestamp vs cached **T = 1700000000100 milliseconds**. 3-value coverage **3/3 values at 1/1 boundary**:

| Case | Fixture clock | Cached after receiving |
| --- | ---: | ---: |
| TC-17 | T−1 = 1700000000099 | 1700000000100 |
| TC-18 | T = 1700000000100 | 1700000000100 |
| TC-19 | T+1 = 1700000000101 | 1700000000101 |

These exercise the **actual installed pure DSH reducer function** through an isolated VM extraction, not a newly invented connector monotonicity policy. The surrounding list-order wrapper is test-owned and not the full UI.

## 6. Rendered Decision Table

Each canonical decision rule has a mapped runtime leaf. R7/R8 expand by both meaningful scoped operations because start creates a new target, not an unknown/archived addressed session. `—` is don't-care.

| Conditions / actions | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Operation | message | start | redirect | message | start | redirect | message or redirect | message or redirect |
| Target known, non-archived | yes | new | yes | yes | new | yes | no | archived |
| Delivery succeeds | yes | yes | yes | no (steer throws) | no (steer throws) | no (followup throws) | — | — |
| Activity emitted for delivered target | yes | yes | yes | no | no | no | no | no |
| Canonical cases | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 | TC-06 | TC-07, TC-09 | TC-08, TC-10 |

## 7. Rendered State Transition table

States are orthogonal: host lifecycle (idle/running/cold/unknown/archived) and connected list cache (baseline/advanced/reseeded). No new product retry or exception machine is invented.

| Current state | Event / guard | Next state / action | Case |
| --- | --- | --- | --- |
| idle managed; old cached row | successful message; later time | receives relay; activity advances live contract row | TC-01 |
| no target | successful start delivery | new managed target receives relay; activity emitted | TC-02 |
| running managed | redirect succeeds | old turn aborted; replacement relay runs; activity | TC-03 |
| cold resumable managed | successful message | resumed; relay runs; activity | TC-25 |
| known target; delivery unperformed | throwing steer (message/start) or followup (redirect) | no delivered message; no activity | TC-04–06 |
| unknown or archived | message/redirect (invalid transition) | refused; no activity | TC-07–10 |
| cached T | incoming less/equal/greater | T / T / T+1 | TC-17–19 |
| cached T | greater → equal → older (key consecutive sequence) | advances once, never regresses (model) | TC-20 |
| connected advanced cache | reload/reconnect from persisted baseline | re-seeded old ordering allowed (model) | TC-21 |
| managed idle | stop (no delivery) | idle; no activity | TC-24 |
| live-only delivery bump | genuine safe-host stop/start | persisted ordering may win; no durable synthetic bump | TC-26 |

## 8. Canonical cases (one row per runtime leaf)

Every test name begins with its canonical TC ID. This table has 26 leaves **per version**, not one row hiding parameterized outcomes. Final statuses below are the **same on both versions**: 22 Pass, 4 Fail; actual failure detail is in §11.

| TC No. | TC Name | Details | Techniques Used | AC Covered | Expected Behaviour | Status |
|---|---|---|---|---|---|---|
| TC-01 | Just-messaged session rises live | Create human-started managed target then newer peer. Seed modeled connected list from actual host rows; message target with `Fishball list activity delivery`; consume actual host activity only. | Use Case, EP, Decision Table (R1), State Transition | AC1, AC3, AC5, AC7 | Actual activity exists and advances target above peer in model without reload. | Fail |
| TC-02 | Start emits activity | `session.start` title `Fishball list activity target`, existing safe folder, first relay message. | Decision Table (R2), State Transition | AC1, AC3, AC7 | Delivered first relay; target activity exists. | Fail |
| TC-03 | Redirect running target emits activity | Hold target's next scripted request, start human turn `independent running turn`, snapshot activity after setup, redirect; release hold. | Decision Table (R3), State Transition | AC1, AC3, AC7 | Old turn aborted; replacement relay delivered; activity exists. | Fail |
| TC-04 | Message failure emits nothing | Cold managed target; arm existing throwing steer probe; `session.message`. | EP, Decision Table (R4), State Transition | AC2, AC7 | Probe reached; failed reply; no delivered message and no activity. | Pass |
| TC-05 | Start failure emits nothing | Arm throwing steer probe; `session.start`. | EP, Decision Table (R5), State Transition | AC2, AC7 | Probe reached; no first message and no activity; no new exception-response rule. | Pass |
| TC-06 | Redirect failure emits nothing | Fresh live managed target; opt-in followup failure for that target; `session.redirect`; restore boundary in finally. | EP, Decision Table (R6), State Transition | AC2, AC7 | Throwing followup reached once; failed reply; no replacement and no activity on any target. | Pass |
| TC-07 | Unknown message emits nothing | `session.message` to absent `session-fbtest-list-activity-missing`. | EP, Decision Table (R7), State Transition | AC2, AC7 | Error, no activity for absent target. | Pass |
| TC-08 | Archived message emits nothing | Fresh managed target, archive through public host operation, message it. | EP, Decision Table (R8), State Transition | AC2, AC7 | Error, no activity. | Pass |
| TC-09 | Unknown redirect emits nothing | Redirect to same absent-id class, independently. | EP, Decision Table (R7), State Transition | AC2, AC7 | Error, no activity. | Pass |
| TC-10 | Archived redirect emits nothing | Fresh managed archived target, redirect. | EP, Decision Table (R8), State Transition | AC2, AC7 | Error, no activity. | Pass |
| TC-11 | Message source unchanged | Message marker `Fishball list activity delivery TC-11`. | EP | AC3, AC7 | One exact text and exact Fishball relay source. | Pass |
| TC-12 | Start source unchanged | Start with marker ending `TC-12`. | EP | AC3, AC7 | One exact first text and exact Fishball relay source. | Pass |
| TC-13 | Redirect source unchanged | Redirect idle managed session with marker ending `TC-13`. | EP | AC3, AC7 | One exact text and exact Fishball relay source. | Pass |
| TC-14 | Message approval provenance unchanged | Human-started target; script delivered marker to call asking tool; inspect real approval notice; escalate for cleanup. | EP | AC4, AC7 | Session started by human; turn Fishball; latest human text still `first words`. | Pass |
| TC-15 | Start approval provenance unchanged | Start whose marker invokes asking tool; inspect notice; escalate. | EP | AC4, AC7 | Session started by Fishball; turn Fishball. | Pass |
| TC-16 | Redirect approval provenance unchanged | Human-started target; redirect marker invokes asking tool; inspect notice; escalate. | EP | AC4, AC7 | Session human; turn Fishball; latest human text unchanged. | Pass |
| TC-17 | Less timestamp ignored (actual reducer) | Deterministic T−1, cached T; exact installed pure reducer in VM. | BVA | AC5, AC7 | Cached T unchanged. | Pass |
| TC-18 | Equal timestamp ignored (actual reducer) | Deterministic T, cached T; exact installed reducer. | BVA | AC5, AC7 | Cached T unchanged. | Pass |
| TC-19 | Greater timestamp advances (actual reducer) | Deterministic T+1, cached T; exact installed reducer. | BVA | AC5, AC7 | Cached T+1. | Pass |
| TC-20 | Advanced cache never regresses (model) | Send T+1 → T+1 → T−1. | State Transition | AC5, AC7 | Modeled cache remains T+1. | Pass |
| TC-21 | Reconnect may restore persisted order (model) | Target 1700000000050, peer T; activity target T+1; new model from original baseline. | State Transition | AC6, AC7 | Connected target first; reseeded peer first; baseline not mutated. | Pass |
| TC-22 | No authoritative updatedAt bump | Read target from actual sessionController.list; successfully relay; reread. | EP | AC6, AC7 | Authoritative updatedAt unchanged. | Pass |
| TC-23 | Accounting order and pins untouched | Start two sessions in same registered safe workspace; order second before first, pin second; assert those preconditions; message first; compare public workspace snapshot. | EP | AC6, AC7 | Durable accounting order and pin/archive sets unchanged, not a visual/manual browser-order check. | Pass |
| TC-24 | Stop alone emits nothing | Fresh managed idle target; snapshot activity; `session.stop`. | State Transition | AC2, AC7 | Stopped response, no message activity. | Pass |
| TC-25 | Cold message emits activity | Seed cold blank managed target using existing harness; confirm no live agent; message. | EP, State Transition | AC1, AC3, AC7 | Resume, unchanged relay, actual target activity exists. | Fail |
| TC-26 | Restart keeps persisted timestamp | Successfully message human-started managed target; safe host restart with same test home; list again. | State Transition | AC6, AC7 | Authoritative timestamp remains pre-relay persisted value. | Pass |

## 9. Technique counts (overlaps explicit)

| Technique | Canonical cases per version | Count |
| --- | --- | ---: |
| Use Case (FIRST) | 01 | 1 |
| EP | 01, 04–16, 22, 23, 25 | 17 |
| BVA | 17–19 | 3 |
| Decision Table | 01–10 (8 rules, R7/R8 each expanded twice) | 10 |
| State Transition | 01–10, 20, 21, 24, 25, 26 | 15 |

26 unique runtime leaves/version; 52 across both versions. Five leaves/version (TC-17–21) exercise the exact installed pure reducer in an isolated VM plus a tiny modeled list/reconnect wrapper; none verifies actual browser UI or full manager wiring. Counts overlap by technique; do not sum them into unique totals.

## 10. Open questions — do not silently lock behavior

- **A/B clock policy:** A) must connector guarantee timestamp > target cached/projected baseline even equal/backward clock; or B) emit delivery clock and accept ties/skew not moving row? **Unresolved, neither enforced nor approved by these tests.** Per-target strictly consecutive timestamps and a global peer maximum are not implied.
- **Unconfirmed flush:** actual steer accepted but delivery durability unconfirmed is neither clear success nor clear failure in this request. No emit/no-emit assertion for that status.
- Event-listener exceptions and recovery policy unspecified; no tests invent them.
- Duplicate/replayed request extra event policy unspecified; no new duplicate-event cardinality assertion.
- Actual browser sorting, remote delivery to connected clients, same-timestamp peer tie-breaks, and multi-client clocks require separate verification after implementation; no claim here.

## 11. Run log and verdict

Expected original RED: TC-01/02/03/25 fail because a successful connector delivery has no activity event (or TC-01 cannot advance). Other 22 leaves/version expected green; setup/import errors are not acceptable RED evidence.

### Commands

Prepare the existing source-contract link (no install):

```sh
/opt/homebrew/bin/node --input-type=module -e "import('./test/support/contract-link.mjs').then(m => m.linkContractForSourceRun())"
```

Run each installed safe-harness version (do not run the global cleanup runner):

```sh
FBTEST_DSH_RUNTIME='/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules' /opt/homebrew/bin/node --test --test-reporter=spec test/session-list-activity.test.mjs
FBTEST_DSH_RUNTIME='/Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules' /opt/homebrew/bin/node --test --test-reporter=spec test/session-list-activity.test.mjs
```

### Actual log (UTC+13 on 2026-11-09)

- First rc.5 author run: 26 executed, 21 pass / 5 fail, exit 1. TC-01/02/03/25 failed exactly at `successful delivery must emit api-session/activity for its target`; TC-06 was a fixture defect (`agents` missing from required inject list), **not valid RED**. Added only that injection, no production changes. First rc.1 parent run independently produced same 21/5 result and setup error.
- Final parent reruns after injection fix and TC-23 peer-before-target precondition strengthening: **both versions 26 executed, 22 Pass / 4 Fail, exit 1; 0 skipped/cancelled**. Author read both complete reviewed logs. rc.5 duration 14.222 s; rc.1 14.514 s. Exactly TC-01/02/03/25 fail at the missing `api-session/activity` assertion after successful unchanged-relay delivery. No import, setup, wrong-source, provenance or fixture failures remain.
- Evidence (ignored local logs): [rc.5 reviewed run](../../.runtime/test-list-bump/activity-rc5-reviewed.log), [rc.1 reviewed run](../../.runtime/test-list-bump/activity-rc1-reviewed.log). They correspond to the run commands above; both show 22/4 at lines 31–38 and the four missing-event assertion details afterward.

| Defect / cases | Actual on both versions | AC affected | Scope / verdict |
| --- | --- | --- | --- |
| TC-01, TC-02, TC-03, TC-25 | Delivery succeeds; no target activity event observed; assertion `successful delivery must emit api-session/activity for its target` fails. | AC1 | Intended requirement RED; automatic modeled order cannot advance without input event. Not a UI screenshot assertion. |
| Remaining 22 leaves | Pass, including failed-delivery/unknown/archived/stop no-event checks, identity/provenance, extracted DSH reducer boundary, host timestamp, accounting order/pins and safe-host restart. | AC2–AC7 within limits | Existing invariants retained; not proof of real remote/browser integration. |
- Existing regression baseline (parent's independent run, not new leaf counts): rc.5 messaging-outbound + approvals-provenance 70/70 pass. rc.1 initial 69/70 with pre-existing running-target turn-end-array race in K1-EP-53; unchanged outbound rerun 37/37, provenance previously 33/33. New cases use independent targets and do not alter that test.

**Verdict:** original feature is **confirmed RED** on both versions, not ready to ship. AC1 is unmet; AC2–AC6 have the focused passing coverage stated above, with the explicit limits in §3 and unchosen policies in §10. This test-only task intentionally does not fix the product; **no product development started**. Parent owns review and final local commit; no production or global-harness changes are part of this delivery.
