# Private fishball memory adaptation provenance

Status: owner-authorized source reuse/spike; owner selected MIT for dsh-fishball (df), with concrete contributor evidence below. Original BUB007-01/02 remain on [BUB007A](tickets/BUB007A.md); this file does not accept them. No fishball checkout, fetch, write, build, profile, personal data, provider or credential was accessed. Source inspection used only `git show` against the exact objects in `/Users/samuel/Documents/GitHub/fishball`.

| Pin | Exact object | Inspected storage behavior |
| --- | --- | --- |
| Main | `f4a887d37b4c60a65ccc7c22fd87b19639287a0a` | Mutable in-memory lists, monotonic ID sequence, whole JSON snapshot; restore preserves IDs and session/bridge. |
| Cached release | `32ac8236bdb8d93c0a895b81557c4d915cf5e80c` | CopyOnWriteArrayList/AtomicLong JVM concurrency; in-place turn revisions; extended turn/tool fields; session compaction seam; separate `turns.jsonl`, last revision wins, snapshot/log union migration, UTF-8 rewrite accounting. |

The adaptation is [fishball-memory-core.mjs](../src/fishball-memory-core.mjs), with [tests](../test/fishball-memory-core.test.mjs). It privately ports the `InMemoryStore` search/recall rules, `Memory` TTL/confirmation rules, `Similarity` character-bigram Jaccard and dimension/zero-norm guarded cosine, and snapshot/release migration semantics. It copies no Android UI, whole application, HTTP gateway, proxy, embedding/reranker provider, personal store or build system. Model-based retrieval/fact extraction in fishball lies outside MemoryStore and is not reproduced by this spike.

## Pinned source byte evidence

Paths below are relative to `core/src/main/kotlin/org/areel/fishball/core/`. SHA256 was computed over the exact `git show <pin>:<path>` bytes, without checkout or branch-name inference.

| Path | Main SHA256 | Release SHA256 |
| --- | --- | --- |
| `memory/InMemoryStore.kt` | `fa2a596808415191b57e31b2b7f96d1d4f87fd34bae71864e42333a527ee00da` | `8b01416d6ce00c2e04108ad0534d91e01dfef88fc2b256fbfd2815eef172b815` |
| `memory/Memory.kt` | `8989b10ede6441b9a8c1835bb7aaa469801734a519699f46e3cc3900e1f7ca87` | `b845e3accbd8c8db83ce1d2a8137ad52477154842c6aed0c03cfb6ddea9924e5` |
| `memory/MemoryStore.kt` | `4a3fac472ea50c6e7817874df2fc36f2b5a8873941c55a1e17ca35a7cc6b9419` | `09e6c088b3340a37a437b699d9dd64f4112cd5762cc81b80f1005d581501343c` |
| `memory/Persistence.kt` | `9d18617227f1d3c7f0f2563516c91e6470286c323fa62230893e1986365b325a` | `85693c4f9496899ecdfd093f357ef11dcf947c1a3a28c56412c1e01db2f0bd2e` |
| `text/Similarity.kt` | `5dd04b3b87533b3fee0a29ef0688dd12f165e879a2d85ce4a311833c225808cc` | Same byte hash |

Additional inspected main source: `copy/Copy.kt` (`a5883264dbe32b0275c31832f8a9ae6778581c73ff8eabad27bb94341dbdbe40`) for exact TTL labels; `trust/Tier.kt` for conservative unknown-tier handling. Both pinned core build files and main `gradle/libs.versions.toml` were inspected as text only.

## License and dependency boundary

Both pinned root trees lack a `LICENSE` entry, and exact `git show <pin>:LICENSE` fails with path absent. Both pinned READMEs explicitly declare MIT. The bounded full reachable-history check for the five reused source paths found only commit authors/committers matching the configured owner Git identity and AI coauthor trailers, with no separate human contributor or conflicting copyright/license notice identified. Owner-authorized MIT covers the current owner-authored ESM integration/translation code in this project. Absence of a tracked full upstream license file is recorded accurately; it is not itself evidence of a concrete third-party blocker for this owner-authored adapted subset. The root-coordinated rename now includes project [LICENSE](../LICENSE) and [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md). This finding does not claim rights clearance for an unexamined whole application or its dependencies, which are not incorporated into the translation.

