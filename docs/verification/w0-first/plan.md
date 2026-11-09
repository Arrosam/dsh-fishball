# Independent W0 verification plan

Approved amended cases, not a new design/sign-off cycle. Date: 2026-11-09; tester: independent coding agent.

Scope: X0-C 95 executable / 9 TODO; FN-1 10 / 3; B1 10 / 10. Authority: design/instance-ext 15d6f1f, tests ab24c84. Methods and exact cases remain in the approved use-case documents; plan.json preserves all 137 names/IDs and initial Not Run status.

Environment: Node v24.22.2 and explicitly selected installed DSH SDK 0.2.1-rc.5 / 0.2.2-rc.1. Reuse guarded in-process fixture, TMPDIR=/private/tmp. No full runner, DSH CLI/launch/restart, install, credential access, product changes or remote changes.

1. Execute the three task-local files on each SDK, retain TAP and per-case results.
2. Inspect each failure and preserve a minimal reproduction; fix test bugs only in a separate justified local commit.
3. Select safe existing regressions for changed chat/bridge/app seams; exclude live-host and later-wave requirement gates.
4. Independently exercise actual Cordis activation/disposal with in-memory tools and optional service present/absent, clearly labeled as framework checks with mocked peripheral services.
5. Report pass/fail/TODO by task/version, scope classifications and merge readiness. Keep WD/MCP absence separate; no claim of exactly-once real wake.

## Run log

Completed. Both initial full runs: 103 pass / 12 fail / 22 TODO. After separate justified test-only commits 720e680 and c38b97e, both complete final runs: X0-C 94 pass / 1 fail / 9 TODO; FN-1 10 / 0 / 3; B1 10 / 0 / 10. All 137 approved IDs/TODO states reconcile, no skipped/cancelled cases. Only confirmed product X11 timestamp defect XC-EP-V-05 remains. Final per-case outcomes: [machine results](<results.json>) and [table](<results.md>); classifications and merge readiness: [report](<report.md>). [Original ledger](<plan.json>) is intentionally retained at its initial Not Run state for provenance, not the current result source. All owned jobs collected; no live DSH launch/restart/install/push/product edit.
