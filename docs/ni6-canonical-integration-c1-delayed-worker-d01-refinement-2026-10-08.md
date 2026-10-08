# D01 exact operations and closed responsiveness refinement

This root selection refines the existing4,794-byte D01 selection (SHA25607eb478d44e470400566abd80cd67183eb6852854054a757f79ec8c4aedb52a5). No D01 source or actual namespace existed at the investigator/author preflight. Both selections must be pinned. This remains SOURCE_ONLY/NOT_RUN preparation, with independent reviews and root once execution still pending. It does not change canonical code, policy or any consumed fixture.

The exact ordered authenticated operation POSTs are:

```text
01 /df-setup status
02 /df-setup prepare
03 /df-setup confirm
04 /df-setup status
05 /df-rpc list
06 /df-rpc intake(A)
07 /df-rpc status(A baseline)
08 /df-rpc prepareContext(A old)
09 /df-rpc detail(A old)
10 /df-rpc workerCatalog
11 /df-rpc workerPolicyPreview
12 /df-rpc workerPolicyConfirm
13 /df-rpc workerPlan(A)
14 /df-rpc workerPreview
15 /df-rpc workerGrant
16 /df-rpc workerCreate
17 /df-rpc workerQuery(A ready)
18 /df-rpc workerExecute(A; leave pending)
19 /df-rpc status(A pending)
20 /df-rpc intake(B)
21 /df-rpc revise(A; exact CAS, reason operator)
22 /df-rpc status(A corrected)

Release bounded gate; await original execute settlement.

23 /df-rpc workerCapture(old CAS; expected STALE_VERSION)
24 /df-rpc workerQuery(A truthful unknown)
25 /df-rpc prepareContext(A current)
26 /df-rpc detail(A corrected)
27 /df-rpc control(A pause)
28 /df-rpc workerQuery(A stopped)
29 /df-rpc status(A stopped; reservation held; no artifact)
```

These29 operation POSTs plus the existing post-removal404 status POST and one original authentication GET yield exactly31 HTTP. There is no final status(B) call; operation20 must assert its accepted queued intake. The additional post-pause query28 independently observes the original worker binding and stopped phase, accompanied by original agent/session absence before entry removal. Status29 observes durable stopped facts and the still-held reservation. No query proves usage, release or a subsequent corrected worker execution.

Select a separate named `responsiveness.json` as the sixth public evidence record, rather than enlarging the existing1,024-byte main diagnostic. It has exactly16 fields: contractVersion, result, statusBeforeMs, statusBeforeOk, intakeMs, intakeOk, reviseMs, reviseOk, statusAfterMs, statusAfterOk, nodeVersion, platform, kernelRelease, arch, cpuCount, totalRamBytes. Contract version is `df.d01-responsiveness/v1`; result is PASS or FAILED_HOLD. Each latency is an integer ceil(send to fully decoded response milliseconds)0..30000, or null if no decoded return. Flags start false and become true only after the exact domain assertion plus original-agent-running, execute-unsettled and gate-held facts at both send and decoded response. Freeze these observations at release or first terminal; late callbacks cannot promote them.

Responsiveness PASS requires all four flags true and all four finite observed latencies, with complete environment identity. **Do not impose an additional measured latency<=2000 PASS threshold.** Preserve the original2-second RPC guards and bounded4,000ms maximum stream gate, all clamped to the original work deadline. Those experiment bounds and observed values do not establish a calibrated product SLA or full BUB002-04 performance acceptance. The investigator's earlier suggested2,000ms scalar threshold is superseded by this explicit root decision.

Observe environment through original Node public process/os interfaces: nodeVersion=process.version (PASS exact v22.22.2), platform=process.platform (PASS darwin), kernelRelease=os.release(), arch=process.arch, cpuCount=os.cpus().length (integer1..1024), totalRamBytes=os.totalmem() (integer1..9007199254740991). Darwin kernel release is not marketing macOS version. Allow null environment fields only for FAILED_HOLD. Node string grammar is ASCII[A-Za-z0-9._+-]{1,32}; platform/arch ASCII[a-z0-9_]{1,16}; kernel ASCII[A-Za-z0-9._+-]{1,64}. Publish no hostname, username, CPU model, private paths, URLs, credentials, response/error/context content or private state.

Use independent record cap1,024/read1,025, O_EXCL/O_NOFOLLOW/0600, ownership/identity/fsync/readback and the same original deadlines. The finite grammar forecast is at most465 compact or530 pretty bytes including LF, not an actual file identity. Add a strict exact-schema responsiveness decoder beside the original diagnostic decoder; reject duplicates/NaN and invalid strings/numeric/null/PASS combinations. Decode after the original EOF/group-absence gates, require both D01 main PASS and responsiveness PASS, publish validated partial/failure observations in the same original finally window and record the object in the explicitly revised executor schema. Root's eventual closed proof/copy routine must name, validate and seal all six records, including cross-equality to the executor object.

Explicitly replace W01's positive committed-result/adoption/finish/released-reservation PASS predicates with D01's safety-negative truth. Report the actual public committed-or-unknown execute envelope without forcing committed. The old-CAS capture must refuse without an adopted artifact; correction remains current, the original worker is factually stopped/absent after pause and the reservation remains held. Keep factual original stop, context-owned agent/session absence, disposal/Loader-removal/post404 and all original process/EOF/group/currentness/signal guards. Do not fabricate finish, release, charges, receipt authentication, instant cancellation or arbitrary-effect exactly-once evidence.

Any unsupported ordering, ordinary API refusal, timeout or source-derived accounting discrepancy must be reported before sealing; do not drop calls or broaden caps/policy. Protected capture/finish implementations are not inspected or changed; use only ordinary public consumer APIs. No browser/private/cloud/model/shared3080/Git action is selected. The later corrected-request/resume/result journey and full87 acceptance remain open.
