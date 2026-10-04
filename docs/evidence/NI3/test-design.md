# NI3 independent ISTQB test design

Status: **independent design frozen against the root-held NI3 candidate; documentation only, executable work NOT RUN and root implementation GO NOT GIVEN.** Exact contract SHA256: `9e806aaf1c224581d43ae54fffe6775e18d58400c20fcc42814b844859a1c012`. Independent owner: `normal_integrations_istqb`, separate from author `ledger_core` and the held final CODE session. Inspection starts at `d91d749a5dc00b0c89c431e26ec49e29e7cf8efb` on `feat/S3-integrations`; local main is `3b136e1ab264040b535c1e787b89f659328b30c4`. Root alone controls Git. This document does not authorize source/library/original-test changes, a host/provider/tool/browser run, credentials, external delivery or publication.

Read [AGENTS.md](../../../AGENTS.md), [latest owner continuation](../../owner-ni2-continuation-2026-10-04.md), [normal integration plan](../../normal-entry-integration-plan.md), [NI1 checkpoint](../NI1/checkpoint.md), [NI2 independent design](../NI2/test-design.md), [NI3 proposal](../../normal-runtime-audit-proposal.md), the actual store/worker/native/runtime modules and [NI3 candidate contract](../../normal-runtime-audit-contract.md). The blocked CODE experiment and unavailable browser observation must never be retried, substituted or rerouted through this lane. CODE, browser, model review quality, full ticket/MVP and publication acceptance remain **HOLD**.

## Scope and independent findings

This unit makes the required normal installed review/repair path concrete. NI2 supplies verified selected roles, original owned native sessions, request gates, explicit preview/grant and truthful finish/settlement. NI3 adds two distinct approved digests, full immutable review input, fresh bounded private reviewer identities, actual captured review authority, and atomic charged repair lineage. Idle creation, caller-written report text and product runtime audit do not satisfy development review.

Observed baseline limitations, not executed defects:

- `runtime-plugin.mjs` allocates one reviewer handle; `RuntimeStore.bindExecution` rejects rebinding that handle. A second task/round needs a fresh private handle, generation and separately owned session.
- `normalizedSpec`, `beginContextExecution`, WorkerManager and NativeAdapter bind native input to `action.dataDigest`. Review consent instead binds artifact/material; weakening that existing digest would approve the wrong bytes.
- `WorkerManager.dispatch` cannot accept/forward the existing atomic `auditRepair` claim field. Post-claim lineage registration cannot replace its transaction.
- Baseline `reportAudit` and `verifyArtifact` have private role/charge checks but no actual native-result association. New normal audit actions must refuse those result-free paths.
- NI2's initial one-active/one-total-attempt policy cannot silently expand for review. The owner must explicitly accept a CAS-bound expanded shared attempt/model policy; retaining one active unit requires producer capture, owned stop and settlement before review admission.

Challenge outcomes are concrete in the held candidate: the closed response keys/types are listed; RuntimeStore receives immutable constructor-only `auditExecutionBounds` and checks selected/core limits before prepare/capture commits; existing policy(owner) CAS is reused after explicit complete policy preview/confirmation; NI2 author agreed the shared `finishExecution` / normal `workerFinish` request. No unresolved NI3 design challenge remains. Root must hold this independent design before author GO; the NI2 author source hold, serial core ownership and source-owned review/repair provider extension remain required implementation dependencies. These are code contracts, not requests for owner production settings. Existing source AC and independent evidence remain untouched.

## Contract to hold

The candidate requires schema5 with closed signed `audit_input`/`audit_result` kinds and an explicit audit execution discriminator. Genuine schema4 migration must authenticate source graph/key/crypto2/signed receipts under the lock, create an exclusive fsynced `.schema-4.backup`, preserve old ciphertext/AAD/digests/grants/receipts/holds and transactionally validate target5. Migration cannot fabricate new input/result proof for historical actions; old schema4 refuses5 before mutation.

