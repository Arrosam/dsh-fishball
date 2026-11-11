# 5. Watchdog: activation, decisions, patrol and failure (WD)

Requirements: R-WD-00…14 (R-WD-13 withdrawn), R-INT-05, R-INT-07, R-FB-07, R-HOST-08,
R-WATCH-05. Conventions: [README](<README.md>).

"Supervised" = Watchdog healthy, a live claim (U8, X15) on the session, and the session managed by
its Fishball. All cases are at the Fishball DSH with a fake connector link unless marked
integration (real child + connector).

## Use Cases

### WD-UC-01 — Watchdog decides a supervised permission request
**Req:** R-WD-03, R-WD-09, R-WD-12, R-INT-07, R-WD-00, R-INT-06 · **Level:** integration · **Flags:** P:S3

- **Actor:** Watchdog (as part of Fishball's principal).
- **Preconditions:** Fishball manages S1; Watchdog is healthy and has a side session claiming S1.
- **Main flow:**
  1. S1 requests permission for an in-scope, low-risk action.
  2. Core's interception service hands the `permission` event to Watchdog (filter: supervised) with **no** Fishball turn.
  3. Watchdog decides **allow** and commits it through core's link, as Fishball's principal.
  4. The `settlement` event for that offer is intercepted by Watchdog (its second filter); Fishball gets no wake for it.
- **Alternative flows:**
  - A1. The request is beyond the task **and** dangerous → **reject** with a justification.
  - A2. Other high-risk → committed as `escalate`: a user card in S1 with no time limit, **no Fishball turn**. When the user settles it, Watchdog gets the `settlement` at once; Fishball gets a **non-waking** note at its next turn.
  - A3. Not high-risk, cannot decide → `release(e, {toFishball: true})`; Fishball is woken once for the same live offer (same offer id) with one `manager.notify` carrying Watchdog's reasoning.
  - A4. The user answers in S1 before Watchdog commits → first commit wins; Watchdog's later commit gets `already-settled` / `expired` and changes nothing.
- **Exception flows:**
  - E1. Watchdog's model call fails while deciding → Watchdog is effective off at once (WD-UC-04); the request goes to Fishball.
- **Postconditions:** exactly one outcome is committed; the connector saw only Fishball's principal.

### WD-UC-02 — Everything other than supervised permissions reaches Fishball
**Req:** R-WD-03, R-WD-12, R-INT-07, R-WATCH-05, R-EXT-20 · **Level:** integration · **Flags:** —

- **Actor:** `fishball-core`.
- **Preconditions:** Watchdog healthy, supervising S1.
- **Main flow:** for each of S1's `turn-finished` (mid-work, with running=true or queued=true), `turn-finished` (idle: running=false, queued=false), `state`, `question`, `plan-review`, `message`, `ask`, `handover`, `takeback`, plus a `notice` and a `contributed:x.y` event, core delivers it to the Fishball agent and Watchdog's handler is never called.
- **Alternative flows:** A1. An unsupervised session S2's `permission` → Fishball.
- **Exception flows:** —
- **Postconditions:** Watchdog has received only supervised `permission` and its own offers' `settlement` / `retirement` events; no Watchdog model step ran for any event above.

### WD-UC-03 — The patrol timer reads the session
**Req:** R-WD-03, R-WD-04, R-WD-14, R-WD-05 · **Level:** unit (fake clock, fake link), integration · **Flags:** TQ-9

- **Actor:** Watchdog's patrol timer.
- **Preconditions:** S1 supervised; `minCheckIntervalSeconds` = 1740; last patrol watermark W.
- **Main flow:**
  1. The timer fires for S1.
  2. Watchdog calls `sessions_list` (running and pending state of S1) and `session_read` from W, bounded by its read limits.
  3. It finds nothing wrong → **nobody is woken**; the watermark advances.
- **Alternative flows:**
  - A1. It finds a problem → it reaches Fishball only through its usual escalation or report (`manager.notify`, R-WD-08).
  - A2. S1 produced nothing since W → the patrol still fires once in that interval.
- **Exception flows:**
  - E1. `session_read` fails → Watchdog failure (WD-UC-04).
- **Postconditions:** no `turn-finished` or `state` event was needed or consumed by Watchdog.

### WD-UC-04 — Watchdog fails and falls back to Fishball
**Req:** R-WD-07, R-INT-04, R-INT-07, R-WD-08 · **Level:** integration · **Flags:** P:S3

- **Actor:** Watchdog / `fishball-core`.
- **Preconditions:** Watchdog supervises S1 and S2; holds an accepted, undecided permission offer O1 of S1.
- **Main flow:**
  1. A failure of any kind (load, readiness, loss of its registration, model/provider error, budget, store, claim, attach, runtime) occurs.
  2. Watchdog is effective off at once: its filters turn false / registrations disposed; claims released; O1 goes to Fishball (woken); sends pass; stale callbacks are fenced (a late Watchdog commit for O1 is not sent).
  3. Fishball gets **one** "watchdog is down" notice through in-session communication (not MCP).
  4. S1's next permission request goes to Fishball.
- **Alternative flows:**
  - A1. Watchdog supervises zero sessions when it fails → the notice is still sent.
  - A2. It goes down, recovers, goes down again → two notices.
- **Exception flows:** E1. Loss of core's link is core's status, **not** a Watchdog failure; no notice (D§7.3).
- **Postconditions:** S1 and S2 are neither stopped nor restarted by the failure.

### WD-UC-05 — "watchdog is down" when Watchdog never started
**Req:** R-FB-07, R-HOST-08, R-WD-07 · **Level:** integration · **Flags:** —

- **Actor:** `fishball-core` (standalone) / the instance (hosted).
- **Main flow (standalone):** `fishball-watchdog` is enabled but incompatible; at the app ready signal it has not registered → Fishball gets "watchdog is down" **once** for this DSH start.
- **Alternative flows:**
  - A1. Hosted: the child fails to start (R-BND-03) → the instance keeps the notice; at the next successful child start Fishball gets it once.
  - A2. Watchdog disabled by the owner → no notice (it is not "enabled but not registered", K).
- **Exception flows:** E1. Two failed child starts then a success → one notice, not two (K: per pending notice).
- **Postconditions:** a restart of the standalone DSH with the same state gives one new notice.

### WD-UC-06 — Pausing and resuming supervision of a session
**Req:** R-WD-10, R-WD-15 · **Level:** integration · **Flags:** Q33

- **Actor:** Fishball (`watchdog_pause` / `watchdog_resume`).
- **Main flow:** `watchdog_pause(S1)` → Watchdog first stops S1 (`session_stop`), then records it paused. No Watchdog run (no model call, no side-session turn, no patrol read) starts.
- **Alternative flows:** A1. `watchdog_resume(S1)` → S1 is supervised again; no Watchdog run starts; the next activation is S1's next permission request or patrol.
- **Exception flows:** E1. The stop fails → the failure is reported; S1 is **not** recorded as paused.
- **Postconditions:** a paused S1's permission requests are not intercepted (K: no claim while paused).

### WD-UC-07 — Fishball cannot run Watchdog on demand; a refine is data only (Q33 = B)
**Req:** R-WD-03, R-WD-15, R-WD-04, R-WD-14 · **Level:** integration (manager tools in a Fishball DSH with a fake link, fake clock and a scripted Watchdog model that counts its calls) · **Flags:** Q33

- **Actor:** Fishball's manager (LLM tool calls through core's façade).
- **Preconditions:** S1 supervised with brief B0 (given at start through `watchdog_brief`); last patrol at t = 0; interval 1740; Watchdog healthy and idle.
- **Main flow:**
  1. Fishball's tool list contains `watchdog_brief`, `watchdog_refine`, `watchdog_pause`, `watchdog_resume`, and **no** `watchdog_check_now`.
  2. A crafted call to `watchdog_check_now` → "unknown tool"; nothing else happens.
  3. At t = 100 Fishball calls `watchdog_refine(S1, B1)` → it returns at once (before any Watchdog work), and B1 is stored.
  4. Between t = 100 and t = 1739: Watchdog model calls = 0, side-session turns = 0, `sessions_list` / `session_read` calls = 0.
  5. At t = 1740 the patrol fires on schedule (not moved by the refine) and its prompt carries **B1**.
