# Independent normal-installation setup and UI test design

Status: **DESIGN PUBLISHED; implementation and execution NOT RUN.** Independent reviewer `/root/istqb_review`, Sol6.1/max. This is the owner's separately authorized product-onboarding continuation, not a final correctness review or a workaround for the blocked CODE/browser gates. Server and UI authors can implement against this matrix; their exact public APIs, bounded limits and held source hashes will be recorded before independent executable tests.

The read contract is [onboarding-contract.md](../../onboarding-contract.md), SHA256 `f61ea745b6ae9080f9d9f12bdbbcf27ff5235d5278fcfce41827e40af7aa6fcd`, including the newly approved exclusive-namespace/staging/no-overwrite publication paragraph. The earlier parent-supplied contract hash preceded that paragraph. Source requirements are retained BUB001/003/006/014/016 (DF aliases); no approved source AC is altered. The corrected installed artifact's [unconfigured runtime observation](portable-native-runtime-unconfigured.json) demonstrates `RUNTIME_ADAPTER_UNAVAILABLE` before storage with zero model/tool calls. Resolver module success alone cannot satisfy normal-use initialization.

Ownership is `test/installation-adversarial.test.mjs`, `test/onboarding-client-adversarial.test.mjs` and new independent M6 evidence. Production code, author tests, Git, actual profiles, prior tests and the [57-path historical archive](../S3/istqb-final-archive.sha256) remain outside this lane. Only disposable synthetic data and existing public native module fixtures are used. Root alone owns actual package/CLI/profile/listener/HTTP/quit/restart observations. No owner credentials, account settings, personal files, live provider/model/tool/recipient or browser action is authorized here.

## Trusted boundary and scope

The new normal `dsh-fishball/installed` export composes the unchanged advanced runtime only after exact native-owner consent. The three existing exports and their factories retain their existing contracts; the new fourth export is an explicit extension, not a replacement. A user-selected model supplies neither identity nor encryption-key authority. A generated private local owner/workspace namespace belongs to this supported personal-local native profile and does not claim a remote account identity.

The configuration's absolute `databasePath` must remain inside the canonical, owned native `profileContext.dir`. Neither JSON profile/owner/role/key claims nor structural service lookalikes establish the profile or owner carrier. Public HostConnection fourth-argument admission and the current native `connection.operator` remain authoritative. The real native credential provider stays unchanged. Missing/wrong host, services, operator or native profile cannot initialize state.

Before explicit confirmation, load/status/prepare/rejected requests make no persistent namespace, key, identity or DB writes. An existing valid installation resumes the same bytes/key/namespace. Any unexplained DB, sidecar, partial marker, legacy/future/corrupt metadata or unsafe path fails closed with preserved bytes; no blank replacement or key regeneration. Staging and link publication preserve losers and uncertain partial facts, rather than promising one filesystem-wide transaction.

## Risk-based partitions and boundaries

