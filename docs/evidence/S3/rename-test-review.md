# Independent rename test review

Status: **PASS for the bounded committed rename and physical move; full Stage3 and consolidated acceptance remain HOLD.** Reviewer `/root/istqb_review`, Sol6.1/max, is independent of the root implementation and separate correctness reviewer. The owner explicitly chose dsh-fishball/df/MIT and provider-neutral chat for this phase. Historical BUB requirements and frozen evidence remain retained. Live chat accounts/provider-specific delivery are OUT of this phase, neither failed prerequisites nor mock-passed criteria.

This review owns this report and [rename-adversarial.test.mjs](../../../test/rename-adversarial.test.mjs). No production code, author test, Git state, installed dependency, personal profile/data, live account, Web process, browser or external model was changed or invoked. Root alone performed the physical move and its stopped, project-owned synthetic YAML row rebase. Subsequent Stage3 implementation is excluded from this verdict.

## Exact reviewed unit and execution

The initial logical rename is `05f5bddd5c797da366035667a24126c5d76ce6ec`; the separate sidecar correction and final reviewed commit is **`dd07d1bfba090bfa5a65be973191b544807eaa10`**. [freeze-final.json](rename/freeze-final.json) contains35 files and has SHA256 `6fd9d26bdfe0303c508248e8ad9ca084745cf48fb2051275dcf07dd8a9877c52`. The independent13-test file has SHA256 `e008b868cd4ada06a49fde8cd3147477838a66ecf5820e67af3afb870573e7bb` in that snapshot. Initial [freeze.json](rename/freeze.json), failed/intermediate runs and historical names remain intact.

Final tests ran from a disposable read-only `git archive` extraction of that commit, with only a link to the already installed pinned public Web libraries. They did not test an evolving dirty Stage3 tree. All35 manifest hashes matched before tests, after tests and after syntax checking. No checkout or Git object was mutated; the disposable extraction was removed afterward.

Environment: actual Node v22.22.2, macOS arm64; builtin SQLite; installed official DSH Web0.2.1-alpha.1/Cordis4.0.5-alpha.1. All identities, keys, content, provider metadata and captured HTTP streams were synthetic. No listener or external model call ran.

| Final command / oracle | Expected | Actual |
| --- | --- | --- |
| `node --test test/rename-adversarial.test.mjs test/rename-compatibility.test.mjs test/client-build.test.mjs test/runtime-plugin.test.mjs` on exact archived commit |13 independent rename cases plus4 compatibility,1 build and2 native-runtime cases; no failures/skips |**20/20 PASS**,0 FAIL,0 SKIP, exit0,317.347917ms. |
| Independent manifest check before/after that command and syntax |All35 frozen file hashes remain exact |35/35,0 mismatches at each check. |
| `npm run check` on exact archived commit |Parse the frozen JavaScript files without executing host/provider effects |52 ESM syntax checks, exit0. Syntax alone accepts no Stage3 runtime behavior. |
| Independent closed pre-brand verified-v2 fixture copied before open |Exact acknowledged content/digests/intent/held reservation and unchanged authenticated data row; original untouched |PASS as detailed below. |
| Independent filesystem/YAML readback after physical move |Old directory absent; retained legacy DB exact; no blank new DB; selected synthetic row rebased |PASS as detailed below; no SQLite/host open. |

Raw final independent TAP: `/tmp/df-istqb-rename-dd07d1b.tap`, SHA256 `8b7dff1626d2cc73253feaf9547328b5c8c0decad981d12cf09cec0c3f31247d`. Root separately reports its final relevant module batch49/49 PASS; [root-final.tap](rename/root-final.tap) is root evidence, not an additional independent run. The separate [code review](rename-code-review.md) supplies its own findings, original probes and exact snapshot retests.

Byte comparison against the reviewed S2 crypto fix `88a25f0a6f12cf1371a40f1860052231b9fe2687` confirms this review's four authoritative modules `ledger`, `foundation`, `runtime-security` and `runtime-store` unchanged by branding. Thus no new schema, hash algorithm, crypto migration or authority rule is inferred from the rename. Tracked and installed runtime-wrapper manifest/lock JSON match;629 lock package entries remain present. The correctness reviewer independently compares the dependency graph with only root-name fields excluded. No install/download occurred.

## Independent partitions and observable oracles

The test numbers below are the stable one-based order of the13 frozen independent cases. Each case checks resulting state, error codes and zero-work/preservation where applicable; it does not merely assert an implementation helper's return value.

