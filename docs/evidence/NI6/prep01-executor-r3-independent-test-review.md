# NI6-PREP01 executor r3 affected independent test review

Status: **SOURCE_SUPPORTED / NOT_RUN / PRE_GO_HOLD**. Reviewer `/root/ni5_r3_affected_review`, Sol6.1 max. No new concrete source blocker was identified in this exact successor. ER2-01 / F-EXE-R2-S01 is **SOURCE_REMEDIATED for r3**; rejected r2 and its reports remain unchanged. This disposition does not establish execution, functional acceptance or root GO. All36 immutable executor families remain NOT_RUN/HOLD and authorize zero additional fault probes.

The unchanged independent design is `public-preparation-r2-executor-independent-design.md`14952B / SHA256 `72152ce0f59b08f458bda8a1d86e3c3278c87e457bddf1f246b6ac9fb3cf923b`, JSON37877B / `f6fbf477c652c2d8e12f406ed8af5129d98a42a59fc4161265c11979a8e14067`. Its original36 expectations are preserved verbatim in the companion JSON. This affected review reads source against those expectations; no failure partition was executed or authored as a passing result.

## Exact pins and permitted readback

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `.runtime/ni6-prep01-executor-r3/source-manifest.json` |10076|`9455d2c27a8d89fbd2729adab059235e22d2a6e5ef96d714fa78ef9cdbe69c2a`|
| `runner.py` in that capsule |42440|`3040abad3378ac506d2f310a3963afaea4fb596897620f4e6cf949dc0b99f177`|
| `runner.before-r2.py` |40432|`3505cefb90104ec82133c72c240e7e8912bb47a599295616b767366c6d35624b`|
| `source-delta.diff` |17447|`540605633a024e283e6456886040478d2f84b9006011758be3502529e77f893d`|
| `docs/ni6-executor-r3-ownership-selection-freeze-2026-10-07.md` |4721|`de7bba6dfacf0fe05154083df137ee7ee839d5e219357e7bed6c41812d06260d`|
| `docs/ni6-preparation-executor-r3-coupled-selection-2026-10-07.md` |4702|`b08d264f5d6e5dd8edb81ef1a734781f75ab098b09d350baa55973717393e671`|

The complete785-line runner, full diff, manifest and both additive freezes were read as text. All28 manifest records (3 owned/25 inputs), including canonical interpreter bytes and preserved predecessor/design/review pins, match their declared sizes/hashes. There are four physical capsule files; the capsule is0700 and three owned source records0600 regular files. The before-copy equals actual rejected r2 exactly. Independent text reconstruction matches the one-file delta,71 added/40 removed lines. The only additions are successful-creation ownership gates, the frozen observed-stop qualification/conservative return check, and honest coupled r3 path/review/freeze selection.

Only public source text/JSON metadata/hash/difflib helpers and this new evidence pair were used. No application Python/JS parser/import/runtime, command/build/test/fault probe, OS process query or signal, profile/listener/database/browser/provider/model/network/Git action or private-content read occurred. Root owns execution, supported approvals and adoption. Existing capsules/designs/reports were not edited.

## ER2-01 and complete ownership refusal paths

The old blocker assigned `evidence` before mkdir succeeded, allowing finalization to write into a refused existing destination. R3 initializes all three ownership latches false at507–508. Proposed evidence/private paths remain separate at527–529; private_directory126–129 creates one new component and verifies canonical owner0700 type/mode. Evidence/private become writable targets only after that call returns successfully at531–534. New build ledger ownership is assigned only after exclusive save and owned0600 verification at540–542. The test carry-over ledger is admitted only after original owned-file, phase/finalization and accounting checks at543–561.

