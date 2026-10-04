# NI3 contract author notes

Status: docs/API-analysis checkpoint only. Author: existing `ledger_core` coding lane, English, Sol6.1/high. Root authorized writing the [candidate contract](../../normal-runtime-audit-contract.md) from the committed [read-only proposal](../../normal-runtime-audit-proposal.md), at root-reported baseline `d91d749`. No implementation/design GO, independent CODE verdict, acceptance or release is asserted.

## Work performed and boundary

Read repository instructions, normal integration/owner continuation, NI2/NI3 proposals, source BUB015 AC, runtime API and actual installed config/runtime plugin/store/security/ledger/worker/native/audit sources. Coordinated privately with `onboarding_ui` (NI2 composer/config/lifecycle) and `prep_messages_results` (NI5 artifact verification/delivery separation). Only the two NI3 Markdown artifacts were written. No source, test, lib, ticket, vault, host, profile or Git mutation was performed. No tests, host/browser/HTTP launch, inference, model stream, tool body, external action, install, credential/personal-data read or blocked review retry was run.

The source inspection establishes API gaps; it does not execute them or replace a CODE review. Independent CODE remains blocked by the recorded platform/session failure and must not be retried/rerouted. Independent test design, root contract freeze, later implementation/fault/module/physical-package oracles remain pending.

## Source-backed implementation seams

| Observed source | Fact and required NI3 change |
| --- | --- |
| `src/runtime-plugin.mjs` reviewerInstaller | Allocates one private reviewer handle. Store binding rejects reuse; replace normal installation with fresh bounded per-claim/task/generation closures, never owner/model handle export. |
| `src/runtime-store.mjs` bindExecution/readData | Private handle determines role/scope/generation/material allowlist. Typed bindAuditReviewer derives exact reads from the claimed audit rather than accepting a supplied allowlist. |
| `src/runtime-security.mjs` normalizedSpec | Closed spec has no executionInput. Schema5 adds its complete normalized consent binding while retaining old artifact dataDigest and audit targetDigest. |
| `src/runtime-store.mjs` beginContextExecution/assertExecutionCurrent | Context digest currently must equal action dataDigest; final consume is already one-use/atomic. Add typed audit branch/input association without loosening ordinary context validation. |
| `src/worker.mjs` dispatch | Async preparation followed by atomic claim/submitted intent exists, but auditRepair is not an accepted/forwarded field. Capture its nested binding before await and forward unchanged into the existing compound claim. |
| `src/audit.mjs` claimRepair; store repair helpers | The atomic charged repair lineage/max-round primitive already exists. Post-claim recordRepair is not the normal dispatch substitute. |
| `src/native-adapter.mjs` executeContext/readResult | Actual owned committed assistant response and cursor are available; current input comparison uses context=dataDigest. Add separate original material/input digests and a private exact result association, not an idle-created report. |
| store configureAudit/reportAudit/auditGate | Current requirement includes material/artifact/semantic binding and bounded reports/repair; report can currently be submitted without native execution proof. New normal actions require captured result proof; old advanced actions retain explicit compatibility. |
| store verifyArtifact; ResultPipeline | Artifact verification is distinct from report/gate, and delivery requires accepted exact current verification. Normal captured audit result must bind both records; neither implies settlement, termination, delivered truth or release. |
| worker close; store settleAction | Full manager close seals all admission; execute/capture do not release. Shared per-execution finish lifecycle is required for the NI2 one-active producer→review→repair sequence. No reservation expansion or payload proof substitutes for known output/effects and actual owned stop. |
| `src/ledger.mjs` schema4 migration | Existing encrypted/signed tables suffice physically, but new persisted consent/result semantics require schema5 plus genuine4→5 source validation/backup. Retain crypto2 AAD, old action/grant/receipt and held/recovery semantics byte-for-byte. |
| `src/installed-config.mjs` | Current installed normal keys include memory but no audit. The contract's disabled-default audit choice is proposed, not current validation or readiness. |

## Inspected source hashes

These are source-inspection hashes, not a new executable freeze or passed-test manifest. NI2 concurrent work may later change its owned files; root must freeze the actual implementation tree separately.

