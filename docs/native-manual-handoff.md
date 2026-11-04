# Native runtime: manual integration handoff

This is unverified opt-in development code, not a replacement for the delivered legacy Fishball. No automated tests or native launches are performed for this handoff. Install/package/restart are separate operator actions.

## Default and package scope

The default bundle patch is unchanged: it registers the existing legacy Fishball and attribution entries only. The native host export is not registered automatically. Even if explicitly registered, its `autoStart` default is `false`. Both native entry files and the source modules are included in the package file allowlist. Installing this code alone must not launch a native child.

## Explicit activation

An operator who controls the main DSH profile composition can append the following patch entry using the normal profile configuration mechanism; do not overwrite existing entries or delivery settings. This is an example for the known local Node 22 binary, not executable-path discovery. Verify the binary path before enabling.

```yaml
- insert:
    - id: fishball-native-host
      name: dsh-fishball/native-host
      config:
        nodeExecutable: /opt/homebrew/Cellar/node@22/22.22.2_1/bin/node
        executableSearchPath: /opt/homebrew/Cellar/node@22/22.22.2_1/bin:/usr/bin:/bin
        managedSessionIds: []
        autoStart: false
```

Load the entry through the native plugin loader. With `autoStart: false`, loading registers a host-local service but does not start a child. Empty `managedSessionIds` denies control of all main-host sessions. Add only explicit locally authorized existing session IDs if control is desired; this is not linked automatically to the legacy managed-session UI.

To start, either explicitly change `autoStart` to `true` and reload this entry, or call `await ctx.nativeFishballRuntime.start()` from an authorized **server-side DSH plugin context**. Read health with `await ctx.nativeFishballRuntime.health()` and obtain the private Web login URL with `await ctx.nativeFishballRuntime.openUrl()`. Open that URL privately; it contains a bearer login capability and must not be logged or shared. The child uses a loopback ephemeral port, not the main GUI port. Its profile is initialized fresh from the running main installation anchor; legacy conversations/config/credentials are not migrated.

There is currently **no native lifecycle GUI, command-line wrapper, public RPC, or agent start/stop tool**. `ctx` above is a host plugin context, not a browser-console variable. The legacy Fishball sidebar continues to control the legacy assistant. If the operator has no host-side integration able to invoke the service and retrieve the URL, this revision does not provide a complete end-user start/open/stop workflow; leave native disabled rather than invent a GUI action.

## Explicit shutdown

1. While the host entry is still loaded, call `await ctx.nativeFishballRuntime.stop()` from that same authorized host integration and confirm success. Failure is not permission to signal an arbitrary PID.
2. Set `autoStart: false` before any future reload, then disable/remove only the `fishball-native-host` entry.
3. Preserve the private runtime directory. Do not delete profiles, credentials, sessions or legacy state.

Disabling the plugin, restarting the main process, or changing `autoStart` to false **does not itself stop a running child**: disposal detaches so it can survive the main host. Stop explicitly before uninstall/upgrades remove installed code. No installed-code retention lease is implemented.

## Known unverified/open items

- Last expanded contract execution: 78 cases, 75 passed, 3 failed (HOST-04 wrong agent identity; HOST-04 wrong session identity; HOST-05 authorization revoked during resolve). A production terminal-refusal fix is written but has not been rerun. Later additional cases are unexecuted.
- Last native lifecycle execution failed: three startup waits timed out, then the outer 240-second deadline interrupted the fourth case. No full native acceptance passed.
- Startup fixes now preserve the full preset config (including required id and tools) and place copied child code within the private profile resolver scope. A side-effect-free resolver probe confirmed ERR_MODULE_NOT_FOUND at the old snapshot location. Post-fix startup remains unverified.
- Real native host session.status/watch callbacks are absent. Generic protocol support does not establish integration.
- Approval adapter code is present but not wired to the native host. Explicit opt-in configuration, TTL and lifecycle integration are unfinished; do not assume host approvals reach the child.
- P1 preflight canonical-target deduplication may skip core-slot inspection through a later scope alias. The logical-path recursion correction alone does not fix this. Do not treat preflight as a complete security boundary; no OS sandbox is established.
- Per-instance owned code snapshots are retained without bounded garbage collection.
- Partial initialization/crash metadata can fail closed and require separately authorized recovery. POSIX only; no broad upgrade/rollback recovery guarantee.
- Test-runner outer deadline/grandchild reaping repair and orphan PID 60179 cleanup belong to the separate testing session; this handoff does not perform either.
- Native runtime/source relocation received limited source review, not final whole-change security acceptance.
- Independent Claude first-account onboarding without credential import/Keychain access is unresolved; see [login research](<native-upgrade-and-login.md>). Do not click stock first Connect under a no-Keychain constraint.

## Integration baseline

The delivery baseline is 74fe6be (delivery/2026-11-04-sync), including the existing fixes, bubble change, model refresh and provider sync. Native integration must retain that baseline. Production/docs and unchanged existing independent tests are separate commits; no tests are run, no package is built or installed, and no live process is restarted as part of this development handoff.