Every ordinary evidence write/copy uses evidence_directory513–516:627–640,673 and684. Terminal existence checks, initial records, PASS commits and failure invalidation are ownership-gated at723–727,740 and770–771. Ledger writes use ledger_record518–521 at565,733,744 and769. Raw command capture requires private_owned plus a fresh ownership recheck at648–649. Candidate success also requires all three latches at701–702. An ownership flag never substitutes for the repeated canonical type/owner/mode checks.

These are source-derived EX25/EX08–11 partitions, not executed faults:

| Refusal/transition | Exact source outcome |
| --- | --- |
| Wrong CLI/cwd/runner/owner directory |494–499 refuse before phase consumption; no application admission. |
| Existing phase marker/file/link | Exclusive save505 refuses before the main finalizer; no overwrite or reset. |
| Existing canonical evidence directory/file | mkdir531 refuses while evidence_owned=false. Finalization skips all target content/existence reads and writes; only this invocation's consumed marker can record failure. |
| Noncanonical/link evidence path or failed fresh evidence verification |528 or531 refuses before latch assignment; no refused target becomes a finalizer/copy destination. A partially created new component stays unknown/preserved. |
| Existing private path or failed fresh private verification |533 refuses before private_owned; no command/capture starts. Any failure summary is limited to the already freshly owned evidence and marker; existing private content is untouched. |
| Existing build ledger/test latch; failed exclusive ledger creation or verification |536–542 refuse before ledger_owned. No finalizer updates a refused old ledger; partial newly created state is preserved and the phase stays consumed. |
| Missing/noncanonical/wrong-owner/mode prior ledger, build marker or result |545–547 refuse before content promotion or ledger ownership. No prior record is repaired or overwritten. |
| Malformed/duplicate prior JSON, nonfinal/failed/contradictory phase or accounting |548–560 refuse before ledger_owned. Early test cannot manufacture a successful build. |
| Genuine finalized build carry-over |561 admits that existing owned ledger only after all checks, conserves active spend and updates test IN_PROGRESS through the guarded ledger accessor. Actual successful root build-driver return is an additional external GO prerequisite. |
| Later failed ownership checks, copy-parent collision or exclusive capture collision | Guarded accessors/one-component creation/O_EXCL refuse; finite failure/incomplete state and no further command follow. No ambient chmod, fallback destination or overwrite is selected. |
| Terminal write/commit/invalidation refusal |716–773 keeps finalized=false or invalidates within the original reserve. All evidence/ledger targets remain ownership-gated, including existence checks. Incomplete/uninterruptible persistence stays HOLD. |

This closes the actual r2 destination-write path at source level. It does not promise atomic filesystem behavior or prove a fault/cleanup result. Marker/ledger unknown states remain consumed; no cleanup removes a latch, private namespace or evidence destination to permit another attempt.

## Eight preserved guard obligations

| Frozen obligation | R3 actual source and design disposition |
| --- | --- |
| Early once-only consumption |505 is exclusive before environment, plan/proposal/commands and input validation; the entire subsequent stage is failure-default. EX08–11 remain source-supported. |
| Failure default and finalization | complete/finalized start false510; ordinary unforeseen exceptions692–693 and catchable interruption689–691 cannot supply success. Complete commands/capture/group/after-check are required687–688. Marker remains nonfinal until required records/checks finish746–752; test requires finalized marker/ledger/result551–560. |
| Private directories/files/copies |113–177 and132–141 retain canonical owner0700 components, O_EXCL/O_NOFOLLOW regular0600 files and no ambient-parent chmod. New ownership accessors strengthen, rather than replace, those checks. Closed public-copy membership/hash checks634–645 remain; the actual finite root copy list still requires review. |
| EOF and prefix capture |216–397 retains concurrent selectors, independently observed stdout/stderr EOF,1MiB each/2MiB combined, bounded retained prefix hashes and explicit UNKNOWN truncation without EOF. Overflow/incomplete capture cannot pass. |
| Catchable stop | SIGTERM/SIGINT latch524–525; same sole cleanup355. Observed stop marks interruption and refuses further commands; the selected admission/completion qualification below applies. |
| Complete time/accounting | Monotonic early admission493, every verification/copy/parser guard,60-second command with4-second cleanup/1-second metadata inside it, and nonadditive observed phase work+5-second terminal charge694–719 remain. Postwrite overrun or insufficient reserve cannot yield finalized success. |
| Denied/unknown owned cleanup |249–301 has absolute pre-signal checks, at most one TERM/conditional KILL to the tracked new group; permission/unknown observation or denied signal latches signalling_blocked and stops all later signals. Observed absence is never reused as a new ownership identity. |
| Strict safe output |77–86 rejects duplicate members at every depth/constants. safe_functional412–468 detects selected identity independent of key order/escaping/prefix and requires exactly one closed14-field record with exact nested domains. safe_tap400–409 publishes only actual numeric totals;655–663 require31/1 complete successful TAP and factual diagnostic. Arbitrary raw/error/assertion text remains private. |