| Priority / risk | Required partitions and boundary values |
| --- | --- |
| P0 unauthorized initialization | Original admitted owner versus absent peer, unauthenticated peer, same-shape/JSON clone, wrong native origin, changed operator instance, foreign profile and borrowed closed handler. Every denial has zero writes and no child runtime. |
| P0 consent replay or scope drift | No preview/current preview/superseded preview; exact/wrong digest; missing/false/string/number versus literal `accept:true`; same/different owner generation, profile/target or empty-state facts; expiry at `expiresAt-1`, `expiresAt`, `expiresAt+1`; clock rollback and disposal while awaiting. Only one current exact acceptance may initialize. |
| P0 overwrite or split installation | Genuine empty namespace versus existing target, missing main with `-wal`/`-shm`/`-journal`, partial key/metadata/staging/claim marker, two-process claim, contender target inserted after prepare or before link. All no-overwrite losers leave the winner unchanged. |
| P0 path/key escape | Canonical owned profile child versus lexical prefix sibling, `..`, relative path, root/profile itself, outside-profile target, symlink or dangling symlink at any ancestor/leaf, directory/FIFO/socket, unexpected owner, modes other than required0600/0700, parent/entry swapped during await/publication. Never follow a link to initialize another namespace. |
| P0 secret or authority leakage | Synthetic key/token/private-path canaries in unexpected JSON, callbacks, state and errors. RPC/status/log/export/ledger/memory/UI are closed metadata only. Private key32bytes and native handles never enter profile JSON or ordinary evidence. Encryption prevents synthetic plaintext bytes in persistent storage. |
| P1 uncertain publication / activation | Faults before claim, after exclusive directory, after staging initialization/close, after target link, after key/metadata publication, before native readiness and after acknowledged readiness. No automatic retry/key replacement or false ready; preserve marker/inodes/bytes and report recovery/unavailable. |
| P1 UI submits an unintended plan | Preview text/digest/ref/state immutable after display; mount/refresh/reconnect never confirm; unchecked/expired/stale/disabled cannot submit; double click one request; changed selection or late reply cannot publish into a new state. Unknown response leads to status readback. |
| P1 packaged entry / lifetime drift | Original three exports plus new installed export; fresh regular installed path/no checkout fallback; one namespace across ten load/unload and root CLI restart; own closure rejects borrowed mutations; no orphan child/listener/session. |

Strict JSON vectors cover null, scalar, arrays/sparse arrays, proxies/getters/symbol/nonenumerable fields, unknown nested keys, unpaired surrogates and serialized size `N-1/N/N+1` at each implemented documented bound. The implementation must publish concrete setup metadata/input limits; this design does not invent a permissive cap. Key size32, preview lifetime at most60000ms and file modes0600/0700 are contract boundaries. Native profile fields are trusted public-carrier observations, not input JSON to be trusted merely because it passed a schema.

## Admission decision table

| Live native owner/profile | Current exact unexpired preview | Literal acceptance | Current empty/safe binding | Result |
| --- | --- | --- | --- | --- |
| No | Any | Any | Any | Stable rejection; zero filesystem writes, runtime activation or private output. |
| Yes | No | Any | Any | Status/prepare remain read/volatile-only; confirm rejected without writes. |
| Yes | Yes | No | Any | Confirm rejected; neither checkbox truthiness nor extra JSON fields substitute for consent. |
| Yes | Yes | Yes | No | Refuse/recovery/unavailable; preserve every retained entry and byte. |
| Yes | Yes | Yes | Yes | One exclusive publication; activate the same closed runtime; acknowledge only actual readiness. |
| Yes | Previously used | Yes | Published valid state | No second initialization or replacement; read current status to reconcile the already committed fact. |

All permutations are tested at the handler/commit boundary, not solely by disabling a UI button. A native permission refusal never becomes consent from a payload. Setup acceptance grants no action/grant/event/model/tool/recipient authority.

## State, process and fault oracles

The observable setup phases are `setup_required`, `ready`, `recovery_required`, `unavailable`. A volatile preview does not constitute a persistent phase or installation. `ready` requires exact valid retained setup state plus successfully activated native child. An empty namespace can prepare another preview; that invalidates the former preview. Unsafe/partial/uncertain state cannot progress to new initialization merely through another prepare/confirm.

