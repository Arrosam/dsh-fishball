# NI2 configuration and late currentness fence — independent functional checkpoint

**Bounded functional PASS; complete NI2, every full source AC, final CODE, browser, model quality, portable normal execution and MVP acceptance remain HOLD.** This is the separately authorized ISTQB execution lease for installed configuration and the host-only read-only `RuntimeStore.assertNativeRequestCurrent` operation. It is not a rerun, reroute or replacement of the blocked CODE experiment. No provider/native host/listener/HTTP/browser/tool/credential/recipient/account/installation action occurred. No production source, old test, old evidence or Git object was edited by this lane.

Reviewer: independent `istqb_review`, Sol 6.1 / max. Reference decisions are the immutable [first-unit design](test-design.md), SHA256 `f37f4b66e2c5f69a818afd83c52c7040cc3cf5c00c47b5d5de5336bd954efaea`, and [authored subunit hold](config-current-author-hold.md). The separate [resume proposal](resume-design-proposal.md) remains unchanged at `f0e21ced82011fcd6b29434b67e8e9b6f774fded940bf72c93feb824383525fd`; continuation still requires its later contract/design/execution unit.

## Exact source and executable boundary

Root supplied configuration commit `687194e` and currentness commit `8cb92fc`; captured HEAD before this lease was `bc12230ef64e7e2a0d217530667909214897174f`. Concurrent authors may modify provider/package files. Consequently this report binds the six-module import closure, not a fictitious unchanged whole working tree:

| Tested production file | SHA256 before and after |
| --- | --- |
| src/installed-worker-config.mjs | `8a9f454fc4b0bc14078107a17e4cb7db03580098ad2d8c5f61f6721e351c4a13` |
| src/installed-config.mjs | `3da0ed1c99cd1ed920e7093fad0dafc6ce5f1653bfd09879018a10dd8d02e5ed` |
| src/config.mjs | `e738a6c50b41140e8d8d1f00dcf4e35868aba6a521d1d72bc804888831d248d8` |
| src/runtime-store.mjs | `1178a826d22c4d051897599d1d500f2315ca85688cda48b77718f3f8356ce7ca` |
| src/runtime-security.mjs | `6edf9f8a544444169f9190fc5e24230ab3a0928ea8d7c295f1b085824c91ac07` |
| src/ledger.mjs | `64cc42e1a834701263c260f311d05d113c6e34af67017901cfd7a95f22c9b650` |

Imports from the new test are Node built-ins plus installed-config, installed-worker-config and RuntimeStore; the relative dependency closure above has no installed-plugin, provider, native adapter, Cordis or client import. Both old authored tests retain their held hashes `1a32585a3ea20ef5a917396faa528acb17d07d4d1a1045a603ee116e3580b86e` and `48c48575535328e32641330237d087d44e15373477e82e9aa471d48b663d93ba`.

Historical author manifest `a5ee5bd6a9667af0483fe8c9cb408aa708080593a2ebaa5a2715a82ccdf0dddf` verifies **24/24 committed files at bc12230**. Its current matching disposition is **23/24** because package.json changed concurrently outside the tested closure. The source, old tests and both immutable independent documents above show zero before/after drift. [Before](foundation-independent-before.json), [pre-first-run](foundation-independent-first-source.json) and [after/results](foundation-independent-after.json) contain the exact checks and import list. The supporting manifest binds this lane's current test, report, raw evidence and relevant production/reference files.

Final new test: [installed-worker-foundation-adversarial.test.mjs](../../../test/installed-worker-foundation-adversarial.test.mjs), SHA256 `b180f9024febea5879825cb202f380c8b9d036092ce186311a0978be2693b1ef`. The new file and evidence are held after this report.

## Commands and actual results

Installed baseline: Node `v22.22.2`, macOS `27.0`, arm64. Commands were executed from the repository with the sanitized environment below. The optional Cordis fixture flag is intentionally absent because these three test files import no Cordis/native composition or gated public fixture.

```sh
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test test/installed-worker-foundation-adversarial.test.mjs
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test test/installed-worker-config.test.mjs test/native-request-current.test.mjs
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --check test/installed-worker-foundation-adversarial.test.mjs
```

