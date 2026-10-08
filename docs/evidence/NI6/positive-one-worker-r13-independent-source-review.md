# Independent R13 affected source review

Verdict: **NO_MATERIAL_NEW_SOURCE_BLOCKER_SOURCE_ONLY_NOT_RUN**. The exact final wrapper moves `sys.exit` outside `BaseException` while conserving the complete R12 main, signals, final gates and fixture. No material source correction is required in this frozen packet. R13 has not been parsed as a program, imported, checked, built, tested or executed in this review. This verdict grants no execution or acceptance GO.

Reviewer: existing independent Sol 6.1 max lane, English, separate from the author and ISTQB lane. Parent-supplied local HEAD is `3f867bc1f60a9433f7eee2f210f6dfa05c96fa0c`; no Git action verified or altered it. The authoritative freeze is `docs/ni6-positive-one-worker-r13-terminal-return-freeze-2026-10-08.md` (9641 bytes, SHA256 `adf896b33d49a25173da51d71a99dda37dd4a1ec2fe93b0e28e1c39fdfc0a3d8`). AGENTS, the complete freeze and R12 checkpoint were read. The complete affected fixture, executor, README, literal delta and author Markdown were read; selected JSON metadata and tables were read and compared inertly. Truncated aggregate displays were resolved with bounded reads. Immutable R12 source and actual authority is reused; this is not another product or dependency-graph audit.

## Concrete terminal behavior

At `run-once.py:671` the only behavior change is:

```python
try: terminal_code = main()
except BaseException: terminal_code = 1  # Never serialize a caught error or payload.
sys.exit(terminal_code)
```

The whole fixture equals R12 after replacing only the fresh namespace. The whole executor equals R12 after that namespace replacement and the exact inverse of these three final lines. Its main body, SIGTERM/SIGINT installation, interruption latch, finalization, cleanup, marker ownership and final gates are unchanged. The original final return remains `return 0 if finalized and not STOP_REQUESTED and time.monotonic()<end else 1` at line665.

| Source case | Terminal status | Evidence |
| --- | --- | --- |
| `main()` returns 0 after its original final gates | 0 | Stored unchanged; outside `sys.exit(0)` is not caught by this wrapper |
| `main()` returns 1 | 1 | Stored unchanged; no forced-success branch |
| `main()` throws a BaseException, including an unexpected SystemExit | 1 | Fail-closed fallback; exception is neither bound nor inspected |

This is static source reasoning, not an executed control or interpreter test. Main is called once. The exit operation follows the handler, so ordinary successful SystemExit is no longer converted into the exception fallback. No main-status instrumentation, deadline or signal relaxation, error serialization, retry, replay or extra command is added.

R12 remains consumed **FUNCTIONAL_PASS_DRIVER_RETURN_FAILED_HOLD**. Its original supported driver returned1 despite closed functional records reporting PASS and both Node children returning0. Those records do not establish that main actually selected0 or that its later final gates all passed. The new source permits the intended returned status to escape the wrapper; separately captured supported R13 driver exit0 with all original gates is still NOT_RUN. No retrospective promotion or replay of R12 is authorized.

## Conserved guards and ordinary interface

All65 selected public package files, including the descriptor and built client, are physically byte-identical to R12 after explicit manifest-selected opaque comparisons. No product source, opaque capture/finish implementation or protected final CODE internals were semantically inspected. The64-digest derivative descriptor and its inherited host/producer authority remain unchanged; no producer was evaluated and no new actual build is claimed. The four newly included canonical reports are provenance metadata only; no mixed canonical adoption is established or selected.

Whole-fixture equality conserves C01–C23, F01–F05, G01–G05 and L01–L05, original counters, all original result/finish/stop/release oracles and the retained-fiber cleanup contract. Positive completion still requires genuine returned and persisted result, checked finish code51B, reservation release, factual worker stop, exact agent/session absence before cleanup, paired dispositions, preset disposal, six verified removals, exact post404 and25HTTP. Root cleanup RESTARTED requires returned original root.dispose, root UID0/state2, ten retained unique direct fibers UID-null/state4 and six original terminal loader rows with checked removals. PositivePath remains gated after finally on RESTARTED. Cleanup failure preserves FAILED_HOLD and the original first failure. This is standalone restart evidence, not full DSH application quit.

Both selected execute and finish caller windows stay10000ms HTTP/10500ms RPC inside unchanged shared24000ms work. Other calls stay2000/2500ms; the60000ms product policy and every enclosing budget remain unchanged. One owned Python executor and its two original sequential Node commands remain selected. No new helper/control/interpreter family, listener, HTTP/model dispatch, aggregation allowance or runtime probe is added. Interruption, EOF, group-absence, output-cap, fresh-path, descriptor, drift, ownership and once-only guards are exact R12.

Idle return cannot replace worker-operation/result/stop/release gates. Finish code104 means the first client HTTP timer before observed headers; it does not identify server receipt, cause, latency or a general timer-only remedy. W03 records return from the original native finish await before subsequent seal/check/response work; clipped elapsed cannot prove a uniquely pending await or full operation duration. No private content or opaque behavior was investigated.

## Closed provenance and byte limits

The inert comparisons independently matched:

