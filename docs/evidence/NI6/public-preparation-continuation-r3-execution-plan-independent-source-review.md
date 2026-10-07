# Public preparation continuation r3: additive execution-plan SOURCE review

Disposition: **SOURCE_SUPPORTED_FIXED_TWO_COMMAND_PLAN_EXECUTION_NOT_RUN_HOLD**. No new affected SOURCE blocker or source/oracle drift found. This separate finite review reads the new root plan and runner as text; it neither authorizes nor executes commands. The existing public23 preparation report and runtime-r4 report remain sealed. All87 accepted0/HOLD and final CODE BLOCKED_UNCHANGED remain unchanged.

## Exact subjects

| Subject | Bytes | SHA256 |
| --- | ---: | --- |
| `.runtime/root-ni6-public-continuation-r3-plan.json` | 33550 | `be902ea792a808526095869b20cd315bff8026d2ac49178419af90606262ee59` |
| `.runtime/root-bounded-execution-60s.py` | 5855 | `e57882ad45265fead78c87c98bedd762314297f71cd46e654e18b0074e33532a` |
| `.runtime/root-ni6-public-continuation-r3.test.mjs` | 1133 | `3dc46ce5059ad4d0590c362f3b0d7dd9656b8c8786cd609be58d176e6b5ed85b` |
| Preserved `.runtime/root-bounded-execution-v2.py` | 5857 | `dbd9d030a315e9ed68fe56c8dd9d7f6d76ccc109329a05c1db551437e63f13cc` |

Current v2 equals its historical frozen r2 copy byte-for-byte. The new runner is exactly the old body with two literal replacements: line76 `'timeoutSecondsPerCommand': 300` becomes `60`; line93 `timeout=300, shell=False` becomes `timeout=60, shell=False`. Reconstructed literal diff is +2/-2, SHA256 `95eeaa2971c67a1b493071c8a8d371e8f685544d04ff0dbd382494f5b6b9e47d`. No other runner mutation exists.

## Fixed commands, pins and copies

The plan's commands at4–17 are exactly:

```text
/opt/homebrew/opt/node@22/bin/node --check .runtime/root-ni6-public-continuation-r3.test.mjs
/opt/homebrew/opt/node@22/bin/node --test --test-concurrency=1 --test-reporter=tap .runtime/root-ni6-public-continuation-r3.test.mjs
```

These are planned commands only. The alias resolves to `/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node`,84640 bytes,SHA256 `463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de`; binary bytes were hashed, never invoked. No wildcard/discovery, model/cloud, installed/native/service/profile/browser or network command is selected.

All203 declared pins match actual bytes: exactly198 active canonical preparation pins plus the manifest, new runner, unchanged wrapper and sealed public23 review pair. Runner52–56 adds the plan self-pin, giving204 effective pins; the already-pinned runner and exact Node add no duplicates. All677 distinct referenced files from the sealed public23 verification were rehashed with zero drift, preserving historical150/root132/r2/r4 records and unchanged oracles. No protected experiment body was investigated or executed.

The50 unique pinned relative sourceCopies at236–286 have50 unique normalized destinations:36 coherent capsule files,13 genuine original/current core files and1 wrapper. Runner82–87 performs those50 copies plus a separate runner-text copy, for51 explicit byte-copy operations. Metadata freezes, verification records, logs and future synthetic DB files are additional evidence writes. No copy or execution directory was created here.

## Import, effect and failure obligations

Unchanged wrapper4 imports the reviewed dispatcher; dispatcher statically imports only builtins. Its manifest signature, all198 canonical size/hash pins, exact35 owned inventory and physical23 leaves precede the sole dynamic leaf import at149. The previous independent lexical review covers26 owned modules and13 genuine core files; all their bytes remain unchanged. Root runner1–10 imports Python standard-library modules only. No JS parser/import/evaluation ran in this lane.

Wrapper7–12 retains exactly PREP-01..13, REQ-01..04, SEC-01..06 in that order. Its awaited concurrency:false loop at14–26 invokes each at most once per invocation, checks exact result ID/PASS, records diagnostics and skips later leaves after the first thrown failure. MIG-01/MIG-02/MIG-03 remain excluded; future selected leaves' own fresh schema6→7 setup is still an actual declared effect. The unchanged authentic schema7 core lacks the separate owner-intent runtime integration.

Plan18–24 matches the sealed source bounds:53 RuntimeStore constructor attempts/owned closes,123 direct preparation calls,38 expected new callbacks,23 scratch paths and1 parallel leaf. These count direct source operations; callbacks are expected, never observed here. Constructor failures, hard process termination or I/O failure can prevent closes. Actual DB/migration/journal/backup writes are declared; no private/transitive SQL-operation bound or installed/native proof is inferred.

Runner47–81 checks root's one-run/HOLD declarations, exact Node and absent evidence directory, freezes metadata and verifies pins before copying or launching Node. Runner89–113 executes command arrays serially with shell=False, stdin DEVNULL and timeout60; timeout records124, and any nonzero result stops later commands. Wrapper fail-stop prevents later leaf effects after an assertion failure. No retry, fallback, cleanup deletion or acceptance promotion is added. Runner114–119 rehashes inputs on ordinary completion and rejects drift. Existing evidence-directory refusal prevents re-entry while evidence is retained; root owns the single authorized invocation. The plan's rootReviewedExecutionGO:true is a root declaration, not independent runtime evidence or this review's execution authority.

The60-second value bounds the configured direct subprocess timeout; source provides no whole-run wall-clock or process-group/descendant termination proof. Pre/copy/post pin checks are nonatomic and do not independently hash copied output bytes; they provide no atomic snapshot or guarantee of postchecks after external termination. Actual syntax/functional outcomes, copy fidelity and termination remain NOT_RUN here. The twice-rejected cloud command and permanently blocked final CODE investigation remain outside this lane.

## Seal

The paired JSON records all203 actual pin hashes/sizes,50 planned copy mappings, literal runner diff, unchanged selection,677-file preservation summary and this disposition. The public23 MD SHA256 `2d159c0fcc92d141ab65517c5e5d970700576ef3c47460525eaa5b621c24ee6b` and JSON `a02fc579cec88db996566e0c180b15e616617cf54523d9cfb643b7946c4946e4` remain intact. Applicable AGENTS.md, owner amendments and development workflow were read. Only stdlib metadata/hash/text checks and these new evidence files were produced; no tests, DB/native state, Git, application execution, network/model/profile/listener or blocked-security work occurred. Root owns any later invocation and its evidence interpretation.