```text
64cc42e1a834701263c260f311d05d113c6e34af67017901cfd7a95f22c9b650  src/ledger.mjs
6edf9f8a544444169f9190fc5e24230ab3a0928ea8d7c295f1b085824c91ac07  src/runtime-security.mjs
63dbc100d4dfa4fa42db31003c84a7925de025dd66af08f5bae589a4e8e7e850  src/runtime-store.mjs
e1b42124b08267e65ecd4d46bcbcb7c2c0d39ef563016ffda167bedb66cffd04  src/worker.mjs
19adc5ec11954299fa7469b1157f95d27dae2bab66efb2c91506749f46ba2cd5  src/native-adapter.mjs
a80aee8e12b0e98fb7723f041957db0d3574ba96309d275338af8012b128de40  src/runtime-plugin.mjs
a1f6bff346c7897d4cf5c7cffa2b8f12e1fee5d69cd2a6fc78c4c4d843475beb  src/audit.mjs
85e40efd59e65adcf9e37647dd63cc135aafb35de045c648337d482c1ab7e7b2  src/installed-config.mjs
e3bde1317c4750151eabee434da935a08b269dbe348496c243f3e2dac7310bdd  docs/normal-runtime-audit-proposal.md
7756af71dfa9d7edbb791b7915d78c4500557ab54ed1f9348124c3ea5ed5878b  docs/normal-worker-proposal.md
```

## Coordinated decisions and open dependencies

NI2 supplied candidate native selection `{provider,model,agentPreset,reasoningEffort,maxOutputTokens}`; reasoning is null or advertised, initial max output128..4096. Its shared reservation shape is `{runtimeMs,usageUnits}`; initial units1/maxActive1/maxAttempts1/maxTotalAttempts1. Published NI2 charges are runtime1..60000/usage1..100000000 with actual request-byte+output reservation floor, and normal policy routes are workerPolicyPreview/workerPolicyConfirm. NI3 reuses those selectors/charges and the verified environment/persistence, fixed empty-tools/fixed-prompt scope and late provider-request gate. Explicit selected maxTotalAttempts2..32 is proposed for NI3 and needs separately accepted shared-policy CAS; no boot overwrite or free review exists. No inferred Codex model mapping or provider price is introduced. The source-owned deterministic provider must produce actual native reviewer JSON in a distinct session; generic pricing remains unknown.

Concrete provider dependency: NI2's fixed plaintext df-testing-worker-v1 cannot produce a structured audit response. NI3 contract proposes source-owned review/repair models under the same active native adapter and private gates, requiring root allocation and separate frozen source behavior before implementation. Existing provider availability is not claimed. Mandatory protected execution-context origin must be established from NI2 composer's private current-lifetime receipt of actual ContextAssembler/MemoryAdapter preparation plus authenticated command/data/currentness checks; a context label is insufficient. New preparation is required after loss of that private origin receipt; no old metadata is retroactively sealed as proof. Signed audit_input retains its accepted original association without recreating execution ownership after restart.

Root requested preservation of NI2 one-active reservations. Contract specifies captured producer facts and actual owned stop plus trusted known-effect settlement before review; report/verification before reviewer settlement; release before repair. NI2 author agreed the exact finishExecution request and normal workerFinish wrapper; it belongs to shared NI2 lifecycle and is a prerequisite, not implemented capability. Unknown obligations block the next claim without autonomous orphan removal or instant-cancel promises.

NI5 author identified the exact accepted artifact verification requirement. Contract keeps report and artifact verification separately bound to the actual captured native result and commits them atomically. Product report parsing is not an independent development reviewer verdict or semantic-quality proof.

Independent NI3 design requested exact response keys and byte-limit authority. Contract now provides the closed df.audit-response/v1 schema and constructor-only immutable auditExecutionBounds, enforced with existing maxDataBytes inside original transactions before content/receipt commits. No payload-selected limit or callback authority is introduced. Signed input/result associations retain selected bounds; recomposition seals old private lifetime.

Root must reconcile/freeze NI2 prepared-policy route names with the proposed closed audit config, selected total-attempt expansion, schema5/migration, result parser/association, private reviewer factory and per-execution lifecycle. Every enabled normal audit choice is explicit; no two-round/default model/cost/capacity policy is silently selected. Owner selects roles/resources/thresholds/bounds; product derives current catalog, permission, session, receipt and readiness facts. Test oracles in the contract remain not-run, including the physical installed package.

Author deliverables: `docs/normal-runtime-audit-contract.md` and this file. Final root design GO and independent test design must precede executable changes. Final CODE/browser/model-quality/full-AC/MVP/publication acceptance remains HOLD.
