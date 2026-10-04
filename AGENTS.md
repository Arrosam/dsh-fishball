# bubbles development rules

## Authorization and product boundary
- The owner authorized local staged development, logical-unit commits, independent English-prompt worker/reviewer sessions, and squash merges into local main. Keep Git local until the full agreed MVP is accepted. Do not create a remote, push, publish, open remote issues, expand OAuth scopes or set up live external accounts.
- DSH is the native execution host. Reuse public DSH tool/model/permission/session interfaces. Do not create a new harness, SDK runtime, daemon, DSH-X launcher or whole fishball/Hydrogen dependency.
- Current host baseline is the verified newest official published preview, DSH Web 0.2.1-alpha.1, installed in project-controlled isolation. Pin it for this wave; evaluate subsequent breaking releases explicitly. Do not add old Desktop compatibility shims or Electron/native-shell acceptance. Old-host evidence is historical only. See [compatibility](docs/compatibility.md).
- Full DSH quit stops bubbles. On restart reconcile durable facts before admitting work. Never promise exactly-once arbitrary effects or instant cancellation.
- M1 is bounded BUB001/003/006 plus minimum BUB012 admission. Preserve every later ticket and acceptance criterion. Do not label the foundation a full MVP.
- No live inference, paid model calls, live webhook/chat setup, personal credential/settings changes, production data access or fishball personal-data inspection. Latest official Web installation and a new project-local synthetic profile on loopback are authorized. Test with mock providers and synthetic identities/secrets. If a real DSH model invocation is necessary, report the exact bounded request for owner approval first. Stop on a denied runtime-policy action; do not bypass it.
- Code reuse requires pinned provenance; redistribution requires a resolved license. Do not pick the owner's main copyright license. M1 copies no fishball source. Later authorized private reuse/portability work may follow BUB007A triage and source pinning while its license review proceeds; do not publish redistributed source until the license gate is resolved.

## Workflow and branching
- Read applicable rules and touched subsystems. Follow [the six-stage workflow](docs/development-workflow.md); freeze the ticket/milestone AC and risks before implementation.
- Every ticket requires an independent code review and a separate independent ISTQB test-design review before acceptance. BUB015 is runtime product functionality, not permission to defer development review.
- English delegated prompts. Coding: gpt-6.1-sol, reasoning high or above. Root-cause and audits: gpt-6.1-sol max. Visual validation: xhigh. No Astra or silent downgrade.
- Commit logical units on feature branches. Root controls Git mutations to avoid shared-directory races. Keep granular branches; squash to local main after review. Never reset/rewrite/delete working branch history to consolidate the future public main snapshot.
- Independent author/reviewer identity, exact reviewed tree, commands/results and remediation/retest evidence go under docs/evidence/M1. Distinguish implemented, tested, accepted and released.
- Verify final changed code; do not remove failing tests, weaken assertions or bypass security to get green checks. Actual backend functional validation is required. Test the real isolated Web profile and loopback browser shell; fixture-only or screenshot-only evidence cannot establish provider/inference or task-UI acceptance. Explicitly mark blocked/not-run checks.
- Development uses the installed Node 22.22.2 / Python 3.14.5 / macOS runtime baseline. Record actual versions and package/dependency/lifecycle sources before any install. Use built-in runtime APIs and existing public host packages first; no unreviewed downloaded code or install scripts.
- Release channel defaults to preview throughout tags, packages, documentation and any eventual automation. Main or a successful test run never implies stable.

## Invariants
- The task/action/approval ledger is authoritative, transactional, schema-versioned and independent of memory summaries.
- Identity is trusted host/operator context, never model/payload claims. Key all durable state by owner + workspace + task; grants bind exact action/target/data digest/limits/task and authorization versions with expiry. Check at the atomic dispatch claim and reconcile effects committed earlier.
- Revoke/cancel racing with dispatch has an explicit linearization point. Stop new dispatch first; preserve uncertain or in-flight reservations until actual termination/effect evidence.
- Deduplicate durable intake by complete source identity. Unknown outcomes remain recovery-required; never automatically replay an arbitrary external action.
- Secrets/raw payloads do not enter logs, diagnostics, exports, memory or durable evidence. Use references/digests and schema-allowlisted metadata; redact errors by stable codes.
- Enforce bounded queue/action/message sizes, active reservations and attempts before work. Reviewers and repair work count against limits.
- Treat storage faults, unsupported/future schema and migration failure as fail-closed; preserve original data and recoverable migration backup. Do not overwrite data the code cannot understand.

## Reference policy
Hydrogen's workflow is a reference, not inherited project configuration. Do not edit Hydrogen or copy its remote-first baseline, release pipeline, database or GraphFlow setup. Local .agents/skills inventory contains a Jira-specific webtesting workflow; this repository uses its own local AC/review process. M1 adds no bubbles task UI, but actual host Web smoke is required under the newer owner baseline. Historical Codex session-manager model-routing rules are superseded by the owner's current Sol 6.1 instructions.
