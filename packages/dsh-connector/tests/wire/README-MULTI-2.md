# MULTI-2 independent black-box test design

Derived only from PLAN-MULTI §§3.3, 4.1, 4.3 and §8 MULTI-2, the direct test brief, frozen public contracts when available, and preexisting harnesses. No product implementation was inspected. Tests use public HTTP/MCP, native settings, published host modules and rendered page output; product code is never changed by these tests. The suite's one entry (`wire.test.mjs`) registers the cases with `forEachVersion`: the current DSH day to day, every release-matrix DSH at release.

**Decision amendment from Fishball, 2026-11-18:** the original portable-OS-watcher limitation is superseded. While `approval.dshName` is empty/whitespace, one local 30,000ms hostname comparison observes OS changes and pushes the standard identity invalidation. Nonblank configuration and disposal stop it; clearing restarts it. This is local OS sampling, not network metadata polling. No assertion assumes a platform-specific watcher or spontaneous delivery before the sampling boundary.

## Acceptance criteria

- AC1: standard modern `server/discover`, revision 2026-07-28, exposes `Implementation` in `result._meta['io.modelcontextprotocol/serverInfo']`; no legacy initialize path or top-level serverInfo.
- AC2: effective nonblank configured base is preserved verbatim, otherwise `node:os.hostname()`; append literal `-DSH`, including to an already suffixed base. No URL/Host fallback, display-name grammar/length normalization or deduplication. Version is preserved.
- AC3: actual readable/listed `dsh-agent://identity` JSON `Implementation {name,version}` uses the same live value as discovery.
- AC4: effective-name change broadcasts only standard `notifications/resources/updated {uri}` on existing authenticated subscribed listen streams. Standard SDK `_meta['io.modelcontextprotocol/subscriptionId']` routing is required and validated separately; it is not a custom identity payload. No mailbox update, tool-list notification, custom fields/method, remount, reconnect or OAuth change. Effective no-op does not push.
- AC5: filter isolation, multiple authenticated clients, disconnect/reopen snapshot recovery and revocation are preserved. Identity is never authentication.
- AC6: one 30s local hostname sampler runs only when configuration is blank; changed hostname pushes once, unchanged hostname does not; configured name/teardown stop; clearing restarts; live getters remain authoritative between samples. No network polling.
- AC7: hosted child always uses actual parent, fixed first/non-removable/URL-read-only per frozen reservation seam. Instance remote override schema/UI/launch/refusal branches are removed, not merely ignored downstream. Missing parent does not become remote.
- AC8: hosted token import/reconnect/succession wire is unchanged. Only reserved parent reference/record counts as hosted credential; additional targets' references/records neither satisfy the probe nor suppress provisioning.

## Decision tables

### Identity source and push

| Rule | Config nonblank | Effective advertised name changed | Existing authenticated stream subscribes identity | Expected |
|---|---|---|---|---|
| R1 | yes | — | — | exact configured base + `-DSH`, no OS watcher |
| R2 | no | — | — | OS hostname + `-DSH`, local watcher enabled |
| R3 | — | yes | yes | one standard identity URI hint on that existing stream |
| R4 | — | no | yes | no hint |
| R5 | — | yes | no | no identity hint on that stream |
| R6 | — | yes | unauthenticated/revoked | no identity delivery, existing refusal/closure preserved |

### Hosted credential probe

| Rule | Usable parent connector | Reserved reference/record configured | Extra target credentials | Expected first start |
|---|---|---|---|---|
| H1 | yes | no | none | one create/import/record |
| H2 | yes | no | one or many | same one create/import/record; extras unchanged |
| H3 | yes | yes (reference) | — | no replacement |
| H4 | yes | yes (saved record) | — | no replacement |
| H5 | no | — | — | no create/import; reserved actual parent remains unset/failed |
| H6 | yes | deleted/disabled hosted entry | — | existing Retry/refusal/Reconnect semantics, no remote-target refusal branch |

## State transitions

| Current state | Event | Next state / observable outcome |
|---|---|---|
| Named + subscribed | save distinct name | same connection/row, one hint, fresh discovery/read agree |
| Named + subscribed | save same name/unrelated setting | unchanged; no identity/tool/mailbox hint |
| Named + subscribed | clear setting | OS name; watcher active; one hint iff effective name changed |
| Blank + watcher active | 29,999ms | no sample-triggered push |
| Blank + watcher active | 30,000ms with changed hostname | one same-channel identity hint |
| Blank + watcher active | next 30,000ms with same hostname | no hint |
| Blank + watcher active | nonblank config | configured identity, watcher stops |
| Named + watcher stopped | clear config | OS identity, watcher restarts (exactly once) |
| Any + subscribed | disconnect; rename; reopen | no stale-stream delivery; current discovery/read snapshot; subsequent pushes work |
| Any + subscribed | revoke | that entry's stream closes; other authenticated subscribed entries continue |
| Any watcher state | connector disposed | no remaining local hostname sampler |
| Hosted parent credential absent | extra remote credentials added | parent still absent; parent import occurs, extra credentials untouched |
| Hosted parent credential imported | reference saved by core; reconnect/restart | no extra first-start token; explicit reconnect preserved |
| Hosted runtime reinstalled + extras remain | succession retry | same old→new parent succession, no extra target retargeting |

