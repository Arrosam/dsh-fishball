# BUB007A independent private-port code review

Reviewer: `/root/code_audit`, Sol6.1 max, independent of the port author and separate ISTQB reviewer. Root extended this reviewer's evidence ownership to this file. No author code/test/Git changes, install, source checkout/build, personal data, profile/browser/provider or inference action is performed.

Status: **Working-unit review complete; no unresolved code finding in these four reviewed files. Final integration verdict awaits root's frozen tree. No ticket, full native portability or redistribution acceptance.** Reviewed scope is the private Node semantic adaptation, its dedicated test, pinned-source provenance and portability evidence. The reviewed synthetic public Cordis fixture was independently executed under root's bounded authorization; this is separate from actual DSH Web-profile or model-input evidence.

## Provenance and semantic scope

Read-only `git --no-optional-locks show` at exact source revisions `f4a887d37b4c60a65ccc7c22fd87b19639287a0a` and `32ac8236bdb8d93c0a895b81557c4d915cf5e80c` was authorized. Independent SHA256 of all five source paths at both revisions matches the ten hashes in `docs/fishball-provenance.md`: InMemoryStore, Memory, MemoryStore, Persistence and Similarity. Source-only reads do not inspect or import any personal memory data.

The port's source-supported boundaries include conservative TTL parsing/defaults, monthly/yearly and182-day expiry, invalidation/confirmation, BMP/UTF-16 character bigrams, Float32-normalized cosine/dimension/zero-norm guards, candidate and same-question thresholds, inclusive turn search windows, revision replacement and snapshot/JSONL union with last revision winning. It is a semantic Node port, not a compiled Kotlin/JS artifact or demonstrated general cross-language equivalence. Unicode-runtime differences and broader source DTO parity remain explicit.

Intentional corrections are visible: unknown/future fields and corrupt/truncated imports fail closed, known-secret/credential material is rejected, IDs/structures/total bytes are bounded, clock rollback does not label future facts fresh, and an uncertain injected persistence acknowledgement blocks further use. JSON snapshot imports are explicit supplied text; no file lookup or automatic personal-data import exists. Scope refs distinguish equality, while a later opaque-caller adapter must establish authentication, encrypted storage/CAS and authority boundaries. The pure core exposes no task/grant/control or native replay API.

Both exact source roots have no `LICENSE` entry, independently checked with `git ls-tree <sha> LICENSE`; both pinned READMEs say MIT. The owner subsequently selected dsh-fishball (df) and MIT for current owner-authored ESM integration/translation. The author's bounded reused-path history/notice review reports no nonmatching human author/committer or conflicting notice; its Git-identity comparison is source provenance evidence, not cryptographic proof. This reviewer independently checked the pinned bytes/README/LICENSE facts and does not attribute the author's history inspection to itself. Absence of a root upstream LICENSE alone is not a concrete third-party blocker for this inspected owner-authorized subset. Root must finish project MIT/notice packaging; unincorporated original application/dependencies and future third-party code remain outside this scoped conclusion. Publication still requires full agreed acceptance; no legal clearance or whole-application redistribution approval is given here.

## Finding and fixture review

| ID / severity | Reproduction and impact | Disposition |
| --- | --- | --- |
| S3-FB-CR01 / Low | `Object.assign([], {4294967295:1})` has length0 and a numeric own data field. The array guard accepts it; cosine treats it as empty and `recordWorldFact` persists embedding `[]` (one write), silently dropping supplied data. Canonical array fields outside actual length must reject before normalization/persistence. | Fixed exact canonical array-index/length checks. Original independent retest rejects `MEMORY_INVALID`, zero persistence calls and zero facts. Author regression independently passes. Closed on the hashes below; final integration tree repetition pending. |

Separate ISTQB findings are not attributed to this reviewer: MEM-T01 future `recordedAt` with older `confirmedAt` incorrectly appeared fresh; the corrected guard requires both timestamps no later than now. MEM-T02 aggregate JSON punctuation overcount rejected exactly bounded valid snapshots; the corrected byte accounting accepts4194303/4194304 bytes and rejects4194305. Independently executed dedicated tests cover both. Explicit caller IDs preserve pinned-source insertion behavior; `nextId()` remains monotonic, including session IDs. No retired explicit-ID security capability is introduced by this unauthenticated pure core.

The gated test imports only the existing project-local public Cordis library and RuntimeStore. It creates a synthetic private Context/plugin, temporary encrypted SQLite store and synthetic coordinator handle/key; migrates supplied synthetic records, persists a memory update as an encrypted fixture-only context record, disposes immediately, checks borrowed-reference denial, reloads and rereads the committed bytes. No DSH application/profile, listener/network, agent/model/provider, browser or credential is invoked. The fixture service intentionally returns synthetic plaintext only inside that isolated test; it is not a production owner/model facade or Coordinator material envelope. This execution cannot close BUB007B integration, native Web-profile, source durability, model-context isolation or licensing gates.

## Exact reviewed unit and execution

Originally author-frozen working unit, independently verified with `shasum -a 256`. Code/test identities remain unchanged; provenance/portability documentation is being traceably updated for the owner's newer name/MIT and contributor evidence, so the two original document identities below are historical and final identities will be recorded at root freeze:

| File | SHA256 |
| --- | --- |
| `src/fishball-memory-core.mjs` | `a4ac97c50b5793e1063007abf7eea4cac9d70be018a42e46c8164a909174903d` |
| `test/fishball-memory-core.test.mjs` | `1817af3962f22a11c49a473b076e533f32d436f84b09864c7dafe16a6d32a13b` |
| `docs/fishball-provenance.md` | `f3cc53f8d2a6bca982bfe470254d1ab4f550f9b82beb52e53512fe8b9a7156d0` |
| `docs/evidence/S3/fishball-portability.md` | `bb798515e57bfb36fa5cabc639c5fa87d46c6f5dd0ed46cdbaba6084a77041f0` |

`BUBBLES_FISHBALL_CORDIS_REVIEWED=1 node --test test/fishball-memory-core.test.mjs`: **11/11 PASS**, fail0/skip0, Node22.22.2, latest independent run408ms. The fixture genuinely loads installed Cordis, writes encrypted synthetic records, disposes and reloads; it is neither skipped nor claimed as actual Web/profile/provider execution. No author code/test/Git files were edited. Exact converged Git tree is still root's pending integration gate.

Remaining requirements: production opaque-caller memory adapter/CAS/tombstones; real task/worker context composition and model-input oracle; whole pinned-source/DTO and Unicode-runtime portability beyond tested partitions; full DSH lifecycle regression; root MIT/notice packaging and full acceptance before publication. Future incorporated third-party code/dependencies require their own concrete provenance/notice review. Stage2 review is independently retained in `docs/evidence/S2/code-review.md`.
