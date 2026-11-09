# X0-C fake-host maintenance — dual SDK verification

## Scope and provenance

- Branch: `test/v2-x0c-fakehost`, isolated worktree from `6b3ea5393ef20020e4bbcb44ecc0a715d93b081e` (`integrate/v2-nov9-wave2`).
- Read the diagnosis in `dev/v2-integration-selfverify` at `898369bc891cb5df6da2ddd176b1b839dbbf0fa8`, [self-verification note](</Volumes/SSD1/GitHub/dsh-fishball/.agents/worktrees/dev/v2-integration-selfverify/docs/verification/v2-integration-selfverify.md>).
- Test-maintenance only: no product source or native-child Git-ancestor safety check changed. Existing assertions outside the expressly authorized `XC-EP-STUB-16` replacement remain unchanged.
- An independent test author derived the X12 replacement before reading any bridge/product implementation, and wrote the new fixture-contract regressions from SDK contracts. A second agent independently reviewed the fixture and SDK publication semantics.

## Authoritative read-only SDK sources

Installed sources are under `/Users/samuel/Library/Application Support/DSH/data/versions/<version>/node_modules/@deepseek-ai/`; neither runtime was modified.

| Contract | `0.2.1-rc.5` | `0.2.2-rc.1` |
| --- | --- | --- |
| `followup` synchronously splices `next-turn` and wakes; `inject` synchronously splices `next-step` without wake | [agent-loop:800–813](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L800-L813>) | [agent-loop:564–577](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L564-L577>) |
| Pending input is durable splice history; duplicate pending identities refuse; claim takes all next-step plus at most one ordinary next-turn | [agent-loop:20–61, 79–110, 180–207](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L20-L207>) | [agent-loop:20–61, 79–110, 174–201](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L20-L201>) |
| `turn/start` precedes synchronous first claim; later next-step input stays within the same turn | [agent-loop:902–909, 938–1040](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L902-L1040>) | [agent-loop:666–685, 724–826](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L666-L826>) |
| Session append publication synchronously contains each observer; reentrant append refuses while publication is open | [session:1226–1239, 1568–1598](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1568-L1598>) | [session:1226–1239, 1576–1607](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1576-L1607>) |
| `SessionPersistence.flush()` is a durability barrier over all active write owners | [session-persistence contract:127–138](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-session-persistence/lib/types/index.d.ts#L127-L138>); [JSONL:379–398, 2555–2562](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js#L379-L398>) | [JSONL:379–398](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js#L379-L398>), [2555–2562](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js#L2555-L2562>) |
| Setup/publication timing differs: rc.5 composes before Session publication; rc.1 announces Session before setup but holds Agent wakes; both await setup before Agent publication | [agent-loop:1790–1794](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L1790-L1794>), [1930–1933](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L1930-L1933>) | [agent-loop:1565–1579](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L1565-L1579>) |

## Fixture boundary

[The child harness](<../../test/support/instance-ext.mjs>) now uses the selected SDK's real Cordis `Context` and `SessionStore`, retaining actual validation, private-branded plugin records, and synchronous observer containment. Its model-free driver models pending inbox splices, wake/no-wake, claim/admission order, turn/step boundaries, cancellation, awaited setup and service-wide flush. It does not assemble prompts, execute tools, call a model or implement all AgentLoop maintenance. The pre-existing synchronous registration-scope simulator is not evidence for async Cordis plugin-fiber ownership.

The fixture's retained `sessionLogs` map is the in-memory durable backend: only explicit flush or orderly close advances its restart-visible prefix. Delta inbox replay/flush avoids introducing full-history copies on every message. Historical two-argument user/assistant history-building calls are normalized to valid SDK messages and surface intents; no SDK validation is disabled and no provider output is synthesized by the driver.

[Root test homes](<../../test/support/constants.mjs>) default to a PID-isolated `os.tmpdir()` directory with the established `.runtime/test-homes` suffix. [The runner](<../../test/run.mjs>) propagates that exact root to workers. Explicit test-home overrides remain supported. The product Git-ancestor refusal is unchanged.

## X12 oracle replacement

`XC-EP-STUB-16` is retained as the case identity but no longer asserts the obsolete bridge stub. Its primary classification remains **Equivalence Partitioning**, with an explicit **Decision Table**: a valid operation included in `bridge(pluginId, operations[])` delegates; another valid required operation omitted from that scope returns exactly `forbidden`, produces no outbound frame/request, and creates no new handshake. Only this case and its exact catalogue row changed.

Requirements: [U9 and X12](<../plugins/instance-extension-points.md#L54-L97>), [approved X0-W row](<../plugins/instance-extension-points.md#L574>), [specified scope partitions](<../plugins/instance-extension-points.md#L801-L803>). Request validity: [connector operation definitions](<../connector-contract.md#L303-L308>).

Eight new independently authored [fixture-contract cases](<../../test/instance-ext-fakehost.test.mjs>) exercise routing/snapshot identity, turn-start-before-claim, explicit flush/crash-checkpoint replay, real plugin records/reentrancy, same-turn stepping, cancellation-before-admission, setup publication gating and orderly-close cancellation. All eight and the replacement case pass separately on both SDKs. The crash scenario snapshots the flushed durable prefix before orderly cleanup; it does not incorrectly assume graceful disposal preserves pending input.

## Execution

Node `v24.22.2`; existing installed SDK packages read-only; no install, external network requests or live model calls. Root integration tests use their existing scripted in-process fake model. Every run uses `env -i` and disposable `HOME`, `TMPDIR`, `DSH_HOME`, `DSH_AGENTS_HOME` under `/private/tmp`. No user credentials, `.npmrc`, live DSH home/profile or live GUI were accessed. Existing tests may create generated dummy credential records only inside their disposable fixtures. Install-smoke opt-in variables are absent, so that existing smoke remains skipped.

Commands (no wrappers, test filters, timeout increases or wider sandbox):

```sh
FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/$version/node_modules" \
  node --test --test-concurrency=1 --test-timeout=60000 \
  packages/instance/test/instance-ext/x0-c.test.mjs

FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/$version/node_modules" \
  node test/run.mjs --test-concurrency=1 --test-timeout=60000
```

The root entrypoint spawns plain `node --test` with the requested concurrency/timeout flags; it retains its existing spec reporter. Raw logs are retained in ignored `.runtime/fakehost-verification/`.

### Final matrix

| SDK | Suite | Pass | Fail | Timed out / cancelled | TODO | Skipped | Process |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `0.2.1-rc.5` | X0-C, frozen source | 91 | 1 | 3 case timeouts; process externally stopped after all 104 leaf outcomes | 9 | 0 | Failed to quiesce for 13 min after last result; interruption summary tracked separately |
| `0.2.2-rc.1` | X0-C | 91 | 1 | 3 case timeouts (`cancelled` in Node summary) | 9 | 0 | Exit 1; 104 cases, 182.100 s |
| `0.2.1-rc.5` | Full root runner | 1507 | 0 | 0 | 7 | 17 | Exit 0; 1,531 cases, 1069.355 s |
| `0.2.2-rc.1` | Full root runner | 1503 | 0 | 0 | 7 | 21 | Exit 0; 1,531 cases, 1142.871 s |
| Both | Independent fixture contracts | 8 | 0 | 0 | 0 | 0 | Exit 0 each |
| Both | Replacement `XC-EP-STUB-16` alone | 1 | 0 | 0 | 0 | 0 | Exit 0 each |

Both final root runs completed on the frozen inputs below. The four-pass difference is four existing SDK-dependent skips on rc.1 (`PTA-01`, `PTC-01`, `PTC-02`, `PTC-03`): DSH 0.2.2 ignores `DSH_TOOLS_MODE`, so this older harness does not expose `run_code`. These are reported fixture gaps, not four new product failures. An earlier complete rc.5 root run (before the last four added fixture cases) exited 0 with 1,503 pass / 0 fail / 0 cancelled / 7 TODO / 17 skipped (1,527 total); the final 1,531-case totals supersede that intermediate run.

Frozen rc.5 X0-C termination emitted 105 records including the interrupted file: 91 pass / 1 fail / 4 cancelled / 9 TODO / 0 skipped, duration 972.229 s. Of the 104 leaf cases, the three 60 s timeouts are Node `cancelled` cases; the fourth cancellation is the external file interruption, not another test assertion. It did not complete normally. rc.1 X0-C exited 1 normally after its 104-case summary.

### Residual diagnosis

- **Fixture observation plus independently confirmed product defect: `XC-UC-02-A1`.** The existing case observes only `manager().followups.map(messageText)`, not the same-turn claim or admitted Session messages. SDK `inject` supplies a separate next-step message with its own stable identity; it does not merge held text into an ordinary followup argument. Consequently the emitted assertion (`actual: next user turn`, expected held text) is a fixture/oracle observation mismatch and could remain red even after a correct product fix. No assertion was changed, as requested. Independently, SDK call-chain analysis and real-SessionStore probes confirm a product defect: [held-notice promotion](<../../packages/instance/src/slim/child/extensions.js#L269-L285>) calls synchronous `live.inject` during `session/event` publication of `turn/start`. Both SDKs refuse its nested inbox append: `session append cannot reenter while another append is being published`. The outer turn continues without actual held-notice admission. The fixture preserves this refusal; it neither merges injected context into followup arguments nor permits reentrant writes to manufacture a pass. Deferring the callback is not equivalent because the first claim happens before a deferred callback can run. Fixing this product bug is not claimed to green the existing followup-only assertion. No product fix made.
- **Performance/environment boundary: `XC-BVA-KEYS-9999`, `XC-BVA-KEYS-10000`, `XC-BVA-KEYS-10001`.** The required 60,000 ms per-case timeout is not increased. The frozen rc.5 run emitted all 104 leaf-case results but failed to quiesce for 13 minutes after its last result and was externally stopped; no normal completion is claimed. On termination Node emitted the interruption summary recorded above. Source shows queued/in-flight persistence is not cancelled by timeout/close, though no live stack proves the exact outstanding resource. Final counts preserve timeout cases separately from assertion failures and external process cancellation. Independent review found no remaining fixture full-history replay/flush per command; product `acceptedIds` scans the entire log and notification persistence syncs files/directories for every transition. A separate model-free fixture-only probe accepted/admitted/flushed 10,000 messages / 70,002 session events in 13.418 s while the root suite also ran. This isolates a product end-to-end scale/I/O budget failure, not a dedupe-assertion result; physical filesystem cost remains environment-sensitive. No product optimization or fake fsync bypass made.

- **Existing product TODO: `P3-H-DT-01`** in [HTTPS provider synchronization](<../../test/e1-p3-sync-https.test.mjs#L112>). The root runner preserves its existing TODO assertion: [host safe-profile validation](<../../packages/instance/src/provider-sync-host.js>) rejects a configured HTTP endpoint as unsafe before the engine can return `non-https-endpoint`. Node reports this in its trailing diagnostics but it remains TODO, not an unexpected failure or a fixture exemption. No assertion or product change made.

## Frozen verification inputs

SHA-256 values recorded before the final matrix (unchanged during execution):

| File | SHA-256 |
| --- | --- |
| [child fixture](<../../test/support/instance-ext.mjs>) | `0461518e9ba7dd73282cc83725b16ebc30fd34054fec27fb333e46155f94e2a5` |
| [test-home constants](<../../test/support/constants.mjs>) | `7a18010d23c5f28e0097ba1936edfdf0c4f46702483bb685b0a3e0d09439b53b` |
| [root runner](<../../test/run.mjs>) | `2ef44c7e043f93fc6bdbeb0c0280897465378024134b584afc11c1f58674fff7` |
| [independent fixture tests](<../../test/instance-ext-fakehost.test.mjs>) | `2ca40e7d4251cbf9fb73e4add5905833e75022203d052c5d1888d9a493a77b6d` |
| [X0-C suite](<../../packages/instance/test/instance-ext/x0-c.test.mjs>) | `7726f88ac0a3368f7fa3330ec1d47048424c6ac9fc87acc71a785844afa5d911` |

## Review and exclusions

Independent review covered SDK publication/reentrancy, inbox routing/order, same-turn stepping, setup version delta, all-owner flush, startup promise ownership, callback containment, temp-home propagation and cleanup on partial boot. Fixture findings were addressed before frozen-source verification; final review also corrected the distinction between the existing followup-only case oracle and the separately proven product admission defect. Product source diff is empty. No existing assertion outside the authorized replacement was edited; no TODO was converted to pass, and no timeout was raised.
