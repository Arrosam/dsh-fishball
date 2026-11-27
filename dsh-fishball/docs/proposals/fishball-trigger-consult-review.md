# Review decision: automatic Fishball actions and an optional consultant

**Status: proposal for review; not an amendment to the approved design.** The two parts can ship separately. Land low-risk, host-owned triggers first. Do not offer paid consultation on a target until that target can prove that an advice-only session stays constrained from its very first turn through disposal. No product implementation, evaluations with live models, or installations accompany this proposal.

| Read in this order | What to review |
|---|---|
| 1. [Tool inventory](fishball-tool-inventory.md) and [inherited DSH prompt map](dsh-manager-prompt-map.md) | What the manager actually gets at staging, who calls each tool, and what depends on the installed profile or connected target. |
| 2. [Trigger flow and scenarios](fishball-trigger-flow.md) | Which action a host can complete without inference, which decision a cue should put before the model, and which operations must stay on demand. |
| 3. [Replacement prompt and size comparison](fishball-prompt.md) | Full literal text for each supported configuration. No replacement of global DSH policy or other plugins' user-customized guides. |
| 4. [Claude advisor evidence](claude-advisor-evidence.md) | What the vendor documents; what we could not verify; why copying the full transcript is the wrong default for Fishball. |
| 5. [Consultant contract and package tests](fishball-consultant.md) | Two manager tools, discovery/settings, guarded start, exact-turn return, disposal, costs and failure states. |

### Decisions to carry forward

- Automate checking facts rather than asking a small model to remember to check. A verified user edit or committed state transition is a fact; “done” in a worker message is not. An ordinary chat message can trigger a cheap taskboard check **without** creating a task, marking one done, answering an approval, or calling a second model. No evidence of need: no wake, write or push.
- Separate the chat reply from the push. Direct questions and awaited outcomes need visible answers, ordinarily via `message_user`. An external notice requires an outstanding action for the human, a known relevant destination, and no duplicate; not every completion, failure or heartbeat qualifies.
- Keep board (historical, session-linked cards) separate from taskboard (user-editable task tree). Don't wire automatic writes to board on this staging combination: board expects API v1; core publishes v2. Do not relax the version check without migrating multi-target identity.
- Add **fishball-consultant** as an independent optional amenity, mountable through the umbrella, not a core dependency. Use one disposable, tool-less advisor session per stable task/topic. Choose the model explicitly in settings from the selected target's `models_list`, never a default. Unset means a configuration error, not a cheap fallback. This is advice to Fishball, not delegated execution, approval or a message to the user.
- Reuse connector session machinery **below** a guarded host-only interface; never start a normal session and attempt to restrict it afterward. A short approved brief discloses less than a transcript, but the consultant may lack decisive evidence. It must be able to say so. Reuse preserves context but also accumulates input cost and retention; bound both. No permission to send to a provider can be inferred from being able to read locally.

### Measuring improvement, not just tool use