## Canonical black-box rows

Statuses below reflect the MULTI-2 parent's serial runs after implementation readiness (evidence below), not a claim that the independent test author ran the heavy suites. TC-20 remains **Not Run** because its executable child-core target collection/UI coverage belongs to MULTI-1. The other rows map to passing automated assertions; they are not separate manual browser runs.

| TC No. | TC Name | Details | Techniques Used | AC Covered | Expected Behaviour | Status |
|---|---|---|---|---|---|---|
| TC-01 | Read modern metadata | Authenticated stock SDK discovers; capture wire methods | EP | AC1 | standard `_meta` name/version; no initialize | Pass |
| TC-02 | Resolve unset/blank names | absent, empty, one space, tabs/newline/em-space | EP, Decision Table R2 | AC2 | OS hostname plus literal suffix | Pass |
| TC-03 | Preserve nonblank bases | x, padded spaces, `Office-DSH`, Unicode/decomposed/RTL/emoji | EP, Decision Table R1 | AC2 | byte-equivalent base plus suffix, including `-DSH-DSH` | Pass |
| TC-04 | Avoid invented name bounds | lengths 63/64/65 and 128/129, plus 4096 | BVA | AC2 | every base preserved; agent/tool name bounds do not apply | Pass |
| TC-05 | Treat markup as data | markup-looking configured name through discovery/resource/settings/approval | EP, Error Guessing | AC2, AC3 | literal text/JSON; no HTML execution | Pass |
| TC-06 | Do not derive identity from Host | read via loopback and trusted tunnel authority | EP | AC2 | same OS/configured identity and version | Pass |
| TC-07 | List and read real identity | resources/list then resources/read; compare latest discover | EP | AC3 | one identity resource; JSON {name,version}, correct URI/mime | Pass |
| TC-08 | Rename on existing connection | open one listen; save new name; rediscover/read same client | State Transition, Decision Table R3 | AC3, AC4 | hint only {uri}; no remount/reconnect/auth; tool definitions/OAuth unchanged | Pass |
| TC-09 | Broadcast with filters | P/Q identity+events, R events-only, S tools-only/no identity | Decision Table R3/R5 | AC4, AC5 | P and Q each receive hint; others do not; no mailbox/tool invalidation | Pass |
| TC-10 | Effective no-op | same configured value; empty→whitespace with same hostname; unrelated setting save | Decision Table R4, State Transition | AC4 | zero identity invalidations | Pass |
| TC-11 | Reopen after disconnect | close subscription, rename offline, reopen and discover/read, rename again | State Transition | AC5 | current snapshot recoverable, future hint delivered, no stale stream reuse | Pass |
| TC-12 | Preserve auth refusal | no bearer/invalid bearer identity reads/listens; revoke one subscriber | EP, Decision Table R6 | AC5 | no unauthenticated identity, revoked closes, another client remains live | Pass |
| TC-13 | Sample hostname at boundary | external hostname fake changes; advance 29,999 then 1ms | BVA, State Transition | AC6 | no early hint; one hint at 30,000ms | Pass |
| TC-14 | Hostname unchanged | advance next full 30s without hostname change | Decision Table R4 | AC6 | no identity update | Pass |
| TC-15 | Disable/re-enable watcher | nonblank setting, hostname changes/ticks, clear setting twice | State Transition | AC6 | no watcher while named; one watcher when blank; live OS identity returns | Pass |
| TC-16 | Dispose watcher | disable connector with blank config; advance clock | State Transition | AC6 | local timer removed; no later hostname calls/delivery | Pass |
| TC-17 | No network polling | capture methods while virtual local intervals advance | Error Guessing | AC4, AC6 | zero unsolicited MCP discovery/read/network requests | Pass |
| TC-18 | Remove instance override | host Config and rendered en/zh settings page | EP | AC7 | no targetUrl host override/edit control; remaining launch/model/actions preserved | Pass |
| TC-19 | Launch actual parent only | old extra override input supplied as adversarial unknown field; connector available/unavailable | Decision Table | AC7 | actual parent URL only, or reserved unavailable; no arbitrary remote launch | Pass |
| TC-20 | Reserve fixed first target | frozen hosted reservation fixture plus extra targets; edit/remove/reorder attempts | State Transition | AC7 | actual parent first, immutable/nonremovable; extras ordinary; core owner integration | Not Run |
| TC-21 | Import beside extra credentials | seed target-qualified reference/record only; run firstStart | Decision Table H2 | AC8 | one parent import to reserved ref; extras untouched; only reserved probe | Pass |
| TC-22 | Existing reserved credential wins | reserved ref-only and saved-record-only, plus extras | Decision Table H3/H4 | AC8 | no replacement or extra token import | Pass |
| TC-23 | Preserve reconnect/succession | imported→core-saved→restart; reinstall with extras→retire retry | State Transition, Decision Table H6 | AC8 | original wire and parent old→new behavior, no remote refusal | Pass |

