# Independent source design: explicitly selected synthetic byte reviewer

Date: 2026-10-07. Independent lane: `/root/ni5_byte_objective_independent_design`. This is an independent ISTQB source design, frozen before new fixture authoring without inspecting the new reviewer implementation. It is not a test report. Fixture count **0**; executed cases **0**; passed cases **0**. All **85** design case families below have acceptance **HOLD / NOT RUN**. Historical All87, final CODE, browser and semantic-quality acceptance remain **HOLD** and are not replaced by these cases.

## Authority, independence and read boundary

The baseline is the immutable product SOURCE at `.runtime/ni4-5-normal-wiring-proposal/history/parser-878-complete-source-for-independent/src/`. Parent-supplied source-manifest SHA-256 is `53d105ac258ef6d986f7a15cac8ed223ecce0ed122ef6353da7fddc2dcc57b73`; that manifest was not independently recomputed. Individual read-source hashes are recorded in the companion JSON. Product SOURCE and original public DSH `lib/index.js` sources under `.runtime/dsh-web/node_modules/@deepseek-ai/` supplied the schema, ordering, construction, currentness, persistence and permission oracles.

The functional specification read was only the sections **Supported objective and literal selection**, **Source delta and original selection blockers**, and **Exact material and response domains** of `normal-entry-selected-byte-reviewer-source-proposal.md`. Its initially observed whole-file SHA-256 was `e64e299f3b09c1085b4611cf8d105eb8bda5720fd3c1ce2ad70c9c92fe78a7ec`. Heading locations were inspected first, and the permitted range was read without the Native permissions/persistence/bounded fixture effects or Review/execution boundaries sections. The whole file was hashed, not read beyond the boundary. The two source-derived corrections below are explicit root dispositions received while this lane worked; they amend the new functional contract only.

Repository instructions `AGENTS.md` and `docs/owner-amendment-2026-10-04.md` were read. No author's tests, fixtures, test-assertion bodies, mixed diffs or oracle reports were inspected. No proposed new reviewer implementation was read. After the Markdown case catalogue was written, the author sent an unsolicited candidate SOURCE-pin notice; no linked candidate code was opened and none of its implementation claims supplied these oracles. The lane does not claim it can establish the author's implementation start time. No JS parse/import, application execution, test run, native/model/provider/service invocation, database access, SQL command, timer, browser, network, dependency operation or Git command occurred. Shell tools were limited to filesystem text reads, source inventory/counts and SHA-256; only these two evidence files are authored. No subagents were spawned by this lane.

The original final CODE receipt/envelope/SQLite tamper experiment remains blocked: it was not investigated, executed, recreated or rerouted. Reading the public producer artifact serialization to identify the new byte objective's actual input format does not establish that experiment's integrity oracle. These cases authorize no such investigation and close no such debt.

## Exact-source findings and dispositions

1. **Output-bound conflict, resolved by an explicit new configuration choice.** The initial proposal used audit `resultByteLimit:4096` and worker `bounds.resultBytes:2048`. Original `installed-audit.mjs:73–75` rejects an audit result limit larger than the worker result bound with `CONFIG_INVALID`. Root explicitly corrected the proposed synthetic worker result bound to **4096**. The invalid 2048 combination remains a negative boundary. Request bound **131072**, producer maximum output **128**, reviewer maximum output **4096**, each worker/reviewer reservation **runtime1000 / usage135168**, provider ceiling **135168**, policy **runtime60000 / usage600000 / cost0**, total attempts **4**, and local-result admission **units1 / runtime1000 / usage135168** stay unchanged. There is no implicit budget increase.
2. **Stored-artifact conflict, resolved by an explicit new objective interpretation.** Original `worker.mjs:254–270` captures `JSON.stringify({contractVersion:'df.native-result/v1',source:{...},content:result.content})`, not raw producer text. Original `installed-worker.mjs:222` unwraps that object for its result projection, while `runtime-plugin.mjs:238–242` retains original captured-producer authority. `runtime-store.mjs:2320–2324` supplies the complete stored artifact bytes to audit material. Root explicitly revised the new contract to validate and digest-check that **whole original envelope**, then compare its `content` payload to the producer formula. The payload is **113 UTF-8 bytes**; the stored artifact envelope is not 113 bytes. No producer recipe, carrier, private row or captured fact may be replaced to manufacture a positive case.
3. **Read-only recovery distinction.** Original `installed-results.mjs:374–388,403` exposes read-only `localDeliveryQuery`; original `results.mjs:126–133` reconciliation records a delivery observation. The new read-only lost-acknowledgement oracle names `localDeliveryQuery`, and requires no resend. A mutating observation-recording call may not be described as read-only.
4. **Prepared-context metadata distinction.** `validateExecutionContext` permits optional memory metadata, but actual `memory.mjs:272–295` preparation always emits `memory`, and installed worker/audit origin readers require its namespace and revision. A native positive therefore uses original present revision0 metadata with empty provenance. Optional/reconstructed forms cannot supply authentic native provenance. A prepared context describes the pre-plan task facts; it must not be rejected merely because later authorized progress increased the live task version while semantic/authentication facts remain current.

