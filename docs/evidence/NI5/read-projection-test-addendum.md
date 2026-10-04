# NI5 independent read-projection test addendum

Status: **independent design HOLD against the exact author/core-agreed additive projection; documentation only, all new executable cases NOT RUN.** This binds [read-projection addendum](read-projection-addendum.md) SHA256 `d404a0c2efb91fa945430cc920b40b8e563e6f9cdd70d7d8b8ffb543832a04db`. Independent owner `normal_integrations_istqb`, separate from `prep_messages_results` and the held CODE lane. Root explicitly authorized this small binding before affected source GO. The held [NI5 design](test-design.md) `80a4debeaca1e482d1aadfb9f70b6cbf437164c8584a60b39848ad27f26dc241` and [NI5 contract](../../normal-results-contract.md) `6b6e2e752141bf7e52a6c6ae4d9b3b6968fdf6d2e31fbc48790f35c0cf3d3569` remain unchanged. Earlier6ffad9c6/ed04e08e author notes are historical drafts, not this binding.

## Concrete source constraint and exact seam

Source inspection, not test execution: [RuntimeStore](../../../src/runtime-store.mjs) SHA256 `1178a826d22c4d051897599d1d500f2315ca85688cda48b77718f3f8356ce7ca` has generic artifact(owner,{taskRef,artifactRef,version?}), generic readData(owner,{taskRef,recordRef}) and getDelivery(owner,{taskRef,deliveryRef}). Artifact metadata binds immutable recordRef/digest/version; readData opens actual ciphertext and invokes scoped read permission. Generic verification records verdict/evidence/reviewer/generation and do not establish a normal authenticated NI3 source chain. [Ledger](../../../src/ledger.mjs) SHA256 `64cc42e1a834701263c260f311d05d113c6e34af67017901cfd7a95f22c9b650` is still schema4 at inspection. Proposed readLocalArtifact and normal native verification projection are later core work; they are not existing or executed storage proof.

The private readArtifact closure receives exactly `{taskRef,artifactRef,version,digest}` and later binds normal-only RuntimeStore.readLocalArtifact(owner,input). Its exact top-level result is `{artifact,data}` from actual scoped artifact metadata and permitted decrypted record data. RecordRef, kind=artifact, digest, complete UTF-8 byteLength and SHA256(content) must match the selected immutable version. Generic advanced read shapes and schema4 verification semantics remain unchanged. Normal artifact.verificationBinding is computed by trusted core, never supplied by caller: null, the held closed unavailable variant, or the held closed native variant from authenticated NI3 audit_result/current report/exact material/semantic coverage and producer/reviewer independence. Allowed unverified historical reads remain distinct from accepted normal readiness. Planning compares current latest metadata separately; locked normal claim/publication recomputes the actual source chain.

The publication result remains the original getDelivery tuple with deliveryRef,artifactRef,artifactVersion,digest,recipientRef,channelRef,targetDigest,intent,previousDeliveryRef,state,claimRef,reservationRef,generationRef,observations,currentAccess and optional notification. TaskRef is inside intent. Sent observation is exactly `{state:'sent',evidenceRef,permissionState:'allowed',openability:'unknown',observedAt}`; currentAccess is exactly `{permissionState:'allowed',openability:'unknown'}`. No top-level taskRef or new verification/proof fields are required. Callback output, available bytes and successful access never certify opening/delivered. After publication await, current private native lifetime/peer/profile, committed getDelivery and permitted exact bytes must be freshly checked.

## Planned discriminating checks

Every row is planned/NOT RUN. These refine existing N5 families; they add no new provider, transport, public API or authority.

