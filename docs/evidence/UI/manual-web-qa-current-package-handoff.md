# Parallel manual Web QA handoff — installed a58c522 package

Prepared by root on 2026-10-05. The owner explicitly requested manual Web regression in parallel with coding and code review, using simulated models. This handoff is for the separate Luna xhigh Mac child cloud thread `01a10a1b-eb23-7049-b0cd-f0e365cf8093`. It is neither a final acceptance result nor permission to repeat the blocked receipt/envelope investigation.

## Immutable runnable inputs

- Repository: `/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball`; working branch `feat/S3-integrations`, root checkpoint `7df1c2cfae04b5b24c63c78a943b0c6a7711263c`.
- **Installed product revision is a58c522**, independently frozen from the actively edited repository. Archive: `.runtime/ni2-install/artifact/dsh-fishball-0.1.0-preview.1.tgz`; SHA-256 `fa3fb398d901a5c3d04d1f6f949878eb190f1d1fb737b16210347963d0afb5c0`.
- Actual installed package directory: `.runtime/ni2-install/home/profiles/web/node_modules/dsh-fishball`. Source archive: `.runtime/ni2-install/source-a58c522`. Do not assume the current root source is the installed product.
- Original official DSH Web 0.2.1-alpha.1 CLI: `.runtime/ni2-install/host/node_modules/@deepseek-ai/dsh/lib/bin.js`. Exact host dependency lock: `.runtime/ni2-install/host/package-lock.json`, SHA-256 `68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3`.
- Node: `/opt/homebrew/opt/node@22/bin/node`, 22.22.2 arm64. Existing installed package and host dependencies can be reused read-only; no new network dependency installation is needed.
- Historical package/archive pin evidence: `docs/evidence/NI2/physical-worker-runs/final-file-pin-check.json`. Recheck the archive and relevant installed files before using them, and record current QA pins separately.

All relative paths above are under the repository. Root and coding agents will not rebuild, replace, reset or delete this installed package or the QA child's frozen fixture during the run.

## Exclusive fixture and listener ownership

The UI QA child owns a **new** `.runtime/ui-qa-a58c522/` fixture, its own `home/profiles/web`, `workspace`, `agents`, `private`, and `evidence` directories, and the original CLI listener at `127.0.0.1:3080`. Verify the fixture does not already exist and the listener is free before preparing it. If an existing owner occupies either, report that exact conflict and coordinate; do not stop an unrelated process, reuse another profile, change port/alias or proxy the browser.

Do not start `.runtime/ni2-install/physical/launch.mjs`: it targets the original preserved NI2 profile. Do not copy the original `df-data`, auth material, signing keys, database, session JSONL, cookie or private logs into QA. That original fixture is recovery evidence and remains untouched.

For a new profile, reuse the pinned original `node_modules` graph read-only (or make an isolated local copy without changing its files), the original `cordis.yml` empty root and `package.json` profile bundle declarations. Adapt the original `home/profiles/web/cordis.patch.yml` configuration **as source only**: replace every NI2-owned filesystem path with the QA fixture path; remove the two physical diagnostic observer registrations; create a fresh synthetic credential through the original supported AuthService/LocalCredentialProvider interface. Do not read or borrow previous browser credentials. Retain all other safety gates and disabled external-provider/account/telemetry/instruction/scheduler entries. Freeze and inspect the adapted configuration before launch.

The profile must retain the verified `df-read-only` permission preset (`sandbox: read-only`, `approval: never`) and `df-ni2-empty` agent preset (no tools). Use only `df-testing-local` / `df-testing-worker-v1`; request cap 8192 bytes, output/result cap 128 bytes, synthetic per-attempt usage 8320/runtime 1000, aggregate usage 20000/runtime 10000/external cost zero, and one active/attempt/total attempt. Memory caps are 65536 bytes/8192 tokens; metadata cap 4096 bytes. Original native transcript storage is unencrypted, compression `none`, owner-managed, and must remain inside the QA profile. Storage setup and worker policy/action confirmations are explicit owner decisions in this synthetic UI exercise.

## Supported start shape