Normal review/repair requires `executionInput:{recordRef,digest,purpose,auditRef,bindingDigest,materialDigest,previousReportRef?}`. `dataDigest` remains artifact digest; `targetDigest` remains audit binding; complete action consent additionally includes exact input and lineage. Preparation is a derived encrypted operation and does not advance task/semantic revision. Every material byte and its provenance appears in the actual approved native input. Bounds reject the whole envelope without truncation.

The private native collector alone supplies `captureAuditResult` content/cursors/evidence. Only its signed result, current held review claim/private reviewer/native session and exact delivered coverage can drive `submitAuditResult`. Report and exact artifact verification commit atomically as distinct records. No owner RPC accepts result content, verdict/coverage/verification flags, reviewer handles, allowlists or authority-bearing closures. A report never grants an action.

The held closed response is `{contractVersion:'df.audit-response/v1',bindingDigest,materialDigest,inputDigest,verdict,coverageRefs,unexaminedRefs,findings}`. Verdict is passed/failed/unknown/budget_exhausted; digest/ref fields are lowercase64-hex. Coverage/unexamined arrays are each at most16 and partition exact delivered material. Findings are at most16 distinct `{findingRef,severity,code,evidenceRef,resolved}` with the existing closed severity/code enums and literal resolved boolean. Unknown keys/prose/markdown/schema repair cannot become a report.

Held normal resources retain units1/maxActive1/maxAttempts1 and require separately owner-confirmed maxTotalAttempts2..32; no activation raises policy. Review/repair charges are runtimeMs1..60000, usageUnits1..100000000, at least NI2 requestBytes plus selected maxOutputTokens, and within accepted shared policy. Output cap remains128..4096; audit result bound cannot exceed NI2 worker resultBytes. Selected input/result bounds are constructor-private, signed into their associations and rechecked under the locked operations/final consume. Existing ordinary/advanced meanings remain unchanged.

The current proposed `df-testing-worker-v1` plaintext output cannot satisfy a review JSON contract. A separately held source-owned original-adapter extension must advertise/execute `df-testing-review-v1` and `df-testing-repair-v1` with the actual delivered typed input; no Config response/verdict/permission selection is allowed. Its model availability, source-zero monetary/network facts and one-use lazy permit are derived only after real current registration. Those tests prove deterministic routing/coverage facts, not useful model review quality.

## Evidence levels and oracle rules

| Level | Oracle | Limit |
| --- | --- | --- |
| T | Detached closed config/action/response/installer modules and hostile-shape canaries | Cannot prove transaction, native ownership or actual output. |
| D | Real encrypted RuntimeStore/SQLite, separately opened connections and OS child processes | Exact durable projections, signed associations, CAS, charges and recovery; no native stream inferred. |
| N | Original pinned public native Loader/classes/AgentLoop/JSONL with source-owned deterministic LlmAdapter | Actual approved input, one request, committed output/session and owned stop; synthetic model semantics only. Requires later GO. |
| P | Root's physical npm package, bare installed entry and original CLI/profile/operator lifecycle | Normal product/package proof; no checkout link or advanced factory substitute. |
| U/M | Supported rendered UI and independently authorized useful model/review-quality observation | HOLD. Source/client fixtures cannot satisfy these gates. |

For every P0 refusal, compare before/after application rows, authenticated receipts, encrypted data/nonce/tag/metadata, actions, attempts, worker mappings, reservations, semantic/audit/result/repair records and current required gates. Observation time alone is fresh safe-integer metadata. For pre-open/migration preservation cases compare exact files and sidecar presence as well. Count actual native sessions/provider streams/tool bodies/recipients separately; no rejection may hide a new effect. Preserve all first failures, source snapshots, fixes and retests.

## Risk-based test families

Each family is **planned/not run**. Use equivalence partitions, boundary values, decision tables, state transitions and forced race orders. At each frozen integer/byte/count bound N test N−1/N/N+1, missing, wrong type, fraction, unsafe integer and nonfinite values where applicable. Expiry equality is expired; absence/uncertainty never becomes a negative-effect proof.