| Case / risk | Meaningful partitions and exact oracle | Result / evidence level |
| --- | --- | --- |
| R01: store namespace selection |Empty, sole current, sole legacy and both regular mains. Empty selects `dsh-fishball.sqlite`; sole existing name selects itself; both refuse `STORE_PATH_AMBIGUOUS`. Distinct binary/UTF-8 file bytes and directory entries stay exact. |PASS, actual filesystem, no SQLite open. |
| R02: encrypted legacy basename |Real crypto2 RuntimeStore saved under `bubbles.sqlite`, encrypted Chinese goal, exact task/ref/digest readback, foreign owner and cloned-handle denial, no new basename; unchanged whole DB after idle reopen. |PASS, actual encryption/store. Created under renamed code; pre-brand provenance is separately proved below. |
| R03: exact prior core memory label |`bubbles.fishball-memory/v1` normalizes to `df.fishball-memory/v1` in memory only. World7/preference9/retired turn11, source facts, session4 and idSeq11 remain exact; returned copies detached; persistence callback count0. |PASS, pure memory snapshot compatibility. |
| R04: unsupported/cross-scope core memory |Seven future/near/empty/null labels, foreign owner/workspace and an extra field reject stably; no persistence. |PASS, pure negative partitions. |
| R05: exact projection label combinations |Four old/current outer/inner combinations preserve namespace revision5, individual revisions/previous facts/source/conflict/tombstone/session/id sequence. Persist/delete counts0; original row content/digest unchanged. |PASS, typed-store read fixture; not schema4 storage acceptance. |
| R06: unsupported/cross-scope projection |Outer future3, inner future2, four outer/inner scope edits, corrupt digest and deleted namespace reject; no writes. |PASS, typed-store negative partitions. |
| R07: package/client/native identity |Private preview package name/export/MIT, native plugin name, lazy generated bundle and host React import; actual client model uses `/df-rpc/v1/list`; df slot/goal label and escaped text. |PASS, module/build and mock element tree. No browser/visual credit. |
| R08: exact admitted RPC identity |New channel accepts only the exact trusted fourth peer. Clone, JSON/undefined claims, wrong endpoint and captured handler after immediate disposal deny. One admitted operation; no old-channel authority alias. |PASS, bounded transport/identity unit. |
| R09: real public host carrier |Public Cordis Context/SessionStore/ApprovalService/HostConnectionService, synthetic BrowserAuth and captured HTTP framing. `ctx.df` diagnostics only; old service/route absent.401/403 paths write0; trusted scope copied before mutation; forged role/verified/scope denied; secret canary redacted; metadata export excludes prose; disposal removes route/service. |PASS, actual public carrier plus encrypted RuntimeStore. Sessions0; no browser credential or listening server evidence. |
| R10: genuine prior crypto format |Independently constructs genuine old AES-GCM-v1 AAD/no marker on each basename. Both reject `CRYPTO_LEGACY_UNVERIFIED`; exact bytes/entries preserved. |PASS, actual old crypto format. Security-driven refusal is distinct from branding compatibility. |
| R11: filesystem entry identity |Eight main-entry decisions: old/new dangling symlink or directory alone refuse unsupported; both-entry combinations refuse ambiguity. Link targets are not created; bytes, presence and modification times remain unchanged. |PASS, actual nonregular entries, no fallback. |
| R12: approved native session identity |Exact legacy prebound, current prebound and unbound-new create choose original legacy/current/default-df raw IDs while full action digest/spec/generation/session bindings stay exact. Unrelated prebinding, absent trusted resume resolver and default-deny permission refuse. |PASS, actual public registry/runtime classes with synthetic metadata resolution. Creates0/streams0/agents0/sessions0; no native execution acceptance. |
| R13: sidecars belong to the namespace |24 decisions:6 regular orphan sidecars,4 mixed namespaces,12 selected nonregular sidecars and2 regular same-namespace sets. Correct orphan/ambiguity/unsupported errors; all entries/bytes preserved; no blank DB. |PASS, actual filesystem. Opaque sidecar bytes test routing; SQLite validity/recovery is delegated to unchanged core guards. |

The storage decision table is deliberately strict: any entries from both basenames mean ambiguity; a selected nonregular entry means unsupported; regular sidecars with no main mean orphaned; only all eight absent mean empty. A real regular main with same-name sidecars remains selected for the core's schema/journal validation. The resolver neither cleans data nor assumes a sidecar is disposable.

The independent correctness reviewer found RENAME-CR01 (legacy preallocated native session mismatch), RENAME-CR02 (dangling legacy entry hidden by `existsSync`) and its orphan-WAL follow-on. This review supplements those findings with its separate state partitions; it does not claim their discovery. Earlier readiness was withdrawn when the orphan-WAL counterexample appeared. The separate dd07 correction, rather than the earlier passing module batch, is the basis of this PASS.

## Actual pre-brand verified-v2 preservation

