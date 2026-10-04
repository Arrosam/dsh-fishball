# NI5 independent standalone functional module results

Status: **independent functional T lease complete; two product failures resolved by the author's narrow repair and an independent12/12 focused retest.** The first broad run was130 tests,128 PASS,2 FAIL,0skip. This is not a new130/130 result against repaired bytes. Independent owner `normal_integrations_istqb` is separate from author `prep_messages_results` and the held CODE lane. Actual store/native/physical/rendered/model/full82+5 acceptance remains pending/HOLD.

## Findings, exact source and execution history

| Observation | Exact module / test / evidence |
| --- | --- |
| Initial author-held module | `89feb0bcc9f97cdeecbeb43d27e39caabd7c1b6014110688e401bf03a37e61fa` |
| Initial author-held test | `6cf4e496bd3e276c475eaa7446389ecfe19bf95b3bb3025c9773d7633b5c1d69` |
| Independent unchanged test and first snapshot | `2f219886a99c96d49319ab158cc4e1a974f72be7927bcd97b4dda2c82be244ae` |
| First full independent TAP130/128PASS/2FAIL | `d7d3f26f7c5da10890ba6da61c4e5db7a7d094ba80f3273b2b655b693102f931` |
| Root-authorized repaired module | `f98296928737a7f8a2feb7c487fe8ff06af17a4d5fed631b561a5ece7d5c77d8` |
| Root-authorized repaired author test | `f6e3feb834521e847a77587b4b0276fd60db34125ad8c6be51bfe38a5978a24e` |
| Independent focused retest12/12PASS | `5cc9a65100bc405ddab59cb48d25df5d78d7b3dfbcfe9f721874eda5de8c542c` |
| Author repair report | `f1d1ae8ab1b711c99bc93053fdac0a2c321889bbd32530dcc53ff341094f6557` |

F1 (first case1): exact disabled selection preserves `{enabled:false}`, but installedResultsInstaller read absent selection.notifications.enabled and threw raw TypeError. Root chose to preserve the existing single private receipt subscription/disposer; zero source-data/effect calls applies to disabled operations. Author introduced a derived short-circuit notificationsEnabled flag, null optional contributions, stable RESULTS_DISABLED/false admission and inactive disabled receipt bookkeeping. The original independent disabled/one-subscription/no-effect assertions remain unchanged and pass the focused retest.

F2 (first case104): localDeliveryAccess reflected a thrown Proxy's code descriptor. Its trap supplied UNAUTHORIZED, producing a false denied-access update instead of uncertainty. Author now detects Proxy before reflection and reports LOCAL_ACCESS_UNKNOWN; only an own inert string data descriptor with actual UNAUTHORIZED/PERMISSION_DENIED may classify denial. The exact original Proxy case now observes0traps/0access writes. The selected actual-denial, crypto/storage/digest/binding/missing/lifetime/unknown and getter partitions also pass without weakening any assertion.

[First full TAP](independent-module-first.tap), [first source snapshot](independent-module-first-source.txt), [unchanged independent test](../../../test/installed-results-adversarial.test.mjs) and [first observations](independent-module-first-observations.json) are retained. This lane made no fixture, assertion or product edits after the first run. A derived observations parser initially used a greedy DOTALL name capture; only that JSON parsing was corrected, with [original parser output](independent-module-first-observations-parser-original.json) retained. Product test/TAP bytes were untouched.

The first commands were `node --check test/installed-results-adversarial.test.mjs` (exit0; [syntax output](independent-module-first-syntax.txt)) and `node --test --test-reporter=tap test/installed-results-adversarial.test.mjs` (exit1,130/128/2,561.126958ms). Root then authorized failed cases plus actually affected disabled/access-error partitions only. The one retest command was:

```text
node --test --test-reporter=tap '--test-name-pattern=^T N5-01/N5R-01:|^T N5-12(/20)?/N5R-08:' test/installed-results-adversarial.test.mjs
```

