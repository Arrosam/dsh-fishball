# Current native host interface: DSH Web preview

Author: delegated host_bootstrap, GPT-6.1 Sol, high reasoning. Frozen code snapshot: `10723812a1f3a85425a5428212ee5febffa62e3d`. Verified 2026-10-04: official `@deepseek-ai/dsh@0.2.1-alpha.1`, public Cordis `4.0.5-alpha.1`, system Node `22.22.2`, built-in SQLite `3.53.2`. The owner selected the newest official published preview. Registry `latest` and `next` were `0.2.0-rc.2`; `alpha` was `0.2.1-alpha.1`, published 2026-10-03T04:53:22.343Z. The exact alpha pin is deliberate and is not described as the npm latest tag. No SDK runtime, DSH-X launcher or old-host shim is used.

The old Desktop report is preserved unchanged in [historical evidence](host-interface.desktop-historical.md). Its acceptance does not establish current Web support.

## Provenance and reviewed installation

The [official README](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md) identifies `npx @deepseek-ai/dsh web`, loopback `127.0.0.1:3080` and `--no-open`. The [CLI manifest](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/package.json), [CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md), [profile boot](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/src/profile-boot.ts), [home paths](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/home-paths/src/index.ts) and [safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md) were browser-verified. Changing master documents located the controls; actual published files establish the supported pin.

