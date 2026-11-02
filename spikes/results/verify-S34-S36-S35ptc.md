# Verification of S34, S36 and S35's `run_code` extension

**Overall: PASS**, with the gaps listed at the end. Tested 2026-11-01 by an independent Sonnet session. No real model calls; the main checkout, `~/.dsh` and the DSH profiles were not touched.

## What I ran

All runs used `spikes/run.sh` in this worktree, on rc.2 (harness default) and on rc.3 (`DSH_RUNTIME_ROOT=/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.3/node_modules`).

| Run | Command |
|---|---|
| S34 | `spikes/run.sh spikes/s34-session-control.mjs` |
| S36 main | `spikes/run.sh spikes/s36-question-routing.mjs` |
| S36 restart | `S36_PHASE=restart spikes/run.sh spikes/s36-question-routing.mjs` |
| S35 (with `run_code` part) | `S35_ID=S35-result-wording-<rc2\|rc3> spikes/run.sh spikes/s35-result-wording.mjs` |

My fresh outputs are kept as `verify-S34-rc2/rc3.json`, `verify-S36-rc2/rc3.json`, `verify-S36-restart-rc2/rc3.json` and `verify-S35ptc-rc2/rc3.json`. The committed result JSON was restored with `git checkout` after the runs; only these new files are added.

All 8 runs exited with `pass: true`:
- S34: 12 of 12 checks on both hosts.
- S36 main: 12 of 12 on both hosts.
- S36 restart: 4 of 4 on both hosts.
- S35: 24 of 24 on both hosts (14 direct, 10 `PTC_*`).

I did not trust the check flags alone. I also read the evidence fields behind each claim below.

## Differences from the committed JSON

I compared each new file with the one in `HEAD`, ignoring nothing but looking at every changed field.

- **S34 (rc.2, rc.3):** only timestamps, subagent session ids, and the "time sampled" line of the parked message. No behavioural difference.
- **S36 main and restart (rc.2, rc.3):** only timestamps, session ids, command ids and the temp home path. One numeric difference: `cases.F1.browserClaimedMs` is 60000, not 59999, on rc.2 (a countdown rounding value). No behavioural difference.
- **S35 (rc.2, rc.3):** after dropping timestamps, durations (`ms`), message ids and `raw` strings, there are **0 differences** on both hosts. `raw` differs only by message id.

## S34: claims

| Claim | Result | Evidence (rc.2 and rc.3 identical) |
|---|---|---|
| Tools appear only in the connected session's next request, not in other sessions | PASS | After `connect(A)`: A has all three tools, B, B's registry view and the global view have none |
| Also appear in the next step of a running turn | PASS | `midTurn`: step 1 has none, step 2 of the same turn has all three |
| They disappear on disconnect | PASS | `afterDisconnect.requestTools` is empty |
| A hidden tool returns `UNKNOWN_TOOL` and its body does not run | PASS | B's call and A's post-disconnect call both give `UNKNOWN_TOOL`; the fixture call log holds only the one call from A |
| A re-created agent gets them back through `agent/created` | PASS | `recreated`: `newAgent: true`, tools present after `resume` |
| Stopping Fishball's plugin (owner "plugin") removes them | PASS | `ownership.plugin.afterPluginStop` is empty. Owner "agent" leaks (still present), as the report says |
| `sessionController.cancel` ends a running turn as Stop does; the approval becomes `cancelled` | PASS | `decided: ['cancelled']`, `ABORTED_BEFORE_DISPATCH`, `signalReason: user`, turn end `aborted` |
| A pending question gets `ASK_ABORTED` | PASS | Result `ASK_ABORTED`, projection empty afterwards |
| A followup then starts a new turn | PASS | Turn ends `['aborted','completed']`, answer from the new script; same for redirect |
| A message the user queued stays parked | PASS | `turnsStartedAfterStop: 0`, `inboxNextTurn: ["queued by the user"]` |
| Subagents get no tools by default | PASS | Child of a managed session and of an unmanaged one both saw `[]`; the opt-in fixture saw all three |

The `Q1.altRestrict` path (global tool plus `tools.restrict`) also toggled per session as reported.

## S36: claims

