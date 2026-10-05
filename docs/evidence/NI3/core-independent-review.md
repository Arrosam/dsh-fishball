# NI3 independent MAIN5 core functional review

**Bounded functional verdict: PASS across the retained first execution and the single affected fixture retest.** All81 distinct leaf cases and ten parent wrappers have passing evidence across those two commands. No single corrected91-node full rerun is claimed. This review is independent from the core author and is not a CODE verdict, native authentication/collector proof, model-quality assessment or full AC/product acceptance.

The root assigned `istqb_review` a source lease for actual synthetic encrypted MAIN5 RuntimeStore and separate OS processes, after author baseline `5619192` and the narrow historical `readAuditInput` addition. The [author read hold](read-input-author/source-hold.json) is SHA256 `1b140e452bc48c470b9005664be8254ed2d4388e69d9817eb6353c9a21e06046`. Independent [before](core-independent-before.json) and [after](core-independent-after.json) inventories match all13 held source/evidence entries, all five genuine tracked schema4 modules and the two contract/design pins. Four current product modules comprise the tested closure; their remaining imports are Node built-ins. No schema6/7 or changing installer/runtime/native/client/provider module was imported.

| Exact held current source | SHA256 |
| --- | --- |
| `src/runtime-store.mjs` | `694b98fbf41090f0278e1421c3b324a236a0f0fcf11d94ff2d685e54d8f2b648` |
| `src/ledger.mjs` | `f629b14679a210e319775466a90f9afcadad75462f8a401b7939e93653da0e44` |
| `src/runtime-security.mjs` | `66fd91b6042eadf7de89c22d18e12a68ed27aec67a87aa4aaf7e5c6df0eda820` |
| `src/context.mjs` | `6fd7ba5b84353382fe5d3656af8717d1d4200c309dd808d79c52fe20728f3700` |
| Supporting `src/foundation.mjs` | `d4c28785b5ab867daef94476547044b67b9861631c1f27326438bd58188fa154` |

The [original audit contract](../../normal-runtime-audit-contract.md) remains `9e806aaf1c224581d43ae54fffe6775e18d58400c20fcc42814b844859a1c012`; the [original independent20-family design](test-design.md) remains `f3e4f79e761310ed98f568bf14843c01448fcba4b22cabfa543acfa7a94d354f`. The [finite supplementary plan](core-independent-plan.md) maps these19 independently chosen families to that design. The five tracked source4 modules and unchanged original provenance manifest were checked before importing their actual old writer. Its manifest remains `d74f0e0225add1b7c3ee80897ac5b13254bd63355f62306f6b8f7245d1db6d92`; no source/version header was relabelled to create a migration fixture.

## Commands and exact outcomes

Commands ran under installed Node **v22.22.2**, darwin/arm64, with the sanitized environment shown below. These cases needed no optional public-library flag, original host, listener, HTTP, provider or native inference.

```sh
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test test/normal-audit-core-functional.test.mjs
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test --test-name-pattern='^N3F08 ' test/normal-audit-core-functional.test.mjs
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --check test/normal-audit-core-functional.test.mjs
```

| Command | Actual result | Evidence |
| --- | --- | --- |
| First independent command | exit1;91 TAP nodes,81 PASS/10 FAIL;81 leaf cases of which72 passed and9 failed, plus ten parent wrappers of which one failed;0skip/cancelled;3652.3935ms | [First raw TAP](core-independent-first.tap), SHA256 `b6acac752663c06280f5e080b1cb9fb0b69850fe156f16cd18b6aa8419aa5f95` |
| Affected N3F08 only, after fixture correction | exit0;16/16 TAP nodes:15 leaf cases plus one parent;0fail/skip/cancelled;860.970708ms | [Affected raw TAP](core-independent-fixture-retest.tap), SHA256 `5b51766a06c863f2fb0c35eb0aabd3779a22c139ee37dfbc9213eb5af8551f8c` |
| New independent test syntax | exit0 | [Syntax output](core-independent-syntax.txt), command/result in [results](core-independent-results.json) |

The nineteen families have81 distinct leaf cases and ten parent wrappers. The nine failed leaves were all in N3F08 and share one wrong fixture projection. The unaffected18 families were not rerun, and the author's135 earlier cases or ten narrow-read cases were not rerun or counted as independent. Repeated cases in the affected family are not added to the distinct total.

## Preserved fixture finding and correction

