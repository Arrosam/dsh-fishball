# Independent check of spikes S33, S35 and S37

Run 2026-11-01 by a separate Sonnet 5.5 session on branch `claude/test-s33-s35-s37-dd330f` (head `436c441`). No source, spike script, fixture or committed result file was edited. No real model calls. Every server I started is stopped (checked: nothing listens on 3133, 3134, 3137, 3233, 3234 or 3237).

**Overall: PASS.** All claims the build relies on held. The committed verdicts stand. A few gaps are listed per spike and in the last section.

How I ran the headless spikes: each one writes `spikes/results/<id>.json`, so I used the id variables (`S33_RESULT_ID`, `S35_ID`) to write new `verify-*.json` files next to the committed ones. The committed JSON is untouched (`git status` shows only the four new `verify-*` files plus this report).

| Run | Command | Result |
|---|---|---|
| S33 rc.2 | `S33_RESULT_ID=verify-S33-rc2 spikes/run.sh spikes/s33-close-prompt.mjs` | all verdict flags true, both modes |
| S33 rc.3 | same with `DSH_RUNTIME_ROOT=<rc.3>/node_modules`, id `verify-S33-rc3` | all verdict flags true, both modes |
| S35 rc.2 | `S35_ID=verify-S35-rc2 spikes/run.sh spikes/s35-result-wording.mjs` | 14 of 14 true |
| S35 rc.3 | same with `DSH_RUNTIME_ROOT`, id `verify-S35-rc3` | 14 of 14 true |
| S37 | `SPIKE_PORT=3237 SPIKE_STDIN_SECONDS=3000 spikes/run.sh spikes/s37-client-slots-server.mjs`, then the built-in browser pane | see below |
| S33 by hand | `S33_SERVE=1 SPIKE_PORT=3233 S33_CONTROL_PORT=3234 spikes/run.sh spikes/s33-close-prompt.mjs`, then the built-in browser pane | see below |

## Differences from the committed JSON

I flattened each pair of JSON files and compared every leaf.

- **S33 rc.2 and rc.3:** only `id`, `started` and `finished` differ. Every other value is identical, including the registry arguments, outcomes and `settledBy`.
- **S35 rc.2 and rc.3:** besides `id`/`started`/`finished`, only the `ms` timings differ (for example 189 → 168 ms; all runs 40 to 190 ms) and the `model.raw` strings (they embed timestamps). The `model.text`, `isError`, `mark`, status and verdict fields are identical. No behavioural difference between the committed run and mine, and none between rc.2 and rc.3.

## S33: answering a stock permission prompt

| Claim | Verdict | Evidence |
|---|---|---|
| Plugin answers Allow once while the prompt shows: tool runs, prompt closes | **PASS** | Headless, both modes, both versions (`A_allow_runs_tool`). The gateway's pending count went 1 → 0. |
| Plugin answers Reject: agent gets a rejection | **PASS** | Headless (`B_reject_reaches_agent`). By hand in the browser pane (re-dispatch mode): session `handrej` showed the stock "Waiting for approval" prompt. After `/answer?...outcome=rejected` the prompt was gone, the session turned idle, the tool result was `not run: rejected`, `decided: ["rejected"]` and `gatewayPending` was 0. |
| Plugin learns the user's answer when the user clicks first | **PASS** | By hand: I clicked Allow once on `handuser`. The registry entry showed `settledBy: "downstream"`, outcome `allowed-once`, and the tool result `RAN handuser`. Headless: `D_user_first_learned`. |
| Stopping the turn cancels the request | **PASS** (headless only) | `C_stop_cancels` on both versions and modes. |
| Arguments are available from the registry | **PASS** | `A_args_recorded`. |
| Nothing hangs, no unhandled rejection | **PASS** | `no_unhandled_rejection: true` headless. In the hand run `unhandled` stayed `[]` and `waiting` fell to 0 after both answers. |
| rc.2 and rc.3 behave the same | **PASS** | No difference in the compared JSON. |

### Gaps (S33)

- The hand check used only the re-dispatch mode. Mutate mode is covered by the committed browser JSON and by my headless runs, not by me in the pane.
- Not done: a server answer arriving in the same tick as a user click in my own browser run. I relied on the committed `s33_4` and `s33_5` cases, which do show one winner.
- Not done: two tabs on one session (the report already says so).
- Not done: a `cap` or `timeout` pass-through. The spike only exercised the direct pass-through.
- The user's Reject note cannot reach the agent through the outcome (known, handed to S35).
- The spike's broker is a fixture. The real `ApprovalBroker` change (listener written as a `function` to get `this`, the `WeakSet` mark, the registry cleanup) is untested until the build.

## S35: agent-visible result wording

