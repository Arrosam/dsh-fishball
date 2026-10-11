# NI6 independent owner finish-intent SOURCE review

The exact 32-entry proposal has one open high source protocol finding, **OI-F01**: recording immutable Q before first durable producer or repair artifact capture makes that Q stale when the original artifact writer increments task version. The newly gated finish then rejects the same Q. This is a source proof for that prescribed write sequence; no product execution or separate runtime-composition review was performed.

**Disposition:** independent affected SOURCE review complete; initial proposal HOLD pending an exact bounded amendment. All 87 retained criteria remain accepted **0/HOLD**. Final CODE, HOST, cold compatibility, browser, useful native/model behavior and publication are unclosed. The report does not authorize adoption or commands.

Reviewer: `/root/ni4_scope_timer_review`; English; 2026-10-07. Author and reviewer are separate. Root controls all adoption, amendment scope, execution, Git and integration. The repository [AGENTS](../../../AGENTS.md), [owner amendment](../../owner-amendment-2026-10-04.md), [three-stage policy](../../three-stage-development.md), [workflow](../../development-workflow.md) and [acceptance debt](../acceptance-debt.md) were applied.

## Exact reviewed source

Subject: [author proposal](schema7-core-author-owner-finish-intent-source-proposal.md), frozen sibling `.runtime/ni6-owner-finish-intent-core-proposal/`, complete seven-module before/after source, preserved original literal and amended companion. The machine report includes every independently calculated pin, all prior 28 hashes, import edges and verification results.

| Artifact | Independently verified SHA256 |
| --- | --- |
| Exact32 freeze digest | `70fe5c97133429cbe4cca2bffd9494d05189e32cc98f1682047307860ce91d6e` |
| source-manifest.json | `86404ee955af4372aa6c1551c9ae7d77537338ca31948c1243c433efd8357889` |
| Before runtime-store.mjs | `59e7b1130ce4a80293881b3aa7bcb7e649402d817922290eee09544b7deafd07` |
| Proposed runtime-store.mjs | `cfc30b5bec526606f6b4075145f8b77e7701aafd2577d251c594640f7b51db28` |
| Actual required.diff | `d136bfd59526ee6afbf6de03dce08a48dffaed9da44b7a136553c19eeb7dbefe` |
| Amended owner command literal | `b56ca315ade426eaabcc9358285a19189452fd3c974a29cbc671116b93a31ec5` |
| Original historical owner command literal | `4afcd5d073ea33f69db7376bed0715fe3d29d886817417288c26af6bd1a8f020` |
| before-after.json | `e0884c7b6e34eded8473681a84f084d37c0c236aaa2e5e2241c1d4745c00f189` |
| import-closure.json | `af8c3f515525d1562ab1be60b28056a167bf7c437863ed64d6fc8c95772f61fd` |
| effects.json | `28c30ba438f7eac5879a24d1880d5d62e473f3eae7d4bd122fd0f2c5f7e83c5e` |
| prior-r2-comparison.json | `76fced8598c527619ce542361014ec95f59e5d58ca581e4062d8533ee5cb00b3` |
| Prior r2 source manifest | `48973af274fab3c82ef4edce1a0129ece321b6ffc2daa46319b3e0e48cd931d0` |

All32 declared paths, sizes and hashes match. Recomputing the manifest's sorted compact-JSON file-list recipe produces the exact freeze digest. A Python stdlib unified diff rebuilt directly from legitimate before/after source is byte-identical to `required.diff`. Only `runtime-store.mjs` changes.

| Exact unchanged sibling module | SHA256 |
| --- | --- |
| context.mjs | `f6c8ec033c53ee11617d090a416ad61da9162a3feb7f526088cac89cdef91cb9` |
| fishball-memory-core.mjs | `65efb6117e6f60f5b669b2305b75f3e43ed7e77530c20c374158d504b7ac03bc` |
| ledger.mjs | `250cfddd11187ac08defd006737491df54b1bfa5901e1df90ef577f72882fbb4` |
| memory.mjs | `074ec0bb4ce686b9b8fddec1e71e885ca5890f108b876b482f4a1ec086f0f1e9` |
| normal-contracts.mjs | `98e68b5678070815e1da07c6410000eb7ce4a711f72ebe87f5070bf9fbc97e67` |
| runtime-security.mjs | `ee3c1051f3c16adf8c9d4f66a15623de5e13c1a3fef844a40927b9e7193c406d` |