The command above displays the filter as one argument; the exact argument array is retained in [scope](independent-module-retest-scope.json). [Focused final TAP](independent-module-retest.tap) records12 tests,12 PASS,0fail/skip/cancel/todo and161.455292ms. Node filters out the other118 cases;0reported skips does not mean those cases reran. Their first-run evidence remains bound to the initial module. The two failures and ten affected initial passes are bound to the repaired retest source separately. No unchanged successful batch was repeated.

Original [author evidence](module-author.md) and its first/readiness/final raw TAPs remain unchanged, including author40/40 and earlier first failures. [Author F1/F2 repair](module-f1-f2-repair.md) and its43-case raw TAPs are author evidence, not independent execution. Root's later focused-only instruction superseded the earlier possible full authored compatibility run, so this lane did not rerun the whole author suite or relabel40/43 as independent passes.

## Source guards and oracle limits

[Initial19-pin manifest](independent-module-held-before.sha256) matched immediately before and after the first run. Root authorized exactly two replacements, module and author test; all17 other source/contract/design/author-evidence/AC pins remained unchanged. [Repaired before](independent-module-retest-held-before.sha256) and [repaired after](independent-module-retest-held-after.sha256) manifests each match the same20 files, adding the repair report. The initial manifest is historical: its two original module/test hashes intentionally differ from repaired current files. [Final manifest](independent-module-final.sha256) pins current code and every retained evidence/report file without erasing the initial pin history.

[Environment](independent-module-environment.json): Node v22.22.2, darwin arm64, Python3.14.5. Independent imports are Node test/assert/crypto plus src/installed-results.mjs only. The actual local product closure is installed-results→runtime-security/context/notifications; notifications→messages/results and runtime-security→ledger declarations/node:sqlite. All seven local sources are pinned; no RuntimeStore import or Ledger/DatabaseSync/RuntimeStore construction occurs. The experimental node:sqlite warning is a transitive import diagnostic, not D evidence. The repair adds supported Node util types only.

The independent fixture uses separately written sorted-JSON/SHA256 and complete UTF-8 envelope expectations, retained Maps, inert typed native/report projections, manual Promise barriers and per-operation counters. Those records are deliberately synthetic closure carriers: no signed provenance, authentic native source result/reviewer, actual receipt/permission, ciphertext, store transaction, physical receiver, timer or process durability is established. Source-derived report aggregation/precedence and final group/fact/resource ownership remain core oracles. Historical synthetic delivered fixtures test retained contract parsing only; they do not invent delivered proof for a real local publication. Opening remains unknown for actual local send/access behavior in this test.

## All21+10 held design families

The [original held NI5 design](test-design.md) SHA256 `80a4debeaca1e482d1aadfb9f70b6cbf437164c8584a60b39848ad27f26dc241`, [read addendum design](read-projection-test-addendum.md) `4215e0ad5997e1ee2b9d9924462b96fc99338d8236a11660610502bfb5a4aed9`, [contract](../../normal-results-contract.md) `6b6e2e752141bf7e52a6c6ae4d9b3b6968fdf6d2e31fbc48790f35c0cf3d3569` and [author projection](read-projection-addendum.md) `d404a0c2efb91fa945430cc920b40b8e563e6f9cdd70d7d8b8ffb543832a04db` remain unchanged. Each family below has a partial typed contribution or explicit NOT RUN; no full family passes through counters or native-looking JSON.

