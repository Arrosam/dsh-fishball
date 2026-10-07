# UI worker reconnect owner lifecycle — independent SOURCE review

Date: 2026-10-07 UTC. Independent Sol 6.1 max source auditor, separate from root executor and helper author.

Disposition: **Historical accepted-with-boundaries SOURCE review; current plan HOLD because a live public config pin failed.** No concrete source blocker was identified in the exact operator and once-only plan. Root subsequently reported one failed prepare invocation. The failed guard is correct fail-closed behavior; this review does not waive it or authorize retry, stop, activation or launch.

Reviewed operator:12154B SHA256 `341d46438f823c3d903f81305c091d081ecb9774ff998b1e5300102cd09ff141`. Reviewed plan:4706B SHA256 `5b904460897b5e16873b4af5d0acdd565dde7a482381effa1150827e00680bca`. Their full source/plan were read. The reviewer did not parse, import or execute the operator or application JavaScript, run process/listener/lifecycle commands, or inspect private files.

## Scope, ownership and private bindings

The three explicit phases are prepare, stop and activate, each limited to one root invocation. The operator accepts only one exact phase argument, refuses optimized Python, sets umask077 and uses explicit require/raise guards. The plan calls Python -E and separately names the exact Node successor helper for a later root start.

Preflight pins the r3 helper manifest/closure, completed composite55fc archive/424c manifest, original public launcher, lifecycle templates and public source/config inputs. The two1114-file inventories must match original and staged byte pins, have canonical roots and no links/special files, and share a filesystem. Four templates copy into a fresh0700 service directory; fresh0700 evidence receives exclusive0600 metadata results. Prepare has no signal, package rename, CLI, browser or model action.

Private auth/DB/key/state are never opened, copied, hashed or interpreted. bindings uses lstat and canonical owner/mode/type checks only. Its namespace `runtime.sqlite.df-setup`, key.bin and state.json follow the original public setup-state.mjs declarations at lines75–76. preserve binds device/inode/uid/mode; auth/key/state size/mtime also remain bound, while normal DB size/mtime changes are permitted. Generated public cordis.yml is separately pinned223B/c300; optional home patch, legacy .dsh-module-fallback, generation outputs and layered .env must be absent. Environment handling checks flag names without exporting secrets. No backend/task/worker mutation is requested.

## Stop and reversible activation

Fresh lsof metadata must show the singleton node91027 listener at127.0.0.1:3080, parent91018 and same user, plus the wrapper's expected Node executable and repository cwd. These are future operator checks; this reviewer performed none.

Stop sends exactly one PID-directed SIGINT to parent91018. It never signals the child with a terminating signal, a process group or a PTY, and contains no force/retry path. Signal0 only observes child91027. Within the10-second observation loop, a free port and gone child are both required before ORIGINAL_STOP_CONFIRMED. An ordinary unconfirmed result records HOLD and raises; any exception also stays HOLD under the plan. An absent result after an exception is not evidence that a signal was unconsumed. The once-only/no-retry bound belongs to the root plan; result files are post-effect evidence, not a durable general execution latch.

Activate requires confirmed stop, freshly free port, preserved metadata and both exact inventories. It moves original ACTIVE to the unused retained-a58-package path, then moves STAGED to ACTIVE on the same filesystem. If the second rename raises OSError, it attempts only the direct inverse first rename, records restoration only after that succeeds and raises without starting a CLI. That directory restoration is the explicitly planned reversible update, not a denied-CLI alternate or automatic launch rollback. If restoration or any postcondition fails, the result is HOLD with no automatic continuation. After successful renames, both1114 inventories and metadata are rechecked; the original package remains retained and no service has yet started.

## Helper handoff and truthful limits

The three helper source files were read only to check this handoff. The copied successor/rollback lifecycle and overlay paths, generations r2-successor-1/r2-rollback-1, active package location and fixed Node/original CLI path agree with the launcher. It checks the full active1114-file inventory and exact client4ba377f9/lib9ba97b83 identity. Its shared stop latch and pre-spawn guard are retained. No historical host graph review was repeated.

The generated public root prerequisite/write accounting remains the r3 helper contract: original CLI rewrites it once per successful start, operator setting writes0, exact223B/c300 post-start expected. Readiness metadata is authentication/bootstrap evidence only. The root plan separately binds actual emitted wrapper/CLI PIDs, singleton listener, startup-audit generation and canonical package/private metadata. Conditional rollback requires fresh ownership and the exact reviewed helper; an actual policy denial permits no alternate or automatic rollback execution.

Mac LOCKED leaves browser handoff, corrected client load, frontend connection, native worker connected and enabled controls all HOLD. Owner task4da34a6d cancellation_requestedV2/authEpoch1 is not reused for execution. All87 accepted0/HOLD and the permanently blocked final CODE investigation remain unchanged.

## Reported prepare failure and current disposition

After source review began, root reported one `python3 -E ...owner-operation.py prepare` attempt failing PUBLIC_PIN_SIZE_CHANGED during preflight. The live synthetic PUBLIC `home/profiles/web/cordis.patch.yml` is6091B; both frozen lifecycle templates require5809B, SHA256 `eaa33ba83cad740d0b0aa94d5fbc86918ecfbf76c609709d1f4cfdcf0f76da43`. Root also reported a hash mismatch; no new live hash was supplied or independently measured by this lane.

Root reported service/evidence directories still absent, no copies/signals/renames/CLI starts, and original session36229 alive. The source ordering supports the lack of operation outputs: public_preflight precedes all phase writes/effects, and the size check raises before opening that config body for hashing. These runtime observations are root-attributed, not reviewer-executed proof.

The original frozen operator/plan are now historical. Current execution stays HOLD at the public config prerequisite. Do not weaken the guard, reuse the failed once-only phase or infer that the drift is harmless. Root owns a narrowly reviewed resolution of the actual public configuration before any successor operation.

Evidence-only byte/JSON metadata checks matched the two reviewed files, r3 manifest/closure and20 public closure pins, four template handoffs and both1114-row declarations. No actual private metadata, process state or live config contents were read by this reviewer. Only new independent evidence and temporary metadata were written.

