# Initial-preview delivery checks — 2026-10-08

Version: **0.1.0-preview.1**. Local preview only; full MVP/stable/public release is not accepted. The final archive's BUILD-METADATA.json names its exact source commit; SHA256 is supplied in the external sidecar and delivery response.

October9 frontend follow-up: actual IAB confirms both blank-panel and worker-recovery fixes on codee495fa9/package sourcedd114ad. Worker status/catalogue reads work before/after reload, repeated selection and task refresh; catalogue reaches needs policy with execution disabled; zero console errors and unchanged tasks, no worker/model calls. [The frontend ledger](FRONTEND-VALIDATION-2026-10-09.md) retains exact candidate/report provenance and remaining RuntimeStore/Ollama blocker. Earlier NOT_RUN visual fields below are immutable historical receipt statements, not the current bounded frontend result. Full UI/worker/continuation/MVP acceptance remains open.

The runnable executable bytes were actually tested from commit `c805bb7bd9566766164150847df9c79f1af0feb7` in the extracted package. Final documentation packaging preserves those script and canonical product bytes. Its source identity differs only because these outcomes were added to README/design/work records. Original DSH Web0.2.1-alpha.1/Node22.22.2 on macOS arm64 is a separately installed prerequisite, not included or downloaded by this archive.

| Check | Actual outcome |
| --- | --- |
| First packaged attempt21120e9 | FAILED at workerCatalog, WORKER_PERSISTENCE_UNSUPPORTED; zero create/execute requests. Profile/task retained. |
| Corrected package hash/member verification | PASS,100 public files; pre-documentation archive SHA25641104c8ef74bc30bf5f632335cabb565817f66418ebdbb2e7c2062387e054135. |
| Original native CLI/authenticated HTML/storage | PASS; explicit owned setup, HTML200. |
| One deterministic native worker/result/finish | PASS; one execution, actual3018 synthetic units, exact result/source, worker stopped and reservation released. |
| Owned stop | Original SIGINT exit130/EOF; endpoint connection refused, launcher lock absent, state retained. |
| Same-profile restart | PARTIAL intermediate checks: ready setup, persisted task/stopped worker/execution/artifact metadata. Whole result-retrieval check FAILED: WORKER_RESULT_UNAVAILABLE. Zero execution replay. |
| Rendered UI/visual regression | NOT_RUN for this candidate; root has no supported callable browser. Prior native QA reported Mac locked. |
| Real inference/provider quality | NOT_RUN; cloud invocation rejected by automatic approval review. No retry. |
| Protected final CODE/full MVP acceptance | BLOCKED_UNCHANGED/open; this initial delivery does not close it. |

Use the live host lifetime to create and read a new synthetic result. Restart-safe result-content viewing remains an explicit limitation. Do not treat retained metadata as a readable result or an audit approval. No personal/old profile or3080 listener was used. Cancellation-requested old QA task4da34a6d remains NEVER_EXECUTE.

## Sanitized actual receipt

The minimum executable-path command returned exit0 (original request `cacbb8`, final `4d6e39`). The subsequent read-only restart command returned exit1 (`00e778`); diagnostic `9550d8` returned only WORKER_RESULT_UNAVAILABLE. These facts contain public references and synthetic digests, no authenticated URL/cookie, private context or raw host output.