| Command/run | Actual result | Raw evidence |
| --- | --- | --- |
| Independent initial draft, first command | Exit1; 44 tests, 41 PASS, 3 FAIL, zero skip/cancel; 655.392250ms | [first TAP](foundation-independent-first.tap) |
| Narrow path-fixture correction, first command | Exit0; 47/47 PASS, zero fail/skip/cancel; 656.489250ms | [path retest TAP](foundation-independent-path-retest.tap) |
| Final independent supplement, first command | Exit0; **48/48 PASS**, zero fail/skip/cancel; 662.528084ms | [final TAP](foundation-independent-final.tap) |
| Independent execution of unchanged two authored files, second command | Exit0; **38/38 PASS**, zero fail/skip/cancel; 291.040041ms | [authored retest TAP](foundation-independent-authored.tap) |
| Final new-test syntax, third command | Exit0, no diagnostics | [syntax output](foundation-independent-syntax.txt) |

Final48 denotes Node test nodes: 20 top-level tests and28 nested tests,41 leaf cases. It is not a count of48 separately accepted ACs or48 independent process races. The final supplement adds one previously planned policy-downshift/nonmutation case after the path47 retest. Tests counted in the separate authored38 were authored by another lane; this reviewer executed them but does not relabel their design as independent.

Final raw TAP SHA256 `647aef42ebf60736eabfa467d86591d7f92e7cc7a5d6509d4755fe3e5f9c2d7d`. First raw TAP SHA256 `a02c00157490c0c8a93bd2b543c11303bb36cd6afc5fd767e0ed6dbb7b572743`. Source and exact command/result details are also machine-readable in the after JSON.

## Preserved first failure and fixture correction

The first C05 fixture tried to create actual canonical ASCII paths at1023,1024 and1025 UTF-8 bytes. This macOS allowed1023 but returned **ENAMETOOLONG from mkdir at1024 and1025 before the product validator ran**. The two failed children plus their failed parent account for all three first-run failures. No product failure was established. Root acknowledged this disposition and the narrow correction. The unsupported mkdir attempts stopped; no symlink/descriptor/permission/filesystem bypass was attempted.

The complete contemporaneous first test source is retained in [first source](foundation-independent-first-test.mjs.txt), hash `ed813b432b7052d1e730857859ca7a4f9a6c52adb1f86ad92f3f60da6cc864b0`. The corrected47 source is retained in [path-retest source](foundation-independent-path-retest-test.mjs.txt), hash `addbbfa0bdbd2c915b6d66fa7386100bcb9388b6c5acc1e818081cb0de09848f`.

The correction keeps actual1023 success and actual1024/1025 `CONFIG_INVALID` refusal through the product's filesystem check, creating neither longer path. A separately named **typed filesystem-facts** table preserves the parser's1023/1024 acceptance and1025 denial expectations using controlled lstat/realpath facts. The typed1024 result proves the lexical ceiling only. An existing1024-byte canonical workspace positive is **NOT RUN / unsupported by this OS fixture**, and is never promoted to real-path PASS. No original assertion/scenario in an old test changed. Other edits in the new fixture remove an unused builtin import, make the unrelated-memory test title accurate and add the in-scope resource downshift test; they do not remove a failing product oracle.

## Independent expected versus actual oracles

All rows below are PASS on the final source unless an explicitly stated limit says otherwise. See the corresponding C/F test IDs in the final raw TAP; configuration values and identities are synthetic.

