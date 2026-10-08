# Canonical package byte/topology map — 2026-10-08

Independent Sol 6.1 max, English, read-only. Parent-reported HEAD `d9d005b8`, branch feat/S3-integrations; no Git query. R12 final source reviews and its separate once-only actual run are parent-owned. This map is source metadata, not an R12 runtime or successful-build result.

## Concrete result

All **65 explicit public `correctedPackageRecords`** in the selected R12 manifest match their actual package byte counts and SHA-256 seals. Exact same-relative canonical paths yield:

| Status | Files | Meaning |
| --- | ---: | --- |
| IDENTICAL | 25 | Existing regular canonical file; full byte equality and SHA equality established |
| DIFFERENT | 21 | Existing regular canonical file; full bytes and SHA differ |
| ABSENT | 19 | Exact same-relative canonical path absent; equality is not applicable |
| Nonregular/unsupported topology | 0 | No selected leaf symlink, directory or other nonregular file |

The 65 package files total **1,952,632 bytes**. Their 46 existing canonical counterparts total **1,506,872 bytes**. The source subset has59 paths:22 identical,20 differing,17 absent. This is a complete map of these explicit records only. No recursive scan, private-directory enumeration, semantic implementation-body read, source diff, import, factory/producer evaluation, check/build/test or runtime occurred. Peer links and any paths outside the65 records were not audited.

An exact full65 file adoption would overwrite21 differing canonical files and create19 missing files. It would touch the protected-core/native file boundary, including **`src/runtime-store.mjs`**, whose whole-file bytes differ. **Canonical adoption remains blocked pending a separate exact selection; every canonical source stays unchanged.** This is a whole-file conclusion. It does not establish that any particular excluded capture/finish/receipt/signature/envelope/revision999 function changed, where the differences occur, why they occur, or whether old/new interfaces are compatible. No hidden-function change is asserted.

The earlier sealed P1/P2 identified the missing normal-contracts/descriptor integration. This65-file map shows that the gap is broader than an isolated cardinality hunk:25 already conserved files do not make21 replacements and19 new canonical bindings accepted. Existing untracked documentation, runtime snapshots and isolated packages are not canonical integration. No full65 copy, partial adoption, source mapping, scope/AC cut or build is approved by this report.

## Opaque core/native boundary attention

These attention tags identify already-held core/runtime/security boundaries and native-named source paths from inherited scope and filenames. They are conservative handling tags, not findings about function ownership or contents. The exact whole-file identities are reproduced below and for every row in the JSON. All content remained opaque in this task.

| Existing differing boundary file | Canonical bytes / SHA-256 | R12 package bytes / SHA-256 |
| --- | --- | --- |
| `src/ledger.mjs` | 21567 / `c42893e85399836ad2bb41f96627104455c5bc31de576a4c993e41d487c0a258` | 21799 / `250cfddd11187ac08defd006737491df54b1bfa5901e1df90ef577f72882fbb4` |
| `src/native-adapter.mjs` | 37074 / `eb990b3def82c29312ec7f94cf5aa1f3003a5f8364a26e9b9b0f8a6cac644bb0` | 41015 / `3a996cc4953f318000c14457f512b05c7c47c2af5a68b50405edd5eb44f149b7` |
| `src/native-contributions.mjs` | 10890 / `8610b7ef36b401bad3733b793b0641664e588b85c97ba39d1419b97333f0f99b` | 10953 / `b811f3a7155a99b3361e8aa2d19df3a3a2783e1d9334c48cb6b77ca7731e1c01` |
| `src/runtime-plugin.mjs` | 36350 / `30c8e1c0aee9d495563d19eb4b71357198912ea472b6b61201168079b7885fb2` | 67362 / `b7d1243d463c8425cf0ad7ea1b3eff453dbd8d2c557142413334cf69a4d16095` |
| `src/runtime-security.mjs` | 5323 / `66fd91b6042eadf7de89c22d18e12a68ed27aec67a87aa4aaf7e5c6df0eda820` | 6033 / `ee3c1051f3c16adf8c9d4f66a15623de5e13c1a3fef844a40927b9e7193c406d` |
| `src/runtime-store.mjs` | 239793 / `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f` | 347241 / `4fb893614b30d22c5ad5b904aa585605bc74a2e2a38aa05cbaea38aeb52a23c7` |
| `src/worker.mjs` | 36626 / `b794af781c0f490a4d61d269c28bfc8d32a6b3705ac79c0ce82bc5ed27ff7e1d` | 36640 / `cfe51d3fa2cc9ed1a5bc584b830c50959d7929dc1866252a7ab5dcac61723e8a` |