| ID | Independent server/module oracle | Required expected observation |
| --- | --- | --- |
| SET-01 | Load/status/prepare in a new synthetic native-profile child; snapshot all declared entries before/after | No namespace/DB/key/identity file created or modes/bytes changed; only setup route active; volatile description exact and `externalExecution:false`. |
| SET-02 | Genuine native owner positive and anonymous/spoof/foreign-origin/profile negative using captured public RPC framing | Only original admitted current owner can prepare/confirm. JSON scope/role/verified/key fields cannot grant access. Rejected cases have callbacks/writes/child activation0. |
| SET-03 | Closed strict input and output vectors for all three methods | Exact fields only, stable redacted codes, no getter/proxy invocation, bounded JSON and closed status/description; no credential/key/native handle value. |
| SET-04 | Preview freshness decision table, expiry `N-1/N/N+1`, supersession and plugin-instance clone | No stale/foreign/replayed plan creates state. Exact current literal consent succeeds once; clock ambiguity denies. |
| SET-05 | Accept under unchanged synthetic profile/target | Regular private namespace/key/metadata/database created only after commit, actual encrypted RuntimeStore reopen succeeds, default deny and unavailable external adapters persist; no automatic task/session/stream/tool/recipient action. |
| SET-06 | Independent already-ready child processes race exact confirmations behind a barrier | One winning exclusive namespace/target publication, at most one initialized namespace/key; loser cannot overwrite and returns stable current/recovery result. Inspect both receipts and actual persisted inodes/digests. No claim from sequential async mocks. |
| SET-07 | Target appears between prepare and commit/link, including a new inode with same bytes | Preserve winner bytes/inode; no overwrite, same preview cannot grant a fallback destination. A SQLite preflight before auto-create is insufficient. |
| SET-08 | Missing target with each retained sidecar; nonregular/symlink/dangling entries and mixed partial states | Refuse before new key/DB; preserve complete entry/byte set. Count absence as well as presence; no silent namespace fallback. |
| SET-09 | Profile path, canonical ancestor/leaf owner/mode/inode reconfiguration and delayed operation swap | Outside-profile/sibling-prefix targets rejected. Binding drift after preview/await checked at publication; no follow-link write, no unsafe chmod of another inode. |
| SET-10 | Existing valid installation unload/reload/reopen | Same generated owner/workspace, key and encrypted task refs/digests/CAS/dedup retained; no key regeneration or fresh namespace. Ten cycles produce one live route/child and no obsolete preview authority. |
| SET-11 | Partial/missing key or metadata, changed binding, future version, corruption, incomplete staged state | Recovery/unavailable, not ready/setup-required. Original files/sidecars byte hashes and entries unchanged; no reseal/reset/import. Bound format/version refusals tied to actual source. |
| SET-12 | True separate-process abrupt exits at durable publication cuts | Uncommitted state absent or preserved as partial; acknowledged state reopens same identity/key/task; incomplete state remains recoverable by explicit future action rather than auto-reconfirmed. No arbitrary filesystem exactly-once claim. |
| SET-13 | Permission/readonly/actual ENOSPC or equivalent bounded native I/O faults, stage/link/key/metadata write failure | Stable storage restriction, no ready or task admission; no overwrite/cleanup of another process's replaced marker. Injected errors are labeled separately from actual filesystem faults. |
| SET-14 | Request abort before synchronous commit and after durable commit/activation await | Pre-commit abort creates no installation; post-commit abort preserves committed facts and cannot authorize a replay/reset. Status can reconcile a missing response. |
| SET-15 | Own fiber closure/unload during preview, confirmation and child activation | Admission sealed before awaited teardown, captured mutation rejects; late callbacks cannot create/activate into a disposed generation. Awaited parent quit leaves no child route/resource. No unsupported instant-ancestor diagnostic premise. |
| SET-16 | Activation failure after publication or required service loss/remount | Persisted valid/partial setup remains same; no misleading ready, alternate key or silent confirmation replay. A public current lifecycle recheck controls child readiness. |
| SET-17 | Known-secret/key/path canaries across inputs, callbacks, status/error streams, child diagnostics/export/database | Stable allowlisted output; synthetic key absent from outputs/profile config/log/evidence and plaintext absent from DB. Inspect only synthetic fixture files; transient key clearing is tested through owned buffers without dumping contents. |
| SET-18 | Installed package normal fourth entry and untouched advanced factory | Original three export paths/metadata retained, fourth packaged target regular; missing trusted advanced callbacks still `RUNTIME_ADAPTER_UNAVAILABLE`. Root actual original profile chooses installed entry without private auth replacement. |

