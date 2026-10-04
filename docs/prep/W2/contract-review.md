# W2 preparation independent contract/code audit

## Reviewer, authorization and status

- Reviewer: `/root/code_audit`, independent of root/shared-verifier and all four lane authors; requested Sol6.1 max audit reasoning.
- Owned artifact: this report only. No source, W1 test/script/package, ticket, author artifact, host/profile, Git or remote mutation; no installation, inference or browser action.
- Scope: authorized reversible candidate-contract/schema/mock preparation on `prep/W2-contracts`. This is not W2 production implementation, native capability evidence, source-ticket acceptance or a main merge.
- W1 remains browser **HOLD**. The production prerequisite and original ticket AC remain authoritative.
- Final verdict: **PREPARATION PASS** for the exact frozen unit below. All six findings are closed after independent retest. There is no remaining contradictory contract requirement or failing structural assertion in this reviewed unit. This accepts only preparation artifacts; W1 remains **HOLD**, and W2 production/runtime/native/UI/ticket acceptance remains **NOT ASSESSED**.
- Preparation branch baseline: W1 evidence commit `a4310d6f672cccd68d26d4c1025ce0b0b87647f4`. Independent read-only Git comparison confirms no change to production, W1 source/tests/scripts/package/evidence, AGENTS/workflow, foundation contract, decision register, waves, milestones or original ticket AC. `main` remains `abb28b7e3962fa46c492b077c6cce5a8613a843b`; `feat/M1-foundation` remains `a4310d6f672cccd68d26d4c1025ce0b0b87647f4`.

## Exact reviewed artifact snapshot

| Object | Git identity |
| --- | --- |
| Preparation commit | `51f36a5997d96be71d54c57e0644ea29a3bb21e8` |
| `prep/w2` tree | `cf520f5153ad9fbae7eaee2728b3c658436b32cb` |
| Schemas tree | `fb4174057070bce9ae791cbbe07087233c08f3d1` |
| Fixtures tree | `3931537af01f3f694169837f64a73daf44e865b4` |
| Verifier blob | `e631590dd7d3e61b375c1488574f426837cdc4f1` |
| Test-design blob | `d503ad24b4b76ff1148d3960179e0aba5a5cb366` |
| Frozen `docs/prep/W2` tree, excluding later review/evidence files | `1b2be6528ab954566c943acab5a0402abb2faba2` |

These identities matched the supplied freeze independently before the final probes. The working schemas/fixtures/verifier and frozen lane/shared/test-design documents matched that commit. This report is a later review artifact, not part of the frozen tree it evaluates.

## Requirements and early inspection

Read `AGENTS.md`, `docs/development-workflow.md`, `docs/waves.md`, `docs/decisions.md`, `docs/foundation-contract.md`, the preparation README/shared vocabulary/common schema, and source cards BUB002/004/005/008/011/012/013/014. Current W1 trust/storage code and prior exact-tree audit are context, not rerun or newly accepted here.

The root shared unit preserves the correct separation between structural validity and runtime truth. Scope refs are equality keys derived/checked against trusted caller context; mutation bindings describe expected task and authority versions rather than overwriting newer facts. A command ref alone is not content idempotency. Worker generation differs from a reused session ref. Worker/cancel/message/artifact/delivery axes stay distinct, unknown outcomes retain accountable capacity, and action settlement does not complete a task. Structured goals/context/messages/artifacts require a separately reviewed bounded scoped data plane instead of expanding W1 reference metadata implicitly.

The candidate schema's future `ledger_snapshot` and `native_observation` labels do not establish their provenance. Positive mock examples must remain mock evidence; final schema/fixture verification must not count serialized labels as actual host or ledger observations. Native model catalog mappings, optional cancellation/query/close capabilities, time/cost sources, retention and UI/recipient integration remain unverified decisions/gates, not silent defaults.

## Cross-lane review oracles

