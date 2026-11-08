# Messenger bubble width — independent requirement-driven regression report

Date: 2026-11-04 (Pacific/Auckland). Base requested: delivery/2026-11-04-fixes at 312ff11. Test author loaded general-coding-principle, then actually read [repository instructions](<AGENTS.md>) before investigation. Only tests/support/report files were changed; no commit was made. The implementation author worked independently and received behavior/command/statistics reports, not test source. No in-flight implementation or implementation diff was read.

## Scope and verdict

**Offline contract/integration regression: PASS, 105/105. Browser geometry acceptance: NOT VERIFIED.**

The user reported that the short Chinese message “等等” became a narrow vertical strip. The requirement is natural single-line short CJK/Latin width, bounded wrapping for long text, correct mixed text, and no regressions to pile/disclosure/composer alignment. This report does not convert source strings into simulated pixels or claim a screenshot-level fix.

- [New CSS-contract cases](<test/messenger-bubble.test.mjs>): 7 pass.
- [New public-slot integration cases](<test/messenger-bubble.integration.test.mjs>): 36 pass.
- [Existing avatar/footer layout contracts](<test/messenger-layout.test.mjs>) and [table contracts](<test/messenger-table.test.mjs>): 36 pass combined.
- [Existing pile/disclosure integration](<test/pile-disclosure.integration.test.mjs>): 26 pass, normal and reduced motion inputs.
- Shared [requirement-owned vocabulary/adapter](<test/support/messenger-bubble.mjs>) reuses the existing [Messenger VM loader](<test/support/messenger-style.mjs>) and [client tree traversal](<test/support/dedicated-model-client.mjs>), rather than introducing another framework. The loader gained optional public host services; existing default callers are unchanged.
- Measured [focused run log](<.runtime/messenger-bubble-focused.log#L118-L125>): **105 tests, 6 suites, 105 pass, 0 fail/cancel/skip, 22,876.309458 ms**. Parent executed the approved exact command and reported exit 0; the test author separately read the log.

## Acceptance criteria and observable scope

| AC | Requirement | Offline evidence | Remaining visual acceptance |
|---|---|---|---|
| AC1 | Short CJK and short Latin take natural content width and remain on one line where they fit | C01/C02/C03 prevent the known indefinite outer-row width contract and forced inner width/vertical/no-wrap changes; I01 verifies unchanged content | Actual line boxes/natural width for “等等”, “OK”, “wait now” |
| AC2 | Long text wraps within a reasonable maximum | C02/C03 retain host stack/text maximum and pre-wrap/break-word; I01 includes long CJK, spaced Latin, unbroken Latin | Actual wrapping/scroll overflow at narrow and wide widths and cap boundaries |
| AC3 | Mixed text displays correctly | I01/I03/I04 preserve exact mixed CJK/Latin, emoji, combining mark and newline strings through public host props and output | Font shaping and visual order |
| AC4 | Pile/disclosure and composer alignment stay unchanged; existing grid/flex host calls are not replaced | C05/C06 + I05 guard host flow, cosmetic-only composer styles and registration ownership; existing 26 pile cases preserve transitions/actions | Real composer/pile left/right edge equality; focus/native keyboard/motion visuals |
| AC5 | Only Fishball with the Messenger look enabled is affected | C04/C07 and I02/I05 check scoping, ordinary delegation, style lifetime and existing slots | Ordinary/Fishball visual comparison |

### Public host style contract

The existing rc.3 host user input uses a column flex userRow aligned to flex-end, a column flex userStack aligned to flex-end with min-width 0 and a chat-relative percentage maximum, then a bubble with max-width 100%, pre-wrap and break-word. Fishball adds its own end-aligned column wrapper. The dangerous contract is an indefinite/shrink-to-fit outer row around the percentage-capped child.

C01 accepts a definite user-row inline size, user-row cross-axis stretch, or wrapper cross-axis stretch; it does not require one exact fix declaration. The row/stack flow, inner natural bubble width, maximum and wrapping rules remain separate preservation assertions. These assertions inspect the mounted stylesheet through the public module lifecycle, not implementation-source substrings. They are still **CSS-contract assertions, not a browser cascade/layout engine**.

## Requirement-derived test design

### Equivalence partitions (EP)

| Domain | Partitions and representatives | Oracle |
|---|---|---|
| Short content | CJK “等”/“等等”/“等等我”; Latin “a”/“OK”/“yes”; words “wait now” | No content mutation; no forced inner width or vertical/nonwrapping workaround |
| Long content | Repeated CJK prose; repeated spaced Latin prose; repeated unbroken Latin token | Complete original content and host cap/wrap retained |
| Mixed Unicode | “等等 OK 2分钟”; fish emoji plus combining accent; explicit newline | Exact original host node/text/attachments/hooks forwarded |
| Session | Fishball; ordinary session | Ordinary input is the original stock root, without Messenger wrappers |
| Public input kind | user; steering; context; turn-trigger | Existing registered kinds and delegation behavior retained |
| Neighbor surfaces | User row/stack/text; incoming message; reply/footer/table; composer/pile | No global host override or cross-surface layout ownership changes |

### Boundary Value Analysis (BVA)

- Content-count boundaries: empty, 1, 2, 3 CJK glyphs and 1, 2, 3 Latin characters, covering the reported two-character case and immediate neighbors for user and steering input. Empty is a rendering/delegation boundary, not a new send-validation rule.
- Existing pile counts: 0, 1, 2 and representative 12 under both motion-preference inputs. Twelve is not claimed as a maximum.
- **True geometric boundaries remain unexecuted:** natural text width versus available inner width at −1px / equality / +1px, and long text at the actual computed cap. Character count is not substituted for proportional-font pixel width. No new fixed numeric bubble maximum was invented.

### Decision table

| Rule | Session | Look | Content/target | Required behavior | Cases |
|---|---|---|---|---|---|
| R1 | Fishball | On | Short own user/steering text | Definite outer containing width; natural inner width; content unchanged | C01–C03, I01 |
| R2 | Fishball | On | Long own user/steering text | Same containing contract; maximum/wrapping remain; text complete | C01–C03, I01/I04 |
| R3 | Ordinary | On | Any public input kind | Original stock renderer/props/root; no wrapper leakage | C04, I02 |
| R4 | Either | Off | Messenger stylesheet | None mounted; re-enable mounts one corrected stylesheet | C07 |
| R5 | Fishball | On | Incoming/reply/work/composer/pile | User-row sizing does not replace neighboring renderer/layout ownership | C04–C06, I03/I05; existing layout/table/pile regressions |

### State-transition table

| Start | Event | Next state / invariant | Evidence |
|---|---|---|---|
| Look off | Enable | One stylesheet with corrected outer-row contract | C07 |
| Look on | Disable | No Messenger stylesheet | C07 |
| Look off after disable | Enable again, then disable | Exactly one corrected sheet, then none | C07 |
| Short user text | Render long mixed text, then short Latin | Each new host node/content remains complete; no stale/manual line breaks | I04 |
| Pending open / grants closed | Toggle each group through all four combinations | Independent whole-group visibility; no extra details | Existing PD-I02, both motion inputs |
| Group folded | Snapshot adds/removes/updates | Still folded; current counts/data | Existing PD-I03 |
| List | Open detail, Back/Escape | One detail then previous list/group choices restored | Existing PD-I04 |
| Detail | New request or selected request disappears | Same selected detail, or return to list when removed | Existing PD-I05 |
| Reopened group | Allow/Reject/Revoke | Same operation route and response/snapshot behavior | Existing PD-I06/07 |

There is no requirement-defined invalid bubble transition to invent. Existing pile regressions cover button semantics/composer non-submit and ordinary-session/model-confirmation isolation; native browser activation remains outside this adapter.

## Canonical case/result inventory

| TC No. | TC Name | Details | Techniques Used | AC Covered | Expected Behaviour | Status |
|---|---|---|---|---|---|---|
| MBW-C01 | Definite outer user container | Mounted stylesheet, public nested end-aligned host row/stack | Decision Table R1/R2 | AC1/AC2 | Remove indefinite shrink/percentage containing-width contract | Pass |
| MBW-C02 | Natural inner width and retained maximum | Own text and stack CSS contract | EP | AC1/AC2 | No forced inner/minimum width; host maximum remains | Pass |
| MBW-C03 | Preserve horizontal/wrappable full text | Own/incoming targets and host text wrap values | EP | AC1/AC2/AC3 | No vertical/no-wrap/ellipsis workaround; pre-wrap/break-word remain | Pass |
| MBW-C04 | Scope host-row overrides | Inspect public selector target/scoping atoms | Decision Table R3/R5 | AC4/AC5 | No global user-row/composer sizing override | Pass |
| MBW-C05 | Preserve original host flex flow | Public row/stack fixture combined with mounted declarations | EP | AC4 | Flex column/end alignment and shrinkability preserved; no replacement grid | Pass |
| MBW-C06 | Keep composer/pile ownership | Mounted selector/declaration contracts | Decision Table R5 | AC4 | Cosmetic-only composer style, no pile/disclosure/dock geometry rules | Pass |
| MBW-C07 | Look lifetime | Off→on→off→on→off | State Transition | AC1/AC2/AC5 | One corrected stylesheet while on, none while off | Pass |
| MBW-I01 ×28 | Forward content partitions unchanged | 14 content values × user/steering | BVA/EP | AC1/AC2/AC3 | Same node/attachment/hook identities and exact stock text, own wrapper retained | Pass |
| MBW-I02 ×4 | Ordinary input delegation | Four public kinds in ordinary session | Decision Table R3 | AC5 | Original stock root, no Messenger wrappers | Pass |
| MBW-I03 ×2 | Incoming non-regression | context/trigger with incoming session author and mixed text | EP | AC3/AC4 | Existing author/body/bubble structure and complete stock content | Pass |
| MBW-I04 | Short/long/short rerender | “等等”→long mixed→“OK” | State Transition | AC1/AC2/AC3 | No stale or inserted breaks/truncation | Pass |
| MBW-I05 | Keep public slot registrations | Registered kinds, locale, priority, slot ownership | EP/Decision Table R5 | AC4/AC5 | Existing chat/header slots only, no composer/pile/reply replacement | Pass |
| Existing regression ×62 | Layout/table/pile behavior | 36 stylesheet contracts + 26 pile integration cases | EP/BVA/Decision Table/State Transition | AC4/AC5 | Existing neighboring behavior retained | Pass |

## Exact commands and red/green evidence

Commands were handed to the parent for ask_fishball approval and execution. The test subagent did not execute shell directly. No full/system/server/browser/pack/install command was run for this regression.

### Green: current working-tree Messenger with new and existing focused regressions

~~~sh
cd /Volumes/SSD1/GitHub/dsh-fishball && /opt/homebrew/bin/node --test --test-reporter=spec test/messenger-bubble.test.mjs test/messenger-bubble.integration.test.mjs test/messenger-layout.test.mjs test/messenger-table.test.mjs test/pile-disclosure.integration.test.mjs
~~~

Actual: **105/105 pass**, 6 suites, 0 fail/cancel/skip, **22.876 s**, parent-reported **exit 0**, verified against the [run summary](<.runtime/messenger-bubble-focused.log#L118-L125>). New cases = 43; old layout/table = 36; old pile = 26.

### Red: exact 312ff11 Messenger against the same C01 contract

~~~sh
cd /Volumes/SSD1/GitHub/dsh-fishball && BASELINE=$(mktemp /tmp/fishball-messenger-312ff11.XXXXXX.js) && git show 312ff11:packages/messenger/client.js > "$BASELINE" && FBTEST_MESSENGER_CLIENT="$BASELINE" /opt/homebrew/bin/node --test --test-reporter=spec --test-name-pattern=MBW-C01 test/messenger-bubble.test.mjs
~~~

Parent executed once and reported **1 selected case / 1 expected failure, exit 1**. Failure: `nested end-aligned user row needs a definite containing width or cross-axis stretch before the host percentage stack cap is applied`. This shows C01 distinguishes the 312ff11 contract from the corrected current mounted stylesheet; it does **not** prove the actual old/new pixel widths. No initial-82 script was used.

The macOS mktemp invocation created the literal temporary filename `/tmp/fishball-messenger-312ff11.XXXXXX.js` in this run; it was not repeated or deleted. Use a fresh supported temporary-file template if reproducing later rather than overwriting that artifact.

## Browser-only follow-up (Blocked / Not Run)

Parent confirmed that BSK access to the existing GUI was blocked by authentication and that request-help/borrow attempts had timed out. This subagent did not retry browser access, start a server, install tooling, use another browser backend, read tokens or touch live profiles. The existing Node harness has no layout engine.

1. In an authorized isolated fixture/browser, render the real host DOM/CSS at narrow and wide container widths. Verify “等”/“等等”/“等等我”, “a”/“OK”/“yes” and “wait now” have one text line where they fit and a content-sized inner bubble, not a stretched full-width bubble.
2. Repeat with mixed “等等 OK 2分钟”, emoji/combining text and an intentional newline. Measure line boxes without altering source text.
3. For long CJK, spaced Latin and unbroken token, verify wrapping inside the computed stack/bubble maximum, no clipping or horizontal overflow, and test available-width/cap boundaries at −1px / equality / +1px.
4. Compare Fishball with look off/on and an ordinary session. Attachments/time/actions retain their original layout.
5. Compare pile and composer bounding left/right edges with groups expanded, folded and detail open; verify native keyboard/focus/reduced-motion behavior. Existing offline functionality is green, but this edge-alignment claim remains unverified.

No browser-only check is counted among the 105 automated passes. The honest release conclusion is: **known CSS contract regression detected red and fixed contract green; focused offline functional regressions green; screenshot-level geometric acceptance remains outstanding.**
