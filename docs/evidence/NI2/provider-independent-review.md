# NI2 independent synthetic-provider functional checkpoint

**PASS for this bounded functional module checkpoint; NI2, normal installed execution, independent CODE, browser, model quality and full source-AC/product acceptance remain HOLD.** The independently authored [test](../../../test/testing-provider-adversarial.test.mjs) ran once and passed **58/58 TAP test nodes** (15 top-level families and43 nested nodes;50 leaf tests), with0 failures, skips, cancelled or TODO tests. The unchanged authored provider test separately passed21/21 nodes. The independent source was not repaired or changed after its first run. No product counterexample was found within this lease.

This report binds the provider logical unit `6f7d49e`, the [frozen first-unit design](test-design.md) SHA256 `f37f4b66e2c5f69a818afd83c52c7040cc3cf5c00c47b5d5de5336bd954efaea` and the [author hold](provider-author-hold.md). The author's19-entry manifest SHA256 is `4ec2fe0075a8d88d7cfbf5bb6ed0aec71f465aaccb0d67fdc5757cb2c6632162`. Concurrent work in unrelated installed/composer/native/client files does not become part of this checkpoint. Root alone performs Git operations and later integration.

## Scope, provenance and source stability

The fixtures instantiate the actual pinned original public Cordis Context, Loader Entry, LlmRuntime/LlmAdapter, AgentRegistry/AgentLoop, SessionStore/projection, JSONL persistence, SystemPrompt, ToolRuntime and approval services. Genuine original idle agents/sessions supply ownership and initiator identity. The provider is loaded through the original public Loader package subpath and actual namespace. Calls use the original LlmRuntime `prepareCall`/`stream`, public prepared-call iterator and original current-initiator context. No private adapter map/registration getter, alternate harness or service replacement is used.

The fixture invokes the source-owned deterministic adapter directly through those public streaming APIs; it does **not** send a complete AgentLoop turn or establish persisted native completion/capture. Its `assertCurrent` callbacks are explicit trusted fixture doubles. The “current false” and seal/disposal orders prove that private callback/source gates take effect; they do not prove atomic real-ledger revoke/claim ordering, authenticated owner RPC or normal installed composition. An additive unrelated synthetic adapter demonstrates that an unrelated genuine native agent retains its route. Both adapters use fixed local text, with no network, model account, paid inference or tool body.

All187 recorded files matched immediately before execution and after both runs, including6 own-module files,175 public-runtime files and the lock/package/author/design evidence. The inventory records335 conservative literal import/require edges,12 explicit public roots, consumed public declarations, the exact host lock and the selected Darwin-arm64 Koffi binary. This is a conservative closure of the exercised fixed roots; it does not certify arbitrary future dynamic imports. Details and realpath observations are in [before](provider-independent-before.json) and [after](provider-independent-after.json). All19 author-manifest entries also match.

The first **static inventory scan**, preserved in [its original JSON](provider-independent-before-first.json), reported14 missing other-platform Koffi branches and exited1. Inspection of the public conditional platform loader showed that these branches target Linux/FreeBSD/OpenBSD/Windows/Darwin-x64, while the selected Darwin-arm64 binary is present and pinned. The current inventory explicitly separates14 unused optional branches and0 unresolved current-platform imports. No installation, filesystem workaround or module execution was used to reconcile that static inventory. This is not a functional test failure or a product defect. The first functional TAP is a clean first-run PASS.