| ID / priority / existing family | Independent decision or boundary oracle | Level |
| --- | --- | --- |
| N5R-01 P0 / N5-01/02/04/20 | Exactly one private normal read closure; no owner handle, operation map, path or proof in wire/config/output. Factory, install, feature, status, subscriptions and read perform0report/policy/grant/claim/send/verification writes. Generic artifact/readData and existing callers preserve their shapes. | T/D/N/P |
| N5R-02 P0 / N5-03/04 | Build actual immutable artifact versions and independently hash permitted decrypted bytes. Wrong task/ref/version/digest/record/kind/byteLength, metadata-only match, different content and tampered ciphertext refuse. Exact historical bytes stay available when allowed; current latest checks for planning remain separate. Include ASCII/CJK/astral and complete envelope bounds without claiming a string-only limit proves claim/publication bytes. | T/D |
| N5R-03 P0 / N5-05/07 | Null, unavailable, generic schema4 accepted, rejected/unknown/not_run provenance cannot unlock normal plan/preview/accepted notification. Closed native accepted positive requires exact authenticated audit/material/semantic/producer/reviewer association. Caller-provided native-looking fields/digest/verdict never establish it. Unverified allowed read is truthful and changes0verification/task/delivery facts. | T/D/N |
| N5R-04 P0 / N5-07/08/09 | Independently alter each native binding ref/digest/current report/reviewer/result/material/semantic field; one-at-a-time staleness must refuse. Actual producer equals reviewer, idle reviewer or report without captured result denies. Final locked claim/publication repeats core source authentication after facade checks; typed native-looking tuples alone are T shape observations. | D/N |
| N5R-05 P0 / N5-09/10 | Exact original getDelivery return positive with taskRef only in intent; missing/extra/mixed/foreign recipient/artifact/claim/generation/notification fields reject. Assert exact sent/currentAccess closed tuples and committed source evidence/time. Callback echo or fake sent result without actual getDelivery association gives no sent receipt. | T/D/N |
| N5R-06 P0 / N5-09/10/18 | Suspend publication; change peer/profile/lifetime, material/current artifact, policy/auth/claim or native availability before resolving. No stale success response or replacement-lifetime access. If effect already committed, preserve exact original publication/unknown obligation and receipt; no retry or fabricated rollback. Store race orders remain N5-09 D work. | T/D/N/P |
| N5R-07 P0 / N5-10/11 | Read-only query of sent/unknown/failed/historical delivery re-reads committed history and exact bytes. Missing source confirmation stays unknown/error; opening stays unknown.0append/send/create/claim/report/policy calls. Lost return after actual publication reconciles same delivery without creating another ID or resend. | T/D/N/P |
| N5R-08 P0 / N5-12/20 | Source permission decision table: actual scoped UNAUTHORIZED/PERMISSION_DENIED may yield denied current access; permitted exact read yields allowed current access. STORAGE_INVALID, CRYPTO_*, DIGEST_MISMATCH, missing binding/record, SERVICE_DISPOSED and unknown/read faults remain error/uncertainty, never denial/failed/delivered proof. Hostile error code accessor/Proxy/secret never executes or leaks. | T/D/N |
| N5R-09 P0 / N5-12 | Separate access update preserves delivery state/history and claim/reservation. Actual monotonic time/evidence, same-time identical dedup, backward/different same-time refusal and protected terminal headroom remain required. Access read alone creates0update; only explicit access operation may record it. Historical sent/unknown permission change never erases publication. | D/N/P |
| N5R-10 P0 / N5-18/19/20 | Repeated private read/status/query and fresh composition have0boot/write/publication/timer effect; disposed/old captured closures cannot use replacement peer/profile. Exact source fields detach under supported descriptor validation; raw content is confined to authorized artifact read and excluded from generic errors/logs/status. Actual public class/Loader provenance and rendered opening remain separate oracles. | T/D/N/P/U |

## Individual retained source AC mapping

[Traceability](../../acceptance-traceability.md) retains82 original plus five DF010 criteria; original source SHA256 `cf38310f93b9a7bd96efaca8ab53e1d71c16e86d6810513807c4b56ed33d1ca3`. These30 relevant NI5 IDs remain individually planned/unpassed. Remaining NI5 mappings are unchanged in the held design.