| Boundary | Required candidate behavior and later runtime oracle |
| --- | --- |
| Caller/scope | The immutable trusted adapter authenticates owner/workspace/task and session incarnation. Matching serialized refs/roles never authenticate. Explicit mapping to W1 raw-ID inputs is required; hashed refs cannot be passed as raw IDs and silently hashed again. |
| Control/idempotency | Current task/auth CAS, complete immutable command/action specification, target/data digests and budgets bind one future atomic claim. Same scoped command with changed content is a conflict. Unknown prior claims cannot be made new by changing an ID/version. |
| Creation/recovery/cancel | Creation timeout, missing receipt, stream disconnect and cancel request do not prove absence/termination. Reconcile actual scoped generation/environment/capabilities and earlier effects; hold capacity until trusted release evidence. No blind recreate/resume/replay or generation inheritance. |
| Context/data plane | Current instructions and authoritative facts outrank stale summaries. Source/version/time, minimal scope, constrained model input and conflict handling are explicit. Prose/artifacts need bounded scoped storage, retention/digests and secret handling outside W1 reference-only tables. |
| Resources | Worker, reviewer, repair, failed retries and uncertain work count against shared admission/runtime/usage budgets. Unknown/estimated usage is not actual billing. Timeout or deadline cannot free an unconfirmed live worker; model unavailability cannot silently lower the owner's preference. |
| Messaging/results | Durable accepted/outbox/sent/consumed and delivery states remain separate. Sender/recipient incarnation, original source/purpose, current grant and bounded routing are checked; unknown consumption is reconciled before resend. Independent verification and delivery bind immutable artifact/version/digest and actual recipient access. |
| Native/UI claims | Candidate names are not invented DSH methods. Public capability/version verification remains necessary. UI click/pause/cancel/timeout cannot manufacture dispatch, stop, success or recipient evidence. Browser/W1 hold is preserved. |
| Preparation isolation | All additions stay under `docs/prep/W2` and `prep/w2`; no production imports, W1 schema/status/table change, dependency install, source AC weakening or acceptance/main merge. |

## Preliminary commands and observations

On 2026-10-04, read-only `git status --short --branch` showed the clean `prep/W2-contracts` branch at the shared unit. `git diff --name-status a4310d6f672cccd68d26d4c1025ce0b0b87647f4` listed only the four preparation README/shared/common-schema additions at that time. No ancestor AGENTS file outside the repository was found.

Existing project-local Ajv manifest and tracked official-runtime lock both name version `8.20.0`, official npm resolution and integrity. The installed `ajv/dist/2020.js` SHA-256 was `908e9670b478b2ba126802a221b7e47006f50cf467e2c5dd7935d3dbef10a20a` under Node `v22.22.2`. This was a provenance read, not an installation or execution of native DSH.

A disposable in-memory `node --input-type=module` probe imported that local Ajv2020 with `strict:true`, `allErrors:true`, and no coercion/default insertion/additional-field removal. All **17/17** early common-definition assertions passed: correct scope, raw/extra/missing scope fields, ref 63/64/65/uppercase/newline, initial epoch0, version0/max-safe/unsafe, negative epoch/numeric string, unknown evidence source, candidate native source label and unknown contract version. The candidate native label passing structure establishes no native evidence or authority. No schema/network loader was configured. These early probes are distinguished from the final executions below; no W1 suite was rerun.

## Findings and final gate

No finding in the early root shared unit. Subsequent findings are preparation correctness/integration issues, not claims of a production exploit or executed native action.

| ID | Severity | Finding, oracle and remediation | Retest disposition |
| --- | --- | --- | --- |
| W2-CR01 | Medium | Clone SM06 revoke-first/rejected and add SM02 outboxRef/claimRef/reservationRef: the original message schema accepted it, contradicting zero dispatch claim on revoke-first. Rejected messages now forbid current outbox/claim/reservation/receipt linkage. | Closed on frozen snapshot; independent strict probe rejects; author negative regression retained. |
| W2-CR02 | Medium | Clone RC06 as applied pause/cancel with dispatchState open: original schema accepted both despite these controls blocking new dispatch. Applied/partial pause/cancel now require blocked without claiming native termination or prescribing the full future applicability table. | Closed on frozen snapshot; all four independent applied/partial pause/cancel probes reject. |
| W2-CR03 | Medium | Code inspection found resource revoke_action carried no target actionRef/digest; commandRef is only idempotency and cannot choose the intended action. Action revoke now requires both exact target fields; task-wide controls exclude them. | Closed on frozen snapshot; missing revoke target and extra task-wide target probes reject. |
| W2-CR04 | Low | Root's recursive mock-provenance guard conflicted with coordinator material sourceKind categories such as summary/ledger. Classification was renamed materialKind; sourceKind remains reserved for evidence provenance. | Closed on frozen snapshot; all 239 vectors pass recursive mock guard; nested native-label mutation rejects. |
| W2-CR05 | Low | Verifier keyPattern.test(vector.id) coerced JSON arrays to strings and Set identity could miss duplicate array IDs. Explicit typeof string now precedes the regex. | Closed on frozen snapshot; array/numeric/duplicate IDs reject VECTOR_ID_INVALID. |
| W2-CR06 | Low | Nested worker/message/result/resource conditional object/array fragments failed root strictTypes compilation, despite legal draft2020-12 conditional semantics. Authors added explicit fragment types; strictTypes remains enabled. | Closed on frozen snapshot; all six schemas compile with the exact strict verifier and retain their negative assertions. |

