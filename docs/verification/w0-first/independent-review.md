# Independent review record

Date: 2026-11-09. Reviewer: separate requirements/test-only agent `afa46ac5-8459-4f67-a1ef-b16edcb00108`. This record preserves its reported findings; reviewer did not execute runtime tests or read product implementation.

## Reviewed scope

- Exact approved design `15d6f1f`, amended test `ab24c84`; budget authority `9cafd92` only in its WD scope.
- [Approved inventory](<../../test-design/instance-ext-w0-inventory.json>) and all three local task files: X0-C **95 executable / 9 TODO**, FN-1 **10 / 3**, B1 **10 / 10**. Generated vectors count as registered bodies, not assertions. No count mismatch.
- Test-only correction `720e680`, then final [X0-C test](<../../../packages/instance/test/instance-ext/x0-c.test.mjs>) / [harness](<../../../test/support/instance-ext.mjs>) candidate committed as `c38b97e`.
- [Actual Cordis supplement](<../../../test/verification/w0-cordis.test.mjs>), [host Session supplement](<../../../test/verification/w0-host-session.test.mjs>) and supplied TAP evidence, committed as `79274fc`.

## Independent author provenance

- Warning observer correction: requirements-only author `482ce582-61af-4f48-977e-1c0ac104c3ce`; inspected approved requirements, test and repro JSON, no product implementation.
- Required payload / image fixture correction: requirements-only author `5a73c431-24fc-4834-a9f7-9a3d09ef141d`; inspected connector contract, test/support and installed attachment API declarations, no product implementation.
- Cordis supplement: requirements-only author `f080f6c7-098a-4f51-b691-d88349e9ea4f`; installed Cordis APIs and public row imports, no product source read to derive expectations.
- Session supplement: requirements-only author `e7f45cb0-77d6-4c73-b6f6-de190c68fde9`; X11, tests/support and installed public Session/LLM APIs, no product implementation.
- Parent independently investigated product causes and committed their test-only candidates. Reviewer was separate from all authors and parent; no product implementation or runtime execution by reviewer.

## Final code/test-candidate conclusion

**No material concern with the final test-only corrections or supplementary verification source.**

1. Warning delta is observed before registration and stays exactly +1 after create/resume; healthy setup still applies after resume. No binding to implementation log text/logger name, no requirement relaxation.
2. Required `attachments: []` is backed by the approved [connector contract](<../../connector-contract.md#L297-L306>), not tailored from product output.
3. All six image-send cases use the same opt-in peripheral; storage methods fail if called and post-test zero-call audit catches swallowed failures. The real public image service/bridge path remains the observation point. No test-authored image storage/upload/model success; original exact request/result/no-retry checks remain. Other harness callers retain absent-store behavior.
4. Cordis evidence correctly distinguishes actual framework ACTIVE/PENDING/DISPOSED from DSH profile/bundle-loader or real agent evidence. Dynamic row imports occur after the network tripwire and explicit SDK check. Supplied final TAPs are 6/6 per SDK, not twelve unique approved cases.
5. Session supplement replaces only the host Session boundary, preserves read-only/order/source checks, never invents `event.at`, and leaves finite/exact timestamp checks red. The failed parent and two dependent timestamp failures are **one X11 defect**, not three. Counts remain separate from the approved task inventory.

## Acceptance/evidence caveats retained

- Async setup awaiting/rejection/disposed completion remains X0-C-owned TODO; dynamic context remains X0-C/X-E2E. Existing fake harness does not await setup before agent publication and cannot certify these by synchronous passes.
- Valid array-image order/preparation/no-partial-turn remains X0-C local ownership even though the inherited TODO labels only X0-I/FN-6. The latter own the wire-ack continuation.
- Original B1 fractional recent-done count assertion and package patch-loading/withdrawn-API assertions had smaller gaps. Parent supplementary checks/static inspection are separately labeled; no install or full loader evidence inferred.
- Missing WD/MCP implementations are not task defects. No exactly-once wake conclusion from fake followup counts. Complete X0-C acceptance remains not ready with the X11 defect and its local deferred obligations.

The reviewer conditionally approved report/triage/commands/provenance before final job collection, with no material concern; it explicitly did not certify then-unfinished expected counts. Parent subsequently collected both complete final task jobs and reconciled all 137 IDs/TODO states on each SDK: X0-C 94 pass / 1 fail / 9 TODO, FN-1 10 / 0 / 3, B1 10 / 0 / 10. Only XC-EP-V-05 remains failed. Reviewer then inspected both completed final TAP tails/exit files, result totals and final Markdown and **approved the final report/evidence summary with no material correction remaining**. This is evidence review, not its own test rerun or product-source inspection. The [final per-case results](<results.json>) remain parent execution evidence. No partial run is accepted as the final result.