| Retained AC | Additive contribution and residual |
| --- | --- |
| BUB013-01 | N5R-02/03 source artifact/report truth; complete N5 report and actual source D/N pending. |
| BUB013-02 | N5R-02/08/09 exact version/bytes/current access; actual opening U HOLD. |
| BUB013-03 | N5R-05/07 original sent/unknown/per-item projection; full lineage N5 pending. |
| BUB013-05 | N5R-06/07 query committed-before-loss without resend; actual durable recovery pending. |
| BUB014-01 | N5R-03/07/10 truthful source/current/access status; rendering U HOLD. |
| BUB014-03 | N5R-06/09 late/CAS/race cannot rebind or repeat; actual store/UI pending. |
| BUB014-04 | N5R-08/10 metadata/error privacy only; keyboard/Chinese/resize/focus U HOLD. |
| BUB014-05 | N5R-02/10 exact artifact association; actual native navigation U/N pending. |
| BUB015-01 | N5R-03/04 exact native material coverage; useful review quality pending. |
| BUB015-02 | N5R-04 actual independent producer/reviewer; development CODE remains HOLD. |
| BUB015-03 | N5R-03/04 unknown/unavailable/stale cannot certify normal readiness. |
| BUB015-05 | N5R-01/03/04 supplied report/binding fields cannot grant or certify. |
| BUB006-01 | N5R-01/02/06/10 actual scoped current private native owner; N/P pending. |
| BUB006-02 | N5R-04/06 final exact source/current claim/permission checks; D/N pending. |
| BUB006-03 | N5R-01/08/10 closed secret-safe result and diagnostics; encrypted D pending. |
| BUB006-04 | N5R-02/05 exact published/read bytes equal approved association; D/N pending. |
| BUB006-05 | N5R-06/08 denial vs corrupt/unavailable; uncertain authority stops effect. |
| BUB003-01 | N5R-05/06/07 committed publication/readback receipt; crash D/P pending. |
| BUB003-02 | N5R-02/04/09 immutable version/source/current-access associations; D pending. |
| BUB003-03 | N5R-02/08 storage/crypto faults fail closed without fabricated denial. |
| BUB004-04 | N5R-06 postcommit abort/cancel preserves actual effect; no undone fiction. |
| BUB004-05 | N5R-06/07 actual current source/query, no old-lifetime replay. |
| BUB001-02 | N5R-06/10 current read/recipient closures on reload; ten native reloads pending. |
| BUB001-04 | N5R-06/07/10 actual full quit/restart unknown holds; D/N/P pending. |
| BUB016-01 | Exact additive hash, source observations and planned residuals; no executable/CODE claim. |
| BUB016-02 | N5R-01/02/05 normal native source/publication contribution; aggregate/M/U HOLD. |
| BUB016-03 | N5R-04/06/08/09 actual race/error/crash limits remain D/N/P pending. |
| BUB016-04 | N5R-01/10 physical package/public peer proof P NOT RUN; no release. |
| DF010-C04 | N5R-02 scoped exact digest/bytes/access; original attachment contract retained, live chat OUT. |
| DF010-C05 | N5R-05/07/08 sent/query/access uncertainty stays separate; live chat OUT. |

## Hold and remaining oracle boundary

No unresolved additive API/design mismatch remains against d404a0c2. Core readLocalArtifact/native projection/final claim/publication and installed original native bindings are implementation dependencies, not pending owner configuration. T doubles can check shape/branch/counters only. Actual encrypted RuntimeStore/NI3 authenticated review/registry/schema6/race/crash tests are D; actual pinned public classes/native permission/lifecycle are N; physical package/full quit/profile are P. All are NOT RUN by this docs task. CODE/browser/model/full82+5 acceptance and release remain HOLD. No held source/test/design/evidence is edited, no product test/native/provider/process/Git/external action runs, and the earlier NI4 typed result is not evidence for these new planned cases. Root must hold this document before affected source GO; later execution needs its own exact source lease and first-result preservation.