`N3F08-FIX01` assumed `answer.verification.digest` existed. The genuine closed verification projection contains verdict/evidence/reviewer/generation/report/result refs; exact artifact digest/version belong to the separate report and artifact/review association. Each failing case had already checked its intended report/verification state before this wrong field assertion. This was a fixture mismatch, not a demonstrated product defect.

The complete first test is preserved at [core-independent-first-test.mjs.txt](core-independent-first-test.mjs.txt), SHA256 `5d9da1692f02d4779cd46c8719ad10dfff2c5f8c7d8458fb9091a5f61504041c`. The [exact diff](core-independent-fixture-correction.diff) replaces only that projection oracle with checks of report digest/version, current exact artifact digest/version and full verification equality, and the distinct review's exact report/result/digest/version linkage. No negative assertion or case was removed. No product, author test, old independent test or old evidence was changed. The corrected [independent test](../../../test/normal-audit-core-functional.test.mjs) is SHA256 `0f10641fe8f768aed2ca7e938854660c862e75de72552fd911d8674b0a49619d`.

## Expected versus observed functional oracles

Each row is actual encrypted-store evidence unless specifically a closed-shape guard. Column counts are leaf cases; parent wrappers are reported separately above. All rows except N3F08 use the first raw TAP; N3F08 uses the affected retest. [Machine-readable results](core-independent-results.json) retain every nested name and original outcome.

| Family / leaves | Expected oracle | Observed |
| --- | --- | --- |
| N3F01 /1 | Independent canonical full material/input/action hashes, Unicode/escaping, distinct input/artifact digests, unchanged task/semantic versions, exact replay and conflict | PASS; complete four-record input matched independent bytes/digest; one replay/no extra fact |
| N3F02 /13 | HOST-only detached historical projection; foreign scope/task and absent association; hostile closed descriptors before property execution; no rows/bytes/permission change | PASS; getter/proxy traps0; unauthorized roles denied, task mismatch distinct from absence; exact no-write projections/counts/file hash |
| N3F03 /3 | Full serialized input bound N−1/N/N+1, including escaping; undersized selection leaves no partial input/receipt | PASS; below-size limit refused atomically, exact/larger accepted same complete byte length |
| N3F04 /8 | Input/ref/artifact/material/audit/purpose/resume/lineage substitutions cannot preserve consent; caller mutation after plan cannot rewrite stored spec | PASS; every invalid plan leaves original facts/bytes; independently recomputed action digest and original stored fields retained |
| N3F05 /1 | Private reviewer can read exactly derived material/input; cannot project HOST history, cross task or rebind; factual stop seals handle while effect uncertainty holds | PASS; exact five-record allowlist and authority/generation refusals; stop retained reservation1 |
| N3F06 /13 | Expiry N−1/equality/N+1; literal permission true only; revoke/pause/cancel/downshift/semantic/memory changes deny consume without mutation | PASS; exact failures and held intent/reservation retained; historical read remains available without renewing admission |
| N3F07 /3 | Procedural task CAS preserves requirement semantics; newer artifact/context invalidates certification while late captured output stays factual history | PASS; procedural waiting task verified but stayed waiting; changed artifact/context rejected AUDIT_STALE with no report write |
| N3F08 /15 | Complete disjoint coverage, closed response, findings15/16/17 and truthful configured severity/fatal/unknown/unexamined verification | PASS after sole fixture correction; fatal/resolved warning rejected, nonblocking info accepted, unknown/budget/partial did not certify; overlap/omission/foreign/extra/truthy/17 findings refused |
| N3F09 /11 | Complete result bytes N−1/N/N+1; strict cursor/UTF-8/secret/descriptor/session checks with no association/receipt | PASS; exact byte cases and safe-integer cursor checks; hostile access0 and registered secret absent from export/DB bytes |
| N3F10 /1 | Immutable exact capture replay; conflicting bytes/cursor/evidence, direct report/verify and unrelated roles cannot bypass captured-result association | PASS; result/ref remained original; no bypass report or verification |
| N3F11 /1 | Before-commit compound report+verification fault rolls back both; exact acknowledgment replay and authentic stopped/reopened history | PASS; FIXTURE_CUT snapshot/count/file unchanged; later exact report+verification linked; released0 reservations; old reviewer sealed |
| N3F12 /2 | Active predecessor blocks repair; wrong/missing/skipped prior-report lineage leaves no charge; total attempts1/2 governs second admitted action | PASS; active refused, actual stop+known settle released; total1 refused repair, total2 committed exact compound claim/lineage/attempt2 |
| N3F13 /1 | Ordinary progress cannot consume reserved final output; complete output/report still commit and known reconciliation releases | PASS; ordinary RECORD_LIMIT unchanged, runtime_data5→6 only through output; accepted report and reservation1→0 after typed stop/settle |
| N3F14 /1 | Already-open independent processes race one final consume; exactly one admission, duplicate false and late fence read only | PASS; results `[false,true]`, attempts1/reservation1, repeated false/no writes |
| N3F15 /2 | Revoke-first denies consume; consume-first retains admitted fact but denies later request; both preserve hold/history | PASS; both forced process orders returned CLAIM_REVOKED at respective fence, historical read unchanged, attempts1/reservation1 |
| N3F16 /1 | Two different tasks/processes race actual global last active unit; one claim/charge and no partial loser | PASS; one winner, one ACTIVE_FULL, units1/attempts1/reservation1; loser remained requested/attempts0 with no cross-task mapping |
| N3F17 /1 | Genuine tracked4→5 exact backup, encrypted permitted data and signed historical receipt/tombstone replay; no new input origin; old4 future refusal | PASS; exact source backup and table counts, original acknowledges/read/tombstone preserved; plain historical context remained AUDIT_INPUT_REQUIRED; old4 rejected without byte/entry change |
| N3F18 /2 | Genuine4 wrong key/backup collision preserves original main/entries and existing backup | PASS; KEY_MISMATCH/STORAGE_UNAVAILABLE with original byte hash/rows/entries, no replacement backup |
| N3F19 /1 | Actual abrupt child exit after acknowledged captured output preserves result/input and unknown reservation on reopen, without auto report or repeat effect admission | PASS; child exit79, captured result1/report0; recovery_required and exact unknown execution/claim/result, held reservation1; historical read and repeat false made no writes |