Prior r2 freeze `72927f81a3d08f5c9888a742c1d74b491a87da3605884c2b338174a427dfd91a` and its 28 entries are unchanged. Four original test files were checked only as bytes to SHA256, under root's explicit immutability-only authorization. Their bodies, assertions, fixtures and oracles were **not decoded, read, printed, reviewed or executed**. The other prior entries are legitimate source, contracts and provenance metadata. The six copied original/shared product baseline pairs also match.

The pinned Node binary resolves to `/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node`, 84640 bytes, SHA256 `463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de`. This was filesystem verification; the binary was not invoked and no current version command was run. DSH Web0.2.1-alpha.1 remains the retained host baseline without host invocation.

## OI-F01 — immutable pre-capture Q conflicts with original task-version advancement

**Severity: high. Disposition: OPEN, source protocol incompatibility. Executable reproduction: NOT_RUN.**

The [amended literal](../../../.runtime/ni6-owner-finish-intent-core-proposal/contracts/amended-owner-command-core-protocol.d.ts.txt) lines75–84 requires actual current CAS when recording first Q; lines106–109 require the same authentic Q before original finish CAS/settlement. Lines136–139 require persisting Q before the runtime's stop/current collector/usage/capture/finish path. The original historical literal lines28–39 also preserves exact immutable Q and pre-effect persistence.

The exact source establishes this sequence:

1. [recordOwnerNativeFinishIntent](../../../.runtime/ni6-owner-finish-intent-core-proposal/proposed/src/runtime-store.mjs) lines3281–3307 uses `#ownerFinishActive` at3190–3198. That helper calls original `#cas` at3191. Original CAS211–216 requires `Q.expectedTaskVersion` equal the actual task version V. Intent writing does not increment V.
2. First `captureNormalNativeResult` at3160 calls original `#artifactEffect`. `writeNormalNativeRepairArtifact` at3162 calls the same helper. At1112 it unconditionally calls `#update`;228–233 increments actual task version to V+1.
3. `finishNormalNativeExecution` at3171 first requires the authentic same-Q intent and then invokes the unchanged original `#cas(c,q)`. Actual V+1 differs from Q's V, so this path throws `STALE_VERSION` before settlement.
4. `#ownerFinishIntent` at3215–3221 refuses a changed Q for the same eventual command. A fresh post-capture Q is a distinct intent; its later admission does not establish the promised before-capture ordering for that new exact owner command.

This is confirmed for **first durable producer output/artifact capture or repair artifact write after Q**. It does not assert failure when those durable captures already precede Q, or when a later collector only reads an existing capture. The actual runtime implementation and call order are outside this exact core-only freeze and were not observed.

The conflict occurs at ample capacity with no competing writer, lost reply, storage fault or foreign input. The exact pending intent remains recoverable/readable, but this attempted same-Q finish cannot release its held reservation. It is a deterministic ordering/version mismatch, distinct from future capacity races.

Root has steered a prospective remedy: require durable output/artifact/report capture before owner Q, then commit exact Q before stop, current **read-only** collector, actual-usage reread and final finish. That message is future steering, not a reviewed source amendment. Root must provide a new bounded literal/runtime/core companion freeze and obtain fresh affected review. This initial32 verdict remains open.

Remediation must preserve immutable Q, original task/auth CAS, genuine owner/task/native graph, current source/profile/backend/lifetime guards and zero guessed refresh/backfill/replay authority. The prerequisite and each post-Q operation must be explicit. Original `workerObservation`880–907 changes worker state for `stopped` without incrementing task version; its `unknown` path902–904 does increment task version and must continue to cause currentness denial. No CAS weakening is justified by this finding.

Affected review obligations are OI-S03/S06/S07/S08. Direct retained acceptance dependencies include BUB003-01/02, BUB004-04/05, BUB006-02, BUB012-01/04 and BUB016-01/02/03, with their same-suffix DF aliases. **None is accepted by this source proof.**