| Held file | SHA256 |
| --- | --- |
| `src/testing-provider.mjs` | `524ac375aaf4011536ebc1e2b9f8c418d96a2c5f242329a278f55afcfbb3d8d7` |
| `src/config.mjs` | `e738a6c50b41140e8d8d1f00dcf4e35868aba6a521d1d72bc804888831d248d8` |
| `src/installed-worker-config.mjs` | `8a9f454fc4b0bc14078107a17e4cb7db03580098ad2d8c5f61f6721e351c4a13` |
| `src/runtime-security.mjs` | `6edf9f8a544444169f9190fc5e24230ab3a0928ea8d7c295f1b085824c91ac07` |
| `src/ledger.mjs` | `64cc42e1a834701263c260f311d05d113c6e34af67017901cfd7a95f22c9b650` |
| `src/host-probe.mjs` | `03e34e0bc3e82a8cbc0841a8f208cf98eac99e8accd7393f2997d394581d33c8` |
| `package.json` | `a1d5a7886e690dd8f715b5ae9059fc8c6eaef22a322071d84aa515b1c9e46e58` |
| Authored `test/testing-provider.test.mjs` | `50b7f2022a8360fee2bdf5f325cd6be3fd50432612f5b8b375b01d04691a3baf` |
| Independent `test/testing-provider-adversarial.test.mjs` | `3ab4368cfb472627bf032a280e3e11efa1348b2a065f9a013e68f2470cfabeaf` |

The original public Cordis `symbols.original` identity declaration is pinned and included in the inventory. Service operations still use the original scoped proxies. Root's separate future `ReflectService.get` adaptation for installed children without `llm` injection is **not tested or accepted here**; this checkpoint uses the held provider's declared dependencies and never silently supplies missing integration services.

## Independent expected and actual oracles

The exact Pxx names below are reproducible test-family selectors in the checked-in file. Every family passed in the first TAP. These supplement the authored fixtures; they do not convert the authored21 cases into independently designed cases.

| Family | Independently selected expected oracle | Actual result |
| --- | --- | --- |
| P01 | Empty provider config only; hidden/symbol/revoked-Proxy/accessor/constructor/undefined extra fields refuse with stable `CONFIG_INVALID`,0 descriptor traps; dependencies/value frozen. | PASS;0 traps and exact3 declared service names. |
| P02 | Original Loader namespace/current entry and original idle agent creation do not enter a provider iterator; issue/prepared-call/iterator construction have0 callbacks/usage. Late private seal then denies. | PASS;0 boot sessions/files before agent creation;1 idle native session afterward;0 pre-iteration callbacks/usage. |
| P03 | A callback becoming false between iterator construction and first `next` denies once. Restoring true does not revive that sealed permit. | PASS;1 callback,0 output/usage,0 repeated callback. |
| P04 | Actual whole escaped JSON messages at511/512/513 bytes under request cap512: first two consume once, third denies before callback/usage. | PASS at all3 reachable boundary values; actual input exceeds plain-content bytes. |
| P05 | Actual whole escaped JSON messages at131071/131072/131073 bytes under cap131072; native projected request includes full ordered source-bearing messages. | PASS; first two exact input counts/response, third0 callback/output/usage. Content remains<=65536 bytes. |
| P06 | Total reservation is actual messages-JSON bytes plus the exact fixed response: N-1 denies, N/N+1 consume once with additive immutable usage/digest. | PASS; native usage and private usage agree; attempted mutation of frozen usage fails. |
| P07 | Well-formed content at65535/65536 bytes roundtrips;65537 and lone high/low surrogate forms refuse before a permit is minted. A corrected input remains issuable. | PASS; valid response hashes use exact original UTF-8 content; malformed refusal does not consume the agent's permit. |
| P08 | Exact token/result/request/usage numeric endpoints; fractions/nonfinite/unsafe values deny. Accepted permit values alone do not claim an actual stream fits. | PASS for20 named partitions. Numeric refusal is `INVALID_INPUT`; valid unconsumed permits have usagenull and are explicitly sealed. |
| P09 | Closed private issue input rejects Proxy/revoked/getter/hidden/symbol/null-prototype/extra authority with0 reflection/callback traps. Mutating the original accepted scalar/callback properties cannot swap the captured permit. | PASS;0 traps,0 callbacks during refused issue; subsequent original approved content consumes once. |
| P10 | Once the first delta has been produced, consumer return/abort cannot erase consumption or renew a permit; usage remains charged even though the consumer stopped before later chunks. | PASS; exact usage already present at first delta,0 retry output/usage chunk,1 callback total. |
| P11 | Synchronous source callback privately sealing the permit or beginning disposal of the **same own provider Entry fiber**, then returningtrue, loses the final source gate before output. | PASS for both orders;0 output/usage,1 callback. This is own-entry closure, not an unsupported immediate ancestor-quit promise. |
| P12 | False/throw/Promise/thenable is not literal synchronoustrue; thenable is not awaited; canary exception is redacted and permit cannot be retried. | PASS for all4 partitions;0 then calls,1 callback,0 output/usage or raw canary. |
| P13 | Another genuine agent, even with the public marker and same DF prefix, cannot use the original agent's permit. An unrelated genuine agent's synthetic route remains usable. | PASS; wrong agent0 callbacks/usage; unrelated stream1; rightful original stream1. |
| P14 | Prepared call retains an old source registration; a topology update followed by removal does not revive it. Only an explicit original own-entry reload yields a new live binding; old private binding remains denied. | PASS; old output/usage/callback0, fresh genuine agent under new binding1 exact response, old permitusage stillnull. |
| P15 | Already-aborted signal, unknown string proof, extra user provenance, extra content block and system ID129 UTF-8 bytes refuse before the private callback. | PASS for5 partitions;0 output/usage/callback. Native pre-processing is distinct from the private issue parser; this report makes no universal public-LLM Proxy trap0 claim. |

