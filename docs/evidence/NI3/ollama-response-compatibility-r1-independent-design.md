# NR-OLLAMA-RESP01 independent response compatibility design

Sealed independent SOURCE-only ISTQB design, 2026-10-07 UTC. Reviewer: /root/ni5_lifetime_independent_design, gpt-6.1-sol, reasoning max; English. This is a proposed finite offline unit. No application was parsed/imported/evaluated, no test or build ran, and no local endpoint, model, native worker, service, listener, browser, profile, database or Git action occurred.

The proposed unit contains 16 envelope/diagnostic families: 80 ordinary synthetic JSON specimens and 3 source-only equality observations outside the JSONValue promise, plus 10 preservation/HOLD cells. The total finite reference grid is83. Standalone executable cells in this design are zero; the selected pure export is declared, and author fixtures still require separate affected review and root GO. Source design does not grant root execution GO. All87 prior criteria remain accepted0/HOLD; permanent protected final CODE remains excluded/blocked/unchanged.

## Independent requirement and narrow compatibility relation

The controlling freeze is docs/next-native-wave-2026-10-07.md, NR-OLLAMA-RESP01, mapped to BUB006/011/012/013. The exact provider/request carrier remains df-approved-ollama, POST http://127.0.0.1:11434/api/chat, request model deepseek-v4.1-flash:cloud, think:false. Only these two response model strings are eligible for that unchanged route:

- deepseek-v4.1-flash:cloud
- deepseek-v4.1-flash

No trimming, case folding, suffix stripping, prefix removal, model fallback, other model, generic alias rule, retry or new request follows from this allowance.