- **Alternative flows:**
  - A1. After the refine, S1 asks a permission at t = 200 → Watchdog judges it at once with **B1** (the next activation).
  - A2. Refines B1, B2, B3 before the next activation → that activation uses B3; still no extra runs.
  - A3. The refine changes the criteria, not the brief text → same rules.
- **Exception flows:**
  - E1. The refine arrives while a judgement or patrol is already running with B0 → that run is not restarted and no extra run starts; the **next** activation uses B1.
  - E2. `watchdog_refine` for a session Watchdog does not supervise → refused (K code); nothing stored.
- **Postconditions:** the only Watchdog runs in the whole case are permission judgements and timer patrols.

## Equivalence Partitioning

### WD-EP-01 — Which events activate Watchdog
**Req:** R-WD-03, R-WD-12, R-INT-07, R-WD-09 (U21), R-WD-15 · **Level:** unit · **Flags:** Q33 (rows 12–14)

| # | Event | Session | Watchdog state | Receiver |
| --- | --- | --- | --- | --- |
| 1 | `permission` | supervised | healthy | Watchdog |
| 2 | `permission` | managed, unclaimed | healthy | Fishball |
| 3 | `permission` | supervised | down / off | Fishball |
| 4 | `question`, `plan-review` | supervised | healthy | Fishball |
| 5 | `turn-finished` (any flags) | supervised | healthy | Fishball |
| 6 | `state` | supervised | healthy | Fishball |
| 7 | `message`, `ask`, `handover`, `takeback` | supervised | healthy | Fishball |
| 8 | `notice`, `contributed:*` | any | healthy | Fishball (or a non-Watchdog interceptor) |
| 9 | `settlement` / `retirement` of an offer Watchdog held or escalated | supervised | healthy | Watchdog |
| 10 | `settlement` / `retirement` of an offer Fishball held | supervised | healthy | Fishball |
| 11 | `settlement` of a Watchdog-held offer | — | down | Fishball (filter false) |
| 12 | Fishball calls `watchdog_check_now` (not an event) | supervised | healthy | "unknown tool"; Watchdog not activated (Q33) |
| 13 | Fishball calls `watchdog_brief` / `watchdog_refine` | supervised | healthy | stored; Watchdog not activated (R-WD-15) |
| 14 | Fishball calls `watchdog_pause` / `watchdog_resume` | supervised / paused | healthy | Watchdog not activated (R-WD-15) |
| 15 | patrol timer fires (not an event) | supervised | healthy | Watchdog (the second of the two activation cases) |