The corrected envelope domain and output bound are prerequisites for a coherent literal candidate. Neither disposition grants execution or a fixture lease.

## Supported objective and independent value oracle

The only supported goal is the following complete single-line UTF-8 string, without a newline:

```text
DF SYNTHETIC CONTEXT BYTE TASK v1. The only requested output is exactly Synthetic local result; approved input SHA-256: followed by one ASCII space, the lowercase SHA-256 of the complete approved context record UTF8 bytes, and one period. This task makes no semantic, safety, factual, provider-delivery, or overall product-quality assertion. Tools and external actions are unavailable.
```

Let **A** be the complete approved audit-input bytes, **C** the complete original context material content, **G** the complete original goal material content, and **R** the complete stored artifact-envelope material content. All hashes below are SHA-256 over complete well-formed UTF-8 bytes, without trimming, normalization, reconstruction or newline conversion. The source-owned expected payload is exactly:

`Synthetic local result; approved input SHA-256: ` + `SHA256(C)` in lowercase ASCII hexadecimal + `.`

The comparison must use `parsed(R).content`, after consuming and checking all of R. It may not hash only `parsed(C).content`, rebuild C from parsed fields, compare substrings, trim the payload, normalize Unicode, case-fold, accept a reported digest alone or treat expected text found elsewhere as equality. Changing any byte in C changes the expected payload even if C parses to equivalent JSON. Hashing all bytes is necessary but does not by itself establish that unsupported structure was examined.

The new selection is literal provider `df-testing-local`, model `df-testing-context-byte-review-v1`, role **review**, effort `deterministic`, empty preset `ni3-empty`, maximum output **4096**. It is a fourth finite descriptor. Original worker, unknown review and repair descriptors retain their existing IDs, prompts, recipe bytes and behavior; there is no role-wide replacement, guessed ID, wildcard or caller-supplied descriptor. The new pure module introduces no import-time registration, callbacks, native objects, filesystem access, timers or external action.

## Original schemas, sorting and structural joins

`runtime-security.mjs:5–32` defines lowercase 64-character SHA-256 refs, safe nonnegative integers, exact inert plain objects, canonical sorted object keys, maximum depth12, object keys64, arrays128 and well-formed strings65536 UTF-8 bytes. These limits apply at the actual validation call's root; nesting overhead must not be guessed. No proxy/accessor/property callback may execute to obtain material.

Original `prepareAuditInput` emits a canonical outer audit object, because `runtime-store.mjs:187–191` and `2332` use `canonical(body)`. Its exact keys are:

`contractVersion,purpose,ownerRef,workspaceRef,taskRef,auditRef,auditRevision,round,semanticRevision,artifact,bindingDigest,materialDigest,policy,material,contextRecordRef,contextDigest,previousReport,responseContract`.

The artifact pointer has exact `artifactRef,version,recordRef,digest` keys. The policy has exact `policyRef,blockingSeverities,maxRepairRounds` keys. Every material has exact `recordRef,digest,kind,content` keys. Original configure sorts material by `recordRef.localeCompare`, sorts blocking severities, and hashes this binding object:

`ownerRef,workspaceRef,taskRef,auditRef,auditRevision,artifactRef,artifactVersion,digest,material,policyRef,blockingSeverities,maxRepairRounds,round,semanticRevision`.

`materialDigest = canonicalDigest(sorted [{recordRef,digest}])`; `bindingDigest = canonicalDigest(binding)`; `inputDigest = SHA256(A)`. No context pointer is invented inside the binding object. The native association contains the context pointer/digest and independently validates it. Review round is0, previous report isnull, repair maximum is0, and the chosen severities are sorted `['blocking','fatal']`. Revisions audit/artifact/semantic are positive safe integers. A new recipe's response does not substitute for `validateAuditInputPair` or the original native currentness checks (`audit-input-pair.mjs:15–49`, `installed-audit.mjs:137–172`).