| Claim | Verdict | Evidence |
|---|---|---|
| Exact agent-visible texts in the report's tables | **PASS** | I compared `model.text` and `isError` in `verify-S35-rc3.json` with the report. All 14 results match character for character: the approval hint on an allowed call; the full reject text with Fishball's reason and the hint (both the pre-execute gate and the tool-body ask); `Waiting for your approval (card card_N). The call did not run. You will be told when the user answers; if they allow it, make the identical call again.` in every waiting case. `isError` is false for the own-tool body result and true for the post-execute `block` cases, as the report says. Variant B carries the extra `Error: ` prefix. rc.2 gives the same texts. |
| Stand-in Fishball's turn continues after a non-blocking request | **PASS** | `Q2_add_plugin_waiting` and `Q2_keeps_handling` true on both versions (turn idle in about 100 ms; a following message handled in about 45 ms while the card was pending). |
| An identical retry runs under a one-time pass | **PASS** | `retryIdentical` returned `installed pkg-a`; `bodyAskRetry` returned `body-ask ran with z`. |
| Keys in another order count as identical | **PASS** | `gatedReordered` `{flag:true, spec:'x'}` after `{spec:'x', flag:true}` ran: `gated ran with x`. |
| A different call does not run | **PASS** | `retryDifferent` (`pkg-b`) and `gatedDifferent` (`flag:false`) both got the waiting text with a new card. |
| A second retry does not run | **PASS** | `retryIdenticalAgain` got `Waiting … (card card_6)`. |

### Gaps (S35)

- Calls made inside `run_code` (the report's own note; being checked elsewhere).
- S35 and S33 were never run together. In S35 the broker stand-in answers the request directly. The build will use S33's re-dispatch with a race, then a post-execute rewrite keyed by call id. Nothing proves the call id and the answer still line up through that path.
- The pass has no expiry in the spike. The rules from the requirements ("withdrawn", "end of the turn Fishball was woken for", "survives a restart") are untested. Marks left by a call that was cancelled between approval and post-execute have no sweep (the report's own risk).
- Retry matching is only tested for flat arguments in a different key order. Nested objects, arrays and number/string forms were not tried.
- Policy `never` (DSH answers `rejected` before any listener) is described in the report but not exercised in the run.
- The three open wording choices in the report (variant A vs B, `isError` on waiting, hint in the output vs `additionalContexts`) are still the user's call.

## S37: browser UI slots

Server on `SPIKE_PORT=3237`. I used the built-in browser pane at 1280×860, with `prefers-color-scheme` set to dark (default) and then light. The seeded sessions' titles are not their roles (they show as "done", "Thanks, carrying on." and so on), so I identified them through the fixture's `/api/s37/events` snapshot.

| Claim | Verdict | Evidence |
|---|---|---|
| `ask_fishball` row with Allow once / Reject | **PASS** | Dark: Parser's row showed "Asking Fishball · bash · Waiting for an answer", the arguments, the reason, and the Allow once / Reject buttons. Light: the same for the Docs row. |
| Clicking clears the matching pile card, and the call finishes | **PASS** | Allow once on Parser's row: the session finished ("Completed in 1m 42s") and the card `call_1vrc3cti` disappeared from the state stream. Reject on Docs' row: the session completed and `call_pgozuesh` disappeared. The remaining cards were the two fixture-only ones. |
| Question tag | **PASS** (light checked by me) | Library session: "Asked Fishball date-fns (Recommended)" under "Ask question · 1/1 answered". It is only visible after expanding "Completed in…" and then "Asked questions" (the report says so). I did not recheck dark; the committed `question-tag-dark.jpg` covers it. |
| Plan-review tag in the turn tail | **PASS**, light and dark | Plan session: "Asked Fishball Approve" under the reply and above the "Split the parser · Plan" card, visible with nothing expanded. |
| Pile with its count | **PASS**, light and dark | Dark: "Waiting for you 4" with permission cards, reason and Fishball's note, a Details link, a note field, Allow once / Reject. After the two row answers it reads "Waiting for you 2" (Library question card and the Fishball `add_plugin` card), in light. The count dropped live. |
| Hand over / Take back in header and menu | **PASS** | On the user's own session the header showed "Hand over to Fishball". Clicking it moved that session into the fixture's managed list and the header and menu both read "Take back from Fishball". The menu's "Take back from Fishball" then removed it from the list (managed 5 → 4) and the header returned to "Hand over to Fishball". |

### Gaps (S37)

- I did not click Allow once or Reject on a pile card to see the matching row clear (the reverse of the row → pile direction I tested). The real frozen sessions were already consumed by the row clicks, and the two remaining cards are fixture-only. The committed S37 report covers it in dark; I did not repeat it.
- I did not exercise the pile's Details toggle, its note field, or the 45vh cap at a short window.
- The menu's "Hand over to Fishball" label (not take back) was not seen separately from the header; only the header's hand over was clicked.
- Dock order against DSH's own Todo and Queue docks, the Messenger look, and a denied `ask_fishball` row (DSH's generic row) were not checked (the report lists the first two).
- The sidebar re-sorts rows as sessions change state. A click can land on a different session than intended (it happened to me once). That is a spike-harness annoyance, not a product point.

## Gaps that matter for the build (all three spikes)

1. **S33 + S35 combined path** (see S35 gaps): no run of a managed session's request through re-dispatch, answered by the plugin, with the post-execute rewrite attached.
2. **Calls inside `run_code`:** S33 and S37 never cover them either (S33's registry and S37's `ask_fishball` row assume a native call id).
3. **Persistence and restart:** card, pass and registry state are all in memory in the spikes. Requirement 24 (survive a restart) has no evidence here.
4. **Question routing (S36):** S37 says an untimed `ask_user_question` has no `wait.callId`, and the fixture invented one. The tag and the pile's question card both depend on S36's answer.
5. **Real `ask_fishball`:** S37's tool is a fixture. How its card and the broker's cards link by `callId` in the real code is not shown.