## Coverage gaps / execution discipline

- Do not run heavy host tests until MULTI-2 owner signals implementation readiness; wire and interactions remain serial.
- Frozen MULTI-0 identity/reservation seam `4155d1e4` was read before final resource/host registration: `RESOURCE.identity`, `SERVER_IDENTITY`, exact `ServerIdentity {name,version}`, reserved parent ID/kind and target-qualified credential grammar. No test assumes internal getter/trigger names. The native child-row handoff remains `targetUrl`; core alone turns it into fixed first `parent`.
- Source-code import scans in old suites are preexisting; new behavior tests do not inspect product source. External OS boundary substitution is confined to a test-only worker extension.
- Displaying fixed first/nonremovable/readonly hosted target inside child core is MULTI-1-owned; MULTI-2 can assert native host handoff and lack of override, not claim full core settings coverage.
- No undocumented maximum display-name length is invented. The above neighboring lengths are regression probes around unrelated existing agent/tool bounds, not new acceptance boundaries.

## Verification evidence — parent-run, 2026-11-18

Both supported SDKs (`0.2.1-rc.5`, `0.2.2-rc.1`) were exercised by the MULTI-2 parent in coordinated serial runs. The independent test author read the resulting summaries and the relevant passing MULTI-2 assertions; the author did not start concurrent heavy tests or inspect product implementation.

| Parent-run scope | Pass | Fail | Skip | TODO | Evidence |
|---|---:|---:|---:|---:|---|
| Full connector wire, including unrestricted names, real identity resource, subscribed broadcast/filtering, effective no-op, disconnect/reopen, revocation and all local hostname-sampler assertions | 348 | 0 | 26 | 16 | [Wire final log](<../../../../.runtime/multi2-wire-final.log>) |
| HTTP, settings page, hosted instance and succession, including both exact padded-name settings assertions and extra-credential isolation | 1,102 | 0 | 28 | 32 | [Deferred first log](<../../../../.runtime/multi2-deferred-first.log>) |
| Final post-freeze connector interactions, including the separately owned page-branch additions (474 total) | 437 | 0 | 35 | 2 | [Interactions final log](<../../../../.runtime/multi2-interactions-final.log>) |
| Broader affected suites outside the focused MULTI-2 gate | 3,674 | 365 | 595 | 433 | [Remaining affected log](<../../../../.runtime/multi2-affected-remaining.log>) |

**Focused verdict:** no failing MULTI-2 behavioral assertion in the completed parent-run scopes above. The initially observed settings trimming defect (`  Office West  ` becoming `Office West`) now passes on both SDKs after the separately owned R-FIX-CUI merge; the exact assertion was retained, not weakened. Required standard SDK subscription-ID `_meta` routing was separately validated without allowing custom name/version notification payloads.

**Cross-slice gap:** TC-20 is not claimed passed. The actual-parent native handoff, absence of instance override, and reserved credential behavior pass here; fixed-first/nonremovable/URL-read-only behavior inside the child core collection/settings UI remains MULTI-1/integration-owned.

**Broader gate is not green:** the parent/Fishball classified all 365 broader failures outside accepted MULTI-2 scope: 12 stale K3a/UI expectations; 4 occupied approval-port 47615 cases; 18 legacy root-environment cases; 3 legacy recommendation/TODO cases; 28 placement-install cases missing release artifacts; 6 tarball contract cases missing release artifacts; 294 release-pack cases missing their release folder. These are reported exclusions, not converted to passes or independently reclassified by this test author.

**Interactions:** the final parent-run post-freeze result is 437 passed / 0 failed, with 35 skipped and 2 TODO (474 total), on both SDKs. This supersedes the earlier 419/0 foundation result; the increased passing count includes 18 separately owned page-branch additions. The final log summary was read by the independent test author.