Fault checks do not require a test-only production bypass. Author-approved cuts are used where available; meaningful child exit after a real returned/publication seam is stronger than a fake in-memory throw. File snapshots include main, sidecars, marker, staging, metadata and key sizes/modes/inodes/hashes without printing secret contents. Stable codes are bound to the held API once implemented, rather than guessing code names today.

## Native client oracles

The existing direct `createModel` and advanced configured runtime remain compatible. The optional setup model is additive. Only the exact pinned status-route404 failure `transport failure for /df-setup/v1/status: HTTP 404`, followed by a successful original `/df-rpc` list read, may select advanced fallback. Auth/network/403/500/malformed errors, substring matches or a failed original list cannot silently bypass setup.

| ID | Independent typed-client/module oracle | Required expected observation |
| --- | --- | --- |
| UISET-01 | Mount/refresh/status/prepare flow | Requests status/read/prepare only; no confirm, persistent write, action/grant or auto-retry. Published preview has exact projected target/meaning/expiry; unexpected fields rejected rather than rendered. |
| UISET-02 | Explicit checkbox and separate button with exact displayed preview | Literal checked consent plus fresh current preview required; one exact `{previewRef,planDigest,accept:true}` request. Missing/false/expired/stale state yields0 confirm. |
| UISET-03 | Double-click/concurrent confirm, request pending | One confirm in flight; disabled controls reflect current state. Later explicit retry follows current status/prepare, never automatic duplicate confirmation. |
| UISET-04 | Disconnect/unload/new preview/status change during digest or confirm await | Invalidate earlier preview/checkbox; delayed reply cannot publish into a new generation or submit. Busy guard clears safely; no previous acceptance carried to new plan. |
| UISET-05 | Confirm transport failure/abort after server may have committed | Show result unconfirmed/recovery, status readback only; never infer success or send another confirm. A ready readback restores normal task view without generating new key. |
| UISET-06 | Strict route-missing fallback decision table | Exact status404 signature plus successful original list only. Unauthorized/network/malformed/other404/failed list block; no string-fragment/truthy output acceptance. |
| UISET-07 | Hostile status/preview/confirmation extra fields, fake secrets/getters, callback errors | Closed safe projection and stable error state; no credential text or arbitrary thrown prose/private path; payload snapshots frozen before awaits. |
| UISET-08 | Setup-required/recovery/unavailable/ready, time boundary and stale/error/loading empty states | Confirm disabled where invalid; accurate storage/authority/default-execution meaning. Typed element/module tests verify semantics, not visual/browser/accessibility acceptance. |
| UISET-09 | Existing direct advanced model and original list/detail/control APIs | No semantic regressions or new automatic setup/authority; installed setup compatibility is an explicit optional composition. |
| UISET-10 | Actual native rendering/keyboard/focus/resize/long Chinese under official UI | **NOT RUN / HOLD** until supported browser tooling is available; mock React elements or module tests cannot pass BUB014-04. No owner manual-QA substitution. |

## Requirement mapping and evidence levels

Each source AC below receives a setup-specific contribution, not whole-ticket acceptance. Existing functional tests/evidence remain retained. Unrelated deferred/provider-quality/retention cases do not disappear because onboarding becomes usable.