## Source conclusions on the remaining affected behavior

The following are source-supported observations, with executable obligations retained. They are not test PASS results or accepted AC.

**Closed request, genuine owner and scope.** Unchanged `normal-contracts.mjs`32–33 validates exactly the six ref fields plus positive task version and nonnegative auth epoch, detaches Q and computes the original owner/workspace/Q finish digest. New public record3281–3282, read3309–3319 and list3320–3323 all use original `#ctx(...,['owner'])` and actual scoped `#task`. Original private principal binding132–161 excludes coordinator/host/worker/reviewer and mismatched bound tasks. New identity3183–3188 joins actual scoped action, worker, generation, action digest, action metadata and execution. Active admission3190–3198 checks current CAS, absence of finished claim, marked create/resume origin graph and actual scoped reservation. Original schema7 graph3081–3094 joins source/configuration/backend and native origin facts. No caller assertion or fabricated receipt constitutes native authority. Intent admission does not call or grant live source/model/tool permission.

**Historical before current CAS.** Record3283–3289 performs a guarded readonly exact command lookup before first mutation/current active admission;3292 repeats history inside the transaction. Authentic same-Q pending history returns before CAS/worker-phase/reservation checks. Changed Q conflicts3219. Exact command history3223–3229 lets an earlier Q stay `intent_committed` after a different command has finished the same claim. Original `#readFinish`3179 still refuses a missing requested command when a claim finish exists. No pending row gains authority to finish or replay; legacy history returns null Q without reconstruction.

**Original signed receipt and encrypted data.** New operation/private kind23–27 leaves the original schema7 tables and six native kinds unchanged. Record3303–3305 stores exact canonical Q/body in original encrypted `runtime_data`; the signed original command result contains only contractVersion, recordRef, digest and ownerRequestDigest. Original data461–479 retains selected data limits, per-task record/audit reserve, original IDs, AES-GCM and original owner/workspace/task/record/kind/digest/metadata AAD. Original `#mut`278–285 bounds the complete actual result and complete signed command wrapper before commit and validates the scope afterward. These ordinary product source routines were inspected, never invoked.

Typed row3200–3213 validates exact signed result, closed decrypted metadata/body, original Q/digest/private-command/record-ID/sourceRef/taskVersion/authEpoch joins and actual worker/action/execution identity. Scoped validation3257–3279 rejects duplicate eventual command refs, duplicate private record owners, orphan private data, unsupported scope/version and per-execution overflow. `#privateData`3066 uses exact actual owner/workspace/task and expected private kind/digest. No SQL row, cipher, envelope or receipt-negative carrier was constructed or reviewed.

**Owner-only readonly projections.** Read/list use original `#normalRead`3065 guarded queries without transaction writes, current CAS, live maps or callbacks. Read's exact two refs and list's exact five refs are closed and detached. List3231–3255 joins the original execution identity, matches exact typed tuples, adds only supported authenticated original finish/settle claim associations, sorts commandRef and wholly refuses above16. Unsupported unverified legacy association is omitted; a known command reads `legacy_unrestorable` with null Q. Original finish/settle facts are never converted into a guessed Q.

**Final gate and original settlement.** New3171 requires authentic same-Q intent in the existing normal transaction before original CAS and settlement. Original stopped worker/capture/current scope, actual-only usage, immutable nonunknown outcome, audit/repair role completion, original strict releaseEvidenceRef equality and held/released reservation checks remain. Generic marked-native artifact/settlement bypass stays refused3156 and927–928. The factored committed history3173–3178 retains the original operation/task/finish-command/digest/receipt joins. These source safeguards do not resolve OI-F01 or establish actual runtime prerequisite ordering.

**Capacity admission and full wrappers.** Record3295–3296 reads the actual original global command and held-reservation counts and enforces
`count + 2 + 12*actualHeld + originalMaxControlCommands <= originalMaxCommands`.
After one new intent, one immediate follow-up command slot remains in addition to the entire original held/control reserve. The narrow terminal classifier355–359 verifies exact private input/Q/ID plus current actual native claim/reservation; other original classifiers are unchanged. The additional conservative first-intent gate still runs inside the transaction before data write, so terminal classification cannot let a new intent borrow that baseline reserve. Every pending intent already counts as a real command.

