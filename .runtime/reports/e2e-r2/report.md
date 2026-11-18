# Fishball V3 · Browser E2E round 2

**12 pass · 5 fail · 9 not run** (26 checks in the requested subset, not the full 73-case plan). Five failed rows represent two observed behaviors; a separate host Plugins loading failure blocked the rename. No release sign-off: no real permission decision was reached.

Tested 2026-11-19 NZDT on `http://127.0.0.1:7713`, profile `fishball`, DSH `0.2.2-rc.1` (shown in General settings), Fishball `1.0.0-alpha.1` (shown in core detail; supplied build `e1324391`). Started the specified signed-in normal browser instance and used only new owned tabs. Session stop was acknowledged after an initial timeout; no sessions remained listed. No product edits, installation, uninstall, or restart. The disposable target was removed; the parent was preserved. The worker was left idle as test evidence; its harmless temp marker was not cleaned up. English/dark was restored visually in the host after the display checks. The initial theme preference mode (Dark versus System) was not recorded.

Round 1b baseline: [report](../e2e-r1/report.md). “Not run” means the decisive assertion was not reached, even if a prerequisite was attempted. Evidence references are screenshot rows unless marked **UI tree**.

## Use-case results

| ID | Case | Result | What happened | Evidence |
|---|---|---|---|---|
| R2-01 | Hosted link and parent target | Pass | Existing parent showed `Connected`; its core settings identified it as the instance-supplied, read-only URL. | E2-08, E2-10; UI tree |
| R2-02 | Fresh pairing and inline detail | Not run | Parent already paired; no authorized second pairing fixture, and the existing pairing was left intact. | E2-08; UI tree |
| R2-03 | Start one managed worker from Fishball | Pass | One `R2 Browser Worker` appeared with `Managed by Fishball` / `Take back`; its first task showed `hello` and `R2-HELLO`, which Fishball also reported. Placement checked separately. | E2-01, E2-04; UI tree |
| R2-04 | Honor the requested Default workspace | Fail | Worker appeared under `Ungrouped`, not `Default workspace`; Fishball reported falling back to a folder after failed name resolution. | E2-16–17; UI tree |
| R2-05 | Message the worker and see the reply | Pass | A separate Fishball message produced a second `Task message received` and `R2-SECOND` in the worker; Fishball reported that same reply. A controlled recent-list ordering comparison was not done. | E2-02; UI tree |
| R2-06 | Redirect a running worker | Pass | The running `sleep 100` turn became `Stopped`, then the replacement turn completed with `R2-REDIRECT`. | E2-07; UI tree |
| R2-07 | Stop the worker without replacing its task | Pass | A separate `sleep 120` turn ended `Stopped`, with no worker `R2-STOP-LATE` response and no replacement turn. | E2-12–13; UI tree |
| R2-08 | Take back and hand over | Pass | `Take back` removed the managed mark and restored the online handover action. Confirming with `R2 handover check. Do not perform any work unless requested.` restored the managed mark live; Fishball quoted the note. Access denial after take-back was not independently exercised. | E2-03–04; UI tree |
| R2-09 | Connector setting saves and renames live | Not run | Host Plugins never got past `Reading plugins…` in two owned tabs; the connector name field was not reached. The existing RENAME-ERR retest is inconclusive. | E2-09, E2-14; UI tree |
| R2-10 | Add and confirm removal of a disposable target | Pass | Added an unpaired loopback alias (`localhost`); verified `Remove Name unavailable?`, confirmed only that row, and returned to one connected parent without reloading. | E2-10–11; UI tree |
| R2-11 | Resolve duplicate advertised names | Not run | The unpaired alias advertised no name; it was not a second connected DSH. | E2-11; UI tree |
| R2-12 | 1440 en/dark | Pass | `DSH targets` appeared in the child sidebar; the dark row showed a green `Connected` badge. | E2-08; UI tree |
| R2-13 | 1440 en/light | Pass | Same target in the child sidebar, with light surface and legible `Connected` badge. | E2-15; UI tree |
| R2-14 | 1440 zh/light | Fail | The translated host drew normally; its Fishball pane stayed at `检查中` instead of showing the child target list. | E2-16 |
| R2-15 | 1440 zh/dark | Fail | The dark theme applied to the host; the Fishball pane remained at `检查中`, with no child target list. | E2-17 |
| R2-16 | 390 en/dark | Pass | Loaded chat had a working native `Open sidebar` → `Navigation` drawer with Fishball entry; no bottom navigation, as designed. | E2-12; UI tree |
| R2-17 | 390 en/light | Not run | 390 en/dark and 1440 en/light were observed before the pane stalled; no loaded 390 en/light chat was verified. | — |
| R2-18 | 390 zh/dark | Fail | The native drawer opened; the Fishball pane behind it remained at `检查中`. The drawer itself is not the defect. | E2-18; UI tree |
| R2-19 | 390 zh/light | Fail | The localized light drawer rendered; closing it still left `检查中` rather than loaded Fishball chat. | E2-19; UI tree |
| R2-20 | Allow once on a real Fishball permission card | Not run | `touch /tmp/fb-e2e-2` completed under Workspace Write without a prompt; no sourced card or Allow once action to test. | UI tree only |
| R2-21 | Reject a fresh permission request with reason | Not run | Same fixture blocker; no real pending request to reject. | UI tree only |
| R2-22 | Scoped grant, matching repeat, revoke | Not run | No real request to grant; no grant made, repeated, or revoked. | UI tree only |
| R2-23 | Bare DSH name on the OAuth approval page | Not run | No authorized new OAuth link fixture; the live sidebar's MCP name would not prove approval-page copy. | — |
| R2-24 | Answer a native ask card | Pass | Worker waited on `R2: red or blue?`; selecting `Blue` and clicking `Submit` closed the card and recorded `R2 choice: Blue`. Fishball also reported Blue. No late-answer race tested. | E2-05; UI tree |
| R2-25 | One-shot reminder fires | Pass | `R2 fire check`, set for 30 seconds, yielded a separate `Automation task` at `03:02` containing `R2-FIRED` with no new user message for that turn. | E2-06; UI tree |
| R2-26 | Stop drops a claimed reminder | Not run | No due-but-held manager reminder turn was prepared and stopped before the frame became unavailable. Worker Stop is not reminder Stop. | E2-06, E2-13 (distinct events) |

