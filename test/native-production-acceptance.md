# Production attached Fishball — independent black-box acceptance

Source of expectations: [runtime requirements](<../docs/runtime-isolation.md>) and the owner’s phase scope. Production implementation is intentionally not inspected. API declarations supplied by implementation authors are the only additional contract.

## Safety and execution boundary

- Every shell invocation requires exact-command approval through `ask_fishball`; this child has no such registered tool, so the parent must forward authorization or run the approved command.
- Run under `env -i` with disposable `HOME`, `DSH_HOME`, `DSH_AGENTS_HOME`, XDG and temporary roots before importing host code. Do not run the host’s broad suite, read real settings/provider credentials, or use Keychain.
- Native integration is opt-in via `DSH_RUNTIME_ROOT`; omission skips only native integration and an explicit invalid root fails without fallback. No built-in installation path or download.
- A test-only transport guard is loaded before CLI imports from the identical copied module URL used by its native fixture. No providers or external requests. Its scope is JavaScript TCP/TLS/fetch, not OS confinement.
- Production lifecycle evidence must launch the **new production owner and its child**. The previous two-CLI feasibility fixture is not lifecycle coverage.
- Only tracked spawned handles can be signalled. Cleanup awaits child exits, closes owned sockets and removes only a canonical verified disposable root. No real-home cleanup.

## Acceptance matrix

| ID | Technique | Inputs / transition | Observable required result | Layer |
|---|---|---|---|---|
| LIFE-01 | State transition | stopped → start → healthy → stop | One production-owned child, verified install/version/capabilities; graceful exit; sockets/ports closed | Native |
| LIFE-02 | Decision table | concurrent start / repeated stop / start after stop | No duplicate writers; stable idempotence or explicit refusal; new connection generation | Contract + native |
| LIFE-03 | State transition | stop while starting / child exits before ready | No hanging readiness, no retained child/listener; visible failure, never host-session fallback | Contract + native |
| LIFE-04 | State transition | child crash then explicit restart | Health fails; stale pending requests invalidated; fresh child, preserved private data | Native |
| LIFE-05 | State transition | owner disconnect/restart while child record remains | No stale adoption or PID-based kill; no second writer; explicit safe recovery or actionable refusal | Native |
| LIFE-06 | Equivalence partition | stale record for nonexistent PID / unrelated live process / occupied port | Only actually owned child can be stopped; stale data cannot authorize signalling | Contract + native |
| LIFE-07 | Decision table | required plugin absent / wrong version / missing install | Fail visibly, no ready state, no fallback, retained data | Native |
| PROTO-01 | Equivalence partition | documented managed messages/status/approvals/questions | Version + hostId on every request/response/event; capabilities negotiated | Contract |
| PROTO-02 | Equivalence partition | unknown operation / model, file or arbitrary tool request | Reject before host capability dispatch | Contract |
| PROTO-03 | Boundary values | missing/wrong version or host; empty/overlong IDs; null/array/non-JSON/cyclic values | Bounded deterministic rejection; no side effects | Contract |
| PROTO-04 | Boundary values | exact max and max+1 bytes; multibyte content; max pending/watches and one over | Correct unit-specific bounds, released capacity after completion/disconnect | Contract |
| AUTH-01 | Decision table | authorized managed target vs unmanaged/unknown/other-host target | Host-local registry and authorization decide, not peer-supplied state | Contract |
| AUTH-02 | State transition | live approval → answer → replay; cancel/expire → answer | At most one settlement; stale/duplicate answers cannot grant execution | Contract |
| AUTH-03 | State transition | disconnect → reconnect; old connection answer/message replay | Fresh status snapshot; old authority invalid; dedupe acknowledgments without blind replay | Contract |
| AUTH-04 | Decision table | caller spoofs managed flag, request target, answer type or correlation | Strict input validation and host-owned pending state | Contract |
| PREF-01 | Equivalence partition | clean ancestor vs enclosing Git repository | Private instruction/skill mitigation is explicit or startup refuses with actionable diagnostic | Contract |
| PREF-02 | Decision table | installation-owned packages / private package / outer main-home fallback / shadow core | Approved identity accepted; unexpected mutable fallback refused before evaluation | Contract |
| PREF-03 | Equivalence partition | active workspace is runtime, main home, ancestor, unrelated, symlink alias | Visible nesting rejected/warned explicitly; no silent relocation | Contract |
| PREF-04 | Boundary values | unowned existing root / symlink escape / sibling prefix lookalike | Canonical ownership containment, no unrelated writes or legacy adoption | Contract |
| DATA-01 | State transition | successful restart / failed upgrade / incompatible plugin | Private config/history and legacy main history unchanged; no grant/import migration | Native |
| DATA-02 | Decision table | upgrade program anchor changed vs unchanged main anchor | Explicit restart uses current host anchor; failure preserves attached data | Contract + native |
| DATA-03 | Equivalence partition | poisoned parent loader/token/proxy/.env variables | Replacement private env/cwd, no sensitive inheritance | Contract + native |

