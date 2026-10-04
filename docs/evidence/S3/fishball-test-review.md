# BUB007A independent memory-port test review

Status: **bounded private Node unit/probe PASS; final frozen-unit development review pending**. This is separate ISTQB test-design review by `/root/istqb_review`, Sol6.1/max, independent of root, the port author and the code reviewer. Root authorized only this evidence file for the port; no port code/author test/Git/source checkout/install/profile/browser/model/provider or personal-data action was performed in this lane. The [three-stage authorization](../../three-stage-development.md) permits development while [full acceptance debt](../acceptance-debt.md) remains open. The newer owner decision selects dsh-fishball (df) and MIT; current provenance supplies a bounded contributor check, so an absent upstream root license alone is no longer a blanket blocker for this identified owner-authored subset.

Reviewed [fishball-memory-core.mjs](../../../src/fishball-memory-core.mjs), its [dedicated tests](../../../test/fishball-memory-core.test.mjs), [source provenance](../../fishball-provenance.md), [author portability evidence](fishball-portability.md), the separate code review and both retained [BUB007A source AC](../../tickets/BUB007A.md). This reviewer inspected the recorded original pins/hashes and the actual Node adaptation; it did not independently read the original Kotlin Git objects or execute Kotlin/Gradle. The code reviewer independently reports those source-byte checks. A recorded pin is not proof of cross-language execution equivalence.

## Exact provisional unit and executed evidence

Environment: Node v22.22.2, macOS arm64. All inputs, scopes, prose, snapshots, JSONL, secrets and persistence callbacks are synthetic. Actual adaptation SHA256 at the independent rerun: `a4ac97c50b5793e1063007abf7eea4cac9d70be018a42e46c8164a909174903d`. The executable unit is not yet bound to a root-supplied final feature SHA.

| Command or probe | Expected oracle | Actual |
| --- | --- | --- |
| `node --test test/fishball-memory-core.test.mjs`, review gate unset | All pure units pass; public-library fixture remains explicitly skipped |10 PASS,0 FAIL,1 SKIP, exit0. No native fixture was run by this reviewer. A later combined event/memory run likewise reports18 PASS,1 SKIP:8 event and10 memory units. |
| Independent `node --input-type=module` synthetic heredoc importing the actual adaptation |39 TTL, migration, corruption, version/namespace, deletion/ID-copy, persistence uncertainty, byte/privacy/authority/vector partitions described below |39/39 PASS. Fresh rerun plus exact retrieval threshold probes reports48/48 PASS,0 FAIL, source hash above. |
| Same actual-module probe, exact mathematical threshold fixtures |Same-question0.60/0.62/0.64, candidate0.20/0.25/0.333…, turn0.08/0.12/0.16 |9/9 PASS. Inclusive0.62 and0.25; strict greater-than0.12. Included in the fresh48 count, not added twice. |
| Author/root `BUBBLES_FISHBALL_CORDIS_REVIEWED=1 node --test test/fishball-memory-core.test.mjs test/coordinator.test.mjs test/context.test.mjs` |Reviewed bounded public Cordis composition executes and stage2 units remain coherent |Author evidence reports34 PASS,0 FAIL,0 SKIP. This reviewer reviewed the composition and does not mislabel author execution as its own native-profile result. |

The48 fresh independent vectors use the actual production pure module, not a reimplementation of its store. Assertions compare supplied/recovered bytes, known ID/content sets, explicit error codes and mathematically constructed threshold scores. Injected persistence callbacks cannot prove an OS write or cross-process durability; those belong to the typed encrypted adapter and its separate later review.

## Risk partitions and boundaries

| IDs / count | Partitions and concrete oracle | Actual |
| --- | --- | --- |
| FB-TTL01..12 /12 |World30/365-day and preference30/182-day expiry atN−1/N/N+1. ExactlyN is stale, permanent still requires nonfuture timestamps; research-only and invalidated facts are never fresh. |12 boundary vectors PASS; permanent/research/invalidation also exercised by author units. |
| FB-TIME01..02 /2 |Preference recordedAt or confirmedAt in the future must be stale during clock rollback, including recordedAt2000/confirmedAt1000/now1500. |PASS after MEM-T01 correction. |
| FB-MIG01..05 /5 |Snapshot-only ID survives; log-only ID joins; last JSONL row for an ID wins even if its timestamp is older. Secret-bearing earlier duplicate cannot be hidden by a safe final row. Blank line, truncated tail and interior blank line fail closed. |PASS. No personal files imported; all strings explicitly supplied. |
| FB-BIND01..02 /2 |Unknown native contractVersion and foreign owner namespace reject before state use. Workspace mismatch is also present in structural scope validation; refs authenticate nobody. |PASS. This is format/equality validation, not trusted-caller isolation proof. |
| FB-STATE01..02 /2 |Deletion/clearTurns retains learned facts, clears session bridge, retains max allocated/session ID across explicit reconstruct; returned snapshots/facts cannot mutate store. |PASS. `nextId` returns10 then11 after reload; returned answer forgery does not alter stored value. |
| FB-IO01..06 /6 |False, undefined, Promise and thrown persistence outcomes block the instance. An uncertain callback that captured bytes requires explicit validated reconstruction; failed deletion preserves last acknowledged bytes and record. |PASS. `MEMORY_IO` followed by `MEMORY_RECOVERY_REQUIRED`; no claim that unacknowledged data was saved. |
| FB-BYTE01..06 /6 |Exact whole UTF-8 JSON4MiB−1/N/N+1 and fact text65535/65536/65537 bytes, including multibyte Chinese characters. |PASS after MEM-T02. WholeN+1 rejects before use; accepted records reproduce exact input. |
| FB-TRUST01..03 /3 |Hostile answer getter and scope proxy reject without invoking traps or exposing canaries. Memory strings alleging approval/completion expose no grant/control/task method. |PASS, zero traps. Ledger integration is a later separate oracle. |
| FB-VECTOR01 /1 |Punctuation/case Jaccard, single-character empty bigram, cosine dimension mismatch, zero norm and identical nonzero vectors. |PASS. Author units add invalid/nonfinite vectors and max(word,vector) recall. |
| FB-SCORE01..09 /9 |Construct unique Chinese bigrams giving exact0.60/0.62/0.64 and0.08/0.12/0.16; ASCII abc versus abdef/abde/abd gives0.20/0.25/⅓. Assert both numerical score and actual retrieval inclusion. |PASS. At0.12 a turn is excluded unless the independent substring rule applies; fixtures avoid that alternative. |

