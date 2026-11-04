# Native runtime: upgrades and independent Claude login

Status: source-only research, 2026-11-04. Production implementation has been approved in the parent task; **this investigation performs no live action** and writes only this document. The earlier [runtime-isolation audit](<runtime-isolation.md>) is the evidence baseline, not proof that production lifecycle or login is complete.

## Scope and conclusions

- Runtime baseline: unmodified DSH **0.2.1-rc.3**, established by the [prior audit](<runtime-isolation.md#L124-L160>). Upgrade design below uses that audit; this investigation did not re-audit the installed DSH updater or execute a host.
- Login baseline: subscriptions **0.9.11**, verified in the installed package [manifest:2–4](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/package.json#L2-L4>). Only published package code, types and README were inspected there. No profile configuration, credential store, account status, Keychain or other real data was read.
- **A standalone browser OAuth implementation exists, but 0.9.11 has no supported first-account GUI/config choice that guarantees bypassing Claude Code credential discovery.** The explicit OAuth backend branch skips import; the stock GUI exposes that choice only after an account exists. Normal first Connect tries import before falling back to OAuth.
- Therefore a fresh private DSH home under the same macOS user does **not** meet a strict “never read the existing user's Keychain” requirement through stock first-account Connect. Do not click it to see whether credentials exist. No login path was executed here.
- Upgrade starts must resolve the **currently running main host's** `ctx.profileContext.installAnchor`. An old surviving child is not permission to replace its code underneath it. Explicit stop/restart and config preservation are the small safe lifecycle boundary; updater code-retention leases and orphan recovery remain unproven gates.

## 1. Subscriptions 0.9.11 first-account behavior

| Entry point / condition | Source behavior | Isolation consequence |
|---|---|---|
| Stock Claude card, zero accounts | Connect calls `login(id)` without a method. | No first-account browser-only selection. |
| Claude login with omitted method | Calls `readClaudeCreds()` first; if it returns credentials, persists them with `keychainBound: true` and returns an empty authorization URL. | Automatic import, not independent browser authorization. |
| Same omitted-method call, no usable credentials | Starts Claude OAuth after the read attempt. | Browser fallback is supported, but credential discovery already happened. |
| Claude login with explicit `oauth` | Starts OAuth directly; the backend branch has no account-count condition. | Existing no-import primitive, not an exposed first-account UI/config feature. |
| Claude card, one or more accounts | Separate Browser authorization and Import Claude Code actions. | An explicitly OAuth-added session is standalone; it does not undo an earlier import. |
| Explicit `keychain`, no usable credentials | Errors rather than falling back to OAuth. | Deliberate import selection differs from default Connect. |

Exact sources:

- Shipped GUI conditions: [client bundle:2879–2898](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/client.js#L2879-L2898>). Omission of unspecified method: [SubscriptionsSection:519–531](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/client/SubscriptionsSection.js#L519-L531>).
- The RPC validates `oauth` / `keychain` only for Claude in [RPC:139–150](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/auth/rpc.js#L139-L150>) and forwards the choice in [RPC:331–334](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/auth/rpc.js#L331-L334>). This proves implemented backend capability, **not authorization to invoke the RPC as an onboarding workaround**.
- Import-first and direct-OAuth branches: actual package entry [server bundle:11394–11418](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/index.js#L11394-L11418>). Its entrypoint is declared in [manifest:24–29](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/package.json#L24-L29>).
- Public usage documentation agrees: Connect imports automatically or falls back to browser, then separate additional-account buttons appear ([README:161–171](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/README.md#L161-L171>)).
- Neither public [Config type:31–80](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/index.d.ts#L31-L80>) nor runtime [schema:11104–11142](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/index.js#L11104-L11142>) exposes a first-account browser-only/import-disable option. Do not invent such a setting.

### Why private HOME is insufficient on macOS

The [credential reader:36–69](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/auth/claude-code-creds.js#L36-L69>) tries the OS Keychain first on Darwin, using an absolute system executable and the fixed service name at [reader:5](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/auth/claude-code-creds.js#L5). Only then does it fall back to its credential-file path. `CLAUDE_CONFIG_DIR` affects that file path, not the Keychain lookup. Replacing `HOME`, `DSH_HOME` or `PATH` is not a Keychain isolation control. **The executable shown in the source was never invoked by this investigation.**

The coupling extends beyond initial import:

- Imported sessions are marked bound at [server bundle:11400–11404](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/index.js#L11400-L11404>).
- Bound refresh selects `refreshClaudeSynced`; unbound refresh selects ordinary OAuth refresh at [server bundle:11681–11696](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/index.js#L11681-L11696>).
- Synchronized refresh reads the external source again and may write refreshed credentials back: [helper:101–129](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/auth/claude-code-creds.js#L101-L129>) and [helper:155–171](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/auth/claude-code-creds.js#L155-L171>). “Tokens saved in private DSH home” therefore does not establish independent refresh ownership.
- OAuth exchange creates an ordinary session without the import-binding marker: [Claude provider:172–215](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/providers/claude.js#L172-L215>). This establishes the intended standalone code path, not a verified real login or provider request.

Browser cookies are separate: once an explicit OAuth flow is available, the browser may already be signed into a Claude account. The [README:171](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/README.md#L171>) describes switching browser accounts or an incognito/manual-code flow. That chooses the account **after OAuth starts**; it cannot prevent default first Connect from probing Claude Code first. Independent token storage also does not guarantee independent subscription identity, quota or provider-side sessions.

## 2. Options and excluded workarounds

| Choice | Supported / known behavior | Decision for this task |
|---|---|---|
| Normal first Connect in current package | Automatic import, browser fallback if discovery returns no usable credentials. | **Do not use** under the no-Keychain-read constraint. Real-item absence/inaccessibility was not checked and must not be manufactured. |
| Browser authorization after a genuine existing account | Stock GUI passes OAuth; standalone refresh is implemented. | Not a way to bootstrap the first account without import. No account was created to expose the button. |
| Future upstream first-account browser choice | Existing backend method could back explicit Browser authorization even with zero accounts. Upstream could alternatively document a supported import policy. | Preferred minimal feature direction, **not implemented or promised**. Keep import deliberate; do not patch the installed package or add a Fishball-only auth bridge. |
| Separate OS user / separately confined login session | A genuine OS identity/security boundary could isolate access to the current user's Keychain, unlike environment variables. | Separate design/approval, not a drop-in setting. Stock 0.9.11 still probes that user's Keychain; it does not meet literal “no Keychain read anywhere”. No OS account, session, ACL or home was changed. |
| Defer Claude onboarding | Leaves independence unresolved rather than silently importing. | Safe immediate outcome pending a supported no-import first-login surface. Does not disprove native-plugin compatibility generally. |

A future upstream feature should establish: zero-account Browser authorization never calls the import reader; import remains a separately deliberate action; OAuth session/refresh remains unbound; cancellation/errors never fall back to import; existing import/add-account and account replacement semantics remain explicit. This document requests no upstream issue, source patch, release or live validation.

Do **not** substitute:

- Direct/private RPC calls, browser-console invocation, request rewriting, synthetic accounts or manual auth-store edits merely to reach the OAuth branch. Backend support is evidence for the upstream feature, not an exception to the [prior audit's boundary](<runtime-isolation.md#L118-L122>).
- Copying/symlinking the main OAuth store, importing once and deleting/changing a binding flag, or automatic logout/relogin. These change credential ownership and can create competing refresh writers.
- Locking, deleting, renaming, denying access to or moving Keychain items; changing search lists/ACLs; logging the user's Claude CLI out to force fallback. No Keychain operation is authorized.
- A `security` shim, PATH change, preload/monkeypatch, source patch, binary replacement, platform spoof or fabricated file failure. The reader uses an absolute executable; these are not supported plugin configuration.
- Treating private `HOME` / `CLAUDE_CONFIG_DIR`, incognito browsing, disabled adapters or an empty auth store as proof that credential discovery cannot occur. The [prior audit](<runtime-isolation.md#L118-L122>) did not activate subscriptions or prove exhaustive dependency-startup safety.

## 3. Upgrade contract: current main installation, preserved private state

This is the small contract to coordinate with the lifecycle author, **not a claim of deployed/tested behavior**. It uses the [same-install launch design](<runtime-isolation.md#L50-L65>) and [managed lifecycle gates](<runtime-isolation.md#L91-L104>).

### Resolve and preflight

1. Resolve the running main's `ctx.profileContext.installAnchor`, validate the manifest/package identity and declared `bin.dsh`, and select a verified platform-valid Node executable. Never choose another install via PATH, “latest”, a profile dependency tree or a copied/custom bootstrap. Electron's executable cannot be assumed to be plain Node. An old main still has its old anchor; downloading new code is not a main-runtime restart.
2. Keep the attached private home stable across code versions. Verify canonical containment and ownership; reject symlink escapes and existing unowned locations. Retain legacy workspace/history in place, per the [layout boundary](<runtime-isolation.md#L28-L48>).
3. Initialize a new private profile only once through the public non-overwriting initializer. Never regenerate an existing profile or rewrite plugin config to make a new runtime start. Missing/corrupt/unrecognized state is a diagnostic, not permission to recreate or migrate it.
4. Preflight selected code identity/version, protocol/capabilities, required official bundles and plugin/module resolution ownership before readiness. Apply the [identity caveats](<runtime-isolation.md#L61-L65>) and [package-ancestry gate](<runtime-isolation.md#L89>). PID, port or loaded page is insufficient. Missing installation, duplicate core identity, incompatible required plugins or failed capability negotiation must fail visibly, never fall back to the shared-runtime assistant.
5. Use a replacement private environment and private workspace ([launch audit](<runtime-isolation.md#L52-L61>)), not inherited main credentials or arbitrary environment/loader flags. Verify child installation identity, version and capabilities after startup too. Static preflight cannot prove arbitrary native plugin initialization behavior.

### Explicit upgrade sequence

| Stage | Required behavior | Forbidden shortcut |
|---|---|---|
| Before upgrade/removal may discard installed code | Stop new host-control work, expire connection-bound operations, explicitly stop the owned child and wait for confirmed exit; preserve private home. | Assume detach pins the install; kill arbitrary PID; delete private state. |
| Main upgraded and restarted | Resolve the **new running main's** anchor and repeat preflight. | Stale cached anchor; mutating old child's loaded code. |
| Compatible, child stopped | Explicit start from that anchor, same private home, unchanged existing config; verify application readiness. | Copy main settings, package trees, credentials or sessions. |
| Old child still running / reattached | Installation/version mismatch becomes restart-required; authenticate ownership before explicit stop/restart. | Second writer, mismatch silently marked ready, old code deleted while in use. |
| New version incompatible / start failed | Preserve data/config and expose precise failed gate. | Disable required plugins, rewrite config, reset defaults, migrate/delete or auto-downgrade. |
| Ordinary disable/uninstall | Operator must call the authenticated lifecycle service stop and confirm exit **before** disabling/removing the entry. Current plugin disposal only detaches; retain private data/config/history. | Assume disable stops the child, or treat uninstall as consent to delete runtime home. |

Rollback is **not** promised safe merely because Fishball leaves configuration alone. Native DSH/plugins may have their own startup/sanitization/storage changes. The [prior audit:82](<runtime-isolation.md#L82>) notes selected-patch sanitation backups. Subscriptions contains its own legacy-store migration in [store:169–174](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/auth/store.js#L169-L174>) and [store:193–221](</Users/samuel/.dsh/profiles/web/node_modules/dsh-plugin-subscriptions/lib/auth/store.js#L193-L221>). This source fact is **not an instruction to inspect, repair, migrate or remove any actual store**. Fishball must not adopt main/legacy stores or use plugin migration routines as an upgrade strategy. Guaranteeing that arbitrary native plugins never modify their own state would require a different contract or further validation.

The narrow invariant is: **no upgrade-time config rewrite, transfer, migration or deletion by Fishball; no automatic downgrade; no private-data cleanup as stale-process repair.** Separately approved destructive cleanup is outside this implementation.

## 4. Detach, orphan recovery and installed-code retention

The parent relayed the lifecycle author's proposed small implementation: authenticated local Unix endpoint for reattachment; child survives main detach/restart; explicit service stop on disable; stale PID is never kill authority; live unknown process fails closed; dead stale records may be cleaned only after ownership verification; changed installation requires explicit restart. These are **coordination inputs**, not source-verified delivery or cross-platform proof in this research.

Keep three questions separate:

1. **Control ownership:** can main authenticate the correct child/host identity, reconcile connection state and avoid a second writer? PID or occupied socket is insufficient. Reconnect must not revive stale approval authority or blindly replay unconfirmed side effects ([disconnect rules](<runtime-isolation.md#L106-L112>)).
2. **Stale metadata recovery:** is an owned control record/socket genuinely stale, with old process dead and no racing starter? Only verified lifecycle-owned ephemeral metadata is eligible for consideration. Live unknown process, failed authentication, PID reuse or uncertain ownership stops automatic recovery. Never delete/rename profile, credentials, workspace or archive to clear a stale record.
3. **Code retention:** will updater/uninstaller retain every file a detached child might lazily import or serve? Endpoint, PID record, live process and private home do not prove an installed-code lease. The [updater audit:83](<runtime-isolation.md#L83>) and [lifecycle limitation:102](<runtime-isolation.md#L102>) leave it unestablished.

Main detach is not child stop, and neither implies upgrade safety. Keep explicit child shutdown **before installed-code removal** as the operational requirement until an upstream retention/lease contract is established. After main disappearance, recovery must first prove ownership rather than signal a recorded PID. If an upgrade already removed the old install, report an installation/lifecycle failure; do not synthesize a rescue installation, alter private config or silently switch an existing process to new code.

Keep the first implementation small: exact-anchor start, readiness/compatibility status, authenticated ownership, explicit stop/restart, conservative conflict diagnostics and config preservation. Do not add speculative migration, automatic orphan killing, updater leases or transparent-unattended-upgrade promises. Independent lifecycle tests/review must establish actual guarantees later; the previous disposable proof did not cover production crash/reconnect/upgrade recovery ([audit:160](<runtime-isolation.md#L160>)).

## 5. Evidence limits and handoff

- Read [AGENTS instructions](<../AGENTS.md>), the coding skill, the approved [design amendment](<../DESIGN.md#L202-L224>) and prior audit. Their older authorization text records the earlier milestone; parent production-phase approval does not broaden this document-only assignment into live action.
- Inspected only subscriptions 0.9.11 package artifacts for login. References are installation-local source observations; no hash, signature or external upstream equivalence was verified. Recheck after package upgrades. No claim about earlier/later versions or today's successful provider OAuth acceptance.
- No actual profile/config, credential/token file, account state, Keychain contents or live runtime status was inspected. No installed package code was imported/evaluated; reading implementation is not running it.
- No shell commands, tests, builds, services, browser login, provider calls, real-home changes, commits or goal-control operations were performed. Shell was unnecessary; this delegated environment has no registered `ask_fishball` tool, so no substitute shell/approval path was attempted. No background job or terminal session was started.
- Upgrade evidence is the prior audit, not a new updater audit. No implementation or test file was changed as a substitute for independent validation. A login without Keychain access, production reattachment, stale recovery, retention leases, rollback safety and cross-platform behavior all remain unproven.
- Findings were sent to the parent for relay to the lifecycle author: first-account GUI limitation, existing backend OAuth primitive, Keychain refresh coupling, config preservation and detach/recovery versus code retention. Next decision: supported upstream first-account browser path versus separately approved OS-isolation design; meanwhile defer independent Claude onboarding.