R has exact top-level keys `contractVersion,source,content`, with contract `df.native-result/v1`. Its exact source keys, derived from original capture, are:

`taskRef,actionRef,actionDigest,claimRef,generationRef,sessionRef,executionRef,inputDigest,cursor,resultDigest`.

All fields except cursor are lowercase64 refs; cursor is a nonnegative safe integer. Source taskRef equals the audit/context task; source inputDigest equals the full C material digest; source resultDigest equals SHA256 of the complete payload. The full R digest equals the advertised artifact material and pointer digest. Native producer capture independently checks the original claim/execution/session/source observations. Ref shape and an internally consistent JSON object cannot prove runtime origin. No source field unavailable in the audit material is reconstructed as proof. Original normal native sessions use `df-` plus generationRef and a hash of that session identity (`native-adapter.mjs:153–158`); the installed native layer owns that identity check.

C is the whole original execution-context record, including its envelope. Its scope and task/auth versions bind to the protected task-facts object. Actual preparation emits sourceRefs and sourceProvenance corresponding to exactly the original G ref/digest; provenance taskVersion/authEpoch/createdAt remain within the context's original version/auth/time envelope. Its inputCounts.bytes equals the full protected inner text's UTF-8 byte count. Empty memory means no memory candidate/provenance, no retained/dropped background refs; native preparation has namespace/revision0 metadata. Supplement, observation, host snapshot, clarification, constraint and previous-report content are outside this first recipe's supported domain.

The inner text consists of exactly five sections, separated by two newlines: fixed authoritative-task header; the full task-facts JSON with exact `scope,taskVersion,authEpoch,status,generationRef` keys; `CURRENT GOAL\n` plus exact G; `CURRENT CONSTRAINTS\n(none recorded)`; `CURRENT WORK FACTS\n` plus the complete JSON with exact `actions,workers,control,artifacts,progress,deliveries,reviews,audits,policy` keys. Status isqueued, generationRef isnull, control isactive, those seven arrays are empty and policy is an inert plain object accepted by the original canonical boundaries. No extra section, duplicate-key overwrite, second JSON value or suffix may be accepted by a prefix parser. Source emission uses JSON.stringify, so novel serialization/residue must not become supported merely because JSON.parse discards it. A caller's recomputed hashes never override these domain checks or native provenance.

`ledgerSnapshotDigest` hashes original `JSON.stringify({task,workFacts})` (`context.mjs:279`). The public envelope does not expose the complete original task record used there. This recipe consumes and structurally validates that field; it must not claim to recompute unavailable task metadata or prove live task currentness from it.

## Decision table and response oracles

Validation precedence is mandatory: malformed association/schema/reference/numeric domains or digest/pointer/source joins **D**; a structurally valid authenticated carrier outside the selected objective/material/context domain **U**; then actual supported payload comparison **P/F**. Malformed joins must not be converted to unknown or a positive response. A valid unsupported case must not be upgraded to examined coverage. The original native path may reject before the recipe; that denial is preserved and does not count as an exercised recipe verdict.

| Oracle | Exact condition | Expected result |
| --- | --- | --- |
| D | Invalid closed audit/artifact schema, digest, binding, pointer, scope or payload-source join | `BootstrapError('WORKER_REQUEST_DENIED')` at recipe/permit boundary; no positive response; upstream admission remains fail closed. Original constructor/currentness gates retain their own original error codes. |
| U | Valid association and hashes, but goal/material/context domain unsupported | Canonical audit response, `verdict:'unknown'`, `coverageRefs:[]`, all original material refs sorted in `unexaminedRefs`, `findings:[]`. |
| P | Exactly three authentic materials, supported complete domain, valid source joins, actual full payload equality | Canonical response `contractVersion:'df.audit-response/v1'`, original binding/material digests, `inputDigest:SHA256(A)`, `verdict:'passed'`, all three refs sorted as coverage, no unexamined refs or findings. |
| F | Same supported domain and valid joins, payload bytes differ | Same response identity digests; `verdict:'failed'`, all three refs covered, no unexamined refs, exactly one unresolved blocking `artifact_mismatch` finding. |