Counts above sum48. Each grouping retains its distinct expected outcome; author tests are supplementary and are not counted as independent probes.

The source behavior and adaptations are explicitly separated. The recorded main pin is `f4a887d37b4c60a65ccc7c22fd87b19639287a0a`; cached release is `32ac8236bdb8d93c0a895b81557c4d915cf5e80c`. Main snapshot and release JSONL revision/union behavior, TTLs and BMP/UTF-16 similarity rules are ported. Fail-closed corrupt imports, secret/bound/unknown-field rejection, conservative future timestamps, exact UTF-8 JSON accounting and uncertain-write blocking are deliberate corrections. Unicode versions, broader DTOs, Kotlin threading and general Node/Kotlin behavioral equivalence remain unverified.

## Independent findings and retests

| ID | Actual reproduction | Correction and retest |
| --- | --- | --- |
| MEM-T01 |Preference recordedAt2000, confirmedAt1000, now1500 was labeled fresh despite the declared conservative clock-rollback rule. |Author requires now≥recordedAt and now≥confirmedAt. Both future partitions PASS. |
| MEM-T02 |Valid normalized native snapshots at4MiB−1 and4MiB rejected due to overcounted container commas/colons, while the declared bound included exactly4MiB. |Author counts exactn−1 commas and object punctuation. ExactN−1/N/N+1 construction PASS; complete normalized JSON byte length independently asserted. |

The separate code-review array-alias finding is not claimed as this reviewer's discovery; its retained author regression rejects numeric own fields outside array length before normalization/persistence. No failing test was removed or softened.

Explicit source-caller IDs and internal allocation have different contracts. The pure core allows caller-selected inserts and revision of existing turns; an explicitly deleted ID may be inserted again by such a caller. `nextId` alone promises monotonic allocation. Provenance now states this distinction. A trusted BUB007B adapter must allocate internally and retain tombstones; testing two pure-core instances does not establish that adapter invariant.

## Retained source AC and remaining gates

| Source AC | Observable expected evidence | Actual bounded evidence / disposition |
| --- | --- | --- |
| BUB007-01 |Compile/load/write/reread/migrate in the actual supported plugin runtime; explicitly compare target routes and gaps. |Actual Node ESM import and10 pure units plus48 independent probes PASS. Reviewed author-run public Cordis/encrypted RuntimeStore fixture supports library load/disposal/reload only. Kotlin/JVM and Kotlin/JS have no compilation or resulting ESM artifact. Actual pinned DSH Web-profile plugin/context/model integration remains **NOT RUN / acceptance HOLD**. |
| BUB007-02 |Identify the reused source/dependencies and ownership/grants/notice; any concrete unresolved contributor/notice keeps that material out of public redistribution. |Both exact pinned READMEs declare MIT; rootLICENSE is absent. Updated provenance reports exhaustive reachable histories within a256-commit cap: main43/release186 commits,7/24 reused-path changes; matching configured owner author/committer identities, AI trailers only, no nonmatching human or conflicting notice. The owner's express MIT choice covers current identified owner-authored adaptation. No concrete third-party blocker was identified in this bounded subset. Root project LICENSE/notice and packaging remain to be supplied; no rights clearance is inferred for the unincorporated whole application/dependencies. Publication remains unauthorized until full acceptance. |

The contributor evidence was reviewed as recorded, with no private identities/emails exposed or original Git action in this lane. Matching local Git identities are concrete provenance evidence, not cryptographic authorship proof. This disposition replaces the earlier blanket absent-LICENSE hold with the newer owner clarification and bounded evidence; newly incorporated third-party material would require its own review.

The reviewed public Cordis fixture is bounded: existing pinned library, synthetic private service, temporary encrypted RuntimeStore, supplied migration strings and dispose/reload denial of borrowed references. It launches no DSH application/profile/listener/model/browser/provider and cannot close BUB007-01's native-profile gate. Its fixture-only `context` record is not a production Coordinator envelope or a typed long-term-memory domain. BUB007B source/confidence/revision/tombstone/trusted-caller/CAS/context oracles remain separately reviewed work.

The development-unit verdict will be finalized only against the exact frozen corrected tree. Full BUB007A, functional/visual, MVP and release acceptance remain unclaimed.
