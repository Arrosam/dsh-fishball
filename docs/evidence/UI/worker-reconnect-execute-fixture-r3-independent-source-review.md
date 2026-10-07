# UI worker reconnect execute fixture r3 — independent affected SOURCE review

Date: 2026-10-07 UTC. Reviewer: independent Sol 6.1 max source auditor, separate from author, independent ISTQB designer and root executor.

Disposition: **F-EP-R2-01 SOURCE_REMEDIATED; no new affected SOURCE blocker identified.** R3 makes exactly the requested two generation-literal corrections. This is a narrow source disposition, not an executed fixture result, functional acceptance or GO. Root owns any later bounded invocation and its test evidence. All87 remains accepted0/HOLD; the separately blocked final CODE investigation remains blocked and untouched.

## Exact freeze and preservation

Reviewed: `.runtime/ui-worker-reconnect-fixture-r3/` and its source-r3 MD/JSON companions. No completed broad r2 review was rerun; the prior independent r2 report and its unchanged source findings/obligations are retained.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| r3 manifest.json | 15573 | `4ddba4463b30e7fc7cda9989a56bd3c1a7e2bf8fc79efefd157bb6974152e64d` |
| r3 closure.sha256 | 2460 | `88b772916d7cfa8a9152815bd1335a5bceab107d23cb2bf4a77c0b60ddc37f8e` |
| r3 support/public-model-fixture.mjs | 7351 | `55f9132ed3d3a55a6ccf9b7223e6fbfcade7fc3f7831a3622264edce037bf994` |
| unchanged whole candidate/client-entry.cjs | 106631 | `4ba377f9973eddd6d1aebe66e014370f9f8ff7b1392b95528a51790040fd9e82` |
| r3 generation-only.patch | 1048 | `545963f2f20de251f17cdc6f4ed1c587bd3e04b09b3fb0b895364ae229dac3c2` |
| author source-r3 MD / identical README | 2520 | `4380ab4b83b1dabd18bf208f0db50a3eabf43eae74e0c804460fc604bc68154b` |
| author source-r3 JSON | 5854 | `64b03a7d487a4395b77f2be5c8604c09b97c513a0ab63c9fd958addd37f5daf6` |

Byte/text/evidence-JSON verification matched every17 authored-file pin, all34 public input pins, both predecessor pins, the public generation declaration, all19 closure entries and the capsule-relative manifest sidecar. The capsule contains exactly18 files; the two author companions are outside it. Including manifest/sidecar/closure gives20 authored paths.

All87 listed historical public files were unchanged. That file count is independent of the acceptance count. All16 previous independent report files, including the r2 EP review, were also preserved. The r2 independent MD remains13885B SHA256 `bd4b9a3ed346cef12f1038ffd230055461e2a03756f44fb584fb936adb8ca66f`; JSON remains66992B SHA256 `ef484e48e6a31b5ade45b983af4b4bccca6ca0aab36371bfd4652e87b6e2ee58`. Historical Apply capsule pins were hashed for conservation only; this lane did not review or authorize that separate capsule.

## Exact F-EP-R2-01 remediation

Location: `support/public-model-fixture.mjs:47`.

The ordered replacements are:

1. `Object.freeze({id:1,fixtureHost:'UNIT_ONLY-identical-host'})` becomes `Object.freeze({id:1,host:Object.freeze({home:'/tmp/UNIT_ONLY/df-ui-worker-r2'})})`.
2. `Object.freeze({id:2,fixtureHost:'UNIT_ONLY-identical-host'})` becomes `Object.freeze({id:2,host:Object.freeze({home:'/tmp/UNIT_ONLY/df-ui-worker-r2'})})`.

Each before literal occurs exactly once in r2 and each after literal exactly once in r3. Applying only those two substitutions to the entire r2 helper reproduces every byte of r3. Reconstructing the full unified diff exactly reproduces the sealed generation-only patch. Of seven ESM modules, only this helper changed; the other6 and complete CJS factory are byte-identical to r2. The changed helper has no other code, assertion, option, import, counter, barrier or cleanup alteration.