F's `findingRef = canonicalDigest(['df.context-byte-finding/v1',SHA256(A),'artifact_mismatch'])`; `evidenceRef = canonicalDigest(['df.context-byte-evidence/v1',SHA256(A),artifact.digest,context.digest])`. The finding's exact keys are `findingRef,severity,code,evidenceRef,resolved`, with `severity:'blocking'`, `code:'artifact_mismatch'`, `resolved:false`. Source `runtime-store.mjs:2587–2595,2613–2624` validates complete/disjoint coverage and native submission before reporting. Passing is limited to this byte equality objective; no safety, factuality, semantic task quality, user consumption or provider-delivery claim follows.

## State, ordering and effect oracle

The required public sequence is explicit setup/catalog refresh; exact policy preview and confirmation; native goal intake; public prepared context before work planning; exact worker action/grant/claim; original factory setup and commit before publication; explicit worker execution; public persisted-result validation and capture; producer termination and reservation settlement; original audit configuration/input preparation; separate reviewer action/grant/claim/create; explicit reviewer execution; original persistence validation/capture/submission; reviewer termination/settlement; accepted exact local delivery and its separate current publication grant/claim. Native worker and reviewer are different principals, generations and sessions. This is a planned sequence, not an executed fixture.

The provider's one-use permit starts prepared, passes full request and currentness gates, becomes consumed synchronously immediately before the first text delta, then emits usage and finish with currentness checks between chunks. Issue, stream and original/native layers all bind selected model and exact prompt. `ownInstalledStream` checks the captured original owner carrier around actual lazy iterator advancement and closure. No agent/session, provider-name string, copied result JSON, caller boolean or reconstructed history grants authority.

| Effect ID | Permitted effect and evidence requirement |
| --- | --- |
| E0 | Pure descriptor/recipe/source checks: no filesystem, registration, listeners, callbacks, native/service/model calls, writes, timers or network. |
| E1 | Explicit config/catalog/preview work: existing bounded source reads and public catalog/preset queries only. No stream/session execution, directory allocation or unapproved action. New provider pin adds one local read/hash at initialization and each existing currentness pass, not a service activation. |
| E2 | Rejected input or request before consumption: no text/usage/finish, no successful capture/submission/publication; rejected issue does not create a usable permit or increment issue count. Existing attempted native setup may have original rollback/uncertainty effects; do not claim arbitrary rollback erased durable facts. |
| E3 | U: inert unknown response only in pure evaluation; if separately leased and genuinely native, at most the existing one review execution/capture/submission with actual usage. Zero publication effects; original unexamined refs remain. |
| E4 | F: inert finite failed response only in pure evaluation; if separately leased and genuinely native, existing review execution/capture/submission only. Zero publication; blocking finding remains unresolved. |
| E5 | P: genuine original worker and reviewer each exactly one permitted stream and original persisted capture; no repair. Entire material, usage, session and independent-review facts checked through public observations. Successful capture/submission alone cannot establish publication. |
| E6 | Revocation/currentness boundary: no new effect after the existing denial/dispatch linearization point. Any already emitted text, committed evidence or held reservation stays factual/uncertain until actual original reconciliation/termination; no automatic replay or invented stop proof. |
| E7 | Exactly one separate local publication of the verified whole original artifact, after exact current grant/claim. Worker/review/publication are serialized for maxActive1; attempt and reserved limits are unchanged. No notifications, automation or external destination. |
| E8 | Read-only `localDeliveryQuery` after a committed publication and a dropped acknowledgement: no new send, claim, grant, attempt, capture, stream or mutation. Report source-confirmed sent/granted with openabilityunknown; no browser-opened/delivered claim. Observation-recording reconcile is separately mutating and is not this oracle. |
| E9 | Original unknown/repair behavior conservation: original recipe file bytes and original catalog entries/prompts unchanged; old explicit review returns unknown/unexamined; original repair formula unchanged. Any separately leased native evaluation retains its original effects/limits. |
| EH | Unsupported/unleased seam: no experiment or effect; acceptance HOLD. |

One successful normal task would need three serialized attempts (worker, review, local publication), each reserving usage135168/runtime1000, within total attempts4 and aggregate usage600000/runtime60000/cost0. This arithmetic is a design constraint, not observed resource evidence. Unknown/failed review cannot proceed to local publication. `setApprovalPolicy('never')` appends an original approval-policy event; tools are restricted to an empty scope and the runtime context is suppressed. Successful native logs must be genuine, unseeded, inheritedEventCount0, contiguous, at most128 events / physical size1048576, with one approved user message, one noninterrupted assistant result and one balanced turn. Original reader handles are read-only and closed; flush must have actual native listeners. These conditions are source-derived, not manufactured native history.

