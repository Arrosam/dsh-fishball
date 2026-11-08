# Independent WD-1 verification plan

Date: 2026-11-09 (Pacific/Auckland). Scope is the user's explicitly approved WD44 execution, not a new case-generation/sign-off cycle.

## Pinned inputs and acceptance boundary

- Product: `dev/wd-1`, `2200928d40875c57b5a7ff304d68dbff6b7877db`.
- Verification branch/worktree: `verify/wd-1`, `.agents/worktrees/verify-wd1`.
- Approved test input: `test/w0-mcp`, `ab24c84daa32dec7105bd25f5ec4cb78399f1f2d`; imported unchanged in `69d7c5154a5ec0094aa64bef2c52d61516b85569`.
- Budget authority: `9cafd921be8a8e67f828ab225bf5fe636887c5c5`, instance-extension-points §2.8, byte-identical in this worktree.
- AC1: package/row identity and host-compatible required/optional service loading.
- AC2: retained defaults/inclusive field bounds and rejected removed controls/fractional budget fields.
- AC3: aggregate native schema acceptance, default growth 9984/9985/9986 = reject/accept/accept, each read rounded separately, output-2048 minimum 11009, independently valid but incoherent combinations rejected.
- AC4: native Schema.resolve/serialized schema and Cordis activation/disposal observations, with in-memory peripheral services only.
- AC5: explicitly distinguish schema acceptance from rendered Settings and atomic persisted-save acceptance; identify later owner or requirement gap.

## Inventory and tracking

The approved machine inventory is the source of all 44 WD1 IDs/names and techniques. WD44 means **20 executable + 24 owner TODO**, not 44 executed passes. The snapshot `plan.json` records every approved case initially Not Run for each SDK. `results.json` and raw TAP will record individual outcomes after each bounded suite run. The original approved inventory/audit remain unchanged historical baseline evidence, not this verification's results.

Primary technique split (executable / TODO): EP 4/2; BVA 9/7; Decision Table 2/2; State Transition 0/4; Use Case 5/9. Supplemental checks are reported separately and cannot promote TODOs.

## Execution and safety

1. Run only `packages/watchdog/test/instance-ext/wd-1.test.mjs` on explicitly selected installed SDKs 0.2.1-rc.5 and 0.2.2-rc.1; Node v24.22.2. Preserve TAP, exit codes and exact inventory comparison.
2. Use a separate-context, requirements-derived supplementary native SDK suite for actual Schema.resolve and real Cordis Context plugin activation. Stub peripheral services; no DSH launcher/profile/server/model or GUI.
3. Run each process with an allowlisted empty-base environment (`env -i`), dedicated scratch HOME/TMPDIR/DSH_HOME/DSH_AGENTS_HOME, explicit SDK resolver, and preload tripwires blocking network/process launches. No full runner, dependency installs, .npmrc/credential reads/copies, production profile access, live DSH/restart, remote changes or push.
4. Any failure is triaged from evidence. Product is immutable; any test/harness fix must have evidence and its own commit, never weakened assertions.
5. Independent scope/code review establishes UI/persistence task ownership and limitations. A passing schema test is not a user save journey.
6. Commit only local tests/report/evidence; dispose native Context fibers, collect owned jobs, remove only verified owned scratch directories.

## Run log

WD44 executed on both SDKs in separate sanitized foreground processes: each exit 0, 20 Pass / 0 Fail / 24 owner TODO / 0 skipped / 0 cancelled. All 44 unique IDs match the approved inventory, with TODO classification unchanged. Raw TAP, initial inventory and per-case results are retained. Supplemental native SDK checks then passed 83/83 on each SDK after one separately committed evidence-backed ESM import-driver fix (`79b74a9`); initial hook failures are preserved and excluded from product results. Final WD44 rerun with hardened preload again passed 20/20 with all 24 TODOs unchanged. Independent scope/code and supplemental test safety reviews are complete. All four final test processes exited 0; no background jobs/servers/DSH were started.