This establishes **headroom at admission**, not a durable allocation or unconditional future finish guarantee. Later separately authorized original terminal traffic retains its existing semantics. Independent last-slot, competing-held-claim, terminal/control traffic and stale-pending16 boundary checks remain NOT_RUN. OI-F01 can strand the prescribed attempted finish even when admission headroom is ample, so quota evidence would not remedy it.

Record3297 enforces16 associated command IDs per execution. Record3298–3302 bounds the whole pending public canonical wrapper plus selected original maxMetadataBytes plus64 against65536. Original data body/metadata/record/audit-reserve and actual result/full signed wrapper checks461–479 and278–285 occur in the same original transaction. Ledger203–208 supplies original rollback. Final runtime JSON encoding/whole wire bytes, actual rollback, durability and concurrency are not proven by source.

**Prospective cold compatibility and recovery.** Cold-open2842–2846 adds typed inverse validation before ordinary recovery, with original constructor109–129 failclosed cleanup. Pre7 private-kind/operation refusal remains explicit2970. Old frozen r2 `#openData`513 excludes the new private kind; its cold validator3009–3010 opens every data row, so a coherent prospective new core/runtime installation is required. No production7 migration or schema8 is supplied. Unchanged Ledger41–54 refuses future schema from the header before SQLite opens. Actual cold-file preservation is NOT_RUN.

Original recovery3029–3053 handles execution/action/message/delivery unknown states and does not iterate or execute owner finish-intent commands. It never refreshes their Q or turns them into restart authority. Readonly intent identity does not require still-held reservation/current CAS, preserving immutable history after a different command finishes or recovery changes task state.

**Privacy and generic surfaces.** Generic `putData`484 cannot mint the private kind. Generic `readAllowed`496–497 denies it; read555–563 and list570–581 therefore refuse or omit private Q. Snapshot1364–1398 and export1401–1404 use that filtered data list. Memory receipt1500–1510 refuses the operation. Diagnostics3341–3346 exposes schema/closed/restricted/limits only. Original known-secret checks197–201/464–465 and stable failure codes remain. Actual output/file scanning is NOT_RUN.

**Imports and effects.** Independently matching lexical statements cover all7 modules and every relative edge; only node built-ins are external, and no lexical dynamic import occurs. Existing context→store→context cycle, original descriptor capture and import compatibility remain unexecuted. Changed source introduces constants/private helpers/public methods/typed validation/gating rather than a new import or top-level invocation. Existing Ledger constructor and recovery effects were inspected as source; no constructor, database or native callback ran. The new write adds encrypted private data plus signed refs-only command and original registry initialization when applicable; no new task/auth/grant/action/semantic/reservation/native effect is introduced by intent writing.

## Explicit affected obligations and acceptance mapping

| Review obligation | Source disposition | Executable disposition |
| --- | --- | --- |
| OI-S01 exact8 Q, closed DTO/read/list | SOURCE_SUPPORTED_ONLY | NOT_RUN |
| OI-S02 original owner/task/auth/native graph/reservation | SOURCE_SUPPORTED_ONLY | NOT_RUN |
| OI-S03 historical command first, immutable pending replay | SOURCE_SUPPORTED_ONLY; OI-F01 sequencing dependent | NOT_RUN |
| OI-S04 signed refs-only receipt/encrypted Q/typed inverses | SOURCE_SUPPORTED_ONLY | NOT_RUN |
| OI-S05 readonly/legacy/sorted bounded16 list | SOURCE_SUPPORTED_ONLY | NOT_RUN |
| OI-S06 final gate and first-capture ordering | **OPEN OI-F01** | NOT_RUN |
| OI-S07 quotas/terminal/headroom/whole wrappers | SOURCE_SUPPORTED_ADMISSION_ONLY | NOT_RUN |
| OI-S08 prospective old/future/cold recovery | SOURCE_SUPPORTED; compatibility HOLD | NOT_RUN |
| OI-S09 privacy/generic surface exclusion | SOURCE_SUPPORTED_ONLY | NOT_RUN |
| OI-S10 exact bytes/diff/lexical imports/effects provenance | Filesystem/lexical verification complete | Target parse/import/execution NOT_RUN |