Missing native-named boundary sources are also not selected for adoption: `src/installed-audit-native-source.mjs`, `src/native-history-collector.mjs`, `src/native-source-descriptor.mjs`, `src/normal-native-operations.mjs`, `src/normal-native-planning.mjs`, `src/normal-native-request.mjs`, `src/normal-native-rpc.mjs`, `src/normal-native-selection.mjs`, and `src/owner-native-command-controls.mjs`. Their presence in an isolated package does not prove a compatible canonical entry graph. The17 missing source paths and two missing build/descriptor artifacts are individually listed in the map.

In particular, the canonical239,793-byte runtime-store would be replaced by a differing347,241-byte file. The differing worker file has only a14-byte length difference; this does not localize or classify any change. Protected bodies remain opaque and permanently excluded from this lane. Keeping old core files while adopting ordinary wrappers cannot be asserted compatible from hashes alone. Parent must select a precise permitted integration boundary before any authoring; this map supplies no inferred route through protected code.

## Exact path map

Rows preserve the R12 manifest's selected order. Canonical/package sizes are bytes; an em dash denotes absence. Full canonical and package hashes, verified-record flags, equality fields and handling tags are in the structured report. No implementation text or diff is included.

| Same-relative public path | Canonical status | Canonical bytes | Package bytes |
| --- | --- | ---: | ---: |
| `lib/client.js` | DIFFERENT | 106599 | 151584 |
| `native-source-manifest.json` | ABSENT | — | 18440 |
| `package.json` | IDENTICAL | 2691 | 2691 |
| `scripts/build-client.mjs` | IDENTICAL | 1166 | 1166 |
| `scripts/build-native-source-manifest.py` | ABSENT | — | 5583 |
| `scripts/dsh-web-runtime-lock.json` | IDENTICAL | 388886 | 388886 |
| `src/approval-preview.mjs` | DIFFERENT | 12081 | 13904 |
| `src/audit-input-pair.mjs` | IDENTICAL | 7647 | 7647 |
| `src/audit.mjs` | IDENTICAL | 6184 | 6184 |
| `src/chat.mjs` | IDENTICAL | 15251 | 15251 |
| `src/client-entry.cjs` | DIFFERENT | 106631 | 151616 |
| `src/config.mjs` | IDENTICAL | 2918 | 2918 |
| `src/context.mjs` | DIFFERENT | 24196 | 28297 |
| `src/control.mjs` | IDENTICAL | 2926 | 2926 |
| `src/coordinator.mjs` | IDENTICAL | 13403 | 13403 |
| `src/environment.mjs` | IDENTICAL | 9792 | 9792 |
| `src/event-clock.mjs` | IDENTICAL | 7432 | 7432 |
| `src/events.mjs` | IDENTICAL | 10602 | 10602 |
| `src/fishball-memory-core.mjs` | IDENTICAL | 21009 | 21009 |
| `src/foundation.mjs` | IDENTICAL | 22111 | 22111 |
| `src/host-probe.mjs` | IDENTICAL | 6739 | 6739 |
| `src/index.mjs` | IDENTICAL | 4354 | 4354 |
| `src/installed-audit-native-source.mjs` | ABSENT | — | 13615 |
| `src/installed-audit-phases.mjs` | ABSENT | — | 6835 |
| `src/installed-audit.mjs` | DIFFERENT | 52703 | 56388 |
| `src/installed-config.mjs` | DIFFERENT | 2173 | 4122 |
| `src/installed-events.mjs` | IDENTICAL | 23241 | 23241 |
| `src/installed-invocation.mjs` | DIFFERENT | 2341 | 4050 |
| `src/installed-memory-continuity.mjs` | IDENTICAL | 22246 | 22246 |
| `src/installed-memory.mjs` | IDENTICAL | 3538 | 3538 |
| `src/installed-normal-services.mjs` | ABSENT | — | 14134 |
| `src/installed-owned-stream.mjs` | ABSENT | — | 1071 |
| `src/installed-plugin.mjs` | DIFFERENT | 7194 | 10275 |
| `src/installed-results.mjs` | DIFFERENT | 48192 | 48343 |
| `src/installed-role-recipes.mjs` | ABSENT | — | 2127 |
| `src/installed-worker-config.mjs` | IDENTICAL | 5018 | 5018 |
| `src/installed-worker-facts.mjs` | DIFFERENT | 20368 | 21961 |
| `src/installed-worker.mjs` | DIFFERENT | 33262 | 47428 |
| `src/ledger.mjs` | DIFFERENT | 21567 | 21799 |
| `src/memory.mjs` | DIFFERENT | 31812 | 36680 |
| `src/messages.mjs` | IDENTICAL | 15586 | 15586 |
| `src/native-adapter.mjs` | DIFFERENT | 37074 | 41015 |
| `src/native-contributions.mjs` | DIFFERENT | 10890 | 10953 |
| `src/native-history-collector.mjs` | ABSENT | — | 13351 |
| `src/native-source-descriptor.mjs` | ABSENT | — | 2328 |
| `src/normal-contracts.mjs` | ABSENT | — | 32057 |
| `src/normal-native-operations.mjs` | ABSENT | — | 20496 |
| `src/normal-native-planning.mjs` | ABSENT | — | 2860 |
| `src/normal-native-request.mjs` | ABSENT | — | 2675 |
| `src/normal-native-rpc.mjs` | ABSENT | — | 1473 |
| `src/normal-native-selection.mjs` | ABSENT | — | 6689 |
| `src/normal-resume-controls.mjs` | ABSENT | — | 15595 |
| `src/normal-source-planning-binding.mjs` | ABSENT | — | 1541 |
| `src/notifications.mjs` | IDENTICAL | 11442 | 11442 |
| `src/operator-bridge.mjs` | DIFFERENT | 8628 | 9944 |
| `src/owner-native-command-controls.mjs` | ABSENT | — | 3908 |
| `src/results.mjs` | IDENTICAL | 13766 | 13766 |
| `src/runtime-plugin.mjs` | DIFFERENT | 36350 | 67362 |
| `src/runtime-security.mjs` | DIFFERENT | 5323 | 6033 |
| `src/runtime-store.mjs` | DIFFERENT | 239793 | 347241 |
| `src/scheduler.mjs` | IDENTICAL | 11509 | 11509 |
| `src/schema7-runtime-composition.mjs` | ABSENT | — | 6085 |
| `src/setup-state.mjs` | IDENTICAL | 20740 | 20740 |
| `src/testing-provider.mjs` | DIFFERENT | 12872 | 15937 |
| `src/worker.mjs` | DIFFERENT | 36626 | 36640 |

