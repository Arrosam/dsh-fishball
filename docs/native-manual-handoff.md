# Native runtime: host-bound manual integration handoff

This is development code with syntax-only validation, not production acceptance. No automated tests, native launches, package/install or live restarts are performed for this change. The original delivery features and legacy Fishball remain in place.

> **Stale in 0.1.0-alpha.0.** This document describes the pre-D22/D28 manual handoff. The released
> row is `fishball-instance` (not `fishball-native-host`), its `Config` has only `enabled`
> (`nodeExecutable`, `executableSearchPath` and `managedSessionIds` are gone, and the retired
> `autoStart` no longer exists), and "Open isolated Fishball" is no longer a capability-URL +
> blank-tab/`window.open` flow: the child is framed in the main area through the embed broker at
> `/fishball/embed/`.

## Installation and one-switch control

The separate install session should append this entry to the main web profile using the normal profile composition mechanism, preserving every existing entry and setting. Do not add it to the isolated child profile. Verify the explicit Node binary exists on the target host.

```yaml
- insert:
    - id: fishball-native-host
      name: dsh-fishball/native-host
      config:
        enabled: true
        nodeExecutable: /opt/homebrew/Cellar/node@22/22.22.2_1/bin/node
        executableSearchPath: /opt/homebrew/Cellar/node@22/22.22.2_1/bin:/usr/bin:/bin
        managedSessionIds: []
```

`enabled: true` means start automatically after main DSH reports ready. `enabled: false` is the single feature off switch: reloading that changed configuration disposes the old host entry and stops its child, and the new disabled instance cannot start one. Disabling/removing the native plugin entry also stops its child. The retired `autoStart` setting no longer controls this lifecycle. The generic package bundle patch still registers only legacy Fishball; the profile entry above is the explicit install opt-in requested by the owner.

An empty `managedSessionIds` denies control of all main-host sessions. Add only explicit locally authorized main-host session IDs if desired; the legacy managed-session UI does not automatically populate this list. Native approval forwarding and native status/watch integration remain separate unfinished work.

## Open from the main GUI

In **Plugins → Fishball → settings**, the native section immediately after legacy Status reports its state independently of legacy Fishball; use Refresh to update it. When ready, click **Open isolated Fishball**. The click sends a same-origin `fetch` POST to the owner-authenticated endpoint, which answers with a no-store, no-referrer JSON body holding a freshly requested child capability URL; the page navigates a blank tab it opened synchronously in the click (so popup blockers do not apply; its opener is cleared). The URL is not inserted into client state, rendered as a link, logged or saved in configuration. In the DSH desktop app the shell denies the blank tab, so the page falls back to `window.open(url, '_blank', 'noopener,noreferrer')`, which the shell hands to the system browser. (2026-11-04 bug fix: the earlier `target=_blank` form with `rel="noopener noreferrer"` + 303 redirect showed "not found" in a regular browser: `noreferrer` makes the form POST carry `Origin: null`, which rc.3 admission rejects, and a noopener new-window submission can reach the POST-only route as a GET, which rc.3's exact-route dispatcher answers with a literal `not found`.) Native owner admission enforces authorization on the server, not just by hiding the button.

The child uses a loopback ephemeral port and a separate freshly initialized profile. It does not replace main GUI port54679 or migrate legacy conversations, config or credentials. Opening from a different computer is not supported by this loopback link. Browser/network inspection of the actual click can of course see the navigation capability; no application can hide a destination from the browser performing that navigation.

If native startup fails or native hosting is not installed/enabled, the native section shows a non-ready status; the legacy Fishball panel remains usable. Opening must not implicitly launch a new runtime.

## Lifecycle, restart and failure rules

- Main readiness triggers asynchronous startup; plugin apply does not await child readiness. Exceptions are reduced to bounded safe status codes, not raw launch output/paths/tokens. Native failure must not fail main startup.
- Disable/dispose and native main shutdown begin graceful authenticated child stop. Escalation is bounded and restricted to the exact still-live ChildProcess handle spawned by this owner; persisted PID numbers are never standalone signal authority. rc.3 main shutdown has a 5000 ms application-disposal grace; native host cleanup has a 4000 ms deadline and an owned-handle force fallback at 2500 ms (an unsuccessful graceful stop may escalate earlier).
- HMR uses **stop then restart**, never intentional detach-and-survive. A process-global per-attached-home registry serializes successor startup behind confirmed predecessor cleanup, including across module reloads. If stop is uncertain, retain the failed gate and refuse replacement.
- Startup checks private ownership markers, active claim, host/instance identity and authenticated lifecycle endpoint. A surviving prior instance must be handled before a replacement can start; dead claims are retired only after verified death, and unknown state fails closed. No second writer is allowed.
- A child crash changes status to failed; there is no automatic respawn loop. An explicit service start/restart or plugin reload can attempt verified recovery.
- Abrupt process exit cannot await asynchronous JavaScript. A Node --import preload installs a private fd3 parent-lifetime pipe before CLI/plugin evaluation. Parent process exit, including SIGKILL, closes the pipe: the child requests native graceful shutdown and has a 3000 ms self-exit deadline. A blocked child event loop, OS failure, termination before preload evaluation, and pre-existing orphan formats still require conservative recovery. An unauthenticated old PID is never killed on the strength of its metadata.
- Private data and snapshots are not deleted when turning the feature off. No installed-code retention lease or transparent upgrade guarantee is provided. Confirm child stop before removing the old installed runtime.

## Known unverified/open items

- The new host-bound shutdown, enabled switch, HMR serialization, crash recovery, failure status and owner-only click redirect have only source review and node --check, not behavioral/browser/native verification.
- Last expanded contract execution:78 cases,75 passed,3 failed (HOST-04 wrong agent identity; HOST-04 wrong session identity; HOST-05 authorization revoked during resolve). A terminal-refusal production fix is written but has not been rerun. Later added cases remain unexecuted.
- Last native lifecycle execution failed: three startup waits timed out, then the outer240-second deadline interrupted the fourth case. No full native acceptance passed.
- Earlier startup fixes preserve the full preset config and place copied child code within the private profile resolver scope. The old resolver path failed ERR_MODULE_NOT_FOUND; post-fix startup remains unverified.
- Real native host session.status/watch callbacks are absent. Generic protocol support does not establish integration.
- Approval adapter code exists but explicit opt-in/TTL/lifecycle integration is unfinished; do not assume main approvals reach the child.
- P1 preflight canonical-target deduplication may skip core-slot inspection through a later scope alias. The logical-path recursion correction alone does not fix it. No OS sandbox is established.
- Per-instance code snapshots are retained without bounded garbage collection. Partial initialization/crash metadata can fail closed and require separately authorized recovery. POSIX only.
- Test-runner timeout/grandchild reaping and orphan PID60179 belong to the separate testing session; no action against that PID is part of this work.
- Independent Claude onboarding without credential import/Keychain access remains unresolved: see [login research](<native-upgrade-and-login.md>). Do not click stock first Connect under a no-Keychain constraint.

## Integration baseline

This change builds on integration/native-runtime-on-74fe6be and preserves delivery74fe6be (existing fixes, bubble change, model refresh and provider sync). Test sources are unchanged. No real home, credentials or Keychain are accessed, no DSH is launched/restarted, and no branch is pushed.