These review obligations describe evidence needed for existing acceptance criteria; they do not invent a newly closed criterion.

| Retained ticket / same-suffix DF alias | Affected existing source AC | Remaining implication |
| --- | --- | --- |
| [BUB003 / DF003](../../tickets/BUB003.md) | 01–05 | Exact command recovery, current CAS, storage failure, coherent prospective compatibility and private export boundary remain unexecuted. |
| [BUB004 / DF004](../../tickets/BUB004.md) | 01,04,05 | Genuine terminal facts, cancellation/late-finish currentness and recovery reconciliation require actual native evidence. |
| [BUB006 / DF006](../../tickets/BUB006.md) | 01,02,03,05 | Real principal/scope denial, immutable Q/CAS, secrets and failclosed permission remain unaccepted. |
| [BUB012 / DF012](../../tickets/BUB012.md) | 01,03,04,05 | Held capacity, actual usage, total-work budgets and quota/load races require independent execution. |
| [BUB016 / DF016](../../tickets/BUB016.md) | 01–04 | Traceability, full chain/cold/revoke/resource behavior and actual coherent package/host compatibility remain HOLD. |

All87 retained criteria, final CODE, HOST, cold compatibility, browser and model quality remain **accepted0/HOLD**. Earlier r2 syntax/public preparation evidence is historical for that exact r2 tree; it is not execution evidence for this changed store. No complete ticket, MVP, release or publication is accepted.

## Remaining work and review boundary

1. Root requests exact OI-F01 ordering/version amendment, preserves this initial32 report and original r2 source, and obtains fresh affected literal/core/runtime review.
2. Under a separate bounded root GO, parse/import the exact coherent modules/runtime and exercise genuine public API/role/scope/CAS/execution admission and closed DTOs. Original descriptor/private-brand compatibility remains required.
3. Independently verify exact historical lookup, changed-CAS/auth readonly replay, pending Q after a different finish, legacy null-Q/list behavior and zero denied mutation. Supported public API carriers are required; no native provenance fabrication or protected SQL/crypto/receipt tamper is authorized here.
4. Verify amended producer/repair durable capture and report prerequisites before Q, Q persistence before stop/read-only collector/usage reread/final finish, stopped vs unknown version behavior, asynchronous owner/task/current source/lifetime/profile/backend checks and no failed-intent effects.
5. Verify actual transaction rollback, cut/lost reply/restart preservation, no pending autoexecution and prospective old/pre7/future compatibility only through separately approved supported synthetic cold paths.
6. Verify global equality/one-below/above admission, actual held claims, last terminal slot, original control/terminal races and pending15/16/17 including CAS-stale and authenticated legacy entries. Preserve the distinction between current headroom and future allocation.
7. Verify whole selected data/metadata/sealed receipt/public transport UTF8 bounds, record/audit reserve rollback and actual private-Q/secret exclusion from outputs and permitted evidence.
8. Retain separate independent ISTQB design/results, blocked final CODE, supported HOST/browser and real useful native/model quality obligations; all87 remain HOLD.

Work performed here was limited to literal product/contract/document reads, filesystem metadata, SHA256 hashing, byte comparison, stdlib source diff reconstruction and lexical import inventory. No JS parser/import/product execution, build/test, DB open/access, native/model/provider/tool/listener/network/browser, Git, product/capsule edit or test/oracle content review occurred. No subdelegation occurred.

Protected package QAa58c522, archive fa3fb398, `.runtime/ui-qa-a58c522` and listener3080 remain untouched. Mac locked/unsupported browser is retained; no QA launch was attempted. No personal profile/data/key was inspected. The older blocked CODE receipt/envelope/tamper/cipher/SQL investigation was not accessed or rerouted. Original r2 strict held receipt equality and withdrawn F03 remain untouched.

Only this independent [machine report](schema7-core-independent-owner-finish-intent-source-review.json) and this Markdown evidence are written. Source review cannot close actual durability, native/runtime integration, cold compatibility, quota concurrency, final wire encoding, final CODE or full acceptance.