Initial message/control contradiction diagnosis temporarily disabled strictTypes solely to inspect the original schema semantics while its authoring lint failed. That was not an accepted verifier configuration or a PASS gate. All remediation retests use root's actual strict configuration. The separately justified strictRequired:false option is limited to Ajv's authoring lint for conditionals whose property schemas live on the enclosing object; required validation remains active, as the negative probes confirm.

### Coherent lane and verifier observations

Coordinator/context preserves complete owner/workspace/provider/source/event intake uniqueness and treats task as association, not a new dedup key. It explicitly maps candidate expectedTaskVersion to W1 expectedVersion and requires a trusted raw-ID/ref bridge. Revisions cannot establish completed-step facts; context uses current instruction/ledger priority, immutable materials/summary provenance, bounded lists and explicit compression/refusal oracles.

Worker mapping keeps original complete actionDigest/claim/generation/environment/tool/permission intent immutable. Newly discovered sessions attach as receipts rather than rehashing approved create intent. Local accepted, created, ready, execution and terminal/unknown facts are separate; richer native mappings, scoped queries/cancellation and observable resume remain deferred. Unknown creation/cancel/stream/handoff stays held; terminal/outcome/ledger release evidence and all outstanding obligations are distinct.

Resources account for worker/reviewer/repair and all attempt groups in one proposed authoritative transaction domain, with separate group/total attempts and estimated/unknown time/usage/cost obligations. Create has no invented session ID; resume requires a known incarnation. Downshift preserves existing holdings. Resource release requires distinct terminalEvidence, outcomeEvidence and atomic ledger releaseEvidence. Held partial terminal/outcome facts remain recordable without releasing units; released snapshots cannot retain unresolved axes. Unknown admission cost and D10 pending are explicit; any future estimated budget must block cost-budget-dependent dispatch with unknown valuation. No price, operational threshold, verified model catalog mapping or hard bill cap is selected.

Messaging binds immutable original source/purpose, scoped source/message identity, endpoint generations, exact grant/spec/version/epoch and bounded routing; known duplicate content differs from conflicting reuse. Outbox/sent/consumed and task/verification/delivery facts remain separate. Unknown delivery/consumption requires reconciliation and retains claim/reservation linkage. Local results bind artifact bytes/version, independent review and receipt-time recipient access, while subsequent current permission/openability changes cannot erase a historical delivered receipt. Pause/cancel guard dispatch without manufacturing native stop; UI applicability and real recipient/input evidence remain future gates.

Root verifier checks bounded non-symlink JSON files, exact existing Ajv8.20.0 manifest/entry/installed+tracked lock hashes before import, six private schema roots, allowed local refs, schema meta/strict compilation, fixture polarity, source AC, stable IDs, recursive mock provenance, no validator mutation and top-level unknown fields. It has no async/network schema loader, data/format extension, coercion, default insertion or additional-field removal. It imports no production Foundation/native service and writes no runtime state. Its report explicitly keeps W1 HOLD and W2 ticket acceptance NOT_ASSESSED. This is a local development verifier; its declared manifest/entry/lock checks are not an attestation of every installed transitive module or a production authority boundary.

### Independent final executions on the frozen snapshot

Executed on 2026-10-04 under shell Node **v22.22.2**, using only existing provenance-checked Ajv8.20.0 and pure artifact reads/in-memory clones:

| Command/check | Observed result |
| --- | --- |
| `git rev-parse HEAD HEAD:prep/w2 HEAD:prep/w2/schemas HEAD:prep/w2/fixtures HEAD:prep/w2/verify.mjs HEAD:docs/prep/W2/test-design.md HEAD:docs/prep/W2 main feat/M1-foundation` | Exit0; all identities match the table and unchanged W1/main refs. |
| `git diff --exit-code a4310d6f672cccd68d26d4c1025ce0b0b87647f4 HEAD -- src test scripts package.json package-lock.json AGENTS.md docs/tickets docs/foundation-contract.md docs/development-workflow.md docs/waves.md docs/decisions.md docs/milestones docs/evidence/M1` | Exit0; empty diff. |
| Frozen working-artifact comparison for `prep/w2` and all lane/shared/conflicts/test-design documents | Exit0; empty diff. Later README/manual-handoff withdrawal notes are separately reviewed evidence-status changes below. |
| `node --check prep/w2/verify.mjs` | Exit0. |
| `node prep/w2/verify.mjs` | Exit0/PASS: **6 schemas,17 fixture files,239 vectors,98 valid/141 invalid,85 positive unknown-field probes,307 mock evidence objects,39 annotated source AC,zero failures**. nativeCalls0/inferenceCalls0; schema_and_fixture_structure_only; W1 HOLD/W2 NOT_ASSESSED. |
| Disposable `node --input-type=module` metadata probes via actual loadPinnedAjv/evaluateVectors | **25/25 passed**: array/numeric/duplicate IDs, missing expectation/instance, header/vector unknown fields, actual bare-common URN and missing fragment, external schema/ref, unknown AC, description bounds, nested nonmock evidence, async/data/format keywords, duplicate schema ID, missing lane/polarity, depth34,65 files and101 vectors/file all reject with the expected guard code. |
| Disposable strict in-memory lane-schema probes | **25/25 passed**, fixtures unchanged: W2-CR01..03, unknown holdings/no dispatch, verified handoff proof, unknown usage, unanswered clarification, summary provenance, receipt-time access, current revoked historical delivery, all three release proofs, held partial facts, no held release basis and no released uncertainty. Three deliberately shape-valid generation/policy-mirror/review-digest mismatches confirm equality remains a future runtime check. |
| Process-local read/stat substitutions against loadPinnedAjv; no files changed | **16/16 passed** before validator import: dependency/version/entry pin, tracked/installed lock hashes, package/entry hashes and altered bytes, integrity/resolved records, invalid provenance JSON, leaf symlink/oversize/non-file, host lock version and manifest-version mismatch all reject with expected guard codes. |

The final test design retains **all40** original source AC as future observable oracles. BUB014-04 is explicitly actual visual/UI design only, so it has no synthetic structural coverage claim; 39 annotated AC are not 39 accepted AC. No runtime/native/recipient/UI case was executed. The earlier author-only100-vector run and early17 common probes are historical diagnostics and are not added to the final239 count.

## Remaining implementation and evidence gates

Runtime/native capabilities and receipt provenance, actual scoped model input/token accounting, canonical encoding/digest recomputation, immutable trusted caller/control/grant enforcement, exact cross-field/version/epoch/expiry checks, atomic worker/resource/message/data-plane mapping, real concurrency/process faults, selected resource/retention/cost policy and UI/recipient-observed delivery remain required later work. Finite schema ceilings are candidate shape bounds, not selected operational policy. No native method or model mapping is inferred from a name/version; no dsh-std dependency, adoption or conformance gate is added. W1's default-deny native identity/permission/operator boundary and schema2 statuses/tables remain unchanged.

The frozen manual-browser-handoff documents describe a separately authorized W1 startup/readiness observation of PID16359, not W2 runtime proof or browser acceptance. At final handoff, the parent reports that the execution session disconnected, port3080 has no listener, the observer is stale, and owner manual QA is withdrawn. The parent subsequently amended only the README/handoff evidence-status paragraphs to record withdrawal and accessibility constraints; those observed diff hunks change no candidate contract, schema, vector, verifier or gate. This auditor did not query/invoke/stop the host, read the private access file, open a browser or retry a blocked surface. The prior readiness snapshot is historical; no current active host or successful rendering/closing is inferred. Official default-browser behavior reported separately by the parent is likewise not an executed observation here.

**PREPARATION PASS** therefore leaves **W1 HOLD**, W2 runtime/ticket acceptance **NOT ASSESSED**, and all production/main integration gates intact. Only this report was edited; no W1 suite, native call, browser action, installation, credential or Git mutation occurred.