## Scope and disposition

The only read inputs beyond the65 public file pairs were current AGENTS, the two earlier sealed scope reports, and the R12 source manifest's correctedPackageRecords. Byte and SHA equality were computed opaquely; no source strings, function bodies or diffs were printed, decoded or interpreted. No private runtime/profile/key/database/history/capture/response/error content was read, copied, decoded or hashed. Protected final CODE and opaque core.native capture/finish boundaries remain BLOCKED_UNCHANGED. Existing-filename equality is conservation evidence only, not code review, functional correctness or acceptance.

All87 HOLD / accepted0 / root HOLD remain; no acceptance or execution GO, publication, canonical source mutation or Git operation. Browser capability remains browsers:[], iab unavailable, no Chrome extension, last parent verification01:45UTC. Screen lock is additional; unlocking alone cannot enable QA. No new browser probe or third denied-cloud/external-inference attempt occurred while the owner rests.

Only this fresh repository-absolute O_EXCL report pair is authored after exact absence checks, with full final readback before external byte/SHA seals. The following four public authority/input seals were measured directly. All65 package records and exact canonical counterparts are separately sealed in the JSON map.

| ID | Input | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| A1 | `AGENTS.md` | 8292 | `f7b4685d6c376159a9de2114c10acd3c08710ceed732b4ea7f07f7ed404e95ba` |
| P1 | `docs/evidence/NI6/canonical-stream-integration-scope-2026-10-08.md` | 12326 | `483430c44a9ed81e578347bf6db6fcf4359a7c2077550cfa6c8bbfdee18a574e` |
| P2 | `docs/evidence/NI6/canonical-stream-integration-scope-2026-10-08.json` | 15938 | `af93d7ca0d18b0fcf792e744d7547055d4cb9ff59b5ef07e611b407ecbc231d9` |
| M1 | `.runtime/ni6-positive-one-worker-r12/source-manifest.json` | 394728 | `ebf5a6bf421f158043038c0a4ea36f2bea6f10ffe28f4f94c1598ee3f6ea93c8` |