The fixed response is exactly **113 UTF-8 bytes**, below both configured minimum output cap128 and minimum maxTokens128. Therefore an actual response-length N-1/N/N+1 overflow is unreachable in this source unit. P08 validates those permitted configuration endpoints and P06 measures the actual113-byte output; it does not fabricate an oversized provider response. The largest admitted request plus this response is131185 bytes, below advertised synthetic context135168. Saturating the advertised context window is likewise unreachable under these stricter caps. The per-entry128-issued-permit growth ceiling was not stress-executed; the normal composer/one-worker admission and global/native load limits are not established by this module run.

## Commands and raw evidence

Runtime is the approved installed Node22.22.2 on macOS27.0 arm64. Each command uses the established sanitized environment. Exact machine-readable counts/hashes are in [after.json](provider-independent-after.json).

```text
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test test/testing-provider-adversarial.test.mjs > docs/evidence/NI2/provider-independent-first.tap 2>&1
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test test/testing-provider.test.mjs > docs/evidence/NI2/provider-independent-authored.tap 2>&1
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --check test/testing-provider-adversarial.test.mjs > docs/evidence/NI2/provider-independent-syntax.txt 2>&1
```

| Command evidence | Exact result | SHA256 |
| --- | --- | --- |
| [First and final independent TAP](provider-independent-first.tap) | 58/58 PASS;15 top-level+43 nested;0fail/skip/cancel/TODO;819.680167ms;exit0. No post-run source change or repeated independent execution. | `79e86afa42f6fbcf06ea540e31a9fffb14fd5d0a4d0c9e799d1ec92d92c1725b` |
| [Unchanged authored TAP](provider-independent-authored.tap) | 21/21 PASS;8 top-level+13 nested;0fail/skip/cancel/TODO;559.510167ms;exit0. | `45a8259232271e2692b7c64de4c64ad49b6d2cb353e6bde0458344b921f530ad` |
| [Syntax output](provider-independent-syntax.txt) | Independent file syntaxcheck exit0; outputempty. | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The full independent source before first execution is archived in [first-test.mjs.txt](provider-independent-first-test.mjs.txt), byte-identical to the held test, and [first-source.json](provider-independent-first-source.json) records that exact hash. All pre-existing author failures/second/third/final source and metadata evidence remain unchanged. No old test or source assertion was weakened or removed. Only the new independent file and new `provider-independent*` evidence were written.

## Retained source-AC contributions and debt

