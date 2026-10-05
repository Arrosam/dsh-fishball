# NI3 native dispatcher: ordinary quality review

Status: independent static code, interface, and focused-fixture review of the pinned held engine subset. No executable review, test run, source proof, CODE verdict, or acceptance decision is recorded.

## Inputs and pins

The three supplied source/test hashes matched before I read their authorized slices. The review also read the latest `AGENTS.md`, the root locked-route amendment, and the current author source-hold final pair.

| File | SHA-256 | Scope read |
|---|---|---|
| `AGENTS.md` | `dea33c79f404cbab39acfc96b70b5e01962b9214cfd44f5cb6524764b1e45fc4` | Full file; latest exception permits this unaffected ordinary review |
| `.runtime/ni3-native-composition/src/native-contributions.mjs` | `8610b7ef36b401bad3733b793b0641664e588b85c97ba39d1419b97333f0f99b` | Full file, 1–145 |
| `.runtime/ni3-native-composition/src/native-adapter.mjs` | `eb990b3def82c29312ec7f94cf5aa1f3003a5f8364a26e9b9b0f8a6cac644bb0` | 54–118 and 130–145 only |
| `.runtime/ni3-native-composition/test/native-composition.test.mjs` | `b554fd99fc0997554261df5fad4be6043d1ccb21154c4f261b03b3d92b60fb3a` | NC1, NC1-D01, NC1-L01 in 37–135 |
| `docs/evidence/NI3/native-composition-locked-route-amendment.md` | Not supplied | Full root amendment |
| `docs/evidence/NI3/native-composition-author-source-hold.md` and `.json` | Not supplied | Current source-hold final pair |

The fixture read command also displayed lines 137–140, the opening of NC3, because the requested range ended at 140. I did not inspect or rely on that NC3 content. No other test group or source file was reviewed.

## Finding: callback proof remains a held boundary

**Coverage/source-proof boundary; no dispatcher source defect identified.** The engine checks callback shape and synchronous behavior, but it cannot establish that source-private callbacks avoid transactions or authenticate real current source state. In `native-contributions.mjs:8, 19–34`, `syncFunction` and registration checks reject proxies and asynchronous/generator functions and restrict callback shapes. The locked path then calls both `#select`/`matchesSpec` and `matchesFull` (`:52–72`); synchronous functions can still perform a transaction. The amendment explicitly requires those real source closures to be transaction-free.

The focused fixture provides a useful route discriminator, not proof of those closures. Its ordinary `routerFixture` matcher accepts based on `actionDigest` (`native-composition.test.mjs:37–45`); NC1-L01 builds a typed source matcher that validates the full record and witness for its positive case, and exercises false, throw, non-true, reentry, withdrawn-source, and witness-mismatch paths (`:89–135`). Its marker observes calls to `environments.assertCurrent`, `readCurrentTask`, claim verification, and hooks, but `matchesSpec`, `matchesFull`, and owner-currentness are pure typed doubles. Thus the fixture shows the engine route avoids the ordinary environment assertion and the listed adjacent calls; it does not prove actual source-private matcher/currentness callbacks are transaction-free or that their positive result authenticates the original source. The author source hold keeps those exact runtime callback implementations separate. Do not treat the typed positive double as native/source proof.

The engine wrapper validates the eight-field full record shape and primitive references/ranges, compares the retained row’s owner/workspace/task/action/digest/spec binding, and forwards the unchanged `record` plus frozen `{ environment, sourceRef }` witness to `matchesFull` (`native-contributions.mjs:6, 52–72`). `taskVersion` and `authEpoch` are range-checked locally and must be checked against authoritative current facts by the required source matcher; NC1-L01 checks a valid full record reaches its typed matcher and rejects a missing `taskVersion`, but does not establish the actual matcher’s version/epoch check. This is the same held callback boundary, not a separate defect in forwarding.

## Static interface and control-flow results

The locked `#full` route is structurally consistent with the root amendment. It validates exact full-record keys, normalizes the supplied original spec, checks the owner fence, selects exactly one contribution, verifies the retained row’s matching fields, constructs only the private frozen witness, and requires literal `true` from `matchesFull` before a final owner-currentness check. It does not call ordinary `#row`, environment `assertCurrent`, `readCurrentTask`, `verifyClaimBinding`, or native hooks on that route (`native-contributions.mjs:52–73`). `hostPermission` converts exceptions to denial and the reentry flag poisons an outer invocation (`:74–80`). The transaction marker fixture observes zero environment/read-task/claim/hook calls on the locked check and confirms the ordinary environment path would hit its marker (`native-composition.test.mjs:114–132`).

The six-field minimal permission record is mapped through the retained row. After claim binding, the adapter and dispatcher require the extra claim/action digest pair; `#minimal` verifies those values against the retained claim before forwarding a newly formed full record. `NativeAdapter.#permit` accepts only literal `true` and keeps the original claim check (`native-adapter.mjs:91–96`); `bindClaim` checks the original currentness callback before invoking the source transition, accepts only literal `true`, and rejects reentry (`:98–116`). The fixture covers pre-prepare denial, post-bind permission, preclaim refusal, authentic postclaim order, wrong claims, and unchanged full-matcher veto (NC1, test lines 47–67).

The planned action digest is carried through the adapter’s `prepare` route as the third argument to `environments.bind` (`native-adapter.mjs:130–134`). The dispatcher validates that reference before source binding and stores/forwards the supplied digest rather than recomputing it (`native-contributions.mjs:109–117`). NC1-D01 distinguishes the planned scoped digest from spec-only and current-CAS digests, checks missing/malformed references cause no source bind/full callback, and shows a wrong digest is passed to the original matcher and vetoed (test lines 69–87).

Descriptor and synchronous-call checks are applied to constructor options, registered contribution functions, environment callbacks, and the optional native claim transition (`native-contributions.mjs:8, 19–34`; `native-adapter.mjs:58–67`). `matchesSpec` must return literal `true` or `false`; exactly one match is required (`native-contributions.mjs:36–45`). `matchesFull` and tool guard acceptance require literal `true`; exceptions, non-true results, and recursive host permission fail closed (`:71–80`). The L01 fixture covers the callback result and reentry partitions with typed doubles.

## Scope and disposition

Scope counters: 3 pinned engine source/test files; 1 source file read in full; 2 adapter slices; 1 fixture subset limited to NC1/NC1-D01/NC1-L01; 1 root amendment; 2 source-hold documents; and 1 latest `AGENTS.md`. Pins matched. Only ordinary source/interface/fixture facts in that subset inform this review.

No Node, import, syntax check, test, database, native, model, tool, network, Git, or source-edit operation was performed. The source-hold records these focused test leaves as `NOT_RUN`. No product/native PASS is established. The exact current source callback implementations, full matcher, core/store closures, remaining engine code, receipt/envelope paths, original blocked final CODE gap, all87 criteria, and ticket/MVP/native/browser acceptance remain outside this review and unaccepted. The original final CODE gap remains blocked and unchanged.