Original Kotlin core build declares Kotlin JVM/serialization plugins, Java17 target, kotlinx-serialization-json, Ktor OkHttp/content-negotiation/serialization and Kotlin tests. The inspected main version catalog declares Kotlin2.1.0, serialization1.7.3, Ktor3.0.3 and coroutines1.9.0; those are source declarations, not a newly installed/resolved runtime. The private Node adaptation directly imports only `node:util`. Its unit tests use Node built-ins; its review-gated public Cordis fixture uses the already reviewed/pinned project-local Cordis4.0.5-alpha.1 and RuntimeStore. No Kotlin/Ktor/Android dependency, download, lifecycle script or new install is added.

## Semantic corrections and target limits

The adaptation retains candidate threshold0.25, same-question threshold0.62, turn-search threshold strictly greater than0.12, max(word overlap, cosine), inclusive time-window search, fresh/stale recall, correction invalidation, preference confirmation, revision position and clear-log/session behavior. Embeddings are normalized to finite Float32 values. Bigrams use BMP letter/decimal-digit filtering and UTF-16 pairs to match the pinned Kotlin Char approach. Kotlin/Node Unicode-version differences outside tested Chinese/BMP cases remain unverified.

Conscious corrections: corrupted/truncated JSON/JSONL fails closed instead of source `runCatching` empty-store/skip behavior; unknown fields/future native versions are rejected; known secrets/credential-shaped material are rejected before output/persistence; full bounded data is validated before committing; duplicate cross-kind IDs conflict; ID sequence additionally accounts for the session; future timestamps are not fresh during clock rollback; `turnBytes` counts the complete normalized turn JSON in UTF-8 instead of source mixed byte/character estimates. Every injected persistence write must return explicit synchronous `true`; exception/false/undefined/async outcomes block the instance as recovery-required, with no claimed in-memory save. An adapter must independently establish what that acknowledgement means.

As in the source, explicit record inserts accept caller-selected IDs and replaceTurn revises an existing ID. Deleted explicit IDs may be inserted again by such a caller; only nextId promises monotonic allocation across deletion/reload. The trusted adapter must allocate IDs internally and retain tombstones instead of treating arbitrary explicit inserts as a no-reuse guarantee.

The native snapshot contract is `df.fishball-memory/v1` (with exact validated `bubbles.fishball-memory/v1` read compatibility), explicitly namespaced by owner/workspace refs. Refs identify equality only and authenticate nobody. This pure core exposes no task/grant/control method, auto-import path, inference or resume action; stored `inFlight` is historical memory, never authorization to resume. The new [MemoryAdapter](../src/memory.mjs) composes this core with trusted RuntimeStore identity, encryption, CAS, retrieval/source/confidence/revision policy and protected context; its actual encrypted-store integration evidence is [recorded separately](evidence/S3/memory.md). Separate pure-core instances and the earlier Cordis fixture do not accept BUB007B. Source personal-data import remains off by default.

## Bounded tracked contributor/notice inspection

A read-only traversal capped at256 reachable commits per pin used only `git show` for commit metadata and changes restricted to the exact InMemoryStore, Memory, MemoryStore, Persistence and Similarity paths above. It exhausted both reachable histories within the bound:43 commits at main and186 at cached release, with7 and24 commits changing those paths respectively. Every such commit's author and committer email privately matches the configured local project owner Git identity; the source repository's configured identity also matches. Private email values are neither repeated nor stored in this evidence. This comparison is concrete local Git identity evidence, not independent cryptographic proof of authorship.

All matching source-change authors are Samuel. Two cached-release source commits (`eae7c1a07c4e61a42c62f9494d271b97967f921c`, `27bab7547f168b0da16759ee312f86c1b067dbc6`) have Claude Opus5 AI coauthor trailers. The release pin itself has a Claude Fable5.1 AI trailer, but it does not change the reused paths. These AI labels do not establish a separate human contributor or independent copyright claimant. No nonmatching human author/committer or conflicting source notice was identified in the examined reused-path histories.

Both exact pinned README texts have the short MIT declaration; tracked upstream root LICENSE is absent. The inspected reused files have no explicit copyright/SPDX/license header. No personal data, profile or credential file was read, and no source checkout/fetch/write occurred. The owner selected project name dsh-fishball (df) and authorized MIT for current owner-authored ESM code; root completed the coordinated project rename/license and third-party notices. Publication remains conditional on full agreed acceptance. Future newly incorporated third-party code or notices would require their own concrete review. The current source subset has no identified third-party blocker; this does not imply complete original application/dependency or full native-ticket acceptance.
