# Independent B11 acceptance baseline (2026-11-09)

## Scope and timing

Independent fixture analyst; general-coding-principle loaded. Approved tests/assertions unchanged. No implementation edits. First baseline ran AFTER parent changed R1 field length to Unicode code points and the R3 comment. This is not a pre-fix baseline. Implementation was inspected only after the initial rc.1 baseline was reported to parent. HEAD at initial inspection: `562027e6b14fe44103ee7ffec56a597be3658359`; parent working-tree edits were present.

Workspace-write; Node v24.22.2. No network/browser/model/credentials/.npmrc/install/push, no DSH boot or live profile access. Initially only non-home SDK fixtures were searched. Parent subsequently relayed explicit user authorization for immutable rc.5 package reads under its installed version directory; no other home access was authorized or performed. Runtime package manifests confirm the versions below.

## Commands and results

Run from this worktree, individually for each suite:

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
  HOME=/private/tmp/fbtest-b11-no-home TMPDIR=/private/tmp \
  FBTEST_DSH_RUNTIME="$SDK/node_modules" \
  node --test --test-concurrency=1 --test-timeout=60000 "$SUITE"
```

SDK roots:

- rc.1: `/tmp/dsh-022` (documented temporary install in slim-native-design).
- rc.5: `/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5` (immutable packages only, explicitly authorized after initial rc.1 run).

Suite values:

```text
packages/board/test/instance-ext/b11-search.test.mjs
packages/board/test/instance-ext/b1.test.mjs
packages/fold-notify/test/instance-ext/fn-1.test.mjs
.runtime/b11-independent/r1-supplemental.test.mjs
```

| SDK | Suite | Tests | Pass | Fail | TODO | Exit |
|---|---|---:|---:|---:|---:|---:|
| 0.2.1-rc.5 | B11 approved | 102 | 34 | 68 | 0 | 1 |
| 0.2.2-rc.1 | B11 approved | 102 | 34 | 68 | 0 | 1 |
| 0.2.1-rc.5 | B1 approved | 20 | 10 | 0 | 10 | 0 |
| 0.2.2-rc.1 | B1 approved | 20 | 10 | 0 | 10 | 0 |
| 0.2.1-rc.5 | FN-1 approved | 13 | 10 | 0 | 3 | 0 |
| 0.2.2-rc.1 | FN-1 approved | 13 | 10 | 0 | 3 | 0 |
| 0.2.1-rc.5 | R1 supplemental only | 24 | 24 | 0 | 0 | 0 |
| 0.2.2-rc.1 | R1 supplemental only | 24 | 24 | 0 | 0 | 0 |

All skipped/cancelled counts are zero. B1 has four suites, FN-1 three; B11 and supplemental use top-level tests. Evidence is local ignored `.runtime/b11-independent/{rc1,rc5}-{b11-search,b1,fn-1,r1-supplemental}.test.mjs.tap` (despite suffix these are Node's default spec output).

Harness uses resolver-only FBTEST_DSH_RUNTIME hooks, stub contexts, and guarded disposable temporary directories. The source-link helper creates only the worktree-local connector link. Neither the plain suite command nor these cases invoke full test/run.mjs, a child boot, a model, or credentials.

## Failure classification and required decisions

The two SDKs have identical failed case labels, grouped below.

1. **60 success-path cases blocked by invalid committed-history fixture.** Fixture creates a v1 board projection without `archiveBytes` alongside nonempty history. The store cannot certify the archive commit boundary, and refuses with `board-unavailable`/interrupted-write. Assertions observe `ok:false` instead of success, so matching/ranking/Unicode/visibility behavior is not exercised. The store's refusal is consistent with its persisted commit-boundary contract; do NOT remove the invariant to make these tests green. A healthy fixture needs the actual UTF-8 archive byte count (or history created by supported writes). Merely accepting first-use migration is insufficient: legacy board plus nonempty archive is ambiguous, not a known healthy migration.

2. **Seven SDK-boundary cases expect product `invalid-input` but receive SDK `INVALID_ARGS`.** Root null/array/string/absent and values undefined/NaN/Infinity are rejected by defineTool before the plugin parser. Undefined/nonfinite numbers are not JSON values. This needs an explicit observation-boundary decision, not a new product identity guard or replacement SDK wrapper. JSON-safe malformed field arguments already reach the product and pass their refusal checks.

3. **One registration case: initial missing guide, final fixture name assumption.** Correction to the initial analyst classification: the search guide is explicitly B11-owned (§12.7), not deferred entirely to B5. Parent added the required search guide. Final reruns still fail because the fixture checks the exact section key `fishball-board:guide`, while the search-only guide is registered as `fishball-board-search`. No requirement establishing the former exact key was identified; the latter intentionally remains separate from the future complete B5 guide. The initial product omission and final name mismatch are distinct causes. Registration is manager-scoped, not global; the test's later resume assertions remain unreached. Approved assertions were not changed.

No test/assertion was amended, no failures were suppressed, and no approved count is replaced by the supplemental result.

## Requirement review / gaps

- R1 correctly means code points, not UTF-16 units or grapheme clusters. The supplemental suite directly invokes real `board_write` with a fresh real store, checks persistence on accepted writes, and checks `invalid-input` on over-limit writes. It covers title 119/120/121 and note 499/500/501 for BMP, astral, combining-sequence, and mixed BMP/astral strings (24 cases). Both SDKs pass after the parent's fix. This supplements but does not certify blocked B11 cases.
- R3 case expects highest `updatedAt`, then highest archive line for one id, consistent with user decision. Approved execution remains blocked by fixture watermark, so no runtime R3 claim is made from the approved suite; the supplemental evidence below independently verifies this rule.
- Healthy read-only search is required, but first-use migration/repair is permitted. Current UC-04 primes via board_read before comparing bytes, which is compatible with that allowance; however its fixture is not committed healthy storage. Literal-query immutability case similarly requires a healthy watermark fixture.
- Representative damaged JSON archive case `B11-EP-FINVALIDJSON` passes on both SDKs. No extra malformed-archive matrix is needed for this scope.
- Existing single-manager caller guard is preserved. No new identity guard requirement is justified.
- B1/FN-1 TODOs are deferred, not passing implemented coverage. Missing ctx.inject is NOT a failure here (early hypothesis withdrawn after actual runs).
- Context descriptor equality in UC-04 does not prove actual prompt text stability when no B5 context is registered; avoid claiming rendered-context coverage.

## Final rerun after guide implementation

All six approved suite/SDK combinations and both R1 supplemental combinations were rerun after the guide change with the same plain Node flags. Counts and exact failure labels remain unchanged from the table: B11 34 pass / 68 fail, B1 10 pass / 10 TODO, FN-1 10 pass / 3 TODO; R1 supplemental 24/24 pass on each SDK. Zero skipped/cancelled. Final evidence names add `final-` before the SDK prefix. DT-01 now fails the exact guide-name assumption described above, not a missing search guide.

An additional independent `.runtime/b11-independent/search-supplemental.test.mjs` (same command, selected as SUITE) passes **2/2 on each SDK**, exits 0, zero TODO/skipped/cancelled. It never edits approved fixtures and does not replace their counts:

- Real board_write creates committed history, edits away matching text, closes and clears the card. Search returns the original matching snapshot with archiveLine 1 and onBoard false; matching and no-match searches preserve board/archive bytes.
- Real board_write/store/search share an injected clock. Writes advance, tie, then roll back; search selects the tied highest timestamp's later archive line (3), not the final lower-timestamp write, preserving board/archive bytes.

This adds positive runtime evidence for R3 and cleared historical retrieval using valid committed storage; the approved B11 suite remains unaccepted. Evidence: `.runtime/b11-independent/final-{rc1,rc5}-search-supplemental.test.mjs.tap`. The earlier statement that approved R3 is blocked remains true; supplemental R3 is now independently verified.

### Durable combined supplemental deliverable

The two supplemental sets are now consolidated with one shared fixture into [supplemental.test.mjs](<v2-board-search-accept/supplemental.test.mjs>) for reproducible commit/handoff. No approved test file changed. Run the same command above with `SUITE=docs/verification/v2-board-search-accept/supplemental.test.mjs`. The durable combined file was rerun on both SDKs: **26 tests / 26 pass / 0 fail / 0 TODO / 0 skipped / 0 cancelled**, exit 0 on each. Logs: `.runtime/b11-independent/durable-{rc1,rc5}-supplemental.tap`. Earlier ignored standalone supplemental files are historical execution artifacts only; the durable combined file is authoritative for future reruns. After the final product description/comment-only changes, the combined file was rerun again: 26/26 pass on each SDK, exit 0; latest logs `.runtime/b11-independent/text-final-{rc1,rc5}-supplemental.tap`.

## Exact failing labels


### Committed-history fixture (60)

- Use Case B11-UC-01 year-old cleared and off-board closed cards remain findable
- Use Case B11-UC-02 injection off does not remove or disable board_search
- Use Case B11-UC-03 no age or line-count cutoff hides a deep ancient match
- Use Case B11-UC-04 well-formed search leaves cards timestamps files and visibility projection unchanged
- BVA B11-BVA-QA001 trimmed ASCII query length 1
- BVA B11-BVA-QA002 trimmed ASCII query length 2
- BVA B11-BVA-QA199 trimmed ASCII query length 199
- BVA B11-BVA-QA200 trimmed ASCII query length 200
- BVA B11-BVA-QU001 astral query length 1 code points
- BVA B11-BVA-QU002 astral query length 2 code points
- BVA B11-BVA-QU199 astral query length 199 code points
- BVA B11-BVA-QU200 astral query length 200 code points
- BVA B11-BVA-QM200 mixed BMP and astral query uses 200 code points not UTF-16 units
- EP B11-EP-QTRIM Unicode whitespace is trimmed before matching and echoed in success
- BVA B11-BVA-L01 limit 1 is validated without clamping
- BVA B11-BVA-L02 limit 2 is validated without clamping
- BVA B11-BVA-L19 limit 19 is validated without clamping
- BVA B11-BVA-L20 limit 20 is validated without clamping
- BVA B11-BVA-L21 limit 21 is validated without clamping
- BVA B11-BVA-L49 limit 49 is validated without clamping
- BVA B11-BVA-L50 limit 50 is validated without clamping
- BVA B11-BVA-LDEFAULT omitted limit returns 20 of 21 distinct matches
- Decision Table B11-DT-MTITLE title/note literal matching and matchedFields
- Decision Table B11-DT-MNOTE title/note literal matching and matchedFields
- Decision Table B11-DT-MBOTH title/note literal matching and matchedFields
- Decision Table B11-DT-MNEITHER title/note literal matching and matchedFields
- EP B11-EP-MNONASCII deterministic Unicode lowercase literal matching
- EP B11-EP-MTURKISH deterministic Unicode lowercase literal matching
- EP B11-EP-MDOTTEDI deterministic Unicode lowercase literal matching
- EP B11-EP-MSHARPS deterministic Unicode lowercase literal matching
- EP B11-EP-MNORMALIZATION deterministic Unicode lowercase literal matching
- EP B11-EP-MSUBSTRING deterministic Unicode lowercase literal matching
- EP B11-EP-MNOTOKEN deterministic Unicode lowercase literal matching
- EP B11-EP-MNOFUZZY deterministic Unicode lowercase literal matching
- EP B11-EP-MLITERAL regex and shell metacharacters match literally without execution
- EP B11-EP-MPATH a path-looking query is literal text, not a file path input
- EP B11-EP-HISTORY edited-away text returns its matching historical snapshot
- Decision Table B11-DT-STODO filter applies to matching snapshot not current status
- Decision Table B11-DT-SIN_PROGRESS filter applies to matching snapshot not current status
- Decision Table B11-DT-SWAITING filter applies to matching snapshot not current status
- Decision Table B11-DT-SPAUSED filter applies to matching snapshot not current status
- Decision Table B11-DT-SDONE filter applies to matching snapshot not current status
- Decision Table B11-DT-SDROPPED filter applies to matching snapshot not current status
- Decision Table B11-DT-RNEWEST one hit per id uses newest matching snapshot not newest nonmatch
- Decision Table B11-DT-RORDER updatedAt descending then 1-based archive line descending
- Decision Table B11-DT-RTIE tied matching snapshots of one id select later archive line
- Decision Table B11-DT-RTRUNCBELOW truncated counts distinct matching ids exactly
- Decision Table B11-DT-RTRUNCEXACT truncated counts distinct matching ids exactly
- Decision Table B11-DT-RTRUNCABOVE truncated counts distinct matching ids exactly
- Decision Table B11-DT-RTRUNCMAXEXACT truncated counts distinct matching ids exactly
- Decision Table B11-DT-RTRUNCMAXABOVE truncated counts distinct matching ids exactly
- Decision Table B11-DT-RTRUNCONEEXACT truncated counts distinct matching ids exactly
- Decision Table B11-DT-RFILTER status filtering and dedup precede limit
- EP B11-EP-RCOMPLETE result retains the complete bounded historical card snapshot
- Decision Table B11-DT-VISIBILITY onBoard follows current visibility not the historical snapshot status
- Decision Table B11-DT-RDISTINCT equal text on different closed ids is not deduplicated by title or note
- Decision Table B11-DT-VISIBLEDONE recent closed card is onBoard
- Decision Table B11-DT-VISIBLEDROPPED recent closed card is onBoard
- BVA B11-BVA-R1 title and note bounds count Unicode code points not UTF-16 units
- State Transition B11-ST-R3 clock rollback selects highest updatedAt then highest archive line

### SDK argument boundary (7)

- EP B11-EP-QUNDEFINED query must be a required string
- EP B11-EP-ROOTNULL tool input must be an argument object
- EP B11-EP-ROOTARRAY tool input must be an argument object
- EP B11-EP-ROOTSTRING tool input must be an argument object
- EP B11-EP-ROOTABSENT tool input must be an argument object
- EP B11-EP-LNAN limit rejects noninteger or wrong-type partition
- EP B11-EP-LINFINITY limit rejects noninteger or wrong-type partition

### Guide registration: initial omission, final exact-name assumption (1)

- Decision Table B11-DT-01 X2 installs board_search in manager setup, never global tools
