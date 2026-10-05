# NI2 physical startup: independent source diagnosis

This is the root-authorized source-only investigation by `/root/native_functional` of the first original physical CLI startup for archive `a58c522`. It is not an independent CODE review, a replacement for the blocked CODE reviewer, or physical acceptance. No product, native/context import, executable test, host launch/retry, HTTP request, browser operation, credential operation, database operation, install, resolver substitution, or Git mutation was performed in this investigation. The sole new deliverable is this Markdown file. All preceding manager and functional evidence remains held.

The strongest current hypothesis is an unresolved import or activation promise on the original profile startup path. The available evidence does not identify the exact suspended promise, plugin, or declarative defect. **No profile correction is justified by this source investigation yet.** A supported boot-free schema dump on the same profile is the smallest next discriminator; root owns its decision and execution.

## Bound observations and preservation

- Root's preserved `original-cli-first-launch.jsonl` records the original CLI spawn and exit `13`, signal `null`, stdout `0` bytes and stderr `420` bytes. Root reported no observer-state, credential or storage files, and no runtime-policy denial. The native stderr body was intentionally not retained. Exit `13` is therefore consistent with unsettled top-level await, rather than proof of its actual warning text or underlying dependency.
- Root's `root-original-config-dump.json` records successful official `--profile web --dump-config`: exit `0`, stdout `53,358` bytes, stderr `0`, stdout SHA-256 `687a6ef06f2b739799a96e2b442bc918fc77d6862a9f3fdd7db448793c4b0628`. This proves bounded composition, not module evaluation, service activation, or physical installation acceptance. No raw dump was read or exported here.
- The `91` rows of `physical/preparation-held.sha256`, manifest SHA-256 `cd114dfddae72d2e2afe6e509753d9b9201dceebd142c5ca641ce8b850bd8d0a`, matched. The `75` original-public entries from `physical/public-source-pins.json` under `.runtime/dsh-web/` also matched their actual `.runtime/ni2-install/host/` counterparts. These are overlapping binding checks, not independent test counts.
- The `19` rows of `docs/evidence/NI2/manager-independent-artifacts.sha256`, manifest SHA-256 `bad10f59c225371e3960fe882d9a1eca55f55cba5e67a3dd634b27b478dd5677`, matched. No manager file was changed or rerun.

All `.runtime/ni2-install/` paths below refer to the separately prepared original host and frozen archive, not an alternate host or source gate.

## Original startup path and finite source conclusions

| Boundary | Original source | Consequence for this failure |
| --- | --- | --- |
| CLI entry | `host/node_modules/@deepseek-ai/dsh/lib/bin.js`, lines 202–234 and 252 | The profile branch awaits `runProfile`; the executable entry awaits `runCli`. A suspended descendant await can leave this final await unresolved. The callsite alone would not identify its descendant. |
| Profile preparation | `dsh/lib/profile-boot-BZ2ZjNWi.js`, lines 205–218 and 258–293 | The original resolution is prepared; `profileContext` and launch environment are provided; original `PluginPackages` is awaited; command-line services are provided before mounting the tree. A successful plain config dump does not execute this activation path. |
| Tree settlement and audit | `dsh-app-boot/lib/index.js`, lines 4155–4216 | Boot awaits original Loader, preparation, root Include and Loader settlement before its audit. Warnings/errors are captured as startup diagnostics. Cleanup is awaited in the catch path. A wait before audit is the main hypothesis; a failure followed by unresolved cleanup is not excluded by count-only output. |
| Missing dependency | `cordis/lib/index.js`, lines 1303–1349; `cordis-plugin-loader/lib/index.js`, lines 146–159 and 648–651 | A missing required service ordinarily leaves a fiber inactive. Loader waits actual import tasks or fiber inertia. A stable missing service alone need not keep an await unresolved; it can reach the pending-entry audit. The default Loader construction does not set its optional `await` service check. |
| Web service chain | Original `dsh-web-app/cordis.patch.yml`; `dsh-web-app/lib/startup.js`, lines 16–40; `dsh-web-app/lib/index.js`, lines 34 and 179; `dsh-host-webserver/lib/index.js`, lines 228–302 | `cmdlineArgs → webStartup → webServer → webRuntime` is still represented. The prepared patch changes runtime configuration but does not delete the original `webStartup` row injection. Browser and URL printing are disabled, so the optional print/browser callback's Loader wait does not explain the startup. |
| Connection dependency | `dsh-client-connection/lib/index.js`, lines 798–822; Cordis `Inject.resolve`; Loader lines 628–633 | The prepared row's `inject: [webServer]` is added to the original module's `inject: [credentials]`. It does not erase the credential dependency. Reintroducing a service shim, removing credential checks or weakening the original class gates is unsupported. |
| Empty native preset | `dsh-agent-preset-registry/lib/index.js`, lines 496–523; `dsh-scope/lib/index.js`, lines 287–306 | Registration mounts a scope under the registry's preserved owner context. The scope plugin is a no-op. No specific self-await cycle was established for the empty preset. This source observation is not an executed preset proof. |
| Product and observer imports | Frozen `source-a58c522/src/host-probe.mjs`, `src/installed-plugin.mjs`; `physical/observer.mjs`, lines 5–11 | These modules contain top-level dynamic original-public imports. Loader evaluation and the observer's import closure remain plausible wait boundaries. Importing the same module from the observer is not, by itself, evidence of a deadlock. No imports were executed to investigate it. |

The original server's initializer normally creates a server and awaits `listen`; the connection's apply awaits original browser-auth creation. The first launch's absent files do not prove either initializer's exact progress, nor do they distinguish import failure from later activation or cleanup. The frozen manager's actual no-listener results cannot substitute for these physical progress facts.