| ID / priority | Independent test and expected observation | Level |
| --- | --- | --- |
| N3-01 P1 closed installed choices | Omitted/exact disabled audit preserve NI1/NI2 and create no audit/session/report/policy. Enabled requires exact bounds, explicit severities/rounds and role selections/charges; rounds0 forbids repair, positive rounds require it. Reject extra/hidden/symbol/accessor/Proxy/inherited/nonplain/callback/identity/proof fields and mutable nested aliases before durable setup. Disabled configuration preserves an already required gate. | T/D/P |
| N3-02 P0 actual native provenance | Resolve original current role model/catalog/preset/environment/approval/tool/persistence facts through NI2. Wrong source/class/registration/config/lifetime fails before request; caller digests/labels do not prove readiness or pricing. Empty tools and original invocation veto survive late tool registration. Unrelated native sessions/services keep original behavior. | T/N/P |
| N3-03 P0 genuine source migration | Generate/hold a real schema4 fixture containing crypto2 data, full signed receipts, grants, memory/tombstones, unresolved claims and authentic audit history. Upgrade to5 changes only permitted schema/boundary facts; old ciphertext/digests/auth/versions/expiry/policies/held topology remain exact. Existing supported1/2/3 paths keep source-specific backups/legacy refusal. A version-edited synthetic5 database alone is not a genuine4 fixture. | D |
| N3-04 P0 migration refusals/crashes | Wrong key, signed metadata/ciphertext/nonce/tag/receipt/topology tamper, future/unsupported schema, WAL/SHM, backup collision, valid/invalid DELETE hot journal and storage faults preserve source/backup facts. Real exits before backup, after fsynced backup, during version/target transaction and before commit recover only authenticated supported state. Old schema4 opens5 fail before write. | D/P |
| N3-05 P0 exact derived input | Material includes artifact plus goal/constraints/evidence with CJK/astral/escaping canaries. Preparation includes canonical-sorted exact immutable entries and full policy/lineage; recompute UTF-8 digest/bytes independently. It advances no task/semantic version, duplicates one receipt without new data, and changed command conflicts. Selected/core byte or record/headroom overflow leaves no partial input/receipt and never drops required bytes. | T/D |
| N3-06 P0 actual input isolation | Insert foreign owner/workspace/task/session/generation and stale summary canaries. Inspect the deterministic provider's complete model-visible request and native input cursor: exact approved material appears with provenance; foreign/unlisted material and unrelated conversation history do not. Reviewer read/list/audit closures cannot read records outside derived allowlist. Registered secrets refuse; attacker prose cannot become an instruction/handle/tool permission. | D/N/P |
| N3-07 P0 two consent digests | Mutate one input byte/reference/purpose/audit/material/binding/previous report while artifact stays identical, and mutate artifact/material while input stays identical. Plan/preview/grant/claim/begin/consume all reject stale combinations. Full action digest covers input and original target/data/model/resource/permission facts. Ordinary context actions retain original behavior; an old advanced action cannot masquerade as normal typed audit. | T/D/N |
| N3-08 P0 one-active release sequence | With maxActive1, producer held reservation refuses review before native creation. Actual producer capture → owner-requested owned stop → factual settlement/release permits separately granted review. Review report/verification commit while its claim is held; owned stop/settlement then permits repair. Idle labels, missing output, unknown effect/stop/usage or outstanding message/delivery/handoff cannot release. Cut between stop, settlement and atomic release; task itself stays incomplete. | D/N/P |
| N3-09 P0 repeatable independence | Two tasks and repeated repair/re-review rounds use distinct opaque private handles, reviewer principals, charged claims, generations and actual native sessions. Reuse producer identity/generation/session, copied handles, stale closures, foreign task/audit or rebound handles refuses. Pool limit is exact; closing an owned generation seals it without losing its durable hold. Restart allocates no reviewer/session automatically. | T/D/N/P |
| N3-10 P0 one-use native execution | Idle dispatch creates0streams. One explicit approved audit input consumes one immutable intent and one NI2 provider permit. Duplicate command, concurrent consume, hidden extra step, title/compaction/retry, source/cursor substitution and captured old adapter yield0additional streams. Delay native readiness/request middleware to force revoke/policy/lifetime changes before actual iteration. No await may separate final durable consume and exact public send. | D/N/P |
| N3-11 P0 actual capture only | A committed assistant output must follow the exact input cursor in the separately owned native session. Idle/whenIdle, callback success, usage/finish-only output, wrong session/action/claim/generation/input digest, backward cursor, unsupported chunks, invalid UTF-8/oversize/secret data or caller-written native-result label cannot create accepted result authority. Identical private capture dedups; different bytes conflict without changing original result. | T/D/N |
| N3-12 P0 closed parsed result | Provider returns one actual held closed `df.audit-response/v1` JSON value. Wrong contract/echo digests/types/extra authority fields, markdown/prose or malformed JSON yields factual failed/unknown attempt and required gate, with no invented report pass. Accepted coverage and unexamined lists partition exactly delivered configured material; duplicates/overlap/omission/foreign records reject. | T/D/N |
| N3-13 P0 report and verifier authority | For new typed actions, direct reportAudit/verifyArtifact without actual signed result fails AUDIT_RESULT_REQUIRED. Actual fully covered current pass gives passed report plus accepted exact artifact verification in one transaction; fatal or configured blocking yields failed/rejected, even resolved:true. Unexamined/unknown/budget-exhausted yields unknown verification and prevents completion. Capacity fault between distinct report/verification associations rolls back both. Existing same-round failure cannot be overwritten. | D/N |
| N3-14 P0 freshness and late facts | Artifact version/digest, requirement revision, semantic goal/constraint/supplement, task/auth/control/expiry, policy, native mapping or lifetime changes at preparation/create/begin/consume/capture/submit. Early change denies new effect; late actual output may remain factual history but cannot certify newer requirements or cancel history. Required audit remains blocked after cancel/disable/reopen; no result modifies grant/policy. | D/N/P |
| N3-15 P0 atomic repair lineage | Mutate detached nested auditRepair during asynchronous prepare; original exact binding alone reaches claim. Wrong audit/prior report/evidence/round0/N+1, skipped round, already pending repair, plain dispatch to audit repair, exhausted attempts or missing grant leaves zero claim/attempt/lineage/native submission. Race already-open processes for same prior report and last reservation: at most one compound claim+repair record, both durable or neither. | T/D/N |
| N3-16 P0 shared review/repair budgets | Explicit accepted policy expansion CAS cannot race a different revision or silently raise maxActive. Review, re-review, failure and repair each count shared units/attempts/runtime/usage/cost. Test exact final slot and N±1 across tasks/rounds. Unknown pricing stays COST_UNKNOWN; synthetic source-proof zero monetary effects never means generic models free. Missing usage/outcome holds remain admission constraints. | D/N |
| N3-17 P0 fault/reopen chain | Real child exits after claim/before create, after publication/before mapping, after execution intent, after consume/before send, after stream result/before capture, after captured result/before submit and during compound report/verification. Reopen distinguishes committed/unknown facts, keeps original reservation/generation/input/result/lineage, and creates/sends/reports nothing automatically. Query never retries; known history replay does not confer current authority. | D/N/P |
| N3-18 P1 bounded privacy/diagnostics | Bounds on materials16, findings16, reports9, pool32/configured lower limit, rounds0..8, input/result65536/configured limit, commands/records/history and protected envelope are independently counted. Capacity refusal retains headroom for reconcile/stop; stable errors/feature/export/log/memory omit secrets/raw output/private handles/paths. Native plaintext transcript disclosure remains NI2's separate explicit consent. | T/D/N/P |
| N3-19 P0 disposal/reload/quit | Ten original owned reloads seal old owner/reviewer/collector/consume/request closures synchronously before awaits; old delayed callbacks cannot bind/report/verify/publish into replacement life. Dispose only owned native handles, flush original sessions and preserve unknown holds/key/vault/ledger. Disable/re-enable and full quit/restart create no new audit, grant, stream or automatic repair. | T/D/N/P |
| N3-20 P1 normal panel/bridge | Configure, prepare/plan, preview/grant, idle dispatch, execute, collect and finish are separate actions over literal authenticated `/df-rpc` envelopes. Wrong peer/role/scope/current CAS and stale/double-click response reject. Readiness derives services/current accepted policy; refresh/navigation never writes or wakes. Current required gate, coverage, unexamined, severe findings, repair count and holdings stay distinct from artifact verification/task completion. Rendered U assertions remain HOLD. | T/D/N/U |