The correctness reviewer supplied a closed synthetic schema3/cryptoVersion2 store created at the exact pre-brand S2 fix `88a25f0a6f12cf1371a40f1860052231b9fe2687`. Original SHA256: `88dd55015b5fb01fd0b162df2464bcd9128d602300d04ba950978d1cbb6b5357`. This lane read filesystem bytes only from that original, then opened a separate copy named `bubbles.sqlite` with the same synthetic key and exact trusted opaque principals. The original remained closed and byte-identical; the copy was removed afterward.

| Preserved fact | Expected / actual |
| --- | --- |
| Acknowledged context |Exact synthetic plaintext after authenticated decryption; content digest `d9686a85df65c02990e161fc49401403cb5ef521100195b671fc87b0c72cf11b` unchanged. |
| Immutable action |Digest `4e1071fe58c83b83e3147cd193615959ea6b9d835bb2803814fd5bee6ef2ea99`, exact stored spec and generation unchanged. |
| Claim / reservation |Claim `ebb89bb28cac76451b3e79bea06a35432a3bb0d326f2cdaee6b752385ac31bb2`, reservation `a55ca348a02b870946834c80eb5f41f63209cf4e0e658c7f851391830d511132`, held count1, no release evidence. |
| Generation |`e661f4c935e8a5a83349afb5e347695c2e972e967b50efcd618f93b0b7b4c24b` unchanged. |
| Authenticated data row |Full ciphertext/nonce/tag/metadata/scope/id/kind/digest row identical before/after copy reopen. |
| Normal startup reconciliation |Task version3→4, authEpoch1 unchanged, task recovery_required, action unknown, reservation held. This acknowledged recovery is not rename rewriting or a claim that whole DB bytes cannot change on recovery. |
| Authority and plaintext |Documentedly allowed same-task worker context read succeeds; reviewer without exact record allowlist denies; foreign owner returns TASK_NOT_FOUND; JSON-cloned owner denies. Export contains no plaintext. |
| File selection |No new-name blank DB; copy retains only the explicit legacy basename. Expired consent does not release the unknown reservation or authorize replay. |

This actual pre-brand fixture distinguishes supported crypto2 parity from newly constructed stores. Genuine prior-v1 rejection remains a separate owner-provenance recovery gate: original generation metadata cannot be proved, so the implementation neither reseals nor invents provenance. A later explicit owner-authorized recovery procedure is not implemented or accepted by this rename.

## Physical move readback

After root moved the repository, this lane checked filesystem/configuration only from `/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball`. The former `bubbles` directory is absent. The stopped synthetic `.runtime/dsh-web-home/bubbles.sqlite` remains53248 bytes, SHA256 **`0144f7f05bd4e12fd9ecde786509437f3274d16b82d3184e7642d477c48bc7a1`**, matching the retained pre-move baseline. No adjacent `dsh-fishball.sqlite` exists.

Using the already installed YAML parser, readback finds exactly one owned `df-m1-fixture` row, generation11, whose module path and explicit legacy database path now use the new project root. This lane did not modify YAML or unrelated settings. Root and the separate reviewer compare the full preserved-settings baseline; this lane's oracle checks only the selected row and DB/file facts. No SQLite connection, Web runner, listening socket, native session or browser was started by this readback. It proves correct stopped paths, not profile/UI lifecycle acceptance.

## Honest failed setup runs

The retained first attempts are not hidden or converted into product passes. An initial independent10-case run had9 PASS/1 FAIL because its VM omitted the browser-standard `AbortController`; providing that global made10/10 pass. A later12-case run had11 PASS/1 FAIL because the public registry exposes `list().length`, not the fixture's mistaken `count` property. The fixture was corrected; all zero-create/stream/agent/session assertions remain. Root's corresponding first independent TAP is retained in [root-independent-first.tap](rename/root-independent-first.tap).

An initial pre-brand probe incorrectly expected worker denial of documented allowed `context`; it was corrected to exact worker context read plus unallowlisted reviewer denial, preserving foreign/clone assertions. An overly broad initial byte-equality assumption included branded config fields; final equality is limited to the four authoritative storage/security modules stated above. The first move readback mistakenly parsed YAML as JSON; it was rerun with the existing YAML parser without changing the file. These are reviewer fixture mistakes, not production defects, and none removes a meaningful invariant.

Root's first renamed client run14/15 correctly refused stale installed wrapper-name metadata; its root-name-only metadata correction and unchanged dependency graph are separately recorded in [rename compatibility](../../rename-compatibility.md). The final exact20-case independent run and unchanged35-file manifest supersede setup failures for this bounded unit only.

## Scope and retained acceptance debt

Bounded rename development integration is safe on this evidence: new names align; legacy data/approved session identity remain accessible through the specified boundaries; unsupported, ambiguous, orphan and foreign state fail without fallback; original authority and crypto rules remain intact. No independent rename finding remains unresolved.

