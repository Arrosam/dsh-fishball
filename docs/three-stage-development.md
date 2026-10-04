# Three development stages and final regression

The owner explicitly approved continuing development and running consolidated regression after all three stages: `同意，三阶段都做完再统一回归测试`, parent-relayed source Sentinel_b2fbb3408104819193e3b8e3bee5904b, 2026-10-04 08:46UTC. This supersedes the prior W1 browser hold as a prerequisite for further development. It does **not** make any blocked test pass, remove scope, authorize inference/accounts/publication or waive independent ticket reviews.

The approved source already defines three development waves at [lines56–64](reference/approved-ticket-review.zh.txt). Local W1–W6 remain implementation milestones within that three-stage plan:

| Development stage | Existing milestones | All retained scope |
| --- | --- | --- |
| Stage1: foundation and prerequisite research | W1/M1; the BUB007A prerequisite formerly grouped under W3/M3; BUB010A research after adapter contracts | BUB001/003/006 bounded foundation and minimum012; BUB007A pinned memory extraction/portability/license evidence in parallel; BUB010A selected-provider research when a provider is chosen. Unfinished full001/003/006 AC carry into integration and final regression. |
| Stage2: coordinator and controlled worker loop | W2/M2 | BUB002 main intake/interruptions,004 lifecycle,005 scoped communication,008 current-task/context continuity,011 environments/handoff,012 full admission/model/budget controls; local013 result and014 control contract support the vertical slice. |
| Stage3: complete assistant experience | W3/M3 memory adapter, W4/M4 events/chat, W5/M5 results/UI/runtime audit | BUB007B after007A; complete008 memory integration;009 schedules/webhooks;010/010A chosen channel;013 artifacts/progress/recipient delivery;014 actual native UI;015 runtime independent review/repair. Complete remaining002/005/006/011/012 integration AC. |
| Final consolidated acceptance, after three development stages | W6/M6; BUB016 evidence is collected throughout | Every original001–016 AC, including007A/B and010A; combined functional/fault/migration/quit/restart/identity/resource/provider/UI/visual regression, licenses, packaging and owner acceptance. No full MVP or publication claim until this gate passes. |

This reconciles existing milestone granularity with the approved three-stage sequence. It does not create a smaller MVP. W3 memory extraction can proceed alongside Stage2 if not already complete; moving readiness work in time does not erase its criteria. Blocked provider/license portions remain explicit and do not stop unrelated implementation.

## Development checks versus acceptance debt

- Every ticket retains its source AC unchanged. Authors run unit/module tests and bounded integration tests appropriate to changed code. Separate Sol6.1 max code and ISTQB reviewers review the exact final unit, findings are fixed and changed code is retested before local development integration.
- Full cross-stage functional and visual regression is consolidated after Stage3. Native API provenance/capability checks and safe mock-backed native fixtures may run during implementation; they cannot establish real provider/inference/visual acceptance.
- The [acceptance debt register](evidence/acceptance-debt.md) retains W1 unverified browser rendering/control/window-close cases and later not-run native/provider/UI cases. Status is deferred or blocked, never passed by the scheduling change.
- Reviewed logical units may squash into local main as **development integrations** while this debt remains. Preserve feature/preparation branches and exact reviewed objects. Local main is not an acceptance, release or stable designation.
- No unapproved paid/external-agent inference, credential/access expansion, unchosen provider setup, fishball personal-data access, dsh-std, daemon, remote repository, push or publication. Pin official DSH Web0.2.1-alpha.1 for this wave; evaluate later upgrades explicitly.

## Current starting state and parallel implementation split

Verified at08:47UTC: clean `prep/W2-contracts` tip `7d1ef59`; `feat/M1-foundation` tip `a4310d6`; main `abb28b7`; no remotes. Reviewed executable W1 unit is `1072381`; reviewed W2 candidate artifacts are frozen at `51f36a5` with `prep/w2` tree `cf520f5153ad9fbae7eaee2728b3c658436b32cb`. Review/evidence additions did not change those artifacts.

Root first commits this authorization/mapping and integrates the already-reviewed foundation/preparation into main locally. Subsequent Stage2 development uses a new retained feature branch. Root owns shared interfaces, integration/native facades, Git and evidence. Parallel nonconflicting owners:

| Owner | Tickets and work | Ownership boundary |
| --- | --- | --- |
| `ledger_core` | BUB003/006 extension and012: authoritative runtime/data-plane storage, migration, scoped command/approval/claim/control/resource accounting | Core ledger/foundation/runtime-store files and dedicated tests; sole storage-schema author. Publish module API before lane implementation depends on it. |
| `prep_coordinator` | BUB002/008: intake, revisions, clarification, interruption and source-bound context | New coordinator/context modules and dedicated tests; consumes frozen runtime API. |
| `host_bootstrap` | BUB004/011: real public native capability mapping, worker creation/resume/query/cancel/environment/handoff adapters | New worker/native-adapter modules and dedicated tests; no live inference or current-host upgrade. |
| `prep_messages_results` | BUB005 and local013/014: broker, artifacts/progress/result/control domain | New messaging/results/control modules and dedicated tests; no actual UI/provider acceptance claim. |
| `code_audit` | Independent code/root-cause audit, every touched ticket and root integration | Evidence only; no author code/Git. Sol6.1 max. |
| `istqb_review` | Independent risk/AC/test design and final test review | Dedicated adversarial tests/evidence; no author code/Git. Sol6.1 max. |

All prompts remain English; authors Sol6.1 high or above, visual reviewer xhigh when supported tools are available, no Astra. Native identity/operator/model permission boundaries stay fail-closed until supported adapters are verified. An isolated synthetic fixture is not an authorization bridge for user-controlled payloads.

Pending provider, fishball redistribution/main license and product policy questions are bundled; no answer or silence grants authority. Continue reversible unrelated work and record exact blocked portions.
