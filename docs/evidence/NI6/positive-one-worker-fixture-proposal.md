# One-worker positive fixture proposal

SOURCE_ONLY_NOT_RUN. Genuine built preparation-r3 + official Web0.2.1-alpha.1; no rebuild: product unchanged. Precedent: NI2/physical-worker-checkpoint.md; APIs: normal-worker-contract.md/runtime-plugin owner operations. Partial BUB002/004/008/012/013 evidence only.

After approved fresh setup, original Loader.create with inject:['webServer']; retain credentials/config. Load dsh-fishball/testing-provider ({}) and an empty read-only/never preset. Authenticated owner /df-rpc/v1 flow: intake -> status -> prepareContext (current goal/constraints, no memory material) -> workerCatalog -> workerPolicyPreview -> workerPolicyConfirm(accept:true) -> workerPlan -> workerPreview -> workerGrant(accept:true) -> workerCreate -> workerExecute -> workerQuery -> workerCapture -> workerResult -> workerFinish. Carry actual references and fresh taskVersion/authEpoch; no fabricated authority.

Fresh owned synthetic profile/workspace, one ephemeral127.0.0.1:0 listener excluding3080; one task/worker/attempt/execution/provider request; turn1/step1. Select df-testing-local/df-testing-worker-v1/deterministic; request8192B, output128B/maxTokens128, runtime reservation1000ms, usage8320 synthetic byte units. Freeze outer deadline separately. Zero external inference/tools, memory writes, webhook/chat; cancelled UI namespace untouched.

Oracles: one fresh task; idle creation0streams; execution1stream; committed result matches deterministic input digest, usage and task/session/execution; exact returned text, not-reviewed/not-requested. No task-complete inference.

Cleanup: workerFinish; assert owned worker stopped, session absent, factual reservation disposition; Loader.remove once, raw fiber.await + Loader.await. Keep honest root restart/FAILED_HOLD. Missing: fresh setup consent, exact preset/carrier/profile, effective turn/step limits, root freeze, independent code/ISTQB reviews. No receipt/envelope internals or adversarial cases; final CODE gap HOLD.