## Case catalogue

Each row is one logical case family, not a count of its parameter variants. EP = equivalence partitioning; BVA = boundary-value analysis; DT = decision table; ST = state transition; CO = call ordering. All rows are **SOURCE DESIGN ONLY / NOT RUN / acceptance HOLD**. `PURE` names a future source-only fixture lease, never current execution authorization. `NATIVE` additionally requires a distinct later bounded native lease and genuine public provenance. `HOLD` has no admissible substitute currently. Mutation descriptions are oracle definitions only; no mutation data or fixtures are authored here.

| ID | Technique | Independent partition / boundary / stimulus | Oracle / effect / future lease |
| --- | --- | --- | --- |
| SEL01 | EP | Exact fourth model, review role, provider, effort, preset and4096 output selection | Exact new descriptor and P-capable domain only; E0/E1; PURE |
| SEL02 | EP | Worker or repair role paired with new review model; wrong provider | D; no role substitution; E2; PURE |
| SEL03 | EP | Unknown/versionless/prefix/suffix/case/Unicode-confusable/whitespace model IDs | D; finite exact selector, no fallback; E2; PURE |
| SEL04 | EP | Caller-defined prompt, recipe, generic descriptor or model-allow boolean | D; not selection authority; E2; PURE |
| SEL05 | DT | Public adapter list+resolve and LlmRuntime list/resolve/call-config agree on fourth model | Actual resolved capacities/effort; public list omits capacity metadata, refresh projects resolved row; E1; NATIVE |
| SEL06 | BVA | Prompt/recipe labels at512 UTF-8 bytes versus513; selected exact labels below bound | Existing client parser bound retained and only fourth review ID added; E1/E2; PURE |
| SEL07 | DT | Audit4096 result limit paired with worker2048 versus explicitly corrected4096 | First CONFIG_INVALID; second passes only this original constructor constraint; E1/E2; PURE |
| SEL08 | EP | Audit enabled false/omitted; new ID not explicitly selected; retained old choice | Disabled stays disabled; explicit old review stays unknown, no implicit new choice; E0/E9; PURE |
| SEL09 | CO | Import new registry alone; provider initialization/currentness source pin read | New registry zero effects; new pin included in existing sourceRef/freshness checks; E0/E1; PURE |
| SEL10 | DT | Unknown pricing, unowned provider registration, wrong effort/preset or nonempty composition | Original COST_UNKNOWN/catalog/preset/source denial; no generic source_zero; E2; NATIVE |
| INT01 | EP | Nonstring, malformed JSON, non-well-formed UTF-8 or NUL audit/material bytes | D; stable boundary error, no positive response; E2; PURE |
| INT02 | EP | Missing/extra/duplicate audit-object keys; second JSON value or trailing instructions | D; complete closed original carrier, no last-key/prefix admission; E2; PURE |
| INT03 | EP | Wrong/future outer contract, response contract, purpose, repair input or previous-report joins | D for malformed joins; valid unsupported repair/round domain U; E2/E3; PURE |
| INT04 | BVA | Audit/artifact/semantic revision0/1/safe-max/unsafe; round0 versus valid nonzero | D for invalid integer domain; U for valid unsupported round; E2/E3; PURE |
| INT05 | EP | Every owner/workspace/task/audit/material/policy/pointer ref lowercase64 versus uppercase/63/65/nonhex | D for any invalid ref; E2; PURE |
| INT06 | EP | Duplicate material recordRef or conflicting pointer/material association | D before coverage; E2; PURE |
| INT07 | DT | Each full content digest checked independently; early/middle/final-byte change with stale digest | D for artifact/context/goal separately; E2; PURE |
| INT08 | DT | Correct material hashes but wrong materialDigest; unsorted vector with an independently advertised hash | D; original sorted original vector is authoritative; E2; PURE |
| INT09 | DT | Binding each field changed independently; material order/severity order mismatches | D unless public configure canonicalizes inputs before emitting current binding; E2; PURE |
| INT10 | DT | Artifact pointer record/digest/version or context pointer ref/digest disagree with its material | D; no digest-only or ref-only acceptance; E2; PURE |
| INT11 | EP | Scope owner/workspace/task mismatch between audit, context and task facts | D; even fully recomputed untrusted hashes grant no scope; E2; PURE |
| INT12 | DT | Rehashed malformed join versus healthy unsupported domain | D takes precedence over U, so missing authenticity/integrity is not hidden by unknown; E2/E3; PURE |
| INT13 | EP | Parsed proxy/accessor/nonplain nested objects or callable metadata offered to pure selector/validators | D without invoking accessors/callbacks; E0/E2; PURE |
| ENV01 | DT | Original whole df.native-result/v1 envelope, all refs/joins current, exact113-byte payload | P only from genuine original captured artifact; E5; NATIVE |
| ENV02 | EP | Raw113-byte producer text used as artifact material instead of original envelope | D malformed original envelope; cannot native-configure as captured producer; E2; PURE |
| ENV03 | EP | Missing/extra/duplicate envelope or source keys; malformed JSON/second object/trailing instruction | D; consume entire R and original closed schema; E2; PURE |
| ENV04 | EP | Envelope source taskRef or inputDigest joined to another task/context | D; even recomputed outer hash is insufficient; E2; PURE |
| ENV05 | DT | Source resultDigest does not hash complete payload versus rehashed payload with wrong expected bytes | First D; second F if all remaining domains supported; E2/E4; PURE |
| ENV06 | BVA | Source cursor negative/fraction/unsafe versus0/positive safe; each source ref shape | D for malformed primitive domains; structural refs/cursor alone give no provenance; E2; PURE |
| ENV07 | DT | Different whole envelope bytes/source metadata with same payload and valid advertised digest | Whole R examined; native original capture facts still required; cannot grant native origin from a label; E2/E5; NATIVE |
| ENV08 | EP | Owner-created JSON, arbitrary writeArtifact, copied result projection or reconstructed source rows | Original AUDIT_PRODUCER_REQUIRED/PROVENANCE_UNAVAILABLE; no fabricated positive; E2; NATIVE |
| DOM01 | DT | Exactly artifact/context/goal versus two/four/16 healthy distinct materials | Three can reach P/F; other valid domains U with every ref unexamined; E3/E5; PURE |
| DOM02 | EP | Three materials but missing/duplicate supported kind or unknown material kind | U after integrity checks, all refs unexamined; E3; PURE |
| DOM03 | EP | G exact literal versus prefix/suffix/newline/CRLF/space/case/lookalike/prose-near-match | Only literal supported; alternatives U; E3; PURE |
| DOM04 | EP | Exact goal embedded in background/policy/work-facts text while actual goal differs | U; no substring-selected objective; E3; PURE |
| DOM05 | DT | sourceRefs/provenance binds exactly G ref/digest versus another/multiple source refs | Bad ref/digest/scope join D; healthy extra-source context U; E2/E3; PURE |
| DOM06 | BVA | Provenance versions/auth/time below/equal envelope versus beyond/invalid | Original envelope numeric/binding bounds retained; invalid association D; E2; PURE |
| DOM07 | EP | Healthy supported execution context versus future material contract/verification/kind | Supported validates; healthy unsupported domain U, malformed known schema D; E2/E3; PURE |
| DOM08 | DT | Empty original memory provenance/revision0 versus nonempty candidates/provenance | Only empty original native domain supported; nonempty U, malformed memory schema D; E2/E3; PURE |
| DOM09 | EP | Namespace/revision metadata omitted/reconstructed versus original public present metadata | No native positive without original origin; recipe-only forms cannot prove native provenance; E2; NATIVE |
| DOM10 | EP | Nonempty retained/dropped refs, background, summary or host snapshot | U; no clipping/truncation to regain support; E3; PURE |
| DOM11 | EP | Supplement/observation/clarification/constraints/previous report added as healthy content | U; no grant or success inferred from text; E3; PURE |
| DOM12 | DT | Exact five sections versus reordered/duplicated/missing section or trailing instruction | U for healthy unsupported text; malformed joined context D; E2/E3; PURE |
| DOM13 | EP | Task facts queued/null-generation exact scope/version/auth versus another healthy status/generation | U outside fresh pre-plan domain; inconsistent scope/version/auth D; E2/E3; PURE |
| DOM14 | DT | Work facts seven empty arrays/controlactive/plain bounded policy versus nonempty arrays/paused control | Healthy expanded domain U; malformed keys/types/canonical bounds D; E2/E3; PURE |
| DOM15 | DT | inputCounts.bytes whole inner content versus character count, prefix count or stale count | D; tokens structurally bounded without invented tokenizer proof; no invented ledgerSnapshotDigest recomputation; E2; PURE |
| BYT01 | EP | Exactly expected payload vs single-byte substitutions at start/middle/final period, with honest digests | P versus F, all three materials actually covered; E4/E5; PURE |
| BYT02 | BVA | Payload112/113/114 bytes, deleted period, extra newline/space/prefix/suffix | Supported-domain wrong bytes F; no trimming; E4; PURE |
| BYT03 | EP | Uppercase hash, full-width punctuation, non-ASCII space or Unicode normalization alternatives | F; expected ASCII bytes exact; E4; PURE |
| BYT04 | DT | Hash inner protected content or reconstructed context JSON instead of whole C | F unless actual whole-byte hash equality; no reconstructed positive; E4; PURE |
| BYT05 | DT | Healthy original context byte differences in envelope/policy metadata with same goal | Expected hash covers all C bytes; artifact must correspond to exact approved C; E4/E5; PURE |
| BYT06 | EP | Expected payload appears inside envelope source/other text but payload differs; trailing unsupported bytes | F for valid wrong payload; D/U for malformed/unsupported whole domain, never P; E2/E3/E4; PURE |
| BYT07 | DT | P/F/U serialized response fields, sorted coverage and deterministic finding/evidence refs | Exact response oracle, finite finding only; no hard-coded pass/coverage by ref existence; E0/E3/E4/E5; PURE |
| BND01 | BVA | A UTF-8 bytes65535/65536/65537; multibyte scalar crossing boundary | Original input limit admits equality only when full canonical carrier fits; excess D; E2; PURE |
| BND02 | BVA | Material ref counts0/1/2/3/4/16/17 and duplicates | Original malformed outside2..16 D; valid nonthree U; three still needs full domain; E2/E3; PURE |
| BND03 | BVA | Public selection output128/4096 vs127/4097; actual response bytes at limit vs limit+1 | Existing config and provider request/output gates retained; E1/E2; PURE |
| BND04 | BVA | request bytes + actual output bytes at/below/above135168 and reservation; input JSON transport overhead | Exact byte accounting, no token estimate substituted; excess denied before effect; E2; NATIVE |
| BND05 | BVA | Reviewer reservation below/at131072+4096; aggregate600000, maxActive1, attempts4 | Original admission inequality retained; no unapproved limit increase; E1/E2; PURE |
| BND06 | BVA | canonical depth12/13, keys64/65, array128/129, string65536/65537, safe integer endpoints | Correct per-validation-root canonical boundaries; no callbacks or prefix acceptance; E0/E2; PURE |
| BND07 | BVA | Permit issue count127/128/129 and one permit per actual original agent | Original bounded issue capacity and identity retained; rejected issue creates no usable permit; E2; NATIVE |
| NAT01 | CO | Fresh original factory setup→commit→publication→explicit execution; create alone | Idle create has no stream; exact empty preset/prompt/tools/approval policy mounted; E1/E5; NATIVE |
| NAT02 | DT | Model/prompt/effort/token/session mismatch independently at issue, mounted system and stream request | Fail closed at every original selected descriptor gate; E2; NATIVE |
| NAT03 | ST | Prepared→consumed once; reuse, sealed, concurrent/old prepared iterator | No second response/usage/execution; original gates still govern lazy stream; E2/E6; NATIVE |
| NAT04 | CO | Correct owner carrier/initiator around next/return versus absent/wrong/disposed carrier | Original invocation/currentness denial; no alternative native carrier; E2/E6; NATIVE |
| NAT05 | ST | Revoked grant/pause/cancel/revision before issue, before first chunk and between chunks | No new effect after denial linearization; preserve already factual effects/held reservations; E6; NATIVE |
| NAT06 | ST | Provider/recipe/new-registry source-byte pin or original registration generation becomes stale | Currentness denial before subsequent effects; all recipe bytes influence sourceRef; E2/E6; NATIVE |
| NAT07 | ST | Profile/path/persistence backend/service identity/source modules/preset composition changes | Existing original source/persistence checks retained; fail closed; E2/E6; NATIVE |
| NAT08 | DT | Artifact latest version, audit revision, material digest, semantic/auth facts current versus stale | Native currentPair denies stale admission; byte equality alone cannot override it; E2/E6; NATIVE |
| NAT09 | DT | Progress-only live task-version advance with fresh CAS versus semantic/auth advance or future source version | Valid retained pre-plan C stays usable only when original semantic/source currentness permits; never require C version=live version blindly; E2/E5; NATIVE |
| NAT10 | CO | Genuine flush→stat→read-only open→complete contiguous log→close, then capture/submit | Original actual usage, source/user/payload/cursor/turn/persistence facts required; no seeded/fake history; E5; NATIVE |
| NAT11 | CO | Independent reviewer identity/generation/session, finish/settle before next maxActive1 action | No producer self-review, no fabricated stop/release, no repair selected; E2/E5/E6; NATIVE |
| PUB01 | DT | Genuinely P submitted/native accepted artifact, exact current target/grant/claim and local publication | One publication of exact whole R; sent/granted/openabilityunknown, not delivered/browser opened; E7; NATIVE |
| PUB02 | DT | U/F/stale/unexamined/incomplete-native-provenance artifact attempted publication | Original verification/provenance denial before publication; no pass label substitutes; E2; NATIVE |
| PUB03 | ST | Actual original publication commits, its acknowledgement is dropped, then localDeliveryQuery | Source sent/granted/unknown-opening recovered by read-only query; send/claims/attempts unchanged; E8; NATIVE |
| PUB04 | ST | Repeated query and repeated delivery dispatch for already committed sent/unknown state | Query remains read-only; dispatch not accepted means no resend; uncertain state is never arbitrary retry authority; E8; NATIVE |
| PUB05 | EP | Query/delivery identity mismatch, artifact digest/version changed, or another recipient/channel | Original binding/currentness denial or unresolved query; never new publication to compensate; E2/E8; NATIVE |
| OLD01 | EP | Existing df-testing-review-v1 with its original prompt and authentic materials | Original unknown, coverage[], all refs sorted unexamined, findings[]; E9; PURE |
| OLD02 | EP | Existing df-testing-repair-v1 and worker-v1 original recipe/prompt selection | Repair formula unchanged; worker complete-context formula unchanged; E9; PURE |
| OLD03 | DT | Original ROLE_PROMPTS/ROLE_MODELS/roleRecipe bytes and three original catalogue descriptors | Original recipe-file SHA remains e8b98864…; new fourth descriptor only; exact old preview text remains; E0/E9; PURE |
| HLD01 | EP | Owner notification-manifest artifact presented for new reviewer/native publication | Unsupported; native provenance seam remains HOLD; no fabricated history/origin or notifications; EH; HOLD |
| HLD02 | ST | Native ACL revocation after publication | HOLD: no original public revocation seam established; synthetic thrown errors cannot pass it; EH; HOLD |
| HLD03 | BVA | Trusted clock equality/rollback/expiry race | HOLD: no supported native clock seam; no timer/clock patch or busy-wait execution; EH; HOLD |
| HLD04 | EP | Semantic/safety/factual/task-quality/model-quality acceptance | HOLD: byte equality cannot establish these properties; EH; HOLD |
| HLD05 | DT | Historical All87/final CODE receipt-envelope-SQLite tamper gap/browser regressions | HOLD: blocked original experiment not rerun/reconstructed/rerouted or closed here; EH; HOLD |
| HLD06 | CO | Native positive carrier/publication/lost acknowledgement without later explicit execution lease | HOLD / NOT RUN until genuine public preparation/capture and bounded lease; no fake native carrier or author fixture substitute; EH; HOLD |

