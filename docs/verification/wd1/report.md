# Independent WD-1 skeleton verification

**Status: verified for the narrow WD-1 skeleton boundary; not full settings/feature/release acceptance.** Date: 2026-11-09 (Pacific/Auckland). Independent verification of the pinned skeleton, not feature/release acceptance.

## Inputs and local provenance

| Item | Pinned SHA |
| --- | --- |
| Product `dev/wd-1` | `2200928d40875c57b5a7ff304d68dbff6b7877db` |
| Approved tests `test/w0-mcp` | `ab24c84daa32dec7105bd25f5ec4cb78399f1f2d` |
| Budget authority §2.8 | `9cafd921be8a8e67f828ab225bf5fe636887c5c5` |
| Unchanged approved WD tests/support import | `69d7c5154a5ec0094aa64bef2c52d61516b85569` |
| Separate native/safety test addition | `db25239f0ab68fefdc9746dbce4e37e4c4f2f05a` |
| Evidence-backed ESM driver correction | `79b74a996b89a0a5f32577ffd3e1c1057bb78211` |

Branch `verify/wd-1` was created directly at the requested product SHA in `.agents/worktrees/verify-wd1`. Product files are unchanged. The [canonical requirement](<../../plugins/instance-extension-points.md#L404-L456>) is byte-identical to the pinned budget commit. Imported test/support/docs blobs match the approved test commit exactly. Imported W0 audits/inventory remain historical red-baseline records; this report and [per-case results](<results.json>) are this verification's outcomes.

## Approved WD44 results

Counts are registered test bodies, not assertions, BVA sample values or duplicate SDK executions.

| SDK | Registered | Executed | Pass | Fail | Owner TODO | Skipped | Cancelled | Exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.2.1-rc.5 | 44 | 20 | 20 | 0 | 24 | 0 | 0 | 0 |
| 0.2.2-rc.1 | 44 | 20 | 20 | 0 | 24 | 0 | 0 | 0 |

Every run contains the exact **44 unique approved IDs**, with all 20 executable cases passing and all 24 TODOs unchanged. No missing-feature, import/driver or skipped result was recategorized into a pass. Executable pass rate is 20/20 per SDK; that is **not 44/44 journey coverage**.

| Primary technique | Executable | TODO | Total |
| --- | ---: | ---: | ---: |
| EP | 4 | 2 | 6 |
| BVA | 9 | 7 | 16 |
| Decision Table | 2 | 2 | 4 |
| State Transition | 0 | 4 | 4 |
| Use Case | 5 | 9 | 14 |
| **Total** | **20** | **24** | **44** |

Evidence: [rc.5 final WD44 TAP](<evidence/wd44-final-0.2.1-rc.5.tap#L301-L309>), [rc.1 final WD44 TAP](<evidence/wd44-final-0.2.2-rc.1.tap#L301-L309>), [initial per-case plan](<plan.json>), [final per-case results](<results.json>), [approved case definitions](<../../../packages/watchdog/test/instance-ext/wd-1.test.mjs>).

## Budget observations

The full Config enforces `growth >= 3 * ceil(readMaxBytes/3) + 768 + output`, following [§2.8](<../../plugins/instance-extension-points.md#L427-L436>):

- Default read 8192/output 1024: growth **9984 rejects; 9985 and 9986 accept**.
- Per-read rounding: read **8190 → minimum 9982**; **8191/8192/8193 → minimum 9985**; **8194 → minimum 9988**. Each minimum−1 rejects; minimum and minimum+1 accept. At read 8192 this rejects the incorrect combined-read rounding threshold 9984.
- Output 2048: growth **10000 and 11008 reject; 11009 and 11010 accept**.
- Read 1048576/output 256/growth 50000: individual fields pass, complete Config rejects; required growth is 1049602.
- Numeric budget fractions reject; all 19 numeric fields expose inclusive bounds independently. Removed enabled/approval-time settings remain absent. Check/health timers and non-decision operational audit retention remain.

[Raw default/rounding/output evidence](<evidence/wd44-0.2.1-rc.5.tap#L119-L184>) is schema acceptance, not runtime byte measurement, output accounting or saved-config rollback.

## Actual SDK/framework checks

The separately authored [native supplemental suite](<../../../test/verification/wd1-native.test.mjs>) passed **83/83 on each SDK**, with 0 failures/TODOs/skips/cancellations and exit 0. It is separate from WD44 and does not promote any approved TODO.

| SDK | Actual Cordis | Actual Schemastery | Supplemental passes | Fail | Exit |
| --- | --- | --- | ---: | ---: | ---: |
| 0.2.1-rc.5 | 4.0.5 | 3.18.5 | 83 | 0 | 0 |
| 0.2.2-rc.1 | 4.1.0 | 3.19.0 | 83 | 0 | 0 |

- **70 schema checks per SDK:** the same 35 requirement-derived checks run through native `Schema.resolve` and through `new Schema(JSON.parse(JSON.stringify(Config)))`. Defaults, full-candidate thresholds, defaulted companion budgets and isolated invalid numeric representations all behave correctly. Restoring callback source without module lexical bindings succeeds; this is actual Schemastery restoration, not a fabricated validator.
- **13 native metadata/host checks per SDK:** actual `Context.plugin(row, config)` activation and disposal, not just direct `apply`; optional service absent/API1/API0/API2/string `1`/missing API; each required service missing → PENDING → supplied → ACTIVE → lost → PENDING → replaced → ACTIVE → DISPOSED; optional arrival/disappearance never gates the skeleton; invalid full config is refused before ACTIVE. The normalized-config observation uses the public SDK-compatible `effectiveConfig` (rc.1) or `config` (rc.5).
- Peripheral agents/tools/LLM/instance services are in-memory fail-on-operation sentinels. Zero runtime readiness/claim/tool/model/agent operations, network attempts or process launches were observed. Every Context registry and row effect was drained at teardown.

Evidence: [rc.5 native TAP](<evidence/native-final-0.2.1-rc.5.tap#L505-L520>), [rc.1 native TAP](<evidence/native-final-0.2.2-rc.1.tap#L505-L520>), [SDK identities/source hashes](<evidence/sdk-identities.json>), [supplemental per-case results](<native-results.json>).

The initial supplemental run failed in its import hook on both SDKs, before product assertions, due to a CommonJS/ESM resolver race. [Fix evidence](<test-fixes.md>) is preserved; the correction changed only test-driver import conditions and was committed separately as `79b74a9`. These initial 83 hook failures per SDK are **not product failures or passes**. The corrected suite was rerun in full.

## Settings UI and atomic-save assessment

**Legitimate later-task scope only for the expressly approved W0 skeleton—not an already completed user settings journey.**

The [aggregate Config](<../../../packages/watchdog/src/config.js#L36-L41>) is nonvolatile. On both SDKs, native Settings includes only volatile forms and rejects writes to entries with no volatile fields. Attaching `Config.dict` exposes field schemas for introspection; it does **not** create an automatic form/save path. See the [independent review with both SDK references](<review.md>).

- **Atomic persistence owner already recorded:** `WD1-ST-BUDGET-SAVE` is explicitly **WD-1/WD-12**. Required transition is saved 10000 → reject 9984 while retaining persisted 10000 → accept/persist 9985. It remains TODO.
- **Model-window save validation:** **WD-1/WD-8/WD-12**, including R below/equal/above 16000. No model-window save validation is implemented or certified here.
- **UI delivery/task gap:** canonical [§11.8](<../../plugins/instance-extension-points.md#L1427-L1447>) assumes native plugin forms; [SET/PG-1](<../../plugins/instance-extension-points.md#L615-L617>) owns page navigation/moving/linking, not a nonvolatile aggregate editor. There is no explicit demonstrated owner for bridging this schema into a usable native editor.
- **Required allocation before settings acceptance:** assign a native-compatible whole-candidate editor/save bridge and atomic persistence to a **WD-1/WD-12 continuation**, with SET/PG-1 presentation integration, or clarify the task split. This is a proposed allocation of the gap, not a claim the existing task table already solves it. Existing official ConfigEditor validation-before-write/atomic rollback is a reuse seam only, not product-connected persistence evidence.

**Full user settings journey: NOT PASSED.** No browser form, save/reopen, invalid-write rollback, real reload or actual model-window configuration journey was run.

## Deferred obligations and limitations

The 24 original owner TODOs remain reviewable in the [results](<results.json>) and [case definitions](<../../../packages/watchdog/test/instance-ext/wd-1.test.mjs#L178-L234>):

- Bundle/readiness/failure hand-over/recovery: X0-B/X0-C/X0-S/WD-13.
- Question/plan bypass and refinement: X0-I/X0-A/WD-3/WD-4/WD-6/WD-10/WD-11/WD-12.
- Saved budget atomicity: WD-1/WD-12; model-window save: WD-1/WD-8/WD-12.
- Canonical UTF-8 measurement, Unicode, whole context once, bounded card/shared non-read allowance, 64000 rollover/preflight/fresh epoch, growth/output accounting and failure handling: WD-8/WD-9/WD-10/WD-12/X0-S/WD-13 as named by each case.
- Real permission decision/escalation and cleared rendered cards: WD-8/WD-10/K2/PANELS.

No real agents/tools/LLM services, provider calls, actual profile boot, bundled snapshot loading, persistent save, model epoch, MCP or browser UI is certified. Skeleton absence compatibility is not proof of later dynamic binding when a service appears.

## Safety and reproducibility

Each bounded test process used Node v24.22.2, an empty-base allowlisted environment, a fresh dedicated scratch HOME/TMPDIR/DSH_HOME/DSH_AGENTS_HOME, explicit installed runtime resolution, and [network/process tripwires](<../../../test/verification/wd1-safe-preload.mjs>). `--test-isolation=none` avoids Node's own test-worker spawn; separate SDK/suite invocations still run in fresh OS processes. The approved passive helper creates only a checked worktree-local connector symlink; no dependency installation or package-manager command.

Exact command shape per SDK, substituting the verified disposable scratch and installed version:

```sh
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
  HOME="$scratch/home" TMPDIR="$scratch/tmp" \
  DSH_HOME="$scratch/dsh-home" DSH_AGENTS_HOME="$scratch/agents-home" LANG=C \
  FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/$version/node_modules" \
  /opt/homebrew/bin/node --import ./test/verification/wd1-safe-preload.mjs \
  --test --test-isolation=none --test-concurrency=1 --test-reporter=tap \
  packages/watchdog/test/instance-ext/wd-1.test.mjs
# Supplemental invocation uses the identical environment/options, with this final path:
# test/verification/wd1-native.test.mjs
```

No DSH CLI/full runner, live DSH access/restarts, installs, network/remote modifications, push, credentials/.npmrc reads or credential backups. A sandbox-blocked attempt to list only the current shell with `ps` was not retried; no wider access was requested. Safety guards plus bounded foreground execution avoid relying on process-table access for cleanup.

No test fixes were needed for WD44. New supplemental verification/safety tests were committed as `db25239`; the evidence-backed supplemental SDK-import correction is separate commit `79b74a9`, with no assertion/case changes. WD44 was rerun on both SDKs with the final hardened preload, retaining identical counts/IDs. Independent read-only code/scope review found no additional skeleton defect. [Initial input hashes](<evidence/input-hashes.json>), [final hardened/corrected harness hashes](<evidence/final-harness-hashes.json>) and [provenance](<evidence/provenance.txt>) are retained. The initial hash record predates preload hardening; final runs use the separately recorded final harness.

## Readiness

**Ready as a WD-1 W0 package/config/load skeleton at `2200928`**, with 20/20 approved executable checks and 83/83 supplemental native checks passing per SDK. No product edits or weakened requirements; independent review found no additional skeleton defect.

**Not ready to claim the full user settings journey or watchdog feature/release complete.** All 24 owner TODOs remain. The missing native-compatible aggregate editor/atomic save bridge is a real task-ownership gap requiring explicit WD-1/WD-12 continuation allocation and SET/PG-1 coordination. Runtime/model/bundle/browser acceptance remains with its named later tasks.

Owned foreground test processes exited; native plugin scopes/effects/registries were disposed. Final scratch/link cleanup and no-background-job evidence are recorded in [cleanup](<evidence/cleanup.json>). No live DSH was touched.