## Smallest supported next diagnostic

Root proposed official same-profile `--dump-config-schema`. Source verification confirms that it is a supported import/metadata discriminator without mounting:

1. `dsh/lib/bin.js`, lines 244–247, dispatches to `runDumpConfigSchema`.
2. `dsh/lib/dump-config-schema-DhhNOaro.js`, lines 20–38, prepares the existing profile, collects the same ordered layers and calls `generateConfigSchema`. It does not call `boot`.
3. `dsh-app-boot/lib/index.js`, lines 3078–3088 and 3264–3276, builds the same original runtime-resolution interception and obtains the original `ModuleLoader`. This is the official profile resolver path, not a workaround.
4. Its walker, lines 3180–3244, sequentially awaits `loader.import(row.name, baseUrl, {})`, unwraps plugin exports and reads `Config` through `configOf` at lines 3037–3039. It creates no host Context, mounts no Cordis plugin, and invokes no plugin apply or plugin constructor.
5. It imports disabled rows as well. Trusted module top-level code, Config getters and lazy schema builders execute. `!!js` expressions, native validators and transform callbacks are not executed. Profile preparation can initialize missing profile files; the proposed target is the already existing exact profile.

Root can bound this official command to 10 seconds on the same profile, with the existing environment and package resolution. Raw stdout/stderr must remain in memory only. Retain exit/signal/timeout, byte counts, digests, and a strict allowlist of warning/error category plus original package/file basename and line. Do not retain raw configuration, schema bodies, stacks, errors, paths containing secrets, tokens or credential values. This document does not perform or report that command.

| Diagnostic result | Permitted inference and next boundary |
| --- | --- |
| Settles with a complete schema | Sequential plugin import and metadata discovery settled. Physical activation, the parallel Loader import schedule and cleanup remain unproven. A passive early observation of original public Loader/Cordis entry lifecycle is then the relevant next diagnostic; no gate change follows. |
| Settles with incomplete schema/error | Preserve allowlisted category and package/file/line or declared row ID. Inspect that exact source boundary before choosing an original-supported declaration repair. Schema completeness errors must not be silently classified as the original startup cause. |
| Exit 13 with an allowlisted unsettled-await warning | Confirms an unsettled await in this boot-free import/metadata path. The printed CLI callsite may still be only the outer await; it does not name the unresolved descendant automatically. |
| Timeout or another exit | Preserve the first result. It does not authorize repeated launches, an alternate profile, port, host, service, resolver or permission path. |

## Exact source anchors

SHA-256 values were read from the actual installed source bytes. Previously pinned public files matched the host-copy binding above; the schema module, startup module and scope module are additional explicit inspected anchors.

| Actual original installed file | SHA-256 |
| --- | --- |
| `dsh/lib/bin.js` | `1a03dee18683483ff6a1b27b2a1e650230da6bcca9a0f55f7d81b3308c3f307f` |
| `dsh/lib/profile-boot-BZ2ZjNWi.js` | `c394b2aa2ce08a3b1fcc8c544257c7d689dd4d0b1cfaf8602687e65eeaba5aa1` |
| `dsh/lib/dump-config-schema-DhhNOaro.js` | `85c7eef6eee4532570133d3b90487996e912216b96825e33c1bb659036a269f1` |
| `dsh-app-boot/lib/index.js` | `619d80619320e953e5ddcee7c71e4b97e90e722a7d17da8819f3bb47e00587be` |
| `cordis/lib/index.js` | `6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e` |
| `cordis-plugin-loader/lib/index.js` | `638b9ad360e01236120772323f80a65570c4f3f42f4cfc6243330241025b6d72` |
| `dsh-web-app/lib/startup.js` | `4568ec210759973d102a07402e9dfe42eb448543d49e4a701f4861a8bb3a6694` |
| `dsh-web-app/lib/index.js` | `c8b9ba271bddffd052cdba8ae86f758fc1a377bc058e7d81f9cc2571a8c6ed85` |
| `dsh-host-webserver/lib/index.js` | `6efea1375eadeff62d5cfb6d1f515ff75a939d40405a62e5d138e8e7a6b18df5` |
| `dsh-client-connection/lib/index.js` | `3950f524aed44e28240140a254cd928ea40eba8e2d04cc8fd04f92a687f5c91d` |
| `dsh-agent-preset-registry/lib/index.js` | `7e23c01514303b2dfa1b69a95929cb19e43ba761d3478a3104d0f565ca537be7` |
| `dsh-scope/lib/index.js` | `2829df71d76e08941457d4dd173eac60783e55354921137c8b75e8b5c0d2ecca` |

The bound physical patch is `9c5528bd3ac54b43a93c9cac2ba924e7bfee6e766371f9c786bb73b9813729d5`, observer `61cc8320586f2a8e6a6f289997585171f9c09fc496ed3880ed8a1c3782fd24c2`, and launch wrapper `3f8a253b9f386e188e3ee069b33d8b9bf6ea0432487d3df4701448bd75517f5d`. First-launch count evidence is `ed67f467dc5ebf97df025825374349ffd32431c76956d508301193af83a90f73`; successful plain-dump summary is `0ec2cf6f0b2bab12f8d7ce534649af3c5a4436c52be872714ad9bb557eb3e58c`.

Verdict: source diagnosis is complete within its authorized boundary, with the exact startup cause still unresolved. No declarative correction, physical success, model quality, browser/CODE acceptance, full 82+5 acceptance, MVP or publication GO is asserted. Root's first launch and all residual holds remain preserved.