| Claim | Result | Evidence |
|---|---|---|
| For every question kind, Fishball's batch deep-equals the browser's `submitDrafts` batch | PASS | `fishballBatchEqualsBrowserBatch: true` for the five-question batch (single, multi with custom, free text, custom replacing a single choice, skipped); `approveEqualsBrowser` and `rejectEqualsGenericBrowser` true for plan reviews |
| Tool results are byte-identical | PASS | The result text is the same string in cases A (Fishball), B (browser), C (unmanaged) and F1 (timed) |
| First answer wins, both ways | PASS | A: Fishball first, browser card gets `cancel`, gateway pending 0. B and F3: user first, Fishball gets `already-settled`. P3 the same for plan review |
| A stopped turn closes the entry | PASS | E: entry `closed`, Fishball's answer refused, result `ASK_ABORTED`, browser got `cancel` |
| Continued questions are answered through `userQuestions.answer` | PASS | F2 and F4: `path: "reply"`, one `user-question-reply` message, model saw it, projection moves to `settled`, a late browser answer returns `false` |
| Plan review approve | PASS | Result "Plan approved — plan mode exited…", `/plan off` says already inactive |
| Plan review reject with feedback | PASS | Tool error "The user chose to keep planning; their feedback: Add a restart test first.", plan mode stays on |
| Restart table holds | PASS | Legacy question and plan review end; timed open and timed continued survive as `continued`; no waterfall replayed; Fishball answered the recovered call |
| A child agent's question gets `DELEGATED_CALLER` | PASS | Case K: router saw 0 requests, child got "human interaction is unavailable while the calling agent is owned by another live agent…" |
| Bad batches are refused before reaching DSH | PASS | Missing item and two labels on a single-select both refused, question stayed open |

The plan-review panel offering only Approve and Discuss is read from client code in the report; Discuss (P4) was seen to close the entry as `ASK_CANCELLED`.

## S35 `run_code`: claims

| Claim | Result | Evidence |
|---|---|---|
| Inner calls keep their call id in post-execute | PASS | `PTC_same_call_id`: approval request and post-execute both carried `<parent>:ptc:<n>`; `sameId` and `innerId` true; arguments found in `tool/ptc-dispatch-start`; `marksLeft: []` |
| The reject text reaches the program | PASS | The program catches "Fishball rejected this call: deleting files outside the workspace is high risk\nNext time, call ask_fishball…", for both a pre-execute gate and a body ask |
| The waiting text reaches the program | PASS | Caught as "Waiting for your approval (card card_N)…"; uncaught it appears inside `code run failed (exception): ToolCallError: …` (text intact, wrapped in DSH wording) |
| An allowed inner call's hint arrives through `additionalContexts` | PASS | `allow.model.contextsAfter` holds a `fishball-notice` with the hint; the result text is just `gated ran with allow-me` |
| Identical retry runs under the pass, a different one does not | PASS | `retryIdentical` ran; `retryDifferent` got a new card |

The direct-call S35 checks (Q1-Q3) also pass again on both hosts.

## Built-in browser check: card closing when Fishball's answer wins

**Not confirmed.** I read `spikes/s37-client-slots-server.mjs` and its fixture (`spikes/fixtures/client-slots/index.js`). Its `user-questions/request` answerer returns the answer directly without calling `next()`, so the session's own question card is never opened, and there is no race to watch. No other spike server does this either. So the claim rests on S36's gateway stand-in (the owner client got `cancel` and `pendingRemoteEvents` was empty) plus the report's reading of `dsh-client-ui-user-questions`. I did not start a server or open the browser.

## Gaps that matter for the build

1. **Real card closing is unverified in a browser** (above). It needs a fixture whose answerer calls `next()` and then answers from outside, in a managed session, with a legacy card and a timed card.
2. **S36's "browser" is a stand-in.** `compose` in `gateway-browser.mjs` is a copy of DSH's client `submitDrafts`, not DSH's actual client code. The deep-equal oracle is therefore only as good as that copy. The real browser path would settle it.
3. **S34 Stop and parked messages:** the redirect order against a parked user message is FIFO by default and the user's choice is still open (A/B/C in the report). Option B (`inbox.prepend`) was never run.
4. **S34 `agent/created` coverage:** only `resume` was exercised; `clear` and compaction were not.
5. **S34 subagents on Stop:** what happens to a running background child when its parent is stopped was not tested.
6. **S34 timed questions on Stop:** a question already `continued` is not cancelled by a stop; untested.
7. **S36 timed mode:** only the shipped blocking tool matters for the presets, but the timed path (F1-F4) is the only one with continued questions, and it is spike-only fixture config.
8. **S36 legacy call id** is inferred from the log; two parallel questions with identical question ids are ambiguous. Not tested.
9. **S35 `run_code` uncaught errors** arrive wrapped in a DSH stack trace; the text is intact but the plugin cannot change the wrapper.
10. **Scope key reuse** (`createScope` with another agent's key) is undocumented DSH behaviour. It works on rc.2 and rc.3 only.
11. Both hosts were tested with the fake model only, never a real model's reaction to the wording.

## Housekeeping

- No servers were started. The spike processes I launched were stopped, together with their feeding `sleep` processes and two monitors. The run loop was cut short by my cleanup after all eight outputs had been written.
- The spikes write into this worktree's `.runtime/` (not touched by git).