The process fixture opens each independent connection before parent claim/intent work, avoiding constructor recovery as an implicit ordering mechanism. Both consume/revoke orders are explicitly acknowledged before the next operation. Last-slot claim contenders target distinct tasks. The abrupt child owns its entire typed claim/begin/consume/capture sequence and exits without closing after the capture acknowledgment; reopen examines the committed result, not a guessed callback outcome. Process results represent durable core admissions, not provider streams or external effects.

## Evidence level and retained acceptance debt

Actual ContextAssembler operates on authoritative encrypted records; its integer tokenizer is an explicit fixture double. Constructor host permission, original-style opaque host/reviewer capabilities, model/catalog/price facts and observed session/cursors are also transparent trusted integration doubles. Core associations, immutable consent, encryption, CAS/claims, historical reads, compound transactions, true independent processes and crash/reopen are observed directly. No real original DSH service/class/request/persisted native collector or reviewer model is involved. Thus these tests provide D/T evidence only.

The [87-row independent AC register](core-independent-ac.json) retains every82 historical and five DF010 criterion individually, including original remaining disposition/source links. Relevant rows name their exact new families; unaffected rows remain outside this supplement with prior debt retained. No entire criterion is promoted. The report/full artifact verification path is tested; a direct completed-state audit-gate matrix, all historical storage fault/hot-journal/corruption variants, every pool/round/attempt/performance bound and full actual native loss chain are not newly executed here. Protected-row/ciphertext/raw-row corruption remains excluded; the existing authenticated inverse validation's STORAGE_INVALID contract is not represented as an independently executed tamper proof.

Actual installed audit configuration/owner consent, source-owned normal preparation origin, current native session/material delivery, original provider one-use permits, actual result collector/reviewer independence, useful model review quality, lifecycle/quit/UI and physical-package installed path require their separate authorized units. No release/publish/MVP or normal-interface readiness follows from this PASS. Final independent CODE remains blocked, browser/visual/full AC/product gates remain HOLD, and live chat platform validation remains OUT of this phase. No denied runtime-policy action or capacity bypass occurred in this lane.

## Hold and source-lease release

The new test, first snapshot/TAP, affected retest/diff, inventories, plan, syntax/result/AC files and this report are held under [core-independent.sha256](core-independent.sha256). All old author/independent evidence remains unchanged. This finite assignment reports no reproduced product defect and requires no production correction.

**The independent MAIN5 read/execution source lease is released on this held checkpoint.** Root may assign the next authentic5→6 logical unit using exactly the five current source pins above and the separately preserved genuine4 archive; this release authorizes no schema6/7 import/run by this lane. Future source/test transitions need their own explicit hold and genuine source5 writer, rather than relabelling a new writer. This review never replaces the separate CODE requirement.