### WD-EP-02 — `minCheckIntervalSeconds` value classes
**Req:** R-WD-04 · **Level:** unit (settings validation) · **Flags:** —

| # | Class | Value | Expected |
| --- | --- | --- | --- |
| 1 | default | unset | 1740 |
| 2 | in range integer | 600 | accepted |
| 3 | non-integer | 600.5 | refused |
| 4 | string | `"600"` | refused (K: the native form's coercion) |
| 5 | negative | −1 | refused |

### WD-EP-03 — Where Watchdog runs and whose identity it uses
**Req:** R-WD-00, R-WD-01, R-WD-02, R-WD-08 · **Level:** integration · **Flags:** —

| # | Class | Expected |
| --- | --- | --- |
| 1 | `fishball-watchdog` installed in a host or main DSH (no core) | no Watchdog code, settings or UI runs; one `fishball-core-missing` line |
| 2 | in a Fishball DSH with core | runs; registers with core's interception service |
| 3 | Watchdog's MCP traffic | none of its own: no token, no subscription, no `subscriptions/listen` stream, no mailbox; the connector sees one principal (Fishball's) for every Watchdog commit |
| 4 | Fishball's token entry revoked at C | Watchdog's next commit fails with Fishball's link; no separate credential exists to keep it alive |
| 5 | Watchdog → Fishball messages (escalation, report, "watchdog is down") | travel only through in-session communication in the Fishball DSH (`manager.notify`, D§7.2); a connector trace shows no MCP call for them |

### WD-EP-04 — Watchdog model changes and saving settings
**Req:** R-WD-06, R-WD-05 · **Level:** integration (fake model provider counting lookups) · **Flags:** —

| # | Class | Expected |
| --- | --- | --- |
| 1 | model changed while no step is prepared | the next model step uses the new model |
| 2 | model changed while a step is already prepared | that step keeps the old model; the next not-yet-prepared step uses the new one |
| 3 | saving Watchdog settings (any field) | performs no model lookup (provider call count unchanged) |
| 4 | timers present in Watchdog after start | only the patrol timer per supervised session, plus the hung-check timeout and the bounded start attachment as failure bounds; no approval, hourly/daily cap, stall, idle, paused-poll or per-brief schedule timers |

## Boundary Value Analysis

### WD-BVA-01 — `minCheckIntervalSeconds` range (60–86400)
**Req:** R-WD-04 · **Level:** unit · **Flags:** —

| # | Value | Expected |
| --- | --- | --- |
| 1 | 59 | refused |
| 2 | 60 | accepted |
| 3 | 61 | accepted |
| 4 | 1739 | accepted |
| 5 | 1740 | accepted (default) |
| 6 | 1741 | accepted |
| 7 | 86399 | accepted |
| 8 | 86400 | accepted |
| 9 | 86401 | refused |
| 10 | 0 | refused |