## Architecture

1. Pure protocol/authority contract tests: deterministic disposable host capability fakes recording calls. These are not native-runtime evidence. Exercise strict schemas, host targeting, dedupe and disconnect generations through public methods only.
2. Filesystem preflight contract tests: generated disposable directories/manifests/sentinels. No production source introspection or snapshots of internal implementation.
3. Native system tests: explicitly supplied installed rc3 modules; install-free minimal fixture; production lifecycle owner launch; independent health/HTTP/socket observations and persisted sentinels; crash/restart/upgrade failures; cleanup tracked by spawned handles.
4. Disposable runner: rejects unsafe roots and runs the selected test files under an empty allowlisted environment. Keep test scaffolding separate from production configuration.

## Contract and validation record

- Protocol, preflight and lifecycle declarations were supplied directly by their authors. Tests do not inspect their new source implementation. Protocol carriers use serialized strings; native cases use the real production owner with a synchronous Node-spawn seam and selected installed CLI.
- Parent-executed preflight initially found private `@deepseek-ai/dsh-llm` shadow accepted (15 pass, 1 fail). Parent-executed protocol found invalid permission-style answer consumed a live question offer (41 pass, 1 fail). Production was fixed; neither failing assertion was changed.
- Parent reports approved command below passed **58 tests, 0 failures, 0 skips**, exit 0, 356.080916 ms; disposable tree removed after process closure. This is a parent execution, not a shell execution by the independent test author.

```sh
/usr/bin/env -i PATH=/opt/homebrew/Cellar/node@22/22.22.2_1/bin:/usr/bin:/bin /opt/homebrew/Cellar/node@22/22.22.2_1/bin/node test/native-production-runner.mjs preflight protocol
```

- Subsequent test-only strengthening adds workspace/runtime/linked-plugin core-shadow and symlinked-manifest partitions; genuine SIGSTOP live-child refusal; failed-suite tree retention and tracked child PID/closure reports. These expand coverage or strengthen cleanup evidence, never relax failing assertions.
- Expanded parent run of preflight/protocol/adapter reported **78 tests: 75 pass, 3 fail, 0 skips**, exit 1 (515.862 ms). All three adapter failures were pre-steer refusal semantics: wrong resolved agent ID, wrong session ID, and management revoked during asynchronous resolution returned instead of rejecting. These assertions were retained; production authors are fixing refusal propagation. Two new protocol cases and a terminal-refusal reconciliation case were subsequently added (81 expected total).
- First parent native run **failed**: initial start-dependent cases timed out; outer runner deadline interrupted the suite before all seven cases completed. Owned-child cleanup was reported for the first three children, with last-child closure pending parent verification. There is **no native lifecycle pass**. A selected diagnostic rerun is planned; opt-in skips or old feasibility fixtures do not count as completion.

## Remaining acceptance gaps

- Host-adapter contract tests now exercise local management, principal authorization, identity matching, resolution races, durable handoff, reconciliation and approval reauthorization. Actual native approval-waterfall/pending-service hook integration is not established by injectable context tests.
- Unknown/recycled PID ownership refusal and precise socket removal need a supported observable contract; real crash, SIGSTOP and detach/reattach cases avoid forging private metadata.
- Missing-install upgrade preservation has an authored native case; incompatible required-plugin failure and installer retention are not established by that case.
- No browser interaction, provider login/network behavior, Keychain isolation, hostile-plugin containment or cross-platform supervisor behavior is claimed.
