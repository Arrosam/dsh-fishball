# BUB007A private Node ESM portability spike

Status: module unit tested, ready for independent review; full BUB007-01/02 acceptance remains pending. Parent authorized private pinned reuse with the project MIT decision and bounded contributor check recorded. [Exact source/provenance and dependency boundaries](../../fishball-provenance.md) and [BUB007A source AC](../../tickets/BUB007A.md) are authoritative. This adds only `src/fishball-memory-core.mjs`, its dedicated test, this evidence file and the provenance file. Stage2 coordinator/context files remain frozen unless reviewers request remediation.

## Target comparison

| Route | Actual observed evidence | Cost/gap |
| --- | --- | --- |
| Kotlin/JVM extraction | Both pins declare Kotlin JVM/serialization and Java17; memory core itself has no Android import, while shared core API also exposes Ktor/serialization types. Release Store uses JVM CopyOnWriteArrayList/AtomicLong. | JVM runtime/bridge is not DSH Node ESM. No Kotlin/Gradle compiler in current PATH; no build, new install, wrapper invocation or JVM plugin integration performed. |
| Kotlin/JS ESM | No actual Kotlin/JS build/module was produced. Source portability would require a multiplatform source set, JVM collection/atomic replacements and isolated serializable/domain types. | Toolchain/dependency/source work and real resulting ESM-host tests are still required. Kotlin supporting JS is not project evidence. |
| Private Node22 ESM semantic adaptation | Actual import and10 pure unit tests pass on Node22.22.2 using only built-ins. TTLs, recall, revisions, source-format migration and fail-closed persistence execute locally. | This is a port of inspected algorithms, not Kotlin compilation or byte-for-byte cross-language execution equivalence. The independently reviewed public Cordis fixture executes successfully against synthetic encrypted RuntimeStore. Real pinned Web-profile plugin and eventual native context integration remain final regression debt. |

## Current commands and results

- Read-only `git show` of exact main `f4a887d37b4c60a65ccc7c22fd87b19639287a0a` and cached release `32ac8236bdb8d93c0a895b81557c4d915cf5e80c`; source paths and byte hashes recorded in provenance. No existing data path was read.
- `command -v kotlinc` and `command -v gradle`: absent from current PATH. `node --version`: v22.22.2. No new dependency/install or lifecycle script.
- `BUBBLES_FISHBALL_CORDIS_REVIEWED=1 node --test test/fishball-memory-core.test.mjs test/coordinator.test.mjs test/context.test.mjs`:34 passed,0 failed,0 skipped;10 pure memory tests,1 reviewed public Cordis fixture and23 Stage2 tests. The environment gate was enabled only after independent fixture composition review and root instruction. This is bounded public-library execution, not native-profile portability acceptance.
- Review remediation: S3-FB-CR01 rejects non-index numeric own array fields before vector normalization/persistence; MEM-T01 rejects preference freshness while either recorded/confirmed time is in the future; MEM-T02 uses exact JSON container punctuation accounting, accepting native snapshots at4MiB−1 and4MiB, rejecting4MiB+1.

## Test coverage and residual oracles

| Criterion/risk | Actual module evidence | Remaining evidence |
| --- | --- | --- |
| BUB007-01 runtime port | ESM import, whole-store write-through/reconstruct, TTL N−1/N/N+1, conservative defaults and labels, invalidation/confirmation, Jaccard/cosine guards and candidate retrieval. | Independent final source review, then actual pinned native Web plugin load/write/reread/migration evidence in final regression. Kotlin/JS remains uncompiled. |
| Main versus release migration | Synthetic main snapshot plus release JSONL checkpoints/final revisions merge by ID; log latest wins, snapshot-only turns survive; source/tool/reasoning/inFlight/steered/quoted fields survive; ID sequence never rewinds. | Broader source DTO parity and independent fault cuts; no personal file migration is authorized/performed. |
| Corruption/persistence faults | Truncated snapshot/JSONL tail, blank record/unknown field, synchronous exception/false/missing/async acknowledgement and reentry refuse; no phantom in-memory saved result; reconstruction uses only explicit validated bytes. | Real storage fault/process durability and adapter CAS/reconciliation under RuntimeStore; no source error swallowing retained. |
| Bounds/privacy/scope | Whole4MiB limit, bounded vectors/rows/strings/tool structures, NaN, duplicate IDs, known canary/credential-field/hostile-getter and namespace mismatch reject before injected persistence. Separate synthetic namespaces retrieve no other instance's content. | Trusted opaque-caller BUB007B adapter, source/confidence/revision indexes, semantic extraction and actual context/model-input isolation. Public refs do not authenticate. |
| Memory authority | Strings alleging approved/completed are plain memory only; core has no grant/control/task APIs and never auto-resumes `inFlight`. | BUB007B ledger/current-instruction conflict integration and native adversarial tests. |
| BUB007-02 rights | Both pinned READMEs declare MIT; root LICENSE absent; bounded complete reused-path histories show owner-identity matches and AI trailers only. Original dependencies/source pins recorded. | Root coordinates project MIT license/notice. No concrete third-party conflict was identified in this reused owner-authored subset; no rights claim is made for the unincorporated whole application/dependencies. |

## Review-gated public Cordis fixture

Authored in the same dedicated test file, gated by `BUBBLES_FISHBALL_CORDIS_REVIEWED=1`. Independent code and ISTQB composition reviews plus root execution instruction authorized the exact fixture; the command ran and passed: `BUBBLES_FISHBALL_CORDIS_REVIEWED=1 node --test test/fishball-memory-core.test.mjs`. It imports only the existing project-local public Cordis library, registers a synthetic private fixture plugin, loads a migrated snapshot, writes one memory fact through encrypted RuntimeStore, disposes the plugin, and reloads/re-reads the exact committed record. Borrowed service references deny after disposal. No profile, DSH application launch, session/model, browser, provider or credential is used.

The synthetic fixture temporarily stores memory bytes as an encrypted `context` record on a dedicated fixture task. It is not a production adapter or a valid Coordinator ContextAssembler material envelope. A production memory domain needs a reviewed typed RuntimeStore extension/index and opaque caller facade; core author has been notified, with no shared RuntimeStore edit by this lane. Running the fixture proves public-library execution only; it cannot satisfy real native-profile/UI/model or complete packaging/notice acceptance.

Independent Sol6.1 code and ISTQB review are requested. No verdict, publication, full ticket/MVP acceptance or release is claimed.