| Family | Observed bounded contribution / remaining oracle |
| --- | --- |
| N5-01 | T: config/installation/no-boot branches; disabled install F1 failed first; exact original case passed focused repaired-source retest. D/N/P remaining. |
| N5-02 | T: independent scoped route/recipient hashes and captured carrier peer/profile/lifetime; authentic public classes/permission N/P remaining. |
| N5-03 | T: typed native/null/unavailable/raw accepted/body flags. Actual captured native result/signed association D/N/P NOT RUN. |
| N5-04 | T: exact typed immutable version/record/kind/digest/bytes/historical read and status counters. Actual encrypted scope reads D/N/P remaining. |
| N5-05 | T: all eight retained aggregate states and per-audit source/coverage/fatal/repair axes survive manifest. Actual source derivation and every precedence pair D NOT RUN. |
| N5-06 | T: independently sorted complete manifest, mismatched/raw/stale association rejection, manifest overflow. Signed actual body/association/atomic writes D remaining. |
| N5-07 | T: typed independence/evidence/generation/verdict/report/result/coverage/fatal guards. Actual fresh signed reviewer/input/captured result D/N NOT RUN. |
| N5-08 | T: exact action/CAS/target/charge recipe, synchronous private receipt narrowing, no recursive reads, 128-plan cap. Actual original preview/grant/receipt N/D remaining. |
| N5-09 | T: original getDelivery/publish shape, source reread, async disposal after fake commit. Actual atomic two-connection races/group claims D/N/P NOT RUN. |
| N5-10 | T: callback echo refused, sent and historical synthetic delivered distinct from current access/opening unknown. Actual committed publication N/D/P remaining. |
| N5-11 | T: retained Map commit/lost-return query/unknown counters with zero resend. Real process reopen/recovery D/N/P NOT RUN. |
| N5-12 | T: explicit access update, source denial vs storage/crypto/lifetime/error partitions and per-item preservation. Proxy error F2 failed first; exact original case passed focused repaired-source retest. Actual monotonic/core persistence D/N/P remaining. |
| N5-13 | T: synthetic sibling states and failed-released retry hint only. Actual failed-only fresh lineage/mixed batch atomicity D NOT RUN. |
| N5-14 | T: stable fact digest dedup across new IDs/dates, unknown group/policy revision hold, 16/17 batches. Durable fact/group ownership/charge/restart D remaining. |
| N5-15 | T: quiet half-open/wrapping/full-day, emergency/frequency, coalescing equality and selected actual Intl DST hints. Atomic/native/complete calendar and rendered matrix pending. |
| N5-16 | T: complete canonical escaped CJK/astral publication envelope bytes N-1/N/N+1 and typed charge recipe/frequency hints. Actual locked claim/publication/shared resources D NOT RUN. |
| N5-17 | NOT RUN D/P: real process/storage crash cuts, migration/IO/fsync/FULL recovery. Injected typed error branches are separate T only. |
| N5-18 | T: captured peer/connection/profile/child retirement, dispose idempotence, old callbacks sealed after await. Ten actual native reloads/full quit N/P remaining. |
| N5-19 | T: closed owner operation data/status/reply shapes and observational counters. Native RPC/rendered Chinese/focus/keyboard/opening U/N HOLD. |
| N5-20 | T: closed hostile config/input, raw byte/digest/request/plans/manifest bounds, errors/counters. Protected storage headroom/privacy/export/native growth D/N/P remaining. |
| N5-21 | NOT RUN D/P: authentic held schema5->6 migration/backups/old-reader refusal, signed registry inverse and crash preservation. No raw rows, schemas or DB touched. |
| N5R-01 | T: exact private module closure and zero boot/read mutation; actual normal-only core binding N/D/P remaining. |
| N5R-02 | T: independently hashed exact permitted-carrier bytes/version/record/kind/byteLength plus malformed/historical cases; actual decryption D remaining. |
| N5R-03 | T: readable bytes distinct from native readiness; null/unavailable/raw/body flags cannot unlock. Actual authenticated normal projection D/N remaining. |
| N5R-04 | T: typed producer/reviewer/generation/evidence/source/report/coverage drift guards; exact actual core signature/current report/locked repeat D/N remaining. |
| N5R-05 | T: exact original getDelivery return/intent/sent/currentAccess and echo-vs-retained-fact cases; actual durable association D/N remaining. |
| N5R-06 | T: manual await with fake committed sent, then captured peer/profile/lifetime/dispose failure; actual store/publication-first order D/N/P remaining. |
| N5R-07 | T: fake committed-loss and unknown read-only query/no resend counters; real crash/reopen N/D/P remaining. |
| N5R-08 | T: actual-typed denial codes vs crypto/storage/lifetime/error; hostile Proxy F2 failed first; exact original case passed focused repaired-source retest. Actual native/core permission/corruption D/N remaining. |
| N5R-09 | T: explicit current access preserves synthetic history/state and unknown opening. Actual monotonic/dedup/time/headroom core D/N/P NOT RUN. |
| N5R-10 | T: source/detachment/current carrier/lifecycle/no boot/no effect. Actual public class/package/current native/rendered oracles N/P/U pending. |