No old guard was removed by the exact diff. The r1 ET01–05/r2 guard dispositions are still source-supported; those rejected runtime positions are not promoted. Verification180–203 checks the entire required source union and original27577-file/12-link graph at the frozen before/after checkpoints; incomplete after-verification records complete:false/unchanged:UNKNOWN725–726. No byte readback is treated as a genuine builder invocation.

## Observed signals, successful return and honest r3 selection

The final observed-stop guard310 is the frozen admission point; Popen311 is a later operation. A flag observed at/before the guard refuses spawn. A later stop concerns an already admitted child and the unchanged bounded owned-group cleanup. There is no masking/preexec hook, atomic cancellation claim or extra process/signal probe.

Completion linearizes at the last successful required postwrite/observed-stop check749; finalized752 follows. Return776 conservatively checks STOP_REQUESTED again. Root must observe the actual successful driver return before test GO: persisted PASS records alone cannot certify a later signal, uncatchable/uninterruptible OS failure or an absent return. These are the expressly frozen boundaries, not a claim that signal delivery/Popen/return are indivisible. No process outcome establishes original route404, entry/root/listener closure, native/remote termination or reservation release.

CAPSULE/OWN16–17, exact root plan496, actual runner check577, proposal/manifest selection578–589, generated/build evidence606–608, evidence527, report40–47 and freeze33–36/599–612 all select real r3. exact_commands471–489 derives exactly four builds, six syntax checks in the unchanged order, then pure31 and functional1 from that capsule. No actualExecutor alias or bypass of sealed r2 preflight is present. The coupled freeze supersedes the initial ownership freeze's r2-path assumption; both historical documents remain pinned. R2 fixture/proposals are lineage, not an executable r3 selection.

All unchanged maxima remain prospective: two once-only phase drivers/twelve child commands,16 interpreter starts (five Python/eleven Node including two ordinary test workers), up to24 private raw streams,180seconds shared active/60seconds cleanup-inclusive command,1MiB per stream/2MiB combined. Only the fully stopped human review gap is excluded. The phase charge is observed whole-phase work+5; command metadata charges are recorded within phase work, not added again to its ledger. No actual elapsed/capture/group/count result was measured here.

## Remaining gates

There is no new concrete executor-source blocker. Runtime GO remains false until the separately sealed preparation-r3 fixture and affected reviews establish the exact coupled selection, root fully reads/freezes the closed phase plans/pin/copy/argv union, genuine original build/generated readback exists for test, and root obtains supported action approval and actual successful driver outcomes. This report neither reviews a not-yet-read fixture-r3 assertion body nor invents its future hashes.

All36 executor families, nine functional families and31 UNIT_ONLY DTO cells remain NOT_RUN/HOLD. No failure probes, reruns or added verification layer are authorized. Typed raw-instance currentness, actual native donors/roles/usage/release, cold/browser acceptance, all87 accepted0/HOLD and permanently blocked final CODE remain unchanged.