| Source AC | Setup/install contribution | Remaining boundary |
| --- | --- | --- |
| BUB001-01 | SET-01/05/10/18; installed package + root actual native entry/start/reload/unload | Exact supported flat/npm/pinned graph only; normal CLI/profile verification is root-owned. |
| BUB001-02 | SET-10/15 ten cycles, one route/child/input, stale references | Actual whole-host resource/listener readback, root full cycles. |
| BUB001-03 | SET-02/16/18 real native host/service class and missing/late services | Metadata alone not capability acceptance; no half-ready task intake. |
| BUB001-04 | SET-10/12/15 own unload and root full quit/restart | Window-close/browser behavior HOLD, no instant cancellation promise. |
| BUB001-05 | SET-18 exact Web/CLI compatibility evidence | Desktop owner-excluded; other layouts/platforms unverified, not inherited. |
| BUB003-01 | SET-07/12/14 commit/crash/uncertain acknowledgement | Existing action dispatch/recovery cuts retained separately, no arbitrary effect replay. |
| BUB003-02 | SET-06/07/10 exclusive publication and durable same-namespace CAS/dedup | Existing task/process CAS coverage retained; no sequential mock concurrency claim. |
| BUB003-03 | SET-11/13 storage failure/refusal restricts initialization/admission | Actual I/O faults distinct from injection; no ready on failed durable publication. |
| BUB003-04 | SET-08/11 retained partial/future/corrupt state preservation | No onboarding migration/reseal/backfill invented; existing schema migration and owner recovery gates retained. |
| BUB003-05 | SET-17 metadata export secret exclusion | Setup state deletion/key rotation/third-party deletion explicitly OUT of this implementation; full retention/export/delete debt retained. |
| BUB006-01 | SET-02/03/09 owner/profile isolation | Local generated namespace is not external channel pairing; live chat platform work OUT this phase. |
| BUB006-02 | SET-04/07/14/15 + UISET-02..05 exact fresh one-use plan | Setup consent grants no execution action; existing grant/version/revoke/expiry tests retained. |
| BUB006-03 | SET-03/17 + UISET-07 closed output and synthetic canary scans | Never inspect/dump native real credentials or owner personal data. |
| BUB006-04 | SET-05/17 + UISET-02 exact minimal RPC fields | No external data send allowed here; existing provider-neutral destination/receipt oracles retained. |
| BUB006-05 | SET-02/05/16 deny-default/missing-service; no reviewer/grant authority | Production policies/model/tool/recipient adapters unavailable until separately configured. |
| BUB014-01 | UISET-01/05/08 current status readback and late-state fencing | Existing task list/detail coherence unchanged. |
| BUB014-02 | UISET-02/03/08 phase-appropriate controls | Runtime task controls still obey original state/CAS contracts. |
| BUB014-03 | UISET-03..06 no double submit/stale overwrite/inferred success | Native service integration differs from typed-client test; both recorded. |
| BUB014-04 | UISET-10 | Actual visual/accessibility gate HOLD, never passed by mocks. |
| BUB014-05 | UISET-01/07 exact displayed scope and credential exclusion | Existing session/artifact/navigation isolation tests retained. |
| BUB016-01 | Every ID tied to exact future command/source/evidence | Final independent CODE remains blocked; this lane supplies ISTQB evidence only. |
| BUB016-02 | SET-05/18 + root actual normal profile intake/storage/control | Full useful native/model product chain remains HOLD; live selected chat platform OUT by amendment. |
| BUB016-03 | SET-10..16 actual storage/lifecycle/fault + existing task revoke/resource suite | Owner credential deletion/rotation and full retained-data policy are separate scope/debt. |
| BUB016-04 | SET-18 normal installed export/doc/artifact source and reproducible commands | No publication/remote/stable action; root actual tgz/CLI verifies install. |
| BUB016-05 | Original MIT/notices/peer provenance unchanged | New implementation and exact native source attribution recorded; no added unreviewed dependency. |
| BUB016-06 | Package remains `0.1.0-preview.1`, private, MIT; no release mutation | Stable/publication requires owner action after full applicable acceptance. |

Executable case reports distinguish (1) structural/typed client vectors, (2) real private FS/encrypted RuntimeStore/process concurrency, (3) genuine public Cordis/Connection/auth with captured streams and no listener, (4) root actual installed CLI/profile/HTTP/quit/restart, and (5) blocked actual browser/model-quality oracles. Exact author/source/test/artifact hashes are checked before/after each final batch. Retain first failures and fixture corrections; rerun original meaningful assertions without weakening. No full-ticket/MVP/CODE/browser PASS is permitted from the planned module cases. This document publishes design only and does not authorize configuration of the owner's persistent credentials or broader access.