The original declaration at `@deepseek-ai/dsh-client-connection/lib/types/client/connection.d.ts:6–14`, 3935B SHA256 `85cc887caeae60ab13bd91f627ce793a42402d8f880c2af0f3f1fc0d256509d0`, requires a numeric id and host containing string home. Both corrected frozen labels satisfy that shape, have ids1/2, and retain the same synthetic home. The original complete stable getSnapshot+subscribe driver stores and EP01 transition order remain unchanged. The home is a synthetic string; no file is read, created or transmitted through it.

This closes the prior fixture DTO conformance finding at SOURCE level. The scope remains standalone UNIT_ONLY public-model stimulation. No generation store is injected into createWorkerModel, whose actual constructor has no connection argument. EP01 explicitly invokes the existing public disconnected methods. Neither this correction nor the generation labels establish authenticated original Connection/Gateway/Apply behavior or native authority.

## Unchanged fixture and functional gates

All64 case objects are identical to r2, including immutable expectations, inventories, entry/status/hold fields and priorMap references. Every WC01–36 and US01–24 case remains `HOLD_NOT_AUTHORED_IN_EP4_CAPSULE` with no entry. Only the case-map container status and explanatory successor label changed. No oracle or independent design was weakened.

Every existing inventory field is identical except the candidate path's r2-to-r3 capsule relocation with the same bytes/hash. Additions only record the generation correction and prospective root entry/syntax checks; these commands were not run here. The preparation flow, exact carrier routes/closed keys/CAS correlations, DTO replies, genuine public method calls, fifth-digest barrier, lost-reply barriers, unknown execution observations, monotone counters, no-replay assertions, first-failure stop, safe diagnostics and cleanup are preserved by exact source equality. The same callable MODEL_ONLY lazy React face and full CJS loader are retained; this is not mounted React or original host service proof.

| Cell | P | E | S | R | C | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| EP01 | 4 | 1 | 5 | 16 | 0 | NOT_RUN |
| EP02 | 4 | 1 | 5 | 16 | 0 | NOT_RUN |
| EP03 | 4 | 0 | 4 | 13 | 0 | NOT_RUN |
| EP04 | 4 | 1 | 5 | 16 | 0 | NOT_RUN |
| Whole | 16 | 3 | 19 | 61 | 0 | NOT_RUN |

Hard caps remain per-cell S5/P4/E1/R32/C0 and30seconds; whole S20/R128/C0 and120seconds. Readonly subcaps and explicit1500ms cleanup are unchanged. EP03 still selects only the null-detail representative. Ready-only task/worker query cannot settle an entered execute, and EP04 boolean acknowledgement cannot establish a committed effect. Disposing a model or settling a synthetic barrier proves no remote termination, native drain or quota release.

No additional affected source issue is introduced by the two DTO replacements. Root must independently decide the exact bounded one-run plan and record actual counts, assertions, deadline and cleanup. Until then EP01–04 remain NOT_RUN. Original host/Apply/Panel/browser/Cua validation, throwing-dependency US01, stale-version representative, external unknown query, cold/durable native reconciliation and authoritative capture/result/model evidence remain separate HOLD obligations. All previous r2 obligations and final CODE boundaries remain unchanged.

## Verification activity

Performed only source-text reads, SHA256/byte comparisons, exact literal replacement/difflib reconstruction, evidence JSON metadata comparisons and new independent MD/JSON writes. No JavaScript parsing/import/execution, fixtures/tests/builds, profile/native/model/network/browser/listener/database/Git actions, personal-data access or protected security experiment occurred. The companion JSON contains full pins and the exact evidence-only replay command, which exited0. This source disposition supplies no runtime or acceptance pass.