| ID | Expected observable oracle | Actual bounded result |
| --- | --- | --- |
| C01 | Omitted/exact disabled and malformed closed choices call no filesystem read/write/chmod method. | Tripwires observe zero calls; disabled values match; malformed values return only CONFIG_INVALID. |
| C02 | Existing base/memory/limits null-prototype semantics survive; enabled worker is detached/frozen; config creates no persistence. | Top-level/base meanings preserved, caller mutation cannot change the accepted worker, target directory absent. Worker null prototype refuses. |
| C03 | Proxy/getter/revoked Proxy and owner/proof/callback fields refuse before path lookup. | Reflection/getter calls0, filesystem tripwire calls0; stable schema/error projection. This trap-zero assertion is limited to these parsers, not all JS/proxy APIs. |
| C04 | Prefix siblings, symlink ancestor aliases, files and dangling entries cannot become canonical workspaces. | All four refuse; persistence target remains absent. |
| C05 | Separate OS existence/canonical facts from1024-byte lexical cap. | Real1023 positive and longer-path refusal; typed1023/1024 positive and1025 negative. Actual1024 positive remains NOT RUN as stated above. |
| C06 | At maximum131072 request bytes and4096 output tokens, conservative usage must be at least135168 and within the total ceiling. |135167 refuses,135168/135169 accept with matching policy; over-policy usage and runtime refuse. Zero monetary ceiling is configuration only, not provider price proof. |
| C07 | Mixed Chinese UTF-8 provider text and persistence suffix retain exact bytes at N±1. |127/128 bytes accepted,129 refused;31/32-character suffix accepted,33 refused; no target creation. |
| F01 | Unconsumed late read refuses; consumed late reads return signed current facts without plaintext, a new permit, rows or byte changes. | Preconsume SPEC_MISMATCH and repeated current reads preserve every table's row digest/counts, main-file SHA and namespace entries. Returned mutation cannot alter store facts; second consume is admittedfalse. Own encrypted context decrypts correctly but does not appear as plaintext in the main database or late-read result. |
| F02 | Every cross-task field substitution must refuse before permission, even when both tasks have legitimate live signed executions. | All five task/claim/generation/action/execution substitutions return SPEC_MISMATCH, callback0; exact second task remains readable. This core fixture deliberately consents to two slots for isolation; it is not evidence that normal NI2 permits maxActive2. |
| F03 | Owner/coordinator/worker/reviewer and forged/cloned handles cannot call a host-only fence; foreign owner/workspace host bindings cannot access the execution. | Role/handle negatives UNAUTHORIZED; foreign scopes SPEC_MISMATCH; callback0; all rows/bytes unchanged. Trusted fixture handles are not native OperatorPeer authentication proof. |
| F04 | Hidden/symbol/getter/revoked Proxy and grant/current flags cannot forge a binding. | INVALID_INPUT with zero traps/callbacks and identical rows/main bytes/entries. |
| F05 | Permission must return literal synchronous true; thrown errors cannot leak canaries; callback receives a detached specification. |1/string/boxed true/Promise/undefined/exported-canary error all HOST_DENIED. Mutating callback's copied spec cannot change authoritative spec. No native provider counter exists in this fixture. |
| F06 | Original grant remains valid at1999, expires at2000 and2001; expiry never releases or renews consumed intent. | Before-expiry current read succeeds; equality/after APPROVAL_INVALID before permission. Every row/file/entry unchanged; original reservation and dispatch_intent remain. |
| F07 | Ordinary progress version change can remain current; new constraints must stale the old exact context even with unchanged authorization epoch. | Progress increases task version without semantic revision and remains current. Constraints increase semantic revision, old read SPEC_MISMATCH; no fence mutation. This is a core context-metadata guard, not an assembled native input test. |
| F08 | Exact memory revision controls admission: equal plaintext with a new revision is stale, deletion is stale, create/delete is not absence, unrelated namespace is independent. | Three STALE_MEMORY cases and one legitimate current case, all late reads nonmutating. Tombstones are not treated as missing revision0. |
| F09 | Task pause followed by unpause cannot revive old action authority. | Control is active again but auth epoch advances twice; old execution CLAIM_REVOKED, slot held and original intent retained. This task unpause is not native session resume. |
| F10 | Cancel-requested/stopped/unknown workers cannot be treated as ready or release work from a read. | WORKER_NOT_READY for first two; CLAIM_REVOKED after unknown/recovery. All retain one reservation and null release proof. |
| F11 | Own closed store refuses; cold recovery retains authenticated content and uncertain obligations without permitting work. | CLOSED attempt preserves the closed bytes/rows/entries. Reopen intentionally records recovery_required/unknown; content/digest remain readable, one slot held, late read SPEC_MISMATCH and repeat consume admittedfalse, callback0. No claim of byte-identical entire database across legitimate recovery. |
| F12 | An already-open independent process must read current signed execution, then observe a committed revoke without a cached approval or mutation. | Child starts before task/claim. Positive read returns the exact execution; parent commits revoke; next child read CLAIM_REVOKED. Exact row/file/entry fingerprints remain unchanged by both child reads, slot stays held; child closes/exits. This is one actual process barrier, not a provider/race/CLI proof. |
| F13 | Explicit owner downshift to maxActive0 must invalidate the old resource policy without re-authorizing or releasing its claim. | Same model version/new resource version yields STALE_POLICY before permission; signed old intent/one slot/null release proof remain unchanged. |

