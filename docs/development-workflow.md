# Local development workflow

Adapted from Hydrogen integration docs read on 2026-10-04, not its project-specific runtime, remote-first setup or release automation.

Current scheduling override: the owner approved completing [three development stages](three-stage-development.md) before consolidated cross-stage functional/visual regression on2026-10-04 08:46UTC. Steps4 and ticket reviews continue during development; step5's full regression is deferred with explicit [acceptance debt](evidence/acceptance-debt.md). Reviewed local squash integrations may proceed without claiming acceptance or release.

1. **Inspiration.** Link the owner instruction and approved behavior review. Record the observable need; suggestions are not authorization.
2. **Triage and AC.** Freeze bounded scope, numbered acceptance criteria, identity/data boundaries, failure/cancellation semantics, limits, migrations, rollback and unresolved decisions. Continue independent safe work.
3. **Development.** Record starting local main SHA and feature branch. Review dependency/runtime policy before builds. Implement bounded logical units with granular commits and synthetic fixtures.
4. **Tests and independent reviews.** Map every AC to test evidence; use ISTQB equivalence partitions, boundary values, decision tables and state transitions according to risk. A separate agent reviews code and another reviews test design. They must not be the implementing author. Findings return to that ticket, then final code is retested and reviewed.
5. **Actual functional/visual validation.** Exercise the exact pinned official DSH Web host with inference disabled, a project-local synthetic profile and loopback browser; supplement with controlled public-service fixtures and separate-process durable recovery tests. A public Cordis fixture alone is not a real Web-profile/UI claim. Record actual Web visual checks separately from later bubbles task-UI and external-provider acceptance. Desktop/Electron are excluded by the newer owner baseline. Record blocked/not-run gates.
6. **Report and integrate.** Record final code tree, reviewer sessions, AC results, commands/environment, limitations and follow-up decisions. Squash the reviewed branch into local main as a development integration, retaining its logical commits and refs and any deferred acceptance debt. Report implemented/tested/accepted/released independently. Final acceptance and publication require the consolidated regression gate.

## Local ticket tracking
[The backlog](tickets/README.md) and individual ticket cards are the source of local planning status. Preserve BUB001–016 and BUB007A/007B; BUB010A is a provider subtask of BUB010. Cards hold source AC; milestone cards select bounded subsets and add executable M1 criteria without marking the complete source ticket done.

Statuses: planned → triaged → implementing → review → validated subset / accepted full ticket. Blocked items retain their original scope. No card is a remote issue.

## Git procedure
Before edits: record git status, main SHA and branch. Root is the only Git writer in shared checkouts. Use a feature branch such as feat/M1-foundation. Commit discrete bootstrap/config, ledger/migration, authorization/admission, tests/remediation and evidence units. After final review, switch main and git merge --squash the feature branch; commit one milestone summary. Retain feature branch commits and immutable reviewed-tree evidence. Do not destroy history.

## Verification
Use repository scripts after they exist. The core uses Node built-ins; the host comes from the verified official distribution in project-local isolation. Record registry/source provenance, exact dependency lock and lifecycle-script review before installing/executing. No launch command may discover personal credentials or use a live default model/profile. Supported DSH_HOME configuration points to project-controlled synthetic state; bind loopback only. A separate synthetic Cordis context may import the pinned public host packages without changing other installations. Verify storage behavior through real local process/file operations, not just mocks. Freeze the host version throughout final tests and reviews; reassess upgrades in a later explicit change.

## Release
No publication now. After the full agreed MVP is accepted and licenses resolved, the owner intends a public Arrosam/bubbles repository. Future initial public main may be a consolidated MVP snapshot made through a new branch/export, preserving all local working branches. All releases default preview; stable requires the owner's explicit version-specific request. Do not change OAuth permissions to create a GitHub Project.