BUB003 storage/migration, BUB006 authority, BUB007 memory, BUB011 native execution, BUB014 visible controls and DF010 provider-neutral chat retain their original/current source requirements. This report accepts no complete ticket. Later schema4 migration, durable memory/events/chat/audit, approval previews, cross-stage integration, actual profile/native input/result delivery and browser functional/visual regression remain explicit development or acceptance work. Mock elements, typed memory doubles and metadata-only provider fixtures satisfy no native UI/live-provider criterion. Live chat platforms are OUT by amendment. Publication, full MVP/release acceptance and legacy-v1 provenance recovery remain unauthorized or unimplemented gates.

## Consolidated regression: React fixture correction and final hold

The historical dd07d1b rename verdict above is unchanged. Root's first consolidated88-file run subsequently exposed a stale independent R07 shallow-render fixture: `React.useEffect is not a function` at the new panel's effect registration. [The retained first consolidated TAP](../M6/consolidated-first.tap) records751 tests,749 PASS,1 FAIL and1 SKIP, exit1. The skip had a separate command cause: root used the historical `BUBBLES_FISHBALL_CORDIS_REVIEWED` flag instead of the current `DF_FISHBALL_CORDIS_REVIEWED` gate for the already authorized public Cordis fixture. Neither failure nor skip is credited as a pass.

Root authorized only the independent React fixture adaptation. The [first source](rename-react-fixture-first-source.txt), SHA256 `3eb8fe6187d361c52fdf298325286a1c51a6d7f8ab65eec93202f27da045d5e1`, remains archived. The sole change adds a `useEffect` hook which registers the callback without running it, plus its explanatory comments and callback array. A read-only complete source diff confirms every assertion and all other source/scenario bytes remain exact. The identity oracle still checks native/package/RPC/module/panel names and escaping; it does not simulate a React commit, run intervals or establish rendered-browser/visual behavior. No production or author test changed.

| Independent command / expected oracle | Actual retained evidence |
| --- | --- |
| `env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node --test --test-name-pattern='independent rename public identities' test/rename-adversarial.test.mjs` before correction; reproduce the stale hook |0 PASS,1 FAIL,0 SKIP, exit1,176.808667ms. [First TAP](rename-react-fixture-first.tap), SHA256 `e77fbb9833abddca9ae90ea5109913eb974763e256afbb7fc2049973ecd25557`. |
| Same focused command after hook registration; retain every identity assertion |1/1 PASS,0 SKIP, exit0,204.193334ms. [Fixed TAP](rename-react-fixture-fixed.tap), SHA256 `9d51ec1bef4751a348939a28ab0f03e45e761462e1d920e20ef23c0cd9db3571`. |
| `env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node --test test/rename-adversarial.test.mjs`; retain all13 rename scenarios |13/13 PASS,0 SKIP, exit0,338.853166ms. [Complete rename TAP](rename-react-fixture-complete.tap), SHA256 `d1babb380a95998e61d4309ef13325db3c2ffd549019b19a4c7d9d595144e18c`. |
| `node --check test/rename-adversarial.test.mjs` |Exit0; parsing alone is no product acceptance. |

Final held [independent test](../../../test/rename-adversarial.test.mjs) SHA256 is **`ed17a70a26f74e97852043d1752f0e26cd214e4e2d540984d1a1578250b7687c`**. The prior executable freeze had87/88 unchanged files; this was its only authorized test change. Root regenerated the [88-file executable freeze](../M6/executable-freeze.sha256), SHA256 `29c53e4e76b26cdc9b9f841346b6279f6b60c85a691c08207aaad34f9dc55041`, and independently rechecked every file afterward. This lane also performed a read-only final88/88 hash check with0 mismatches; the three evidence reports are outside that executable manifest.

Root's corrected command `/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin DF_FISHBALL_CORDIS_REVIEWED=1 /opt/homebrew/bin/node --test --test-concurrency=4 test/*.test.mjs` records **751/751 PASS,0 FAIL,0 SKIP,0 CANCELLED**, exit0,30329.830291ms in [the final run record](../M6/consolidated-final-run.json). [Raw final TAP](../M6/consolidated.tap) SHA256 `5fea35bc468803cabe0651368fabf0a939d1a9042dd6ac1caaa4ef170a26174a` was checked by this lane. These are root-executed consolidated results, not an additional independent full-suite run. Source commit is `6c830caef7d5748e4bc2afda0168cdca1a933b3c`, with only the separately held hook fixture correction afterward. Node22.22.2/npm10.9.7/macOS27.0 preview are recorded.

**Bounded rename and corrected fixture regression PASS; files HELD.** Independent final CODE, actual browser/visual behavior, portable production installation, real model/catalog/permission policy behavior and complete ticket/MVP/release acceptance remain HOLD. The successful suite does not change those gates or the owner-excluded live chat platform scope.