```json
{
  "path": {
    "sourceCommit": "c805bb7bd9566766164150847df9c79f1af0feb7",
    "package": "0.1.0-preview.1",
    "profile": "df-initial-preview",
    "endpoint": "http://127.0.0.1:3091",
    "steps": [
      "status",
      "prepare",
      "confirm",
      "status",
      "list",
      "intake",
      "status",
      "prepareContext",
      "detail",
      "workerCatalog",
      "workerPolicyPreview",
      "workerPolicyConfirm",
      "workerPlan",
      "workerPreview",
      "workerGrant",
      "workerCreate",
      "workerQuery",
      "workerExecute",
      "workerQuery",
      "workerCapture",
      "workerResult",
      "workerFinish",
      "status"
    ],
    "requests": 25,
    "workerExecuteRequests": 1,
    "realModelRequests": 0,
    "visualValidation": "NOT_RUN",
    "nativeChildPid": 92795,
    "launchId": "d5c0156f-215b-4626-b1da-1e6140846c78",
    "clientDigest": "2df9592a085c65f01f104e552f52128d8a4657bb57ef4ba3592e2fdb89748d41",
    "nativePageHTTP": 200,
    "taskRef": "104bfb466a06ee5659f445139bb80244404f3cb2d78169ea295b498666ded774",
    "result": "PASS",
    "phase": "COMPLETE",
    "taskVersion": 4,
    "authEpoch": 1,
    "workerQuery": {
      "taskRef": "104bfb466a06ee5659f445139bb80244404f3cb2d78169ea295b498666ded774",
      "actionRef": "afae5e6b54eaafe700dcd7413045d0a954ccf7ed6d06dce7ab6d739922543369",
      "claimRef": "39193842244923104223ccea3574d6a0c646162d7965c8c14badb78841be6ef0",
      "generationRef": "dc4e8c5568d05b1e213d234a7547dc3433f7f101b1241f074ddd755bb867a656"
    },
    "artifactRef": "5eb379fdd08da7b1b34911196bf2ec082066e7b7b4ef5fbf630fb6ee45e93ad3",
    "artifactVersion": 1,
    "resultDigest": "eea263bf00e2dcd85715f9be268ec9113a31c2d893be0c015e2fbaa8e2a7e186",
    "inputDigest": "2fc9ec3ebb76fd853e0e3b36a944366a0faebdb30592c62db0a42bd326870af4",
    "executionRef": "d3877480a249e8bf3a574ce0ff95cd8bd31635182618d7ea87c3ab0ac4518f2e",
    "executionUsage": {
      "accounting": "df-testing-utf8-byte-units/v1",
      "state": "actual",
      "units": 3018
    },
    "reservationReleased": true,
    "workerStopped": true,
    "artifactCount": 1,
    "executionCount": 1,
    "verification": "not-reviewed",
    "delivery": "not-requested",
    "observedAtUTC": "2026-10-08T16:10:40Z"
  },
  "restart": {
    "sourceCommit": "c805bb7bd9566766164150847df9c79f1af0feb7",
    "package": "0.1.0-preview.1",
    "profile": "df-initial-preview",
    "endpoint": "http://127.0.0.1:3091",
    "workerExecuteRequests": 0,
    "realModelRequests": 0,
    "visualValidation": "NOT_RUN",
    "nativeChildPid": 92851,
    "launchId": "ccc3419e-15bc-49a8-bdb9-b68f2cf2d754",
    "clientDigest": "2df9592a085c65f01f104e552f52128d8a4657bb57ef4ba3592e2fdb89748d41",
    "result": "FAILED",
    "phase": "workerResult",
    "code": "RPC_REFUSED",
    "requests": 6,
    "observedAtUTC": "2026-10-08T16:12:44Z",
    "classifiedCode": "WORKER_RESULT_UNAVAILABLE",
    "passedIntermediateChecks": [
      "authenticated_native_HTML_200",
      "storage_ready",
      "one_persisted_task",
      "one_stopped_worker",
      "one_execution",
      "one_artifact"
    ]
  }
}
```

## Reproduce the package and launch

Build from the exact source tree identified by BUILD-METADATA; the destination directory must exist and its filename must be fresh. The commit argument labels this tree and does not perform a checkout. This explicit selection includes the design, workflow, decisions, scope, public contracts, all local tickets/acceptance criteria and delivery records. Complete historical detailed evidence stays in the local Git repository.