## Individual source-AC contribution

All original82 AC and five DF010 criteria remain in [acceptance traceability](../../acceptance-traceability.md). These rows map NI3's contribution only; no entire AC is accepted. Provider-specific historical chat portions remain OUT OF THIS PHASE by owner amendment, while provider-neutral contracts stay retained.

| Retained AC | NI3 independent oracle / residual |
| --- | --- |
| BUB003-01 | N3-08/17 durable claim/input/result/settlement crash chain; full product fault acceptance HOLD. |
| BUB003-02 | N3-07/13/15 CAS, immutable report/verification and compound lineage; final CODE HOLD. |
| BUB003-03 | N3-04/13/17/18 storage refusal, stable diagnostics, no partial acknowledgement. |
| BUB003-04 | N3-03/04 genuine4→5 backup, old-reader refusal, target fault/recovery and preservation. |
| BUB004-01 | N3-08/10/11 actual idle/input/output/stopped/unknown facts; real model quality HOLD. |
| BUB004-02 | N3-09/17 late exact session mapping, retained unknown claim, no duplicate create. |
| BUB004-03 | N3-06/10/11 actual original native bounded review work; initial NI3 fresh sessions, existing-session/resume acceptance retained in NI2. |
| BUB004-04 | N3-08/14 cancellation keeps actual output/effects and holds; no instantaneous undo claim. |
| BUB004-05 | N3-11/17/19 current source/cursor/generation reconciliation; no old-event replay. |
| BUB006-01 | N3-02/06/09/20 private role/native peer/current scoped identity. |
| BUB006-02 | N3-07/10/14/15 complete approval digest and current revoke/expiry/policy/CAS. |
| BUB006-03 | N3-05/11/18 synthetic secret refusal, encrypted ledger and redacted diagnostics. |
| BUB006-04 | N3-06/07 actual delivered native review material equals approved necessary scope; external sends absent. |
| BUB006-05 | N3-02/13/14 authority unknown/denied stops work; reviewer cannot grant. |
| BUB008-01 | N3-05/06/14 current full goal/constraint/material after task/round/restart. |
| BUB008-02 | N3-05/07/14 source/semantic provenance and stale input refusal. |
| BUB008-03 | N3-05/18 full serialized UTF-8 envelope limits; exact real-provider token ceiling remains HOLD. |
| BUB008-04 | N3-06 actual provider request isolation plus private read allowlist. |
| BUB008-05 | N3-13/14/20 fresh ledger gate/policy, visible observed-time snapshot, no stale completion. |
| BUB012-01 | N3-08/09/15/16 one-active pool/shared final-slot races and held uncertainty. |
| BUB012-02 | N3-02/07/16 actual selected role facts; no silent fallback/production preference assumed. |
| BUB012-03 | N3-08/15/16 every review/failure/repair charged to shared limits. |
| BUB012-04 | N3-08/16 actual/estimated/unknown usage/cost separate; real measured pricing HOLD. |
| BUB012-05 | N3-05/09/18 exact bounded input/result/material/handle/history growth. |
| BUB013-01 | N3-11/12/20 native result provenance and coverage/not-run limits; complete local report composition additionally NI5. |
| BUB013-02 | N3-07/13/14 exact artifact/version/digest review+verification; actual recipient opening additionally NI5/HOLD. |
| BUB013-03 | Review outcome/verification retained; per-item publication/delivery/retry belongs to NI5, no NI3 delivery PASS. |
| BUB013-04 | Failure/blocker/round state observable; notification quiet/coalescing/frequency belongs to NI5. |
| BUB013-05 | N3-08/17 preserve unknown effect ownership; result transport query/retry additionally NI5. |
| BUB014-01 | N3-20 current gate/version/hold snapshots; actual rendered state HOLD. |
| BUB014-02 | N3-08/20 separate state-specific explicit controls and concrete grants. |
| BUB014-03 | N3-10/15/20 duplicate/stale/CAS/race prevents second action. |
| BUB014-04 | U/rendered resizing/Chinese/keyboard/focus/loading/error remains HOLD; no substitute. |
| BUB014-05 | N3-09/20 exact related reviewer/session/material mappings; real navigation HOLD. |
| BUB015-01 | N3-05/06/11/12 actual full material, scope isolation, exact coverage/unexamined partition. |
| BUB015-02 | N3-09/13 separate private producer/reviewer/native session/claim; independent development CODE remains blocked. |
| BUB015-03 | N3-11/12/13/14 pending/failure/unknown/budget/fatal/stale gate cannot complete. |
| BUB015-04 | N3-08/15/16 explicit bounded rounds, atomic previous-report lineage, shared charge and owner escalation. |
| BUB015-05 | N3-06/12/13/14 hostile material/output never changes approval or expands scope. |
| BUB001-02 | N3-19 ten reloads, no new orphan reviewer/session/registration. |
| BUB001-04 | N3-17/19 owned full-stop and same-ledger recovery; window/browser observation HOLD. |
| BUB016-01 | Exact design/source/test/evidence manifests and each row disposition; all82+5 retained. |
| BUB016-02 | N/P bounded synthetic native chain; useful model/full product chain HOLD, live chat OUT. |
| BUB016-03 | N3-03/04/14/17/19 bounded migration/revoke/restart/quit/limits; aggregate NI6 still required. |
| BUB016-04 | P exact physical package/public peer/source proof; final reproducibility/acceptance NI6. |