### WD-BVA-02 — The 29-minute patrol interval in time
**Req:** R-WD-04, R-WD-14 · **Level:** unit (fake clock) · **Flags:** TQ-9

Interval 1740 s. The previous patrol of S1 at t = 0.

| # | Clock | Expected |
| --- | --- | --- |
| 1 | t = 1739 | no patrol of S1 |
| 2 | t = 1740 | exactly one patrol of S1 |
| 3 | t = 1741 (after #2) | no further patrol |
| 4 | t = 3479 | no patrol |
| 5 | t = 3480 | the next patrol |
| 6 | 10 permission requests between t = 0 and t = 10 | each handled at once; patrol schedule unchanged (never delayed or throttled) |
| 7 | S1 and S2 supervised, S2's previous patrol at t = 100 | S2's next at t = 1840, independent of S1 |
| 8 | interval 60: patrol at 0, next at 60, none at 59 | |
| 9 | interval 86400: next at 86400, none at 86399 | |
| 10 | the first patrol after a new claim at t = c | TQ-9 (c + interval, or at once?) |
| 11 | interval 1740, 4 × 1740 s elapse with no activity in S1 | exactly 4 patrols ("exactly one per interval", whether or not S1 produced anything) |

### WD-BVA-03 — A refine around the patrol timer
**Req:** R-WD-15, R-WD-04, R-WD-03 · **Level:** unit (fake clock, a scripted model that records each call's brief) · **Flags:** Q33

Interval 1740 s; previous patrol of S1 at t = 0 with brief B0; no permission requests unless stated. "Runs" = Watchdog model calls + side-session turns + patrol reads.

| # | Refine to B1 at | Expected |
| --- | --- | --- |
| 1 | t = 1 | returns at once; 0 runs until 1740; patrol at 1740 uses B1 |
| 2 | t = 1738 | 0 runs at 1738–1739; patrol at **1740** (not moved) uses B1 |
| 3 | t = 1739 | 0 runs at 1739; patrol at 1740 uses B1 |
| 4 | t = 1740, just **before** the patrol fires (same tick, refine first) | the 1740 patrol uses B1; next patrol 3480 |
| 5 | t = 1740, just **after** the patrol started with B0 | that patrol is not restarted and uses B0; no extra run; the 3480 patrol uses B1 |
| 6 | t = 1741 | 0 runs until 3480; patrol at 3480 (not 1741 + 1740 = 3481) uses B1 |
| 7 | t = 100, then a permission request at t = 101 | judgement at 101 uses B1; patrol still at 1740 |
| 8 | 5 refines at t = 10, 20, 30, 40, 50 (B1…B5) | 0 runs before 1740; patrol at 1740 uses B5 |
| 9 | refine at t = 100 with interval 60 (`minCheckIntervalSeconds` = 60, previous patrol t = 60) | patrol at 120 uses B1; none at 100 |
| 10 | refine at t = 100 with interval 86400 | next patrol at 86400 uses B1; 0 runs before |
| 11 | refine latency | the call returns before any Watchdog work begins (assert: the scripted model has not been called when the tool result is observed) |
## Decision Tables

### WD-DT-01 — Watchdog's decision on a supervised permission request
**Req:** R-WD-09, R-WD-12, Q13 · **Level:** unit (decision mapping with a scripted model) · **Flags:** TQ-10

| Rule | In task scope | Dangerous | High-risk | Watchdog can decide | Outcome | Fishball turn | User card |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | yes | no | no | yes | allow | no | no |
| 2 | no | yes | yes | yes | reject + justification | no | no |
| 3 | yes | — | yes | — | `escalate` | no | yes, no time limit |
| 4 | no | no | yes | — | `escalate` | no | yes |
| 5 | — | — | no | no | re-route to Fishball (`release`) | yes, once | no |
| 6 | no | no | no | yes | TQ-10 (beyond scope, not dangerous, low risk: not "in scope", so not allow; not dangerous, so not reject) | | |
| 7 | — | — | — | Watchdog down | Fishball | yes | no |

### WD-DT-02 — Routing for a session by supervision and health
**Req:** R-WD-11, R-WD-12, R-WD-07, R-INT-07 · **Level:** unit · **Flags:** —

| Rule | Managed by this Fishball | Claimed | Watchdog healthy | `permission` to | Other events to |
| --- | --- | --- | --- | --- | --- |
| 1 | yes | yes | yes | Watchdog | Fishball |
| 2 | yes | yes | no | Fishball | Fishball |
| 3 | yes | no | yes | Fishball | Fishball |
| 4 | no (another principal) | — | — | not received at all | not received |
| 5 | no (unmanaged) | — | — | the user in the session | (message/ask to D) |

## State Transitions

### WD-ST-01 — Watchdog health
**Req:** R-WD-07, R-INT-07, R-FB-07, R-HOST-08 · **Level:** unit · **Flags:** P:S3

States: **NotLoaded**, **Starting**, **Healthy**, **Down**, **Off** (disabled).

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | NotLoaded | core `ready()`, registration ok | Healthy | two registrations exist |
| 2 | NotLoaded | app ready, still not registered (enabled) | Down | one "watchdog is down" |
| 3 | Healthy | any failure kind | Down | filters false at once; claims released; pending items → Fishball; one notice |
| 4 | Down | another failure | Down | no second notice in the same episode |
| 5 | Down | recovery (K: restart of the plugin) | Healthy | re-registered |
| 6 | Healthy | link to connector lost | Healthy | no notice; events wait at C |
| 7 | Healthy | owner disables the plugin | Off | registrations gone; everything to Fishball |
| 8 | Down | a late model result for O1 | Down | fenced: not committed |
| 9 | Healthy | a supervised session is stopped/restarted by the failure | — (invalid) | never happens |

### WD-ST-02 — Supervision of one session
**Req:** R-WD-10, R-WD-11, R-WD-14, R-WD-15, R-WATCH-05 · **Level:** unit · **Flags:** TQ-9, Q33 (rows 8–9), TQ-11

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | Unsupervised | claim (side session) on a session Fishball manages | Supervised (timer armed) |
| 2 | Unsupervised | claim on a session Fishball does not manage | Unsupervised (refused, K) |
| 3 | Supervised | timer fires | Supervised (patrol read; watermark advanced) |
| 4 | Supervised | pause, stop ok | Paused (session stopped) |
| 5 | Supervised | pause, stop fails | Supervised (failure reported) |
| 6 | Supervised | Fishball stops managing (release, Take back, revocation) | TQ-11 (claim must end: Watchdog supervises only managed sessions) |
| 7 | Supervised | Watchdog down | Unsupervised (claims released) |
| 8 | Supervised | Fishball calls `watchdog_check_now` | Supervised ("unknown tool"; no run; timer unchanged) |
| 9 | Paused | `watchdog_resume` | Supervised (no run starts; next activation = next permission request or patrol) |
| 10 | Supervised | permission request | Supervised (judged at once, never delayed by the timer) |

### WD-ST-03 — A supervised session's brief (R-WD-15)
**Req:** R-WD-15, R-WD-03, R-WD-10 · **Level:** unit (fake clock, scripted model) · **Flags:** Q33

States: **Idle(Bk)** — supervised, no Watchdog run in progress, current brief Bk; **Running(Bk)** — a judgement or patrol in progress that started with Bk; **Paused(Bk)**. "Run" = a model call, side-session turn or patrol read.

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | (none) | supervision starts with `watchdog_brief(B0)` | Idle(B0) | no run starts (K: whether the start itself attaches a side session is T0's bounded start attachment, not a check) |
| 2 | Idle(B0) | `watchdog_refine(B1)` | Idle(B1) | returns at once; 0 runs; timer unchanged |
| 3 | Idle(B1) | `watchdog_refine(B2)` | Idle(B2) | same; latest wins |
| 4 | Idle(Bk) | permission request | Running(Bk) | the judgement uses Bk |
| 5 | Idle(Bk) | patrol timer fires | Running(Bk) | the patrol uses Bk |
| 6 | Running(B0) | `watchdog_refine(B1)` | Running(B0) + pending B1 | returns at once; the run is not restarted; no extra run |
| 7 | Running(B0) + pending B1 | run ends | Idle(B1) | the next activation uses B1 |
| 8 | Idle(Bk) | `watchdog_check_now` | Idle(Bk) | "unknown tool" |
| 9 | Idle(Bk) | `watchdog_pause`, stop ok | Paused(Bk) | session stopped first; 0 runs |
| 10 | Paused(Bk) | `watchdog_refine(B1)` | Paused(B1) (K: is refine allowed while paused?) | 0 runs |
| 11 | Paused(Bk) | `watchdog_resume` | Idle(Bk) | 0 runs at resume |
| 12 | Idle(Bk) | `watchdog_refine` with invalid input | Idle(Bk) | refused (K code); brief unchanged |
| 13 | Idle(Bk) | Watchdog down | (unsupervised) | the stored brief is kept or dropped: K; no run |