Canonical tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.1-alpha.1.tgz`, 24,302 bytes. SHA256 `857f93aa6c85cbd92be3422380e5516f236dc5c49cda0405a958cbdf1865e8db`; SHA512 matches registry integrity `sha512-DJ8pwG/XqzwDrYQTgJXuIga6ku153Z4vJI/B3MzNtudVCkDaOf4O2pUQh1ToroLHPPe4mxhhFeNJ7ttNculqMw==`. Published metadata declares MIT and the official repository/directory `deepseek-ai/deepseek-harness` / `apps/cli`, with no top-package engines or lifecycle scripts. Full versions, public source hashes and distribution metadata are in [host-runtime-provenance.json](host-runtime-provenance.json).

The initial normal-sandbox registry request failed `ENOTFOUND`; root then obtained approval for narrowly scoped official-registry acquisition. Successful pack/lock/install commands used an empty inherited environment, fixed PATH, explicit project user/global npm configs and cache, zero retries and 15-second request timeouts. They did not use personal npm configuration/log paths.

Executed commands, with explicit project configuration/cache arguments omitted here for readability:

```sh
npm pack @deepseek-ai/dsh@0.2.1-alpha.1 --ignore-scripts --json
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
```

The exact manifest and complete transitive lock are tracked as `scripts/dsh-web-runtime-package.json` and `scripts/dsh-web-runtime-lock.json`. Lock SHA256: `91b1d804426b61ff15317ce69c57d83ba14ac9add0acdd7b80b6a1f9086ee0ec`. There are 629 lock entries including root/all-platform optional packages; 560 installed packages. [Engine check](host-engine-check.json) inspected all 560 installed manifests: 183 declared Node engine ranges, zero failures against Node 22.22.2.

Before installation, all five lifecycle-flagged packages were acquired with scripts disabled and their scripts inspected:

| Published package | Reviewed action | Execution |
| --- | --- | --- |
| dsh-subprocess-local 0.2.1-alpha.1 | restore bundled spawn-helper executable bit | disabled |
| @google/genai 2.21.0 | empty preinstall echo | disabled |
| koffi 3.1.1 | native prebuild/build through cnoke | disabled |
| node-pty 1.2.0-beta.15 | prebuild check or node-gyp fallback; platform postinstall cleanup | disabled |
| protobufjs 7.6.6 | compatibility notice | disabled |

No lifecycle script was enabled to remedy a test. Actual Web boot succeeds with scripts disabled. Terminal/subprocess/native-addon and provider execution remain untested. `npm run host:setup` reproducibly performs the exact locked `npm ci`, with all scripts disabled; launch/test never silently downloads code. The root package is private and preview; its owner copyright license remains pending. Peer declarations describe official host requirements, without requiring root peer installation.

## Native API and fail-closed boundary

Installed public packages are under `.runtime/dsh-web/node_modules/@deepseek-ai`. `src/host-probe.mjs` checks exact CLI, Cordis, session, approval, Web app and Web server versions/source hashes; real imported Context/SessionStore/ApprovalService class identity; context `provide/effect/on`; session `create/get/list`; approval `request/effectivePolicy`; exact Node, an actual SQLite query and runtime-lock equality. Handmade contexts/version strings cannot pass. Required capability failure precedes Foundation/storage construction. Strict synchronous Standard Schema rejects unknown, hidden, accessor and proxy fields before intake.

The plugin injects native sessions/approval and publishes one effect-owned bubbles service. Every borrowed operation checks public Cordis fiber lifecycle, closing admission at disposal request before asynchronous cleanup. It adds no model tool, remote transport, worker, timer or operator authority.

Default native loading has no principal bridge: task operations fail `IDENTITY_UNAVAILABLE`. The same-process test factory samples, copies and freezes a trusted synthetic owner/workspace callback. Config and payloads cannot authenticate or override scope. Native operator deletion returns `OPERATOR_UNAVAILABLE`; no grant/revoke authority is published, and host permission remains deny-all. Web browser authentication does not create bubbles operator/principal authority.

Concrete installed worker/control findings for W2 are distinct from SessionStore persistence:

| Public package, version 0.2.1-alpha.1 | Installed interface | Evidence |
| --- | --- | --- |
| dsh-session | SessionStore create/get/list/prepare and session event facts | real public fixture; not an execution loop |
| dsh-agent | AgentRegistry create(options), resume(options), registered factory, scoped initiating-agent attribution and effect-owned handles | source inspected; not invoked |
| dsh-agent-loop | factory createAgent/resume; ReactLoopAgent send(message,target,wakeup), followup, steer, inject and cancel; cancel aborts the active phase and can preserve inbox | source inspected; not invoked |
| dsh-api-session-controller | native sessionController create/fork/cancel and live/cold session projections | source inspected; commands not invoked |
| dsh-tool-subagent | agent-scoped public tool composition via agent/preset/model-selection services and lifecycle events | source inspected; not invoked |

Extra source hashes are in provenance. These are W2 integration candidates, not inferred worker support from persistence. SDK and DSH-X are separate compositions, untested here; older global CLI/Desktop are outside the current target.

## Reproduction and actual profile

```sh
npm run check
npm test
npm run host:smoke
npm run host:web
npm run host:profile-smoke
```

Syntax check: 14 ESM files. Current unit suite: 109/109 pass; bootstrap 11/11 pass. Public-library smoke: 11 loads/10 reloads/11 distinct deduplicated synthetic entries, service removal/reappearance, malformed config and identity before storage, immediate held-reference disposal rejection, zero inference. That fixture never reads a DSH profile.

The actual runner executes official CLI `lib/bin.js --profile web --host 127.0.0.1 --port 3080 --no-open`. Its child inherits only fixed PATH, absolute project `DSH_HOME` and distinct project `DSH_AGENTS_HOME`, telemetry opt-out and read-only permission mode. Clean working directory `.runtime/dsh-web-workspace`, home `.runtime/dsh-web-home` and agents root `.runtime/dsh-web-agents` are controlled; cwd/home contain no `.env`; HOME/CODEX_HOME are not repurposed. The native profile stacks official dsh-base + dsh-web-app with a profile patch inserting owned `scripts/web-fixture.mjs`. Account/account-controller and automatic LLM title rows are disabled. Official URL printing/opening are disabled.

The trusted local observer owns a bubbles child fiber and synthetic identity, writes only allowlisted counters, and blocks attempted agent requests. It publishes no HTTP/operator endpoint. Synthetic browser access is an ephemeral mode600 private runtime file, deleted on disposal; raw tokens are excluded from durable evidence/logs/screenshots.

Normal-sandbox launch failed `listen EPERM: operation not permitted 127.0.0.1:3080`; approved narrow loopback execution succeeded. Normal-sandbox termination of the escalated runner was denied; reviewed termination of only the owned runner succeeded. Binding, personal-data boundaries and approval review were preserved. Initial observer property access without inject was corrected to public ad-hoc `ctx.get`, intentionally borrowing the child service to test disposal.

Ten actual profile HMR updates passed in one server PID: loads11/unloads10, one retained durable synthetic entry, all held stale references disposed, zero DSH sessions/inference attempts. Nonsecret snapshots: [web-profile-smoke.json](web-profile-smoke.json). Full graceful stop then exited0, left observer disposed at loads11/unloads11, deleted ephemeral access and removed the loopback listener. Independent same-profile restart verified a new process, one retained entry and firstDeduplicated=true, with zero sessions/inference attempts. Audit CR11 found chunk-split log redaction needed bounded per-stream line buffering: fixed and independently retested, including oversized-line suppression and final-tail redaction. Audit CR12 found the separate default user-agents skill root: bound supported DSH_AGENTS_HOME to a distinct project-local path. A regression calls only the actual published provider roots(undefined), never discovery/body reads, and confirms exactly the two controlled skill roots. The corrected final source was independently observed active with its project agents directory; final graceful shutdown then exited0. Independent final readback confirmed loads15/unloads15, disposed stale reference, one retained entry, zero sessions/inference attempts, no loopback listener and no private access file. Source hashes remained unchanged between active/stopped readbacks. Final runner SHA256: `30dbb53a9e00255cde51ce9bf79db21fd7287726ec9ef7cd6ec5065d97bf39cf`. The separate browser evidence owns those final readbacks.

## Support matrix

| Gate | Status |
| --- | --- |
| Official published preview provenance/transitive lock/engine checks | verified |
| Public native library lifecycle/reload10/default-deny identity and permission | passed |
| Actual isolated official Web boot/loopback/profile HMR reload10/graceful stop | passed |
| Web browser shell/authentication/plugin UI | blocked: independent IAB and native Chrome returned net::ERR_BLOCKED_BY_CLIENT; blocker screenshot only; no host UI capture/token access |
| Full process restart, retained ledger and final corrected-source graceful stop | independently passed; host left stopped |
| Trusted native principal/operator/permission bridge and action dispatch | pending; fail-closed |
| Provider/model/subprocess/tool/worker cancellation/session resume | source findings only; not executed |
| Bubbles task UI/full vertical slice/full MVP/stable release | outside M1; not claimed |

Final acceptance requires independent code/test review of the final tree and the separate actual browser/process-lifetime evidence. No dsh-std dependency/conformance adaptation was made; the owner withdrew that requirement before implementation.

Reproducible setup script itself was executed after stopping the server: exact locked npm ci added 560 packages in 7s, with all lifecycle scripts disabled and no engine incompatibility. Final source tests include log chunk/overflow redaction and actual isolated skill-root enumeration.