## Individual retained AC residuals

The48 NI5 IDs below exactly match the held original NI5 design; the read addendum's30 are a subset. [Retained traceability](../../acceptance-traceability.md) still contains82 original plus five DF010 criteria, and [approved source](../../reference/approved-ticket-review.zh.txt) remains SHA256 `cf38310f93b9a7bd96efaca8ab53e1d71c16e86d6810513807c4b56ed33d1ca3`. Other retained AC remain unchanged. [Results JSON](independent-module-results.json) records exact130/12 case names, pins, finding transitions,31-family dispositions and these individual residuals. No whole AC is marked PASS.

| Retained AC | Bounded independent contribution | Remaining unpassed oracle |
| --- | --- | --- |
| BUB013-01 | T partial: all eight report states and exact original-goal/scope/unfinished/next/evidence/source/repair material retained in canonical manifests. | Actual native result, source-derived encrypted report and complete source facts D/N pending. |
| BUB013-02 | T partial: version/record/digest/complete bytes, scoped historical reads and separate current allowed/denied access. | Actual encrypted/native permitted read and supported rendered opening D/N/U pending. |
| BUB013-03 | T partial: original getDelivery/sent/currentAccess tuples, synthetic historical delivery and unknown sibling remain distinct. | Actual per-item outbox/publication/receipts and failed-only fresh retry D/N pending. |
| BUB013-04 | T partial: stable fact digest dedup, current kinds, quiet/emergency/merge/frequency advisory boundaries. | Actual report classification, atomic fact ownership/counters and notification effects D/N pending. |
| BUB013-05 | T partial: fake committed-loss query reads sent/unknown without another publish; held group survives policy revision. | Real durable unknown/reopen/lineage/query-before-retry D/N/P pending. |
| BUB014-01 | T partial: material/native/null/unavailable/raw states and closed observable local status. | Actual rendered panel/audit/task/delivery/access presentation U HOLD. |
| BUB014-02 | T partial: separate explicit plan/read/report/accept/access and closed denied calls. | Actual state controls, preview/grant, positive policy update/runtime wiring N/D/U pending. |
| BUB014-03 | T partial: wrong CAS, receipt invalidation, exact target and after-await replacement refusal. | Actual double-click/atomic race/late reply original host and renderer D/N/U pending. |
| BUB014-04 | NOT RUN U: no rendered browser/Chinese/resize/keyboard/focus/loading/error/opening observation. | Supported native/browser observation HOLD; metadata counters are not visual evidence. |
| BUB014-05 | T partial: scoped artifact/version/record/intent/recipient refs and exact bytes. | Actual original native navigation, session/approval links and rendered access N/U pending. |
| BUB015-01 | T partial: canonical material/source coverage and complete passed-report binding shape. | Authentic admitted exact native review input/result and useful review quality D/N/M pending. |
| BUB015-02 | T partial: same producer/reviewer or generation and mixed source/report refs refuse. | Actual fresh independent native reviewer/generation/claim D/N pending; development CODE HOLD. |
| BUB015-03 | T partial: raw/unavailable/rejected/unknown readiness refusal; typed passed requires coverage/current source/no fatal findings. | Actual signed aggregate precedence/material currentness and no false accepted completion D/N pending. |
| BUB015-04 | T partial: selected action charge/attempt recipe is explicit; no fixture review/repair work is performed. | Actual charged bounded NI3 review/repair/retry/shared reservations D/N pending. |
| BUB015-05 | T partial: body native-looking/pass/delivered flags and supplied report verdict/time/proof do not grant readiness. | Actual model/native proof exclusion and original final permission/core authority D/N pending. |
| BUB006-01 | T partial: independently hashed owner/workspace/profile route and captured peer/connection/profile/lifetime fences. | Authentic public classes/OperatorPeer/RPC/owner/source/permission N/P NOT RUN. |
| BUB006-02 | T partial: exact target/CAS/material/reviewer/action-digest/private receipt narrowing and after-await lifetime refusal. | Actual grant/auth/expiry/revoke/core locked source policy/native permission D/N pending. |
| BUB006-03 | T partial: closed hostile config/wire/errors and exact canonical bounded material; F2 reflection/false denial fixed. | Real encryption/registered secret scans/generic export/storage/privacy D/N pending. |
| BUB006-04 | T partial: read/publish request bytes and association refs equal independently computed selected data. | Actual admitted necessary exact published material and native recipient D/N pending. |
| BUB006-05 | T partial: typed true denial versus crypto/storage/missing/lifetime/Proxy uncertainty; no alternate effect. | Actual current native permission/unknown safety and final original core authority D/N pending. |
| BUB009-01 | T partial: notification factual digest remains identity-independent; duplicates suppress and unknown facts hold. | Persistent origin/fact identity, full-content conflicts/retention/intake dedup D pending; NI4 separate. |
| BUB009-02 | T partial: fake commit/lost return retains sent/unknown, query invokes zero mutation. | Actual outbox/publication/result crash cuts and durable query-before-effect-retry D/P pending. |
| BUB009-03 | T partial: boot invokes no data/effect calls; captured old lifetime seals after fake commit. | Actual full quit/restart, durable reconciliation/no drain and missed schedule NI4 N/P/D pending. |
| BUB009-04 | T partial: UTC half-open/wrapping boundaries and selected actual Intl repeated/missing DST minute hints. | Complete actual schedule/notification timezone/date/rendering U/D/N pending. |
| BUB009-05 | T partial: quiet/merge/emergency/frequency/disabled advisory state and no auto publication. | Actual atomic pause/quiet/coalescing/frequency/emergency policy, intake/work independence D/N pending. |
| BUB012-01 | T partial: explicit selected units/current bounds and narrow local-none action recipe. | Actual held sent/unknown shared reservation/last-slot/queue/weight races D pending. |
| BUB012-02 | T partial: exact model/resource versions and route/model/environment/tool-empty facts are in derived spec. | Actual accepted native catalog/policy/reasoning/role/source and selected-model quality N/D/M pending. |
| BUB012-03 | T partial: explicit attempt1/group/charges and no automatic fake resend/review. | Actual cumulative charged publication retry/review/repair budgets and unknown holds D pending. |
| BUB012-04 | T partial: source-local estimated monetary0 recipe and complete UTF-8 usage charges labelled explicitly. | Actual measured usage/unknown billing/generic unknown-cost refusal/provider tokens D/N/M pending. |
| BUB012-05 | T partial: selected N±1 caps, full escaped CJK/astral envelope bytes, manifest overflow, batch16/17 and plan128/129. | Actual protected terminal/storage/registry/history/rate/resource growth headroom D/N/P pending. |
| BUB003-01 | T partial: fake committed result/readback and lost-return observation preserve source map fact. | Actual transaction/receipt/outbox/publication/ack crash and storage durability D/P NOT RUN. |
| BUB003-02 | T partial: immutable scoped artifact/version/digest/intent/current-access and CAS. | Actual signed immutable associations, final locked races and chronological access history D pending. |
| BUB003-03 | T partial: typed source crypto/storage/missing errors and overflow refuse without fake trusted effect. | Real SQL/IO/FULL/crypto/registry inverse/capacity atomic refusal D NOT RUN. |
| BUB003-04 | NOT RUN D/P: no schema/migration/backup/fsync/old-reader/database/raw-row work occurs. | Authentic held5→6 preservation/old5 refusal and unchanged NI3 held4→5 D/P pending. |
| BUB004-03 | T partial: body claimed native output/accepted/delivered flags cannot substitute for private projection. | Actual source-captured native output/execution/result association D/N NOT RUN. |
| BUB004-04 | T partial: fake committed publication survives post-await peer/profile/dispose/lifetime loss. | Actual cancel/revoke/publication-first outcome and held reservations D/N/P pending. |
| BUB004-05 | T partial: exact query/material refs and old callback/lifetime cannot replay into replacement. | Actual native cursor/owned session/source reconcile/restart D/N/P pending. |
| BUB001-02 | T partial: captured original closure fences, one owned subscription/disposer and idempotent disposal. | Ten actual native reloads and one original panel/route/recipient N/P NOT RUN. |
| BUB001-04 | T partial: fake committed-before-retirement facts retained with no stale success. | Actual full-stop/reopen/window-close limitation and native restart D/N/P/U pending. |
| BUB016-01 | Bounded T evidence: exact first failures/source, authorized two-pin repair, focused retest and individual48 AC/31-family residuals. | No full AC or CODE acceptance; all82+5 and future source/aggregate/oracles retained. |
| BUB016-02 | T partial: standalone installed module with data-only same-ledger closure shapes. | Actual normal encrypted/native review/local publication chain, UI/model/aggregate NI6 HOLD. |
| BUB016-03 | T partial: typed fault/currentness/async/caps and first failure/repair counters. | Actual migration/storage/cancel/revoke/crash/restart/quit/full regression D/N/P pending. |
| BUB016-04 | NOT RUN P: no packed artifact/install/CLI/native-profile/host lifecycle command. | Genuine bare installed package/original public peers and preview reproduction pending; no release. |
| DF010-C01 | T contribution: private current local recipient/scope/receipt/lifetime boundaries. | Original provider-neutral paired identity/revoke criteria retained; live chat/accounts OUT. |
| DF010-C02 | T contribution: immutable selected artifact/manifest/fact digest identity. | Original edit/delete/order/complete event identity criteria retained; live chat OUT. |
| DF010-C03 | T contribution: original scoped local recipient/channel/intent refs; no caller target authority. | Original conversation/thread/forward/group contract retained; native/provider proof pending, live chat OUT. |
| DF010-C04 | T contribution: exact permitted-carrier digest/version/UTF-8 bytes and distinct access/opening states. | Original attachment descriptor/access/receipt criteria retained; actual opening and delivery pending. |
| DF010-C05 | T contribution: sent/query/unknown/historical delivered/current access/rate hints remain separate without resend. | Actual source-backed transport/rate/disconnect/outcome/core query proof pending; live chat OUT. |

## Pending gates and lease release

Actual D proof remains NOT RUN: normal-only readLocalArtifact/readLocalProgress, actual NI3 signed audit_result/independent reviewer/current material/semantic coverage, schema6 policy/pair/report inverse registry, complete encrypted byte/source admission and exact manifest, original grant/CAS/revoke/core final permission, same claim/group/fact notification publication with no second charge, access monotonicity/headroom, real two-connection races and genuine migration/crash/reopen/fsync/backup/old-reader refusal. No raw-row corruption or DB experiment was attempted.

Actual N/P proof remains NOT RUN: pinned original public classes/native operator/permission/profile, actual private runtime/RPC/composer/client binding, real recipient/publication/host lifecycle, bare package/CLI/install/full quit/restart and useful native independent model review. CODE stays HOLD with the flagged experiment untouched; browser/rendered opening/UI/model/NI6/full82+5/MVP/release remain HOLD. Live chat/provider accounts stay OUT OF THIS PHASE. No external, credential, inference/tool/provider/recipient/native listener/install/Git operation ran. This lane releases its new test/evidence and held seven-source closure to root after exact bundle validation; it creates no source or acceptance lease for those pending integrations.