## Inspection pins and later hold procedure

These are inspected baseline bytes, not final implementation pins. Approved Chinese source SHA256 is `cf38310f93b9a7bd96efaca8ab53e1d71c16e86d6810513807c4b56ed33d1ca3`; owner amendment is `92f1b4b2cae959e88e6e35a351c253e186ef4b3567f2f048cd60fc7017b8a89e`. Candidate contract at initial inspection was `762d07b3c8d1c7e52229cf84bbf83b60d6efd97b3a9530142976d9fd13063cb7`; the separately read/root-held final design candidate is `9e806aaf1c224581d43ae54fffe6775e18d58400c20fcc42814b844859a1c012`. Its documented resolved challenges supersede the proposal, while the initial observation remains intact. Any later contract change requires explicit design reassessment and a new hold before author GO.

| Source | SHA256 at inspection |
| --- | --- |
| src/audit.mjs | a1f6bff346c7897d4cf5c7cffa2b8f12e1fee5d69cd2a6fc78c4c4d843475beb |
| src/runtime-store.mjs | 63dbc100d4dfa4fa42db31003c84a7925de025dd66af08f5bae589a4e8e7e850 |
| src/runtime-security.mjs | 6edf9f8a544444169f9190fc5e24230ab3a0928ea8d7c295f1b085824c91ac07 |
| src/ledger.mjs | 64cc42e1a834701263c260f311d05d113c6e34af67017901cfd7a95f22c9b650 |
| src/worker.mjs | e1b42124b08267e65ecd4d46bcbcb7c2c0d39ef563016ffda167bedb66cffd04 |
| src/native-adapter.mjs | 19adc5ec11954299fa7469b1157f95d27dae2bab66efb2c91506749f46ba2cd5 |
| src/runtime-plugin.mjs | a80aee8e12b0e98fb7723f041957db0d3574ba96309d275338af8012b128de40 |
| src/operator-bridge.mjs | 968daa6bd54af89ae554acb21560c75a0cf98cd8eb046a26944733b24c7b2e96 |

After root contract/design GO and an author implementation hold, the assigned independent new test file is `test/installed-audit-adversarial.test.mjs`. Hold its first source and full product/test/public-peer manifests before running; root supplies the installed Node22.22.2 path and exact physical/native recipe. Use focused Node test commands for the new file plus affected audit/worker/store/automation suites; no original assertions are removed or rewritten. Broaden only for changed code/failure concerns. Real-process migration/race fixtures remain distinct from native provider fixtures. Keep first TAP, actual first failure, corrected sources, remediation rationale, retest TAP, environment/runtime/source pins and before/after row/byte/native counters separately. Root holds the final executable/package tree and performs authorized P proof. This design pass runs no executable test and marks no AC PASS.
