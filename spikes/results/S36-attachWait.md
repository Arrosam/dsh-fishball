# S36-attachWait: holding a timed question's wait for Fishball

**Verdict: FAIL as designed, PASS with one amendment.**

DESIGN.md §7a.10 says the router "attaches with `userQuestions.attachWait`" to hold the wait. That claim alone holds the wait only while no session card is open. The session's own card also claims the wait, and its countdown rejects `ASK_TIMED_OUT` at the tool's timeout. rev11g opens the card at once, so the question became `continued` at 10.2 s.

**Amendment (proved):** the router claims with `attachWait`, then passes the request on to the session card with `wait.timed: false`. The card shows as a blocking card: no claim and no countdown. The wait was then held past the tool's 10 s timeout, through the 30 s answer time, and on after the "pile" point. An answer from Fishball or from the card at 40 s resumed the same turn.

- **Run on:** real DSH 0.2.1-rc.2, in-process, with a throwaway `DSH_HOME` under `.runtime/` and the fake model.
- **Files:**
  - script: `spikes/s36-attachwait.mjs`;
  - evidence: `spikes/results/S36-attachWait.json` (per-second samples for every case);
  - router change: `spikes/fixtures/question-router.mjs`, an opt-in `holdTimed` option (`HOLD.claim` or `HOLD.claimUntimed`) that is off by default. The S36 main spike was re-run with it and still passes.
- **Command:** `SPIKE_STDIN_SECONDS=200 SPIKE_DEADLINE_MS=180000 spikes/run.sh spikes/s36-attachwait.mjs`, about 95 s. The process exits by itself, and no server is left running.
- **Session card stand-in:** `spikes/fixtures/gateway-browser.mjs` on DSH's real gateway. It copies the real card's rule from `dsh-client-ui-user-questions` `answerQuestion`: only a request with `wait.timed === true` and a `callId` claims the wait and counts down from the `remainingMs` that `attachWait` returns. `PendingQuestion.timeout()` then rejects `ASK_TIMED_OUT`.
- **Timings:**

  | Setting | Value |
  |---|---|
  | Tool `timeout` (per call) | 10 s |
  | `approvalAnswerSeconds` stand-in | 30 s |
  | Further hold after the pile point | 10 s |
  | Stop or release in A3 and A4 | 15 s |

## How it works (DSH code, rc.2)

- **`askTimed`** (`dsh-user-questions` index.js) creates a `TimedQuestionWait` with the deadline `now + timeout`. It then runs the waterfall with `wait.signal` and `wait: { callId, timed: true }`.
- **The host timer** (`TimedQuestionWait.schedule`) runs only while `claims.size === 0`. `attachWait(agent, callId, signal)` adds a claim, which stops the timer. The claim lasts until its signal aborts or the wait closes, and it yields `{ remainingMs }` once.
- **When a claim ends,** `schedule()` runs again. If the deadline has passed, the timer fires at once with `ASK_TIMED_OUT`.
- **The card's countdown** is a second, independent clock. It rejects the waterfall with `ASK_TIMED_OUT`, and `askTimed` maps that to the pending result. That is the `continued` path.
- **A Stop** (`agent.cancel`) aborts the turn signal, which closes the wait. The gateway sends `cancel` to the card, every claim is released, and the result is `ASK_ABORTED`.

## Results

All cases ran in parallel in their own sessions. L0 ran last, with no browser connected.

| Case | Hold | Session card | What happened | Tool result at | Same turn |
|---|---|---|---|---|---|
| L0 | claim only | none | Held past 10 s, 30 s and 40 s with 1 claim (Fishball's), status `running`, projection `open`. Fishball answered at 40 s. | 40.0 s, answer batch | yes: 1 turn, no late reply |
| **L1** | **claim only (§7a.10 as written)** | **open, timed** | 2 claims (router and card). At 10 s the card's countdown rejected `ASK_TIMED_OUT`. | **10.2 s, pending → `continued`** | the turn went on without the answer |
| A1 | claim + untimed request | open, untimed | Held through 12 s, 30 s ("moves to pile") and 40 s: status `running`, projection `open`, 1 claim. Fishball answered at 40 s, and the card got `cancel`. | 40.0 s, Fishball's batch | yes |
| A2 | claim + untimed request | open, untimed | Held the same way. The user answered in the card at 40 s. The router recorded `by: user`. | 40.0 s, the card's batch | yes |
| A3 | claim + untimed request | open, untimed | Stop at 15 s. | 15.0 s, error `ASK_ABORTED` "aborted before the user answered" | turn ended |
| A4 | claim + untimed request | open, untimed | Router released its claim at 15 s (Fishball turned off). The host timer fired at once because the deadline had passed. The card got `cancel`, and the question became `continued`. Fishball answered through `userQuestions.answer`. | 15.1 s, pending | no: a second turn with a `user-question-reply` |

**Same turn**, for L0, A1 and A2: the session log has one `turn/start` and one `turn/end`, and no `user-question-reply` message. The tool result is the answer batch itself, so the model continued in that turn with the answer.

**Leaks**, checked after every case:

| Check | Result in every case |
|---|---|
| `userQuestions.waits` entry for the agent | gone |
| Router's `attachWait` claim | ended (its stream settled) |
| Gateway pending events for that session | 0 |
| Router entry | settled (`answered`, `closed` or `continued`) |

After Stop (A3), the projection row was dropped (`none`), and Fishball's later answer was refused (`already-settled`).

## Checks (all true in the final run)

| Check | Result |
|---|---|
| `claim_only_holds_without_card` | true |
| `claim_only_with_card_ends_at_tool_timeout` | true (this is the failure of the design as written) |
| `untimed_card_holds_past_timeout_and_pile` | true |
| `untimed_fishball_answer_same_turn` | true |
| `untimed_card_answer_same_turn` | true |
| `stop_while_held_ends_clean` | true |
| `released_hold_becomes_continued` | true |

## What rev11g should build

1. **In the prepended `user-questions/request` listener,** for a managed session's timed question:
   - await the first frame of `attachWait(agent, request.wait.callId, claimSignal)` before calling `next()`;
   - set `request.wait = { ...request.wait, timed: false }`;
   - then do S36's signal swap and race.

   Release the claim when the waterfall settles: it is released anyway when the wait closes. Keep holding past `approvalAnswerSeconds`: moving to the pile changes nothing in DSH.
2. **When Fishball stops holding** (turned off, or Permission requests off), abort the claim. The host timer then ends the wait at once if the deadline has passed. The question becomes `continued`, and the user can still answer it from the card or the pile.
3. **Stop needs no handling:** DSH closes the wait, the claim and the card.

## Not covered and caveats

- **A real browser is not checked.** The untimed card is the stand-in following the client code's rule: no claim and no countdown when `wait.timed` is not true. rev11g's real-browser check (§14) should confirm two things:
  - the card shows no countdown and stays answerable while the projection row is a timed `open` row;
  - the card closes on `cancel`.
- **The user loses the card's countdown** for a held question. That is intended: Fishball holds the wait like a permission request.
- **Rejected alternative (from client code, not run):** keep the request timed and have the router ignore the card's `ASK_TIMED_OUT`. That holds the wait, but the card then has no waterfall and no RPC (`continued` only follows a tool result), so the user could not answer in the session.
- **Restart:** a held question is a foreground wait. At a restart it ends the way S36 found for timed questions, and becomes `continued`. Not re-run here.
