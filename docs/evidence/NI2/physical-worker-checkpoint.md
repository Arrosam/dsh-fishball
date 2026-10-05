# NI2 installed first-worker checkpoint — 2026-10-05

The bounded installed path **passes**: coordinator intake → encrypted durable task → explicit preview/grant → one original DSH worker → captured result → owner read → explicit finish and reservation release. Ten original Loader reloads, full quit, same-profile cold restart and final full quit also pass. Full NI2 and aggregate MVP acceptance remain **HOLD**. The captured result is `not-reviewed`; delivery is `not-requested`. Cold native provenance is unavailable and resume remains unimplemented.

## Exact installation and scope

The physically installed private preview is Git `a58c522`, tarball SHA-256 `fa3fb398d901a5c3d04d1f6f949878eb190f1d1fb737b16210347963d0afb5c0`. The project-isolated official flat DSH Web target is `0.2.1-alpha.1`; lock SHA-256 `68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3`. Node is `22.22.2` arm64. Original Desktop and Hydrogen were untouched. All 57 held package files match both the archived source and physical installed copy at this checkpoint; see [file checks](physical-worker-runs/final-file-pin-check.json). This package does not contain the newer controls or audit installer committed at `8476c42` / `058a345`.

The original compiled CLI ran its `web` profile at `127.0.0.1:3080`, with the original Cordis Loader, AgentLoop, JSONL persistence, Authentication connection/operator and LocalCredentialProvider. Five bare package exports resolved the physical artifact; no duplicate peer graph or alias supplied an alternate realm. Runtime observations assert exact original class, module and fiber identities. The original credential class generated a synthetic local grant in the owned private fixture; raw authenticated URL/cookie/signing material was never exported into this evidence. The corrected profile declares the supported native `df-read-only` preset with sandbox `read-only`, approval `never`, and an empty tool preset. No native or product permission gate was weakened.

Only the source-owned deterministic testing provider/model was available. No external model inference, tools, live accounts or paid calls occurred. Admission was one active worker/one attempt, request limit8192 bytes, output limit128 bytes, usage reservation8320 synthetic UTF8 byte units, runtime reservation1000ms, and explicit owner storage/policy/action consent. Original JSONL persistence is unencrypted and owner managed; this checkpoint does not establish a retention limit or hard disk quota.

## First failures and affected repairs

All first observations remain preserved alongside their helper source in [run evidence](physical-worker-runs/). They are not relabeled as passes.

1. Original first CLI PID89415 exited13 before readiness. Passive original Loader diagnostics identified actual `permission-default-unmatched` and socket `EPERM`. The supported declarative preset correction retained `read-only`/`never`. The exact same original CLI/profile/address was then submitted to sandbox automatic approval review and approved; no alternate browser, port, proxy or service realm was used. The official configuration dump passed, while its schema dump remained incomplete for the typed standard-schema Config exports; that diagnostic limitation is retained.
2. Approved CLI PID91790 reached readiness, but the first execution stayed at an unknown dispatch intent with zero streams. Independent [source diagnosis](physical-worker-execution-source-diagnosis.md) and the retained request discriminator identified a fixture defect: both `agent/request` observers omitted `next()`, which vetoed the original Cordis waterfall. Root repaired only those two helper callbacks. Product source and permission gates stayed byte-identical. The first unknown intent/reservation was not replayed, reset, adopted or reported complete: after graceful exit0 the entire owned synthetic `df-data` directory was reversibly preserved under private `first-observer-failure-data`. The same original profile/address was used with fresh explicitly confirmed synthetic storage, policy and action consent. [Preservation metadata](physical-worker-runs/root-first-failure-fixture-preserved.json) records five files and their hashes without exporting their contents.
3. Corrected CLI PID92911 produced one actual completed deterministic stream. Its smoke stopped at an incorrect duplicate-command oracle expecting `STALE_VERSION`. Original source returns the same historical intent/reference with uncertain execution metadata. Root repaired only that assertion and continued the already completed stream through capture/read/finish; it did not repeat create or inference. Duplicate reads produced zero additional streams. The first failed smoke messages and original smoke source are retained.