The primary v0.40.0 ChatHandler rewrites an explicit-cloud request to its base name, and the proxy forwards upstream response status/body. This makes the base spelling a legitimate compatibility alternative; it does not establish that the historical response had that spelling. [Pinned routes.go](https://raw.githubusercontent.com/ollama/ollama/v0.40.0/server/routes.go), [pinned cloud_proxy.go](https://raw.githubusercontent.com/ollama/ollama/v0.40.0/server/cloud_proxy.go).

The public chat API defines model, message, completion and counter fields; its example uses assistant role. The public error contract permits an error body and warns that streaming errors can occur after the HTTP status has begun. Those facts reinforce the separate completion/error checks. They do not supply a DF authority or full-response oracle. [Chat API](https://docs.ollama.com/api/chat), [errors](https://docs.ollama.com/api/errors), [pinned public types](https://raw.githubusercontent.com/ollama/ollama/v0.40.0/api/types.go). Public cloud documentation distinguishes API model selection from local app/CLI cloud names; no account/settings change is required or proposed here. [Cloud documentation](https://docs.ollama.com/cloud).

Expected behavior was derived before reading the new author helper or test bodies. Basis: the root freeze, unchanged original public contracts, original54 independent design and primary public sources. Root additionally supplied an implementation-free declaration of the original five-predicate gate:

| Predicate | Exact original semantics to preserve |
| --- | --- |
| R | Nonfalsy result. |
| E | result.error === undefined. Defined null, false, zero, empty string, string, object or array refuses. |
| M | result.model equals exactly the request string or the newly pinned base string for the approved route. |
| C | result.done === true. |
| A | result.message.role === 'assistant'. Missing/non-assistant role refuses. |

Eligibility is R AND E AND M AND C AND A. Only M gains the pinned alternative. A truthy primitive can satisfy R while still failing the conjunction. For ordinary parsed JSON, refusing a top-level non-object/array preserves the original conjunction's outcome because it cannot carry all required fields. No arbitrary JavaScript proxy/accessor/class/prototype/descriptor guarantee is inferred. The three explicit undefined observations are source equality boundaries outside the selected JSONValue promise, not required callable tests or observed response representations.

An eligible envelope is necessary and insufficient for the full original response path. Original tools/thinking/content/byte/finish/usage/currentness/admission/timeout checks remain in force. NR-P12 deliberately demonstrates that an envelope can pass while content/finish/counters remain absent. That case is not a completed inference or valid native result.

## Decision table

“Approved route independently bound” is a SOURCE/integration prerequisite. The pure inspector does not authenticate provider, endpoint, agent, task, permit or source. It cannot broaden a response-name rule to another carrier merely because its input matches.

| Row | Condition | Envelope disposition | Full chain disposition | Finite diagnostic obligation |
| --- | --- | --- | --- | --- |
| NR-D01 | approved route independently bound; R=true,E=true,M=exact_request,C=true,A=true | ELIGIBLE | UNTESTED; original checks still required | finite eligible/exact-request facts only |
| NR-D02 | approved route independently bound; R=true,E=true,M=pinned_base,C=true,A=true | ELIGIBLE | UNTESTED; original checks still required | finite eligible/pinned-base facts only |
| NR-D03 | M other/missing/nonstring, remaining conditions true | REFUSE | NO helper-created success/authority | finite name-mismatch facts; no arbitrary name |
| NR-D04 | R=false (falsy result) | REFUSE | NO helper-created success/authority | finite result fact; no raw input |
| NR-D05 | E=false (any defined error, including null/false/0/empty string) | REFUSE | NO helper-created success/authority | finite error-defined fact; no error value |
| NR-D06 | C=false (done not exactly true) | REFUSE | NO helper-created completion | finite completion fact |
| NR-D07 | A=false (message.role not exactly assistant or unavailable) | REFUSE | NO fabricated assistant/content | finite assistant-role fact; no role value |
| NR-D08 | multiple failed predicates | REFUSE | NO partial success; declared first refusal order applies | first refusal shape/error/completion/model/assistant; no historical single-cause claim |
| NR-D09 | all five true; original content/finish/usage/tools/thinking validator rejects or unobserved | ELIGIBLE ONLY | FULL_CHAIN_REFUSAL_OR_HOLD per unchanged original checks; NOT_RUN here | helper facts cannot imply downstream validation |
| NR-D10 | all five true; route/source/permit/currentness missing or lost | ELIGIBLE ONLY if pure input inspected | NO original authority/new dispatch/success; lifecycle proof HOLD | pure helper cannot attest currentness |
| NR-D11 | historical HTTP200/local_failure; five predicate values not observed | NOT_RECONSTRUCTED | UNKNOWN/HOLD unchanged | cause UNDETERMINED; no retroactive diagnostic fill |

Refusal observations must be independently asserted from the declared predicates and literal synthetic specimens, not computed by the implementation under test or reconstructed from an unavailable historical payload. The root-owned signature companion declares first refusal order: shape, error, completion, response model, assistant role. Multiple failures must follow that order while preserving truthful inspected facts; not-inspected is an allowed finite value for skipped stages. This is a future synthetic diagnostic rule, not a reconstruction of historical R01.

## Finite proposed offline grid

Each family expands only its listed values; crossed families use both pinned names. No random generation, arbitrary loops, retry or replenishment is proposed. The 83 observations are a finite partition/boundary proposal: 80 ordinary JSONValue specimens and3 held source equality boundaries. They are not a demand for one test title per observation. A later fixture review must identify coverage, representative equivalence rationale and remaining gaps from actual assertions. Test count alone neither passes nor fails coverage.

The ordinary positive DTO can contain bounded synthetic content and factual-shaped counters for clarity, but the pure envelope helper proves nothing about their downstream validation. “Missing” means absent property. “Explicit undefined” is a source-only equality observation outside ordinary parsed JSON; it is not proposed as a required public helper invocation. Synthetic private markers are invented test strings, never credentials, private response content or personal data.

| Family | Specimens | Technique | Exact finite stimulus values | Independent expected public observation |
| --- | --- | --- | --- | --- |
| NR-P01 | 1 | DT/EP | model exactly deepseek-v4.1-flash:cloud | Five-predicate envelope eligible. Exact request-name relation; no downstream or native success claim. Valid diagnostic: schema fixed, accepted true, responseShape object, errorField absent, completion complete, responseModel request, messageShape object, assistantRole assistant, refusal NONE. |
| NR-P02 | 1 | DT/EP | model exactly deepseek-v4.1-flash | Five-predicate envelope eligible. Pinned base-name relation; all other logical observations agree with NR-P01. Same valid diagnostic except responseModel cloud-base. |
| NR-P03 | 8 | EP | DEEPSEEK-v4.1-flash:cloud; Deepseek-v4.1-flash;  deepseek-v4.1-flash:cloud; deepseek-v4.1-flash ; deepseek-v4.1-flash:latest; deepseek-v4.1-flash:cloud:cloud; ollama.com/deepseek-v4.1-flash; other-synthetic-model | Refuse each spelling. No trimming, case folding, prefix/suffix removal, generic alias, remote model or fallback acceptance. |
| NR-P04 | 5 | EP | model absent; model null; model 0; model ordinary object; model array | Refuse; do not coerce a nonstring or missing model into either pinned string. |
| NR-P05 | 10 (1 outside-JSON HOLD) | EP/DT | undefined (direct pure input only); null; false; 0; empty string; true; 1; SYNTHETIC_RAW_RESPONSE string; empty array; empty ordinary object | Refuse all. Preserve nonfalsy as the original first predicate: truthy primitives/array/object need not fail that first predicate, but cannot pass all five. No raw input in diagnostics. |
| NR-P06 | 14 | DT/MC-DC | error null; error false; error 0; error empty string; error SYNTHETIC_UPSTREAM_ERROR string; error ordinary object containing a synthetic private marker; error array containing a synthetic private marker (each of the two pinned names) | Refuse all because error is defined. A falsy error is not absent; correct model/done/role cannot mask it. Diagnostic facts never contain the error value. |
| NR-P07 | 2 (2 outside-JSON HOLD) | DT/boundary | own error property explicitly undefined (each of the two pinned names) | Five-predicate envelope eligible because error === undefined. This is a logical equality boundary, not an observed JSON wire representation or a new wire allowance. |
| NR-P08 | 10 | DT/MC-DC | done absent; done false; done null; done 1; done string true (each of the two pinned names) | Refuse all; only boolean true satisfies completion. Truthiness, HTTP200 and an accepted name do not supply completion. |
| NR-P09 | 8 | EP/DT | message absent; message null; message SYNTHETIC_MESSAGE string; message empty array (each of the two pinned names) | Refuse; no assistant role exists. No coercion, fabricated assistant message or raw message diagnostic. |
| NR-P10 | 12 | DT/MC-DC | role absent; role null; role user; role tool; role Assistant; role assistant followed by a space (each of the two pinned names) | Refuse; role must be exactly assistant. No case/whitespace normalization or inference from content. |
| NR-P11 | 2 | DT | error SYNTHETIC_COMBINED_ERROR, done false and role user together (each of the two pinned names) | Refuse. Declared first refusal ERROR_FIELD_PRESENT for both names; inspected facts truthful, skipped facts not-inspected when applicable. No success or historical cause claim. |
| NR-P12 | 2 | claim boundary | content, done_reason and all counters absent (each of the two pinned names) | Five-predicate envelope eligible only. It proves no content, finish, API usage, bill, native capture/result, settlement or completion of the full adapter chain. |
| NR-P13 | 2 | CO/metamorphic | synthetic distinct private markers in content, thinking, response-like headers, token-like fields, credential-like fields and arbitrary nested metadata; all five gate inputs unchanged (each of the two pinned names) | Same five-predicate eligibility. Diagnostics are restricted to the declared finite projection and contain none of these markers, values, nested objects or field dumps. Downstream thinking/tools/content validation is not executed by this unit. |
| NR-P14 | 2 | CO | model SYNTHETIC_PRIVATE_MODEL_MARKER with role assistant; model pinned base with role SYNTHETIC_PRIVATE_ROLE_MARKER | Refuse; classify mismatch with finite facts, never echo the arbitrary model or role. |
| NR-P15 | 2 | BVA/CO | defined error string containing an ASCII private marker and filler, exactly 32768 UTF-8 bytes (each of the two pinned names) | Refuse; the diagnostic schema/size remains finite and does not grow with or retain the upstream value. This is diagnostic projection coverage, not a response-byte-limit test. |
| NR-P16 | 2 | DT | remote_model equals exact request name; name equals pinned base name | Refuse. Alternate fields do not substitute for the primary model field or bind the exact approved route. |

The two positive controls differ only in the primary model string. For every crossed negative family, the invalid done/error/message/role field must refuse under each permitted spelling. This checks that the new name alternative neither shadows the original predicates nor suppresses refusal.

The diagnostic marker cases are gate/projection cases. In particular, allowing arbitrary synthetic thinking/content metadata through the five-predicate inspector does not assert that the unchanged full adapter accepts it. No downstream adapter or real API response is fabricated.

## Diagnostics and selected public seam

The root-owned implementation-free companion docs/contracts/ollama-response-envelope-v1.md declares inspectResponseEnvelope(result: JSONValue): Readonly<EnvelopeDiagnostic> and ACCEPTED_RESPONSE_MODELS, the exact readonly two-string tuple. Input is bounded JSON.parse(raw) with no reviver, or ordinary synthetic JSON data. Arbitrary JavaScript proxies/accessors/classes/functions/symbols/constructed authority are outside the promise. No fetch injection, adapter constructor, original agent/session, loop marker or fake currentness callback is invented. The original exported ApprovedOllamaAdapter/getApprovedOllamaBinding/permit/ownInstalledStream interfaces are preservation references only and are not invoked by this unit.

The diagnostic has exactly nine enumerable data fields. The closed schema below was read solely to identify the public surface; independent gate expectations were already derived from the frozen requirements and original declaration.

| Field | Closed domain |
| --- | --- |
| schema | df.ollama-response-envelope/v1 |
| accepted | boolean |
| responseShape | null, array, object, string, number, boolean, missing, unsupported |
| errorField | not-inspected, absent, present |
| completion | not-inspected, complete, incomplete, missing, invalid |
| responseModel | not-inspected, request, cloud-base, missing, non-string, unapproved |
| messageShape | not-inspected, null, array, object, string, number, boolean, missing, unsupported |
| assistantRole | not-inspected, assistant, missing, non-string, unapproved |
| refusal | NONE, INVALID_RESPONSE_SHAPE, ERROR_FIELD_PRESENT, COMPLETION_NOT_TRUE, RESPONSE_MODEL_NOT_APPROVED, ASSISTANT_ROLE_REQUIRED |

Only these declared boolean/finite-enum facts concerning the five predicates and bounded shape/refusal classes are diagnostic facts. The model relation must be a finite class or independently bounded pinned value, never the arbitrary returned model. Error facts must preserve errorUndefined semantics; a defined falsy error cannot be labeled absent. A truthy primitive cannot be labeled a proven object. First refusal follows the declared shape/error/completion/model/assistant order; no diagnostic NONE/accepted true is possible when one fails. Missing/unsupported domains are finite classifiers, not a promise to accept arbitrary non-JSON JavaScript input.

Diagnostic facts must never retain upstream error text/value/object, content, thinking, headers, tokens/token values, credentials, arbitrary model/role, nested response values, whole input serialization or raw exception messages/stacks. The independent NR-P06/13/14/15 markers check conservation. Different marker values must not enlarge the finite schema or echo the source.

The proposed serialized diagnostic check ceiling is 1024 UTF-8 bytes, subject to root freezing the actual finite schema/size before GO. It is an offline specimen budget, not an invented original runtime interface. Existing allowlisted API usage observations remain separate from these diagnostic facts. Neither supplies price, billed amount, native authority or a semantic verdict.

## Explicit untouched-boundary and missing-proof cells

The following cells preserve original requirements and map back to original54. They are not newly exercised by the helper unit. Their SOURCE/lifecycle/conservation distinctions remain explicit; a synthetic envelope result cannot close them.

| Hold | Boundary | Required preservation / missing proof | Original54 mapping | Disposition |
| --- | --- | --- | --- | --- |
| NR-H01 | Exact request carrier and route | Provider df-approved-ollama; POST http://127.0.0.1:11434/api/chat; request model deepseek-v4.1-flash:cloud; think:false; bounded nonstreaming request; empty tools and no foreign destination/fallback/retry. Pure envelope inspection has no transport or provider authority. | P01, M01, M02 | SOURCE_PRESERVATION_HOLD; no wire observation or wrong-route execution proposed. |
| NR-H02 | Untouched response validators | Keep original tools, thinking, content/type/UTF-8, finish stop/length mapping and other downstream checks byte-preserved. The helper gate is necessary and insufficient; name compatibility cannot bypass them. | M03, M05 | SOURCE_PRESERVATION_HOLD; downstream functional checks NOT_RUN and not newly exercised. |
| NR-H03 | Independent byte/token/usage budgets | Original frozen maximum request32768 bytes, response98304 bytes, visible result16384 bytes, output512 tokens, admitted usage33280 units/action; per-call configured bounds still apply. Envelope/body/output/token budgets remain distinct. | M04, M06 | SOURCE_PRESERVATION_HOLD; no budget-edge runtime proof from the pure helper. |
| NR-H04 | Actual accounting and billing | Actual prompt/eval counts remain nonnegative safe integers; optional cached count cannot exceed prompt total; aggregate/disjoint accounting remains original. Missing counts are not zero, bytes or estimates. df-ollama-api-token-units/v1 and billing unknown; original configured cost allocation remains an estimate, not price or a billed amount. Diagnostic facts carry no raw tokens or token values. | P04, M04, H06 | SOURCE_PRESERVATION_HOLD; no usage, owner snapshot, permit, cost or bill observation. |
| NR-H05 | Genuine original authority/currentness | Original owned agent-loop/session, per-invocation permit, source/module/fiber/service/registration and current captured checker remain required before dispatch and throughout resumed iteration/terminal publication. Copied metadata/caller booleans/helper output cannot establish authority. Refused captured checker cannot be replaced with fresh admission. | M09, L01, L02, L03, L04, L05, L06 | PUBLIC_LIFECYCLE_HOLD; no fake adapter, agent, Context, checker or native proof. |
| NR-H06 | Cancellation, deadline, drain and unknown | Original 60000ms request deadline, AbortSignal/currentness loss and owned cancellation semantics remain unchanged. Local abort, synchronous close, inactive audit, guard refusal, iterator.return refusal or context disposal alone do not prove remote termination/drain/release. Preserve unknown holds. | M07, M09, L02, L10 | PUBLIC_LIFECYCLE_HOLD; no timing/abort/drain/cancellation execution. |
| NR-H07 | Attempts, concurrency and ledger | No helper reset/replenishment/replay or reservation/uncertain-hold mutation. Original failed request remains attempted1. Original task attempt1/retry0 and single-active admission remain unchanged. Original six-position freeze is historical finite execution control; new owner permission is not a reset or a global six-call provider quota. Any later live command needs its own exact finite accounting. | M08, L06, L08 | CONSERVATION_HOLD; no mutation or later request authorized by this design. |
| NR-H08 | Native result/finish, UI and authoritative audit | Name/envelope eligibility supplies no grant, execution receipt, native capture, workerResult, query-ready state, authoritative audit verdict, settlement or installed UI acceptance. Original task/permission/expiry and stop-before-release obligations remain intact; original missing audit/UI contracts remain held. | L08, H01, H02, H06 | CONSERVATION_HOLD; no host, ledger, UI or audit proof. |
| NR-H09 | Historical original R01 | Preserve executed capsule, source, raw/private observations, attempt markers and reserved/consumed positions. Exactly one HTTP200 followed by OLLAMA_INVALID_RESPONSE/local_failure, remote/billing unknown and uncertain hold; failed predicate/cause remains undetermined. R02-R06 NOT_RUN. Do not replay R01 or retrofit future synthetic diagnostic facts onto it. | R01, R02, R03, R04, R05, R06, H03 | CONSERVATION_HOLD; historical facts are frozen root requirements, not fresh observations by this lane. |
| NR-H10 | Missing public fixture seam and later GO | The root-owned implementation-free inspectResponseEnvelope JSONValue/nine-field schema is now declared. Exact pure helper/import closure/author assertions need separate affected review. Require exact successor/source/literal pins, independent code review, affected independent fixture review and root-owned finite command GO. No original adapter/agent construction, transport substitution or new harness. Later actual inference is a separate frozen case; quota errors stop it. | M01, M03, M10, H03 | CONTRACT_DECLARED_AFFECTED_FIXTURE_AND_EXECUTION_HOLD; zero standalone executable cells in this design. |

Original currentness public signatures remain genuine-source requirements: one trusted checker for the already admitted exact invocation; no replacement admission after refusal; original owning fiber/service/registration lifecycle; no public token constructor or replacement authority. The captured guard can also refuse iterator return/cleanup. There is no new public drain or remote-termination acknowledgement, so unknown holds persist when genuine lifecycle evidence is missing.

The original 1000000 micro-unit/action and 6000000 total allocation are configured admission estimates from the old finite six-slot plan, not price, actual bill or provider quota. Actual API token units remain distinct from synthetic bytes. This helper design observes none of them and does not continue the old live command.

## Historical R01 and evidence conservation

The root freeze states that the original command ran once: one HTTP200, followed by OLLAMA_INVALID_RESPONSE/local_failure, remote outcome unknown, billing unknown, uncertain hold and attempted1. R02–R06 were NOT_RUN. The failed predicate and cause remain UNDETERMINED.

The compatibility defect is independently documented at the route/name relation. It does not retrospectively identify R01's cause. No historical response values were inspected in this lane; no future diagnostic facts are filled into the old observation. The executed capsule, original source, raw/private observations, reserved/consumed positions and attempt markers remain immutable. Original context disposal resolving does not validate a response, establish billed cost, clear an uncertain remote outcome or grant replay credit.

## Finite bounds and root GO prerequisites

The proposed root offline unit permits 80 listed ordinary JSON specimens, one inspectResponseEnvelope call per specimen (80 total); the3 outside-JSON source equality observations stay held, no retries, no arbitrary fuzz/loop, at most65536 UTF-8 bytes per synthetic specimen and exactly32768 bytes for the largest defined-error string. The proposed command ceiling is60000ms. No runner has been authored or executed by this lane.

External/local endpoint requests0; actual model requests0; native actions0; task/permission/grant mutations0; persistence writes0; listener/process creation0. Only a future root-owned pure Node test process after explicit scoped GO can change the process/test count. Unit fixtures may contain ordinary synthetic DTOs; they have no original host/native provenance.

Root must complete these steps before any offline execution:

1. Verify the pinned implementation-free signature/nine-field schema and exact pure helper/import closure agree, with no side effects.
2. Pin the exact successor/source manifest and before/after/literal. Independently review the unchanged request carrier and byte-preserved downstream/currentness/usage/timeout checks. Preserve the failed source and evidence.
3. Freeze author fixtures after this design; independently review actual assertions and exact calls against this grid, declaring complete/partial/held coverage.
4. Review the exact finite command, source/fixture pins and process scope; decide root GO. This design grants none.
5. Record real syntax/pure test results without native/model/usage/currentness claims. Stop on first drift, mismatch, unbounded/out-of-schema diagnostics, effect/import scope violation or timeout; no live fallback.
6. Freeze any later actual model case separately under the exact owner authorization, count every real request and usage observation, preserve unknown outcomes and stop on quota errors. It cannot replay old R01 automatically.

This lane has performed only authorized SOURCE/public-documentation reads and evidence metadata/JSON checks. The selected pure contract was read and pinned before seal. The author helper/assertions, application behavior and all executable/downstream obligations remain NOT_RUN or pending their separate reviews.

## Exact local pins and external provenance limits

| Local source/evidence | Bytes | SHA-256 | Read scope |
| --- | --- | --- | --- |
| AGENTS.md | 8292 | f7b4685d6c376159a9de2114c10acd3c08710ceed732b4ea7f07f7ed404e95ba | complete text |
| docs/next-native-wave-2026-10-07.md | 6662 | 840aaa086d41b9a2e6579ca4d86f0247305a413631ab7da48bb9ca703c28ba44 | complete text; controlling NR-OLLAMA-RESP01 freeze |
| .runtime/ollama-dsh-integration-source/contracts.json | 3821 | d7481ba67c7059f2ba7c621a1dacdeb81a7ec8cce96ed1219bab233ee0f35cb1 | original public contract; complete JSON evidence |
| .runtime/ollama-dsh-integration-source/public-contract-refinement.md | 8588 | c5a748dac880c58259ab19b9eaeec7040a3d6f4ca01502091e0c42c63fbb6ef8 | original implementation-free public contract; complete text |
| .runtime/ollama-dsh-integration-source/public-contract-refinement.json | 15322 | da1adc6c56fb495aa76cb1004eab7664738333c537b851edb3ec76b7de06e913 | original implementation-free public contract; relevant publicAdapter/reportedPermitUsage/audit fields |
| .runtime/ollama-dsh-integration-currentness-r1/public-contract-currentness-r1.md | 2184 | 0b10f59c8d13e63729a3f2748753cc12747df0f6843df0c0d610c8459f034781 | original additive implementation-free currentness contract; complete text |
| .runtime/ollama-dsh-integration-currentness-r1/public-contract-currentness-r1.json | 1953 | 7a85dd198850ff6fe3f74fa9c0e0d71f42f4e78d8c61346e270f449543382960 | hash/bytes only; MD companion read |
| docs/evidence/NI3/ollama-installed-worker-independent-design.json | 51212 | 872f4d3f484ec3704d70db1ff210ddf143b8f98457ad122a45f3b4de61412b2f | immutable independent original54; selected families/publicSeams/resourcePlan/accounting |
| docs/evidence/NI3/ollama-installed-worker-independent-design.md | 53185 | 45db6968d99ca1c2d9af031bcc714b7e54d774b63c8552666f70e3277aa883b4 | hash/bytes only in this affected lane; immutable |
| docs/contracts/ollama-response-envelope-v1.md | 2692 | dd4ea5f652797e46db8197141bc4f9686307158457bc6452d143eefd708f9993 | complete root-owned implementation-free signature/finite diagnostic companion; no author implementation/assertion |

The original five-predicate declaration came from root's implementation-free collaboration message on2026-10-07; it is not a byte-pinned author assertion. The separate root-owned public companion was read afterward to select the call/schema only; it does not replace the original behavioral basis or supply author assertions.

External public provenance: versioned v0.40.0 routes.go2748–2756, cloud_proxy.go153–160/210–224, api/types.go Message184–205 and ChatResponse/Metrics484–527; current public API/chat, API/errors and cloud pages observed2026-10-07. URLs/tag/read windows are references, not verified whole-file SHA-256 seals; live documentation is not claimed as immutable v0.40.0 bytes. The separately frozen local implementation/source closure is a later root/code-review prerequisite.

Companion: docs/evidence/NI3/ollama-response-compatibility-r1-independent-design.json. Existing original54, memory, UI, NI6 and historical source seals remain unchanged. No native/real-model/API usage/billing/visual pass, historical cause attribution, release or acceptance promotion follows.
