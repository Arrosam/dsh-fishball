# W0 first verification — failure triage

Date: 2026-11-09. Product snapshot: merge `c8aecc7a398f339842523115bd983802689d0279`. No product edits.

Initial approved three-file run on each installed SDK registered all 137 unique IDs: X0-C 83 pass / 12 fail / 9 TODO, FN-1 10 / 0 / 3, B1 10 / 0 / 10. Neither SDK had a skipped/cancelled case. Initial TAP is preserved; it is not replaced by corrected results.

| Initial failure IDs | Count/version | Classification | Evidence and disposition |
| --- | ---: | --- | --- |
| XC-UC-01-E1 | 1 | Test observer defect | All-child warning count includes a pre-existing image-service boot warning. Repro is 1 before setup, 2 after create, 2 after resume, healthy setup on both. Local test-only commit `720e6808469d19b1973dcab5daaff93a29094672` measures +1 delta and retains healthy-create/adds healthy-resume assertion. Targeted retest passes on both. |
| XC-UC-03-M1/M2, XC-DT-OFF-message_session/redirect_session | 4 | Test oracle defect | Exact expected wire payload omitted `attachments: []`, although the approved connector contract §4.1 requires `attachments[]` on both message and redirect. Product preserves the existing required field, target and message. Correction must preserve exact request/result checks, not strip the required field from product. |
| XC-UC-03-A1/A2, XC-DT-OFF-IMAGES-1/2, XC-DT-02, XC-EP-IMAGE-01 | 6 | Test fixture/precondition defect | Safe harness intentionally supplies no attachment store and does not expose `ctx.attachments`; image-service construction therefore refuses before the tested send method exists. These cases must opt into a host-shaped in-memory peripheral, whose methods fail if used: empty/omitted lists must not fetch/store/upload any attachment. No image implementation belongs in test code. |
| XC-EP-V-05 | 1 | Confirmed product defect, X11 | `manager.userTexts()` returns user-authored strings but no finite `at`. Product maps `event.at`, while both installed host Session APIs expose numeric `event.time`. Detached real `Session.create` + `Session.append` reproduction confirms the public timestamp is omitted on both SDKs. Do not weaken the finite timestamp requirement. |

## Final disposition

Complete final reruns on both SDKs confirm **X0-C 94 pass / 1 fail / 9 TODO, FN-1 10 / 0 / 3, B1 10 / 0 / 10**. Only `XC-EP-V-05` remains red. The eleven test-side initial failures pass after separate test-only commits; no product code changed. All 137 approved IDs/TODO states reconcile. See [final results](<results.json>) and [report](<report.md>).

## Minimal reproductions

### Setup log observer

Use the approved safe `bootChild` fixture, capture its warning count before registering a throwing callback and a healthy neighbor, open chat, remove the fake live agent and open chat again. The stored JSONs show exactly one additional setup warning and healthy create/resume registration. This is not real agent/model-loop evidence.

### Required wire attachments

Run only `XC-UC-03-M1` with the selected SDK. Expected pre-correction assertion omits `attachments`; observed request includes required empty `attachments: []`. Compare against connector contract §4.1, not against implementation to set the oracle. Disabled and enabled-but-not-ready paths share the same issue; no WD implementation is needed.

### Image fixture

Run only `XC-UC-03-A1` with the original fixture. `fishballImages` is absent, and the fixture logs image service unavailable before the send assertion. Opt-in peripheral construction is a fixture prerequisite, not a product fix. Empty-list tests must still prove exactly one `session.message`, no attachment operation, and unchanged response/refusal.

### X11 real Session API

1. Boot child rows with the existing safe fixture and activate its fake manager.
2. Create a detached in-memory `Session` from the explicitly selected installed `@deepseek-ai/dsh-session`; append `createUserMessage({content:[{type:'text',text:'user-authored host session event'}],source:{kind:'user'}})` with `{surfaceOp:'append'}`.
3. Supply that real session's `snapshotEvents()` at the manager boundary, then call public `manager.userTexts({limit:1,maxChars:100})`.
4. Expected `at === event.time`, a finite epoch-millisecond timestamp. Actual public object has text only; `Number.isFinite(at)` is false on both hosts.

Evidence: [rc.5 host-event reproduction](<evidence/usertexts-host-session-repro-0.2.1-rc.5.json>) and [rc.1 counterpart](<evidence/usertexts-host-session-repro-0.2.2-rc.1.json>). This uses actual installed Session event construction/validation, but no persistence plugin, real Agent service, model call or real wake. Product cause: [timestamp projection:174](<../../../packages/instance/src/slim/child/extensions.js#L174>).

## Scope/evidence cautions

- Existing fake agent setup is not awaited by the harness; approved async policy A, dynamic-context lifecycle, durable acceptance-lost receipt/quiet recovery remain TODO, not passes.
- Valid array-image preparation/order/no-partial-turn TODO needs X0-C local ownership, not only X0-I/FN-6 wire-ack owners.
- No WD package implementation or MCP-S1/S2/S3/K1 runtime was required/run. Their absence is separately out of scope, not a defect in these tasks.
- No exactly-once real wake assertion is inferred from fake followup counts. MCP-S2 remains the owner of real delivery/wake investigation.
- Supplementary Cordis initial rc.5 warning-count failure was its exporter severity threshold, not product activation: setting the test-owned exporter to DEBUG exposes warnings on both Cordis generations. Corrected six-body checks pass on both; original exploratory logs remain labeled as superseded.
