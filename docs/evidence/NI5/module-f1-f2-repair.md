# NI5 independent F1/F2 narrow repair

Status: AUTHOR HOLD for this affected source/test unit, pending independent exact failed-case and affected-coverage retest. Root authorized only src/installed-results.mjs, authored test/installed-results.test.mjs and new author repair evidence; no other source/core/shared/independent test/Git/native lease was used.

The independent first run is retained unchanged:130 tests,128 passed,2 failed. Original source snapshot is independent-module-first-source.txt; original TAP is independent-module-first.tap. The old author module-author.md, module-first.tap, module-readiness-first.tap and module-final.tap remain byte-identical. This finding-driven note supersedes no earlier evidence and does not turn a prior failure into a pass.

F1: validateInstalledResults deliberately returns exact detached `{enabled:false}`. Installer later read selection.notifications.enabled and threw TypeError. The repair uses a short-circuit derived notificationsEnabled flag, preserving the validator shape; disabled installation returns the same closed operations/recipientAdapter with progressPolicy:null and notifications:null. Valid disabled operations return RESULTS_DISABLED before source data/lifetime reads, admission is false, and disabled receipt callbacks do no bookkeeping. Per root's explicit clarification, the frozen single private receipt lifecycle subscription and one disposer remain; neither registers/activates a native route nor reads/writes policy/artifacts/reports/plans/grants/claims/publications. No default or new authority is introduced.

F2: localDeliveryAccess reflected getOwnPropertyDescriptor on a thrown Proxy; its trap could forge UNAUTHORIZED and cause a denied-access fact. The repair checks supported node:util types.isProxy before any error reflection and returns LOCAL_ACCESS_UNKNOWN for a Proxy. Only an own inert string data descriptor containing exact UNAUTHORIZED or PERMISSION_DENIED can classify an actual scoped read denial. Accessor/inherited/coercible codes confer no denied fact. Existing storage/crypto/digest/binding/missing/lifetime errors remain errors/uncertainty; none writes access evidence or changes historical delivery. Generic read/publication/normal native verification semantics are unchanged.

The authored regressions exercise the exact disabled shape/null contributions/single lifecycle registration, all named valid disabled operations, false admission and zero source reads/effects, plus thrown Proxy/getter/inherited/coercible code traps and retained published facts. Existing enabled/native/read-source/crypto/current-access coverage is retained without loosening assertions. Syntax checks passed. First affected authored run43/43 passed; final affected authored run43/43 passed,0 skips. Both raw TAPs are retained in module-f1-f2-first.tap and module-f1-f2-final.tap. Tests remain trusted typed module carriers only, not actual storage/native/provider/recipient/CODE/browser/full acceptance proof.

| Repaired AUTHOR HOLD file | SHA256 |
| --- | --- |
| src/installed-results.mjs | `f98296928737a7f8a2feb7c487fe8ff06af17a4d5fed631b561a5ece7d5c77d8` |
| test/installed-results.test.mjs | `f6e3feb834521e847a77587b4b0276fd60db34125ad8c6be51bfe38a5978a24e` |
| old source before repair | `89feb0bcc9f97cdeecbeb43d27e39caabd7c1b6014110688e401bf03a37e61fa` |
| old authored test before repair | `6cf4e496bd3e276c475eaa7446389ecfe19bf95b3bb3025c9773d7633b5c1d69` |

All17 other pins in the retained19-file independent manifest remain unchanged, recorded in module-f1-f2-protected.sha256. Root's held NI4 files, core and generic module sources were not edited. No edits are pending in these repaired held bytes absent a new concrete finding. Independent retest/review disposition, actual serial core/runtime/package/native/recipient proof and full82+5 acceptance remain pending/HOLD.