Every45 NI2 source row, all82 original criteria and current DF010-C01..C05 remain in the frozen design/root acceptance register. The following are the observed **module contributions**, never whole-AC acceptance:

| Source criterion | Exact bounded contribution | Still unproved here |
| --- | --- | --- |
| BUB004-04 | P10/P11 distinguish admission closure before output from already-consumed output/usage. | Native cancellation, committed-session result, factual stopped/drained settlement and external-effect safety. |
| BUB004-05 | P03/P10/P14 refuse repeated/old prepared output; no automatic provider replay. | Full native event-feed gaps/reconnect/reconciliation and durable restart. |
| BUB006-01 | P09/P13 public marker/name/native prefix and foreign real agent do not acquire a private permit. | Actual operator/authenticated RPC, ledger owner/workspace and model/transport authority boundaries. |
| BUB006-02 | P03/P11/P14 private current/source/lifetime changes defeat stale request admission. | Real exact grant/task/auth/expiry/revoke CAS and policy/catalog/environment drift. |
| BUB006-03 | P01/P09/P12 refuse direct hostile descriptors and redact injected callback exceptions. | Registered secret scans through normal logs/export/memory/native persisted transcripts/result/UI. |
| BUB006-04 | P04/P05/P07/P15 require exact approved content and source-bearing system/user messages. | Actual normal assembled context and selected external recipient/provider minimization. |
| BUB008-03 | P04–P08 exact synthetic UTF-8 input/output/usage partitions. | Heuristic prepared-context/protected refusal and real provider tokenizer/capacity. |
| BUB008-04 | P13 rejects a different actual agent; P15 rejects extra source/content. | Full owner/workspace/task/background/native-history canary isolation of assembled input. |
| BUB008-05 | P14 stale original registration cannot regain currentness merely by restoring a route name. | Current ledger completion, tools, preset, environment and rendered freshness. |
| BUB012-02 | P02/P13/P14 actual original provider registration/model routing and lifetime. | Normal owner policy selection/display, full catalog/preset currentness and real-model usefulness. |
| BUB012-03 | P03/P10 one consumed/sealed permit cannot repeat; provider has0 retries in unchanged authored metadata oracle. | Durable shared attempt/resource budget and NI3 charged review/repair rounds. |
| BUB012-04 | P04–P08 whole JSON plus exact113-byte response provides labelled additive synthetic usage, separate from reservation bounds. | Real ledger charge settlement/source-bound zero-cost policy, generic unknown-cost refusal and commercial billing. |
| BUB012-05 | P01/P04/P05/P07/P08/P15 closed/finite/byte bounds and malformed refusal. | Queue/last-slot concurrent ledger admission,128-permit lifetime growth, native persistence/load/SLA. |

Original BUB001 load/reload/unload and BUB016 provenance/evidence receive only P02/P11/P14 and exact recorded-source/command contributions. BUB003 encrypted persistence/CAS/migration is not exercised in this provider-only unit; its separate completed foundation evidence remains unchanged. All other source rows remain unchanged pending obligations rather than inferred PASS. BUB004-03 and resumed/continued BUB008 work remain a separately proposed future unit; no resume is executed or accepted here.

Normal lazy composer, private original ApprovalPreview integration, actual scoped default/fixed prompt, prepared-memory/context origin, native plaintext persistence consent and full original AgentLoop output capture/finish remain pending. The separate [preview-seam test addendum](preview-seam-test-addendum.md) is design-only. Physical package/CLI/profile lifecycle, actual browser/rendering, useful model/provider work, tools, recipients and final independent CODE remain HOLD. Live chat platforms/accounts remain OUT OF THIS PHASE, neither failed nor passed. No policy denial was bypassed, and no blocked CODE or browser experiment was retried.

The owned test/evidence are now **HELD** under [the independent manifest](provider-independent.sha256). Root may commit this bounded functional unit and release its held dependencies for subsequent integration. A future change to these consumed bytes requires a new appropriately scoped fixture/provenance checkpoint; this report does not silently apply to later code.
