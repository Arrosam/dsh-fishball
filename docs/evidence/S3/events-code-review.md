# BUB009 pure clock independent code review

Reviewer: `/root/code_audit`, requested Sol6.1 max, independent of root/author and the separate ISTQB lane. Root extended this reviewer's evidence ownership to this file. Only evidence is edited; no author code/tests/Git, host/browser/provider, dependency install, credential or inference action.

Status: **Working-unit review complete; no unresolved finding in this pure utility. Final integration verdict awaits root's frozen tree. BUB009 runtime/provider/UI acceptance is not granted.**

## Reviewed boundary

`src/event-clock.mjs` proposes bounded due instants from explicit interval/daily schedules and IANA timezones. It has no timer, scheduler, ledger admission, authentication, task mutation, external effect, webhook or notification. Occurrence refs bind the complete behavior-affecting schedule and exact instant; they confer no authority. Future runtime integration must persist source/cursor/consent/resource facts and classify external effects before atomic admission. A pure coalescing proposal is not permission to replay an unknown effect.

Read `AGENTS.md`, the three-stage mapping/acceptance debt and the pure utility/tests. Explicit policies include repeated DST first/both/skip, missing local time skip, catch-up skip/coalesce/verify, max age/scan bound and quiet-hour emergency exception. Daily lookup scans both sides of the cursor so restart between DST folds does not misidentify the second fold as first. Output is bounded128, immutable and copied. Large gaps refuse for review. Known policy/descriptor/proxy failures use stable codes; Intl errors are redacted.

## Findings and corrective checks

| ID / severity | Reproduction and impact | Disposition |
| --- | --- | --- |
| EV-CR01 / Low | `missedPlan` accepted a fabricated occurrence `{at:123,timezone:'fabricated',localDate:'wrong',occurrenceRef:'not-a-reference'}` and coalesced it. Caller-supplied labels were treated as clock evidence without validating schedule/time eligibility. | Fixed complete schedule digest, instant eligibility, timezone/localDate/hash and duplicate validation; copied due is frozen. Original independent forged occurrence, changed-policy binding, duplicate and frozen-result checks pass. Closed on hashes below. |
| EV-CR02 / Low | A safe integer beyond JavaScript Date range reached Intl and escaped as raw `RangeError` without stable code. | Instants are bounded to Date maximum minus26h scan margin; Intl formatting failures redact to `TIME_RANGE_INVALID`. Original independent `MAX_SAFE_INTEGER` due/quiet probes reject stably. Closed on hashes below. |

The first author corrective run7/8 failed because an older fixture reused occurrence refs after changing catch-up policy. Corrected fixtures derive refs from each changed full spec and retain an explicit old-spec binding rejection; this is a stronger binding oracle, not weakened assertions.

## Exact working unit and execution

| File | SHA256 |
| --- | --- |
| `src/event-clock.mjs` | `eb5bd8872479cf6d3a69acd5d7c9ab341ad2b9a8a3f54ed1c4fff2c87e20b5f4` |
| `test/event-clock.test.mjs` | `61742c490286ccef7faa9f383366ee6654f97a90704b8333f0295c91c6f77a3c` |

Independent `node --test test/event-clock.test.mjs`: **8/8 PASS**, fail0/skip0, Node22.22.2; repeated in the current52-case core/native/clock focused run with all52 passing. Additional independent original corrective probes: **6/6 PASS**. `shasum -a 256` matches the two identities above. These changing-tree execution counts do not establish a final frozen-tree or full-ticket verdict.

Remaining requirements: typed durable event state and source-complete dedup/cursor/outbox; atomic current task/consent/resource admission; restart/revoke/cancel/clock-jump ordering; unknown-effect non-replay; actual chosen webhook/chat-provider/current-owner-timezone behavior; real native scheduler/UI/quiet notification regression. All original source AC and final consolidated acceptance debt remain retained. No alternate daemon, automatic host run or external account was introduced by this utility.