SQLite row fingerprints use an independent readonly builtin DatabaseSync connection and every table's ordered row contents, including commands, grants, encrypted data, policy, actions, workers, automation records and reservations. The test prints no row/plaintext/key/receipt body; only comparisons and failure codes. Main SHA and directory-entry checks complement the public snapshots. These checks prove the tested late operation's lack of mutation; they do not prove arbitrary trusted callback purity or malicious filesystem/SQLite tamper resistance. No external row corruption was attempted.

## Source-AC contribution and remaining gates

The frozen design's45 individually mapped source ACs remain authoritative and unaccepted as whole criteria. This lease contributes only the following local facts:

| Source AC | Contribution in this checkpoint | Required later observation remains |
| --- | --- | --- |
| BUB006-01 | C03/F03/F04 closed input and core role/scope binding | Original native operator/authenticated12-operation carrier; webhook/chat identities and complete owner UI. |
| BUB006-02 | F02/F06/F09/F12/F13 exact binding, expiry, invalidation and policy | Full concrete native target/preview/grant and all actual asynchronous request-entry fences. |
| BUB006-03 | C03/F01/F05 bounded stable projection, callback canary and encrypted late-read output | Actual status/preview/log/transcript/model/result/recipient secret scans. |
| BUB006-04 | F01/F02/F07/F08 exact scoped stored context and current metadata | Actual original provider input and minimum necessary external fields. |
| BUB006-05 | F05 literal host permission and private-core refusal | Original public tools/permission and useful independent scoped behavior. |
| BUB008-01 | F01/F07/F11 current/recovered encrypted context facts without replay | Same-owned original native resume, useful work and full continuity. |
| BUB008-02 | F07/F08 old semantic/memory snapshot cannot admit fresh instructions | Authentic prepared receipt origin, protected assembled instruction conflict and actual native input. |
| BUB008-03 | C05/C06/C07 field/byte/reservation boundaries | Complete rendered envelope accounting, actual request messages and advertised/provider-token capacity. |
| BUB008-04 | F02/F03 task/owner/workspace core separation | Foreign native session/history/system/generation canaries absent from real local provider input. |
| BUB008-05 | F06/F07/F08/F12/F13 current core facts | Actual preset/tools/catalog/environment/persistence facts and truthful current UI. |
| BUB012-01 | F10/F11 unknown work remains reserved | Original idle/native execution, last-slot create and broader load/response behavior. |
| BUB012-02 | C02/C06/C07 exact closed selection and numeric configuration | Actual current public provider/model/reasoning/preset resolution with no fallback. |
| BUB012-03 | F01/F11 original one-use consume not reset by read/reopen | Original provider retry/auxiliary/extra-step0 and cumulative reviewer/repair policy. |
| BUB012-04 | C06 truthful conservative configured charge relationships | Actual source-owned zero-price proof and measured labelled usage, generic COST_UNKNOWN refusal and real-provider billing. |
| BUB012-05 | C01/C03/C05–07 and F01–13 bounded local input/state checks | Stream/transcript/cache/growth/load/latency/retention evidence;1024-byte existing-path positive remains OS-limited. |

No positive proof is newly claimed for BUB002/004/005/011/013/014 full functions beyond these contributing mechanisms. Native creation, provider topology/identity (`symbols.original` is a separate proposed repair), full two-message/continued-history request admission, receipt origin, native scoped flush/persist/capture/finish, additional owner UI and packed normal CLI are outside this lease. They remain in the first-unit design and resume proposal. Final CODE/browser/full source-AC/product HOLD survives this functional PASS.