- 1286 inherited input rows exactly plus93 declared, physically sealed public additions:1379 unique inputs/46140117 bytes. The100 new-input/current-owned regular records match their hashes; inherited graph rows are reused, not physically re-audited.
- 817 inherited copy paths as an exact ordered prefix plus65 current package paths:882 unique copies/26070666 bytes. These are proposed copy identities, not an R13 executed-copy claim.
- 1391 future pins:1379 inputs +7 owned records +the current source-manifest self pin +4 final reviews. The current execution/root-plan file is not its own recursive pin. Input/ownership/review sets are disjoint.
- 15 exact inherited topology rows plusone explicitly checked fresh public peer symlink:16. No directory graph was enumerated.
- Exact six-file delta:386-byte descriptive preamble +21832-byte regenerated body =22218 bytes. Package contracts and native descriptor entries have empty deltas.
- Whole proposed-plan equality after current namespace normalization and removing its separately conserved copy list. Original effects and budget metadata remain unchanged.
- Diagnostic v2 grammar:36 fields,55 phases,37 refusal values,38 feasible finish codes,31 finish-wait stages; rootCleanup NOT_RUN/UNCERTAIN/RESTARTED. Fixture/executor validators are unchanged; manifest/proposal/author metadata agree.
- Conservative longest-closed-scalar bounds878 compact/1023 pretty bytes including final LF, with1024 cap/read1025. Pretty headroom is one byte; no field/enum growth is silently allowed.

All three proposal GO flags remain false, pins and author reviewPins are empty, testWorkerStarts is0, runCountAuthorized is1 and status is SOURCE_ONLY_NOT_RUN. Six explicit actual destinations and both assigned review destinations were checked absent before exclusive creation. The other review pair belongs to the independent ISTQB lane.

## Record qualifications and remaining dependency

No material findings or required candidate fixes. The inherited proposal.effects string 'Strict original root cleanup remains HOLD' does not replace explicit v2 RESTARTED qualification and independent gates. The generic unchanged2000ms transport value describes other ordinary HTTP calls; named selected execute/finish10000ms HTTP/10500ms RPC metadata governs those callers.

The R12 checkpoint incorrectly said 'checked51 bytes'. Root corrected this descriptive coordination in the append-only `docs/evidence/NI6/r12-checkpoint-finish-trace-clarification-2026-10-08.md` (1438 bytes, SHA256 `7d7e68297264ee1a3caa599f0ffc28f0744ea266fbe9b33a9218da2a14facf9b`), fully read and sealed here. The authoritative field is three-character closed code51B, not a response byte count. This clarification changes no sealed R12/R13 input, pin, oracle, runtime selection or GO; it is current-handoff coordination outside the immutable R13 input closure.

Reviewer-only inert checks initially compared a manifest effects dictionary with the proposal's descriptive string, then its diagnostic printer assumed both were dictionaries. Both stopped before candidate action. Corrected within-schema comparisons and the complete final finite check returned exit0. A report preflight also stopped before either write on a guessed inherited test-assessment filename; exact manifest-declared paths resolved it. No candidate byte was changed.

The author qualifies preparation as inert copying/hashing/literal metadata sizing without evaluated candidate/helper/producer. This review establishes its own inert method and exact bytes, not independent access to the author's historical process. Historical R7B pathname-only private enumeration remains qualified; no historical zero-enumeration claim is made. This lane used explicit public paths and exact absence probes, with no private enumeration or content inspection/copy/hash/decoding.

The remaining affected dependency is root's separate selection and direct capture of a fresh supported once R13 terminal return, alongside all conserved child/public/marker/EOF/group/drift/currentness/cleanup guards. Persisted PASS alone is insufficient. This report supplies no execution GO, runtime PASS, acceptance, new build, canonical adoption or full DSH quit claim.

All87HOLD/accepted0/rootHOLD and protected CODE BLOCKED_UNCHANGED remain. Cloud was twice denied with no third attempt. Supported-browser capability remains blocked by the last parent verification: browsers[]/iab unavailable/no Chrome extension; screen lock is additional and unlock alone does not resolve it. Authorized future use would prefer Codex built-in, with supported Chrome extension fallback only, avoiding Browser LUA and native-browser routes. 'LUA' means Browser LUA, not a Luna-model ban; no new availability or route authorization follows. UI has no corrected handoff; cancelled4da34a6d remains NEVER_EXECUTE. Main, remotes, unrelated drafts, QA and prior evidence were unchanged by this review. No publication/MVP/task-completion claim is made.

## Exact final candidate identities

| Public artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `.runtime/ni6-positive-one-worker-r13/fixture.mjs` | 53734 | `9befafef1115c3cd93064272805410dfdd16ff73c17812faf0e6eaab64c9ada8` |
| `.runtime/ni6-positive-one-worker-r13/run-once.py` | 35239 | `65c3a87e1f40ff461522dd68dc03061c86b6fd503c457344b72169e123aef874` |
| `.runtime/ni6-positive-one-worker-r13/execution-plan.proposed.json` | 75681 | `224fd243cb10d4d47356d339961e2f0cecabdb2d66ad8d2e22c2715408c05c11` |
| `.runtime/ni6-positive-one-worker-r13/source-delta.diff` | 22218 | `744ff0f02cb9f0db4f944446be85754f5bd7e37e246080055ce05126fcd1f320` |
| `.runtime/ni6-positive-one-worker-r13/README.md` | 4541 | `12188be9b027dd844fb5479abb34598c6af228729efae3bca77b58b5bf0e5467` |
| `.runtime/ni6-positive-one-worker-r13/source-manifest.json` | 419964 | `b46a77d8d84d2c29e82ee10ae5d09dcda70fba6892855b342edccc79c84dda32` |
| `docs/evidence/NI6/positive-one-worker-r13-source.md` | 4890 | `5f31e5593b0a33d7767e163f768a23e64cd36a45088c36ebbd30829c4cd31b54` |
| `docs/evidence/NI6/positive-one-worker-r13-source.json` | 123626 | `3577bc02a84c4facf0b5030c93299b370fd42b5498be8624fe4d339934954bf9` |

The companion JSON carries immutable authority identities, finite checks and the Markdown seal. Only this fresh Markdown/JSON pair was created with exclusive/no-follow creation. Complete final readback and external seals are reported to root separately; the JSON has no recursive self hash.