```sh
/opt/homebrew/bin/python3 -I scripts/package-initial-preview.py \
  --commit <BUILD-METADATA.sourceCommit> --date 2026-10-08 \
  --output /absolute/fresh/dsh-fishball-0.1.0-preview.1-initial.tar.gz \
  --include docs/decisions.md \
  --include docs/development-workflow.md \
  --include docs/three-stage-development.md \
  --include docs/compatibility.md \
  --include docs/runtime-installation.md \
  --include docs/foundation-contract.md \
  --include docs/runtime-api.md \
  --include docs/runtime-automation-api.md \
  --include docs/native-preview-api.md \
  --include docs/onboarding-contract.md \
  --include docs/onboarding-native-carrier-addendum.md \
  --include docs/normal-worker-contract.md \
  --include docs/normal-worker-resume-contract.md \
  --include docs/normal-memory-continuity-contract.md \
  --include docs/normal-events-contract.md \
  --include docs/normal-results-contract.md \
  --include docs/normal-runtime-audit-contract.md \
  --include docs/event-adapter-api.md \
  --include docs/fishball-provenance.md \
  --include docs/rename-compatibility.md \
  --include docs/acceptance-traceability.md \
  --include docs/owner-amendment-2026-10-04.md \
  --include docs/owner-amendment-2026-10-07-ollama.md \
  --include docs/owner-initial-preview-2026-10-08.md \
  --include docs/tickets/README.md \
  --include docs/INITIAL-PREVIEW-DELIVERY.md \
  --include docs/waves.md \
  --include docs/tickets/BUB001.md \
  --include docs/tickets/BUB002.md \
  --include docs/tickets/BUB003.md \
  --include docs/tickets/BUB004.md \
  --include docs/tickets/BUB005.md \
  --include docs/tickets/BUB006.md \
  --include docs/tickets/BUB007A.md \
  --include docs/tickets/BUB007B.md \
  --include docs/tickets/BUB008.md \
  --include docs/tickets/BUB009.md \
  --include docs/tickets/BUB010.md \
  --include docs/tickets/BUB010A.md \
  --include docs/tickets/BUB011.md \
  --include docs/tickets/BUB012.md \
  --include docs/tickets/BUB013.md \
  --include docs/tickets/BUB014.md \
  --include docs/tickets/BUB015.md \
  --include docs/tickets/BUB016.md
```

```sh
/opt/homebrew/opt/node@22/bin/node scripts/initial-preview.mjs \
  --host-root /Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/dsh-web
```

The launcher owns127.0.0.1:3091, the private df-initial-preview profile and its original CLI child. Its private `.runtime/initial-preview/private/current-launch.json` points to the local access handoff; keep all authenticated URLs and credentials private. Ctrl+C stops the owned host and retains state. Do not precreate state or clear another launcher's lock. No daemon/remote/listener bypass is introduced. See [the design](INITIAL-PREVIEW.md), [work log](INITIAL-PREVIEW-WORKLOG.md) and later acceptance checklist before continuing.


## Result-reopening follow-up — current corrected executable

Initial Library version0 and its FAILED restart-content record above remain historical. The owner authorized this one practical correction after delivery. Diagnosis showed the cryptoVersion2 artifact/index/data survived restart and remained readable through the scoped detail API; the installed workerResult incorrectly required a lifetime-local captures Map entry before reading it.

Executable source **9f23122eed4ff63e0208944cd35d9c83e31b0865** changes only workerResult. It reads the scoped immutable artifact/data, verifies the closed envelope and content/digest/byte bounds, binds persisted worker/action/execution metadata and rechecks scope/CAS and the unchanged binding. Any present live receipt must still agree. No schema, transcript, key, protected core, native handle, stream or recapture change is needed. Four targeted pure installer tests passed; independent CODE and separate ISTQB reviews found no blocking issue for this changed path.

The actual packaged original-CLI path passed one synthetic task/create/execute/capture/result/finish. Owned stop completed exit130/EOF and the endpoint/lock were gone. Same exact profile/package restart and stored-result reopening **PASSED**: exact113-byte content, artifact record/digest and complete source object matched; only six read-only calls, zero execution/capture replay, zero real-model calls. A stopped worker and one execution/artifact remain. This does not prove native worker continuation, full visual/recovery acceptance or independently reviewed/delivered content.