Launch the original CLI with Node and these literal arguments, from the new QA workspace:

```
/opt/homebrew/opt/node@22/bin/node /Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ni2-install/host/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --host 127.0.0.1 --port 3080 --no-open
```

Supply a minimal environment: `PATH=/opt/homebrew/bin:/usr/bin:/bin`, `DSH_HOME=<QA fixture>/home`, `DSH_AGENTS_HOME=<QA fixture>/agents`, `DSH_TELEMETRY_DISABLED=1`, `DSH_PERMISSION_MODE=read-only`. Check canonical owned paths and reject `.env` files in the QA home/workspace. Use an owned wrapper to keep raw host output private; publish sanitized status/byte counts, never credential-bearing URL/query/logs. The established NI2 wrapper is a readable example of original CLI spawning and owned signal forwarding; it must not be run or edited for QA.

The original loopback CLI action is authorized. If the exact start needs sandbox escalation, request only that bounded original command/loopback action through auto-review. Stop and report a denied action; do not change tools, ports, routing, hostname or execution environment to evade it.

First verify available **supported browser automation tools** in the UI child environment. Prior attempts lacked a browser tool and original 3080 access returned `ERR_BLOCKED_BY_CLIENT`. This is historical blocked evidence, not permission to use alternate browser ports, aliases, proxies, CDP, AppleScript, screen capture or a different environment. If the same supported surface remains blocked, record the exact tool/action/error and continue only unaffected static accessibility/test design work. Do not report manual Web PASS from a mocked model or source inspection.

## Implemented UI inventory for this package

Actual renderer source is the installed `src/client-entry.cjs`, especially `setupCard`, `workerCard`, and `Panel` (roughly lines 479–619). Inspect current exact lines before selecting tests.

1. **Local storage setup:** cached status, setup location/ownership/encryption description, preview, exact-plan acceptance checkbox, explicit confirmation, expiry/changed preview refusal, unavailable/recovery/offline messages.
2. **Tasks:** create a bounded goal, task list/select, current task status/version/approval epoch, refresh, goal/constraints, task revision, interruption questions and complete answer submission, pause/continue/cancellation request. Cancellation is a request until host facts confirm it.
3. **Native worker:** cached status/catalogue, selected synthetic provider/model/empty preset, transcript storage disclosure, exact worker policy preview/checkbox/confirm, approved context preparation, one action plan, exact action preview/checkbox/grant, create, execute, query, capture/read result, finish; uncertain responses require current-state reconciliation. Synthetic output is marked as lacking model-quality evidence; delivery is not requested.
4. **Owned session navigation:** exact worker mapping verification before navigation; stopped/incarnation and unavailable navigation explanations.
5. **Existing advanced task displays:** action scope/limits/grant expiry, material/records, independent audit requirements/reports/coverage/blockers, event sources/subscriptions/registered schedule state and missed-plan approval UI. Empty or unavailable data is expected in this minimal profile; the presence of these displays is not evidence that new normal audit/events integrations are installed.
6. **Connection/accessibility/layout:** busy, stale and offline control disabling; expired decisions; labels/live status/alerts; keyboard interaction, visible focus, long synthetic goals/refs, narrow viewport, overflow and clear recovery messaging. Memory is configured in this package but no dedicated memory CRUD/continuity UI is claimed here.

Current repository schema6, newer control/audit amendments, NI3 native engine/runtime composition, normal event/result delivery wiring and proposed schema7 origin support are **not installed in a58c522**. Record unimplemented/deferred coverage honestly, keep all 87 acceptance criteria unaccepted, and request a new frozen package for incremental retests after those changes are integrated. Do not mutate the frozen package to make a case pass.

## Result handback

Record the exact installed revision/pins, browser tool and original start command, owned fixture path, listener lifecycle, supported actual UI actions and observations, screenshots only if supported, console/network errors with secrets removed, defects/reproduction steps and blocked/not-run cases. Keep initial failed runs and subsequent targeted retests distinct. Report fixture/listener ownership before root makes any next package available. Code review continues independently; this QA cannot close the existing blocked final independent code review gap.