1. **Deterministic first.** From the [flow probes](fishball-trigger-flow.md) and [consultant acceptance cases](fishball-consultant.md), have an independent test author create synthetic inputs and expected receipts from requirements alone, under the owning package. Fix time, source, target/epoch, capabilities, task revisions, pending requests and initial state. Replay duplicates, a failed/unknown commit, disabled plugins and recovery on restart. First run with a model that emits *no* calls: A effects still occur exactly once; B may offer a candidate but cannot commit it, C does nothing. A silent wake class stays silent. Run again with a bad decision: host guards still reject stale/unauthorized effects. Compare logs, state and actual visible output, not prose about what the model might do.
2. **Paired weak-model trial, opt-in only.** After approval, select one or two actual low-cost manager models from an available catalog; record exact provider/model/version, sampling, tool list, locale, context/window and budget. No default model choice in product. Run the same fresh fixture in counterbalanced order, e.g. five repeats per model per scenario. Compare (i) staging, (ii) shortened compatible prompt alone, (iii) host hooks + staging prompt, and (iv) hooks + full new prompt. For (ii) omit sentences requiring proposed capabilities; record the exact ablation. Keep synthetic terminal/heartbeat traces fixed. First use a recording connector and canned consultant answer; a separate, budgeted trial is required to judge real advice. Use the same intervention policy across arms or report the difference.
3. **Score desired and forbidden outcomes separately.** For each trigger count eligible cases, correct effects by the next eligible turn, false triggers on negative controls, wrong task/target, duplicate writes/pushes, missed awaited answers, authority violations, model turns and unneeded reads. For B, score host cue and subsequent correct decision independently (including correctly declining). For consultation, record unique sessions per subject, relevance/uncertainty of advice, improvement in final decision vs no consult under blinded review, exact invocation counts, cost if known, and response latency. Measure uncached/cached input, schema/context/notice overhead, output tokens and end-to-end p50/p95 where sample size supports them. Record denominators and paired wins/losses per model; do not interpret a handful of trials as a population guarantee.
4. **Suggested release gate.** All deterministic invariants pass; zero unauthorized grants/writes/disclosures, wrong-target sends, actionless pushes or duplicate paid calls in the suite. For each trigger report correct-action and correct-silence rates separately; accept a pilot only if missed eligible actions fall relative to staging without losing required visible answers or worsening false edits. Report token/latency trade-offs rather than trading safety for a higher call rate. If a model still ignores a cue, change the hook or reduce the task before lengthening the prompt. Neither the fixed-text reduction nor the Claude example is an evaluation result.

### Ordered implementation plan (after user approval)

Estimates are engineering **person-days**, including package-level tests and an independent review at each gate, not release dates. Host/connector changes require their owners' agreement. Stages 1–3 deliver value without a consultant; stage 4 is a stop/go gate, not a commitment that installed DSH already supports it.

| Stage | Deliverable / exit check | Estimate |
|---|---|---:|
| 1 | Record registry/assembly and two-target fixtures; define receipt keys and A/B/C expectations. Prove direct replies versus action-only pushes; baseline small-model traces. | 1–2 d |
| 2 | Wire cheap state checks, batched cues, revision-checked task writes, visible reply/notification guards, heartbeat/compaction restore and optional memory gating. Ship in small independent changes. Don't enable incompatible board; budget a separate 2–4 d migration only if wanted. | 4–7 d |
| 3 | Mount the shorter sections only with their capabilities, compare four trial arms, tune or roll back noisy cues independently. | 2–3 d |
| 4 | Spike host/connector guard: pre-publication fence, tool-less read-only preset, non-model-reachable operations, model pinning, exact-turn terminal receipts and authorized disposal. Demonstrate no inference or side effect on partial failure, direct GUI races or resume. Stop here on unsupported hosts. | 3–6 d |
| 5 | Implement guarded connector lifecycle and reconciled cleanup, independent consultant package, settings selector and subject store. Add optional umbrella entry, task lifecycle feed and batched result integration; no heartbeat consults. | 6–10 d |
| 6 | Run offline fault-injection matrix and opt-in end-to-end pilot; compare quality, spend and missed actions against no consultant. Keep feature disabled on unsupported profiles. | 2–4 d |

### Questions for review

1. Is a bounded brief in a dedicated neutral, read-only workspace sufficient? If project placement or direct reads are required, which target/provider and paths may receive what data, and how should the user authorize that scope?
2. Without a task ID, how should the user establish and end a topic? Should reopening a completed task create a distinctly identified new topic, or require an explicit decision before consulting again?
3. Does “discard” mean a reversible archive (lower recovery risk, retained transcript) or guaranteed erasure under a retention policy? What audit metadata may survive?
4. What hard limits should settings enforce per task/topic and per time period (questions, input/output, concurrent requests, cost)? What should happen when provider usage is unknown?
5. Should this phase include the optional board migration and scoped meow guide integration, or leave both at their existing compatibility boundaries?