Counts: selection10; association13; original envelope8; objective/context domain15; payload equality7; bounds7; native ordering/currentness11; publication/recovery5; conservation3; explicit unsupported holds6. Total **85** families: **55 PURE**, **24 NATIVE**, **6 HOLD**. Every family remains acceptance HOLD. Future lease classes describe prerequisites, not granted actions.

## Evidence required before any acceptance changes

A later independently reviewed literal source candidate must freeze its exact changed-source hashes and closed descriptor; preserve before copies and literal patches for the five existing selection/binding files and new pure module; preserve original recipe bytes, schemas, native factory APIs, normal result permissions and observer count. Root then dispositions this source design and may grant source-only fixture authoring. Fixture work must use this design without reading author oracles. Runtime execution remains a separate authorization decision.

Positive inputs must come from actual public prepared-context and genuine original worker execution/capture in an isolated permitted synthetic profile. Pure negative mutations can assess recipe partitions only and do not authenticate a carrier. Native positive acceptance requires independently observed current catalog/policy/grants, original sessions/persistence/usage, actual full three-material coverage, independent reviewer, bounded reservations/attempts, genuine capture/submission and exact local publication. Dropped acknowledgement evidence must refer to an actual committed original publication and use public read-only query with unchanged publication/send/claim/attempt counts. Unsupported seams and broad quality remain HOLD. No proposed result in this file is evidence that any of those actions occurred.