```json
{
  "path": {
    "sourceCommit": "9f23122eed4ff63e0208944cd35d9c83e31b0865",
    "package": "0.1.0-preview.1",
    "profile": "df-initial-preview",
    "endpoint": "http://127.0.0.1:3091",
    "steps": [
      "status",
      "prepare",
      "confirm",
      "status",
      "list",
      "intake",
      "status",
      "prepareContext",
      "detail",
      "workerCatalog",
      "workerPolicyPreview",
      "workerPolicyConfirm",
      "workerPlan",
      "workerPreview",
      "workerGrant",
      "workerCreate",
      "workerQuery",
      "workerExecute",
      "workerQuery",
      "workerCapture",
      "workerResult",
      "workerFinish",
      "status"
    ],
    "requests": 25,
    "workerExecuteRequests": 1,
    "realModelRequests": 0,
    "visualValidation": "NOT_RUN",
    "nativeChildPid": 93908,
    "launchId": "6aae3481-a397-491c-b1af-f0ff371415f1",
    "clientDigest": "2df9592a085c65f01f104e552f52128d8a4657bb57ef4ba3592e2fdb89748d41",
    "nativePageHTTP": 200,
    "taskRef": "d441229fe6b8e238ec39dd79b592b12a485046bdca200cfd189ff2d9aa99989f",
    "result": "PASS",
    "phase": "COMPLETE",
    "taskVersion": 4,
    "authEpoch": 1,
    "workerQuery": {
      "taskRef": "d441229fe6b8e238ec39dd79b592b12a485046bdca200cfd189ff2d9aa99989f",
      "actionRef": "4e7ae0c19c1a1ee771cff08e9dffa330ce5f4e712ad1cb8fc84076350631bc82",
      "claimRef": "ec3a0e2b6d5c069dce498843d625067236c548b179a066f41ae0f7711ff7c7d0",
      "generationRef": "64a0ef989096b7d4f3e05dc5b864636e982a3852aa29f9ebd8213417329234fe"
    },
    "artifactRef": "d899cd1716d9b380b64e8621b3b2656eb65edbdfde62a5a169347787ba23f3c9",
    "artifactVersion": 1,
    "artifactDigest": "b4478aee758f2b35d7f707ae2f489bb2dab6f8e84dccba929e2308e9d6478e89",
    "artifactRecordRef": "1c6a9e4559763d7b70e8f1aed22ac6c4629824a4e622d8f9c0751219dfe64bb4",
    "resultSource": {
      "actionDigest": "b7956f00c94e8fd4add8f493622675cd2138d59c2f7c81f05f22dfca11c2ca3f",
      "actionRef": "4e7ae0c19c1a1ee771cff08e9dffa330ce5f4e712ad1cb8fc84076350631bc82",
      "claimRef": "ec3a0e2b6d5c069dce498843d625067236c548b179a066f41ae0f7711ff7c7d0",
      "cursor": 9,
      "executionRef": "7a0deaf59704b324258e24f7049305a49543ba720601140c9620c74d5c90f784",
      "generationRef": "64a0ef989096b7d4f3e05dc5b864636e982a3852aa29f9ebd8213417329234fe",
      "inputDigest": "68fbb52158fbbde20b445547e2ab0b18145e2c81e7733ef7e70dfa0a842eacee",
      "resultDigest": "ba66c85ca547bc0e6001c5cb4d406a5b3ed67aeacf1238904a251f64a3ba1e8f",
      "sessionRef": "1eacaa34b1e33ff9989fd03d3888d8eb1f0256745b45afc85174a5a0aad52429",
      "taskRef": "d441229fe6b8e238ec39dd79b592b12a485046bdca200cfd189ff2d9aa99989f"
    },
    "resultBytes": 113,
    "resultDigest": "ba66c85ca547bc0e6001c5cb4d406a5b3ed67aeacf1238904a251f64a3ba1e8f",
    "inputDigest": "68fbb52158fbbde20b445547e2ab0b18145e2c81e7733ef7e70dfa0a842eacee",
    "executionRef": "7a0deaf59704b324258e24f7049305a49543ba720601140c9620c74d5c90f784",
    "executionUsage": {
      "accounting": "df-testing-utf8-byte-units/v1",
      "state": "actual",
      "units": 3018
    },
    "reservationReleased": true,
    "workerStopped": true,
    "artifactCount": 1,
    "executionCount": 1,
    "verification": "not-reviewed",
    "delivery": "not-requested",
    "observedAtUTC": "2026-10-08T16:36:09Z"
  },
  "restart": {
    "sourceCommit": "9f23122eed4ff63e0208944cd35d9c83e31b0865",
    "package": "0.1.0-preview.1",
    "profile": "df-initial-preview",
    "endpoint": "http://127.0.0.1:3091",
    "workerExecuteRequests": 0,
    "realModelRequests": 0,
    "visualValidation": "NOT_RUN",
    "nativeChildPid": 93984,
    "launchId": "ac7b4baa-3f2b-43fc-9bf1-afef6145bf93",
    "clientDigest": "2df9592a085c65f01f104e552f52128d8a4657bb57ef4ba3592e2fdb89748d41",
    "result": "PASS",
    "phase": "COMPLETE",
    "setup": "ready",
    "taskRef": "d441229fe6b8e238ec39dd79b592b12a485046bdca200cfd189ff2d9aa99989f",
    "taskVersion": 4,
    "authEpoch": 1,
    "artifactRef": "d899cd1716d9b380b64e8621b3b2656eb65edbdfde62a5a169347787ba23f3c9",
    "artifactVersion": 1,
    "resultDigest": "ba66c85ca547bc0e6001c5cb4d406a5b3ed67aeacf1238904a251f64a3ba1e8f",
    "artifactDigest": "b4478aee758f2b35d7f707ae2f489bb2dab6f8e84dccba929e2308e9d6478e89",
    "artifactRecordRef": "1c6a9e4559763d7b70e8f1aed22ac6c4629824a4e622d8f9c0751219dfe64bb4",
    "resultSource": {
      "actionDigest": "b7956f00c94e8fd4add8f493622675cd2138d59c2f7c81f05f22dfca11c2ca3f",
      "actionRef": "4e7ae0c19c1a1ee771cff08e9dffa330ce5f4e712ad1cb8fc84076350631bc82",
      "claimRef": "ec3a0e2b6d5c069dce498843d625067236c548b179a066f41ae0f7711ff7c7d0",
      "cursor": 9,
      "executionRef": "7a0deaf59704b324258e24f7049305a49543ba720601140c9620c74d5c90f784",
      "generationRef": "64a0ef989096b7d4f3e05dc5b864636e982a3852aa29f9ebd8213417329234fe",
      "inputDigest": "68fbb52158fbbde20b445547e2ab0b18145e2c81e7733ef7e70dfa0a842eacee",
      "resultDigest": "ba66c85ca547bc0e6001c5cb4d406a5b3ed67aeacf1238904a251f64a3ba1e8f",
      "sessionRef": "1eacaa34b1e33ff9989fd03d3888d8eb1f0256745b45afc85174a5a0aad52429",
      "taskRef": "d441229fe6b8e238ec39dd79b592b12a485046bdca200cfd189ff2d9aa99989f"
    },
    "resultBytes": 113,
    "resultContentMatches": true,
    "resultSourceMatches": true,
    "artifactDigestMatches": true,
    "persistedTaskCount": 1,
    "persistedArtifactCount": 1,
    "persistedExecutionCount": 1,
    "workerPhase": "stopped",
    "nativePageHTTP": 200,
    "requests": 6,
    "observedAtUTC": "2026-10-08T16:38:15Z"
  }
}
```

The code above is the exact checked revision; final archive BUILD-METADATA identifies its later documentation-only packaging commit. The old failing package/profile is preserved. Current original CLI child PID93984, launcher PTY22011, profile df-initial-preview, endpoint127.0.0.1:3091, is ready in `.runtime/result-reopen-package-9f23122/dsh-fishball-0.1.0-preview.1-initial-preview/`. Its private `.runtime/initial-preview/private/current-launch.json` is the local browser handoff; no private URL/credential is included here. Root owns this foreground launcher until handoff/stop. A fresh task is required for additional execution cases; the stopped smoke recordd441229f is retained.