Fixed startup observer SHA-256 `030e2aa2a7a414a79402a326149f9dffad5dcc3dad922c3981235e94a8c7b4dd`; physical observer `ce1fb2bd91856434803e2e435652f22714d2de399751523d0efb858dc58cec2e`; smoke `d3ed6ad3b695974c25e360e2150d7992bb66c9f93c2f446a26eb13d0633a24ac`; continuation `3f2707210052909b124952f410d6afd7d4de7d9dc20f4bdfa7825733549e444e`. These are validation helpers, not product fixes.

## Actual worker and lifecycle evidence

| Observation | Actual result |
| --- | --- |
| Original worker | One request/stream/finish, zero tool attempts, two input messages, one user and one assistant message persisted |
| Usage | Input3137 + output113 = total3250 synthetic UTF8 byte units, original observed usage agrees with the signed execution and reconciled action |
| Input | SHA-256 `de4c8a89d937e3d57ca4508ccf91004cf68ff95b5e8dba1998ba158912b11886` |
| Output | SHA-256 `979dc9b4bcd1a9edd97ca00758adf28b656b0b631520fdedf17037f40c122e2b` |
| Capture/read/finish | Original authenticated operations; exact output; original signed binding; completed action with actual usage; reservation released; native sessions0 |
| Persistence | Original SessionStore flush plus original JSONL backend stat/open/read;14 events and exact prompt/output digests |
| Duplicate execution | Original historical intent/reference, uncertain metadata, zero extra streams; uncertainty is not converted to fresh authority |
| Reload | Ten actual original Loader disable/enable cycles; setup/runtime loads1→11,20 immediate `SERVICE_DISPOSED` withdrawals, old references and routes withdrawn; no extra work; key/state hashes and DB inode unchanged |
| Quit | Owned PID92911 exited0; services disposed, routes withdrawn, native sessions0, original listener absent |
| Cold restart | Owned PID93270; same key/state hashes and DB inode; artifact and original JSONL preserved; requests/streams/tools/sessions0; actions disabled; no automatic wake |
| Cold boundary | Authenticated `workerResult` refuses `WORKER_RESULT_UNAVAILABLE`; resume `not-implemented` |
| Final quit | PID93270 exited0; setup/runtime disposed, auth access file removed, original port3080 listener absent |

The [continued report](physical-worker-runs/initial-worker-continued-smoke.json), [reload report](physical-worker-runs/reload-worker-smoke.json), [cold report](physical-worker-runs/restart-worker-smoke.json), [reload observation](physical-worker-runs/root-worker-reload-final-state.json) and [final disposed observation](physical-worker-runs/root-cold-final-disposed-state.json) support these facts. The helper asserted all ten cycle outcomes; the subsequent persistence observation overwrote the individual cycle array. The retained1→11 load counts,20 withdrawals and successful report remain available; no individually retained ten-cycle array is claimed.

## Boundaries and next work

This is actual original CLI/HTTP functional evidence with a synthetic provider. Browser rendering remains unobserved: supported browser control was unavailable and the original browser address was blocked. Independent source diagnoses and functional/ISTQB sessions do not substitute for the blocked independent CODE session. No blocked action was retried through an alternate reviewer/model/environment. No package was published, no remote was created, and all87 AC remain retained on HOLD.

Next work is native audit/repair composition; independently validated schema6 migration and promotion followed by normal event/report/delivery wiring; schema7 signed cold origin/preparation/capture/finish and resume; then one combined installed package and applicable aggregate functional/visual/code acceptance. Passing historical module totals do not establish that future package. The test host is stopped; ignored private fixture state is preserved locally. The evidence manifest copies metadata and helper source only, excludes raw native logs, authenticated URL/cookies, secret bytes, databases and native session bodies, and records exact bytes for reproducibility.