### Test design and boundaries

1. **Use cases first:** follow the signed-in hosted path through a fresh worker, then the ownership, target, display, approval, ask and reminder flows. [DESIGN §26](../../../DESIGN.md#L2248-L2252) keeps the worker's native question on the worker; it need not appear as a second actionable Fishball card. The source-labeled Fishball permission card remained untested.
2. **Equivalence partitions:** connected parent versus unpaired alias; English versus Chinese; light versus dark; native question versus real permission offer; auto-permitted operation versus one that asks. The temp-area command only exercised the auto-permitted class.
3. **Boundaries:** exact viewport samples 1440×900 and 390×844 CSS px; target count 1 → 2 → 1; only the latter exercised both sides of a discrete count boundary. The precise drawer switch at 768 and recurring reminder minimum at 60 s were not bracketed. [DESIGN §24](../../../DESIGN.md#L2210-L2211) is the rc.1 drawer oracle.
4. **Decision tables:** the eight locale × theme × width cells are listed above. Permission outcomes for a real pending offer are Allow once → run and ask again on a fresh identical call; Reject → no execution and reason returned; exact scoped Grant → matching repeat proceeds until revoke/expiry. None of those three was exercised; an auto-permitted call is not an approval.
5. **State transitions:** worker running → interrupted → replacement complete, and separately running → stopped; managed → unmanaged → managed; alias absent → present → confirmation → absent; native question pending → Blue → complete; reminder scheduled → automation delivered. Reminder cleanup/listing and Stop-drop transition were not verified.

## Defects grouped by affected behavior

### P1 · Hosted frame stops loading after a live language change (R2-14, -15, -18, -19)

1. In a signed-in test tab, open Fishball on the host and verify English chat and the connected target list at 1440. Switch the host Appearance to Light; verify the child target list is still visible (E2-15).
2. Without reloading the page, open host Account menu → Settings → General → Language → `中文` and close Settings.
3. **Actual:** host shows `Fishball` / `运行中` but the pane shows only the centered `检查中` spinner, with `刷新` disabled and no child frame in the UI tree (E2-16). Switching to dark or 390 did not recover it (E2-17–19). Switching back to English and selecting Fishball from the drawer still left `Fishball running` / `checking` with disabled `Refresh`. No self-recovery observed before cleanup; the last read was several minutes after the initial switch. A separate fresh host tab also timed out at DOM readiness late in the run; infrastructure involvement is not ruled out.
4. **Expected:** language changes should reopen the child in the requested locale and return to usable chat/target list; if opening fails, show an actionable error rather than leave Refresh disabled indefinitely. **Likely starting point:** [connector UI `useAdmission` and `makeChildView`](../../../packages/dsh-connector-ui/src/client/client.shell.js#L760-L833). No trace or claim that Chinese itself is the root cause.

**Reported authentication text:** Not reproduced in these tabs. The first Fishball open showed normal chat and stayed usable through worker, reminder and target actions. The later failure followed an in-app locale change, not a restart, and showed `检查中` / `checking` only, not `dsh web authentication required; reopen the URL printed by dsh web.` No authentication workaround was attempted.

### P1 · Host plugin list never becomes usable (blocks R2-09)

1. On the signed-in host, while Fishball already works in another test tab, open a new owned tab at :7713 and click host `Plugins`. Later, from the separate worker tab, click host `Plugins` again.
2. **Actual:** both showed `Reading plugins…`, with `Add plugin` and `Refresh` disabled. No installed list, settings link, or error appeared in repeated observations. The first tab was still in that state minutes later; one browser reload of that tab timed out, and BrowserSkill then refused reads because an earlier Chrome read was pending. The second tab independently showed the same loader while the already-open child still rendered core settings. No authentication prompt was observed.
3. **Expected:** installed packages load, or the view shows an actionable error/retry. The connector could not be renamed in this run. **Likely starting point:** upstream DSH `dsh-client-ui-plugin-manager` plugin-list loading and `dsh-plugin-manager` service; the exact source file and whether this shares a cause with the later frame spinner are unverified.

### P2 · Fishball creates the worker outside the requested workspace (R2-04)

1. In Fishball's chat ask: `Start exactly one new worker session titled R2 Browser Worker in the Default workspace. Manage it.` Add the harmless `echo hello` task.
2. **Actual:** task ran, but the worker row appeared in `Ungrouped`, while `Default workspace` was visible separately (E2-16–17 show the same placement in Chinese). Fishball said `default` and `Default` were rejected as folder arguments and it used a fallback folder.
3. **Expected:** resolve the named workspace and start there, or ask for clarification before creating outside the requested workspace. **Likely starting point:** the [connector `session_start` tool description](../../../packages/dsh-connector/mcp-schema/tools.js#L43-L48) and [folder resolver](../../../packages/dsh-connector/src/domain/folder.js#L1-L33), which accepts an ID or absolute path; inspect manager workspace resolution before attributing the fallback to the connector. One model run, not a reproducibility claim for all providers.

**Known cases:** RENAME-ERR (P2 save-error despite live rename) is neither reconfirmed nor cleared. The 390px native drawer/no bottom bar, missing Fishball logo button, and accepted KI-1 guards component path are not new defects.

## In-session screenshot index

Images remain session attachments only. Digests below identify successful captures; no images are exported or committed. Crops do not establish text outside their bounds. Local device name is omitted from this report; the UI showed it truncated in the 260 px crops.

| Shot | Step | Exact safe text, state, and layout | Judgment |
|---|---|---|---|
| E2-01 `304e069a` | Worker first turn | `Completed in 2s`, compact status row on dark background | Pass for completion; output separately in UI tree |
| E2-02 `74dd7dc2` | Worker second turn | `Completed in 1s` in a dark status row | Pass for completion; marker separately in UI tree |
| E2-03 `1177b220` | After Take back | `Hand over to Fishball` with green dot in header control | Pass: online handover becomes available |
| E2-04 `0972936b` | After confirming handover | `Take back` in dark header control | Pass: managed action restored |
| E2-05 `1d3c29ce` | Native ask before answering | `2` and `Blue` on dark option row | Pass for available option; submission separately observed |
| E2-06 `2a681e4f` | Fired one-shot | `Automation task` / `03:02` in its own rounded dark turn header | Pass with `R2-FIRED` in UI tree below it |
| E2-07 `2818b189` | Interrupted worker turn | `Stopped` in dark status row before replacement | Pass with replacement marker in UI tree |
| E2-08 `76f63ccc` | 1440 en/dark parent | Green dot and `Connected` badge alongside truncated parent name on dark sidebar row | Pass for connected parent and row style |
| E2-09 `1d746ccb` | Host Plugins first attempt | Small circular About glyph only, no legible text | Inconclusive crop; loading state from UI tree |
| E2-10 `c5d8ebb7` | Core model settings | Dark native selector reading `ollama / deepseek-v4.1-flash:1017` | Pass for B5 with catalog options in UI tree |
| E2-11 `f1889ed0` | Confirm disposable alias removal | `Remove` on a light confirmation button | Pass with dialog identity and postcondition verified in UI tree |
| E2-12 `40f9a651` | 390 en/dark, after worker Stop | `Fishball`, `running`, `Refresh`, `Chat`, `Trajectory`; top drawer opener, chat with `R2-STOP-LATE` mentioned as absent, composer and usage strip at bottom | Pass for mobile layout; worker Stop verified separately |
| E2-13 `2459ca7c` | Separate worker Stop turn | `Stopped` in dark status row | Pass: separate terminal turn, not the redirect |
| E2-14 `f2fe3350` | Host Plugins second tab | Dimmed `Refresh` control in dark header crop | Fail with surrounding `Reading plugins…` in UI tree |
| E2-15 `fde3fd0d` | 1440 en/light parent | Green dot and `Connected` badge alongside truncated name on light sidebar row | Pass for English/light row |
| E2-16 `26d4ee96` | 1440 zh/light after language change | `Fishball`, green `运行中`, disabled `刷新`, centered `检查中` on light empty pane; `R2 Browser Worker` below `未分组` on left | Fail: child missing; also shows worker placement |
| E2-17 `912fd829` | 1440 zh/dark | Same `运行中` / `检查中` and disabled `刷新` on dark pane with host sidebar | Fail: theme applied, child still missing |
| E2-18 `4087268e` | 390 zh/dark | Top drawer opener, `Fishball` / `运行中`, dim `刷新`, centered `检查中`; no chat/composer | Fail for child content, not for drawer design |
| E2-19 `d5b79bdf` | 390 zh/light, drawer open | Native light drawer with `新会话`, `Fishball`, `插件`, `自动化任务`, `更多`; dimmed pane behind it | Drawer pass; full cell fails because pane still showed `检查中` on closing (UI tree) |

## B1–B8 regression disposition (not added to totals)

| Bug | Round 2 result |
|---|---|
| B1 · hosted child lacks target/session tools | **Pass on the existing hosted path.** Connected parent plus actual start, message, redirect and stop. Fresh install/first pair not exercised. |
| B2 · pnpm store conflict | **Not run.** Install-only; the prior install report covers the separate-store helper. |
| B3 · stale tool/publication wording | **Not run in browser.** No registry check; round 1b had checked the repacked release text. |
| B4 · stale/internal package text | **Partial.** Installed fishball-core detail displayed `v1.0.0-alpha.1` and current README copy with no stale checkout-version qualifier. Host instance/connector UI package text blocked by host Plugins; Board is shelved. |
| B5 · core model catalog unreadable | **Pass.** Core displayed `This DSH's default model` plus its selected model; no catalog error (E2-10 and UI tree). |
| B6 · missing install guidance | **Not run in browser.** Release-documentation issue; no install or documentation walkthrough in this round. |
| B7 · first-open Preview Notice | **Not run.** An established child opened normally before the locale-change failure; that is not a fresh first open. |
| B8 · misleading uninstall diagnostic | **Not run.** Requires an uninstall/diagnostic fixture, prohibited here. |

**Next retest:** use a preconfigured disposable worker that demonstrably asks on a harmless exact command; rerun the three real decisions and the claimed-reminder Stop path. Recheck host Plugins and live locale switching separately, and retest connector rename once its settings can be opened. No restart, re-pair, or new install is implied by this report.
