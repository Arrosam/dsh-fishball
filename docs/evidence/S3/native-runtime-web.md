# Separate actual official Web runtime fixture

Status: prepared and module tested; actual process load/owner HTTP/quit/restart NOT RUN in this checkpoint. Root controls the reviewed bounded launch and any managed listener approval. This is author evidence, not independent code review, browser/visual acceptance or production secret-store/model readiness.

## Reviewable setup and scope

`scripts/runtime-web.mjs` prepares an entirely separate project-local profile and spawns only the existing exact official DSH Web0.2.1-alpha.1 CLI, Node22.22.2, on127.0.0.1:3080 with --no-open. It changes neither the preserved foundation profile nor personal settings/profiles/credentials. Its exact five-key child environment sets project DSH_HOME/DSH_AGENTS_HOME, telemetry disabled and read-only permission mode, with explicit minimal PATH. HOME/CODEX_HOME are not repurposed. No installation/dependency/lifecycle script/network acquisition occurs.

All paths are under `.runtime/dsh-web-runtime-fixture/`: home (new profile and encrypted runtime.sqlite), workspace (empty synthetic cwd), agents (empty synthetic skills root), private (runtime-key.bin, native auth-record.json and ephemeral access.json), evidence (allowlisted observer/readback). Directories are0700; keys/auth/access/profile and evidence files are0600; unsafe symlinks/modes are rejected. Runtime encryption key is randomly generated once as32binary bytes in private storage and retained for restart. No key/token/cookie is a CLI argument, YAML value, environment variable, console field, diagnostic, tracked fixture vector or evidence value. The native launch URL exists only in ignored private access.json and is deleted on fixture disposal.

The wrapper `scripts/runtime-web-fixture.mjs` explicitly imports and selects `createRuntimePlugin` from src/runtime-plugin.mjs, rather than the package foundation default. It privately binds synthetic raw owner/workspace identity and the persistent key. hostPermission and worker permission both returnfalse. Explicit synthetic memory namespace/tokenizer/bounds, a scoped environment registry, empty-tool guard, preview configuration, private reviewer/automation lifecycle hooks, denied recipient adapter and notification route populate feature boundaries. These are configured synthetic capabilities only. No provider/model catalog is fabricated or registered; actual provider route count must0. Model readiness and concrete preview meaning are explicitly unavailable. No agent creation/resume/send, claim, external recipient or tool body is necessary for this test. Disabled account/LLM/tool rows and a native invocation guard fence inference/tool effects; counters are allowlisted. A registered feature flag does not establish a live provider or usable production policy.

## Original native authentication with synthetic backing

The default official local credential provider stores the native browser-session signing grant in YAML. To obey root’s fixture no-key/YAML constraint, this disposable profile selects `scripts/runtime-web-credentials.mjs`, which extends the actual public CredentialProvider. It permits only the exact native client-connection/browser-session grant record and its native version/32byte canonical secret format, stores it as bounded JSON0600 with exclusive read/modify/write lock and atomic rename, and refuses all model/external references, writes, fallback environment/.env/user-home resolution, unknown records/formats, unsafe modes and late reads after unload. This is narrow synthetic fixture infrastructure, not production secret-store acceptance, cross-process crash recovery or an alternative authentication algorithm.

The original installed HostConnection plugin still calls BrowserAuth.create through that provider. It owns secret generation, process token, signed-cookie format, Host/Origin checks and OperatorPeer admission unchanged. There is no isAuthenticated override, fabricated peer, signing shortcut, anonymous endpoint, custom authentication route or browser-bypass surface. Module tests use the original native token exchange and verify operator peer identity, anonymous401, forged401, cross-origin403, signed-cookie persistence across native reload and disposal rejection. They invoke no listener/browser/HTTP request.

| Pinned source | SHA256 | Concrete interface |
| --- | --- | --- |
| dsh-client-connection/lib/index.js | 3950f524aed44e28240140a254cd928ea40eba8e2d04cc8fd04f92a687f5c91d | lines325–340 native credential initialization;391–407 root token GET→303 clean redirect/cookie;585–594 Host/Origin+cookie→original operator;643–655 registered RPC applies native admit before handler |
| dsh-credentials/lib/index.js | c1008e2a37c62ba13e61c2ffdd7451c886e214f131c30ced1a5a67bf06a8df5e | public CredentialProvider extends native Service, ctx.credentials and record interface |
| dsh-base/cordis.patch.yml | 9c2be64f46a193eff3cca190c26e697e8e8eee25c9b40149dfdb56f8142c252d | official server/service bundle, empty startup agents, configured credential row |
| dsh-web-app/cordis.patch.yml | 3073a35dbb1dafd933143e7c299452256073f9f7f5f129aeeeba85a55fa85192 | official browser-surface bundle/HostConnection and Web runtime layering |

All four packages are0.2.1-alpha.1. The runner rechecks exact source bytes and package versions before setup. Existing runtime-plugin/nativeAdapter guards independently verify installed host classes/APIs/runtime-lock and workers, not version strings alone.

## Planned bounded actual-process oracles

After root-approved launch, `scripts/runtime-web-smoke.mjs initial <official-child-pid>` reads only the newly owned private launch URL, validates fixed loopback root before sending it, performs the supported root token exchange with redirect manual, and retains its cookie in process memory only. It submits original native /df-rpc request framing. Expected unauthenticated/forged/cross-origin outcomes401/401/403 precede valid owner200. It registers one synthetic goal, tests complete-event dedup, reads protected detail using current task/auth CAS, pauses new admission and configures one explicitly disabled synthetic internal source. It creates0actions/workers/executions/sessions and checks0inference/recipient/tool counters; no source callback/timer starts.

Full SIGTERM quit should dispose the chosen runtime and private installer hooks, invalidate borrowed diagnostics immediately, close the encrypted store, remove the ephemeral access file and release the sole loopback listener. Root then restarts the SAME isolated profile/key. `restart <new-official-child-pid>` checks retained goal/event dedup, paused control/current task facts and source revision without another task/action/effect. Final quit must leave no listener or private launch URL. State is PID-bound and allowlisted. Any absent auth/owner RPC/process fact is a remaining oracle rather than a mocked pass; denial stops without another port/proxy/browser route.

Reproducible commands (root runs launch/shutdown and uses the PID printed without tokens):

```sh
node --test test/runtime-web-fixture.test.mjs
node scripts/runtime-web.mjs --prepare
node scripts/runtime-web.mjs
node scripts/runtime-web-smoke.mjs initial <official-child-pid>
# Graceful SIGTERM of only the owned fixture launcher/child; inspect disposal.
node scripts/runtime-web.mjs
node scripts/runtime-web-smoke.mjs restart <new-official-child-pid>
# Graceful final quit and listener/access-file absence.
```

Prepared checks:3/3 dedicated module tests pass; syntax74ESMfiles passes; preparation ran with no listener and printed only target/port/private-file-presence labels. The first dedicated run2PASS/1FAIL exposed Cordis scoped service proxies invoking a class method with a proxy receiver and private-field failure. The fixture now binds its private-field methods to the provider, retains explicit unload/late-write guards, and the unchanged native authentication oracle passes. Historical first output is native-runtime-web-first.tap; corrected output native-runtime-web-prepared.tap. No key/token/cookie was printed. The initial candidate hashes remain in historical native-runtime-web.sha256; current corrected fixture hashes are native-runtime-web-prepared.sha256.

Actual host process/profile/HTTP/stop/restart remain not run here. Browser rendering/navigation/keyboard/focus/resize, real model/tool/provider permission, production identity/key composition and final independent code review remain separate unresolved gates. No full MVP/stable/release claim.


## Prepared tokenizer correction

Root identified that the initial fixture tokenizer returned an array rather than ContextAssembler’s required integer count. The wrapper now uses exported fixtureTokenCount, returning the whitespace token count integer; this is explicitly synthetic tokenization, not a real model’s tokenizer. A retained positive actual RuntimeStore + ContextAssembler + MemoryAdapter oracle assembles a protected execution_context, verifies its scoped immutable encrypted content/digest, and leaves0actions/workers/executions. Native HTTP smoke now also prepares and reads exactly one protected current context before pause, verifying its material kind/digest and preservation on restart; memoryRead alone earns no context-assembly credit.

The first added positive test incorrectly treated async prepareExecutionContext as synchronous and closed the store before completion; its original3PASS/1FAIL + late-rejection output is preserved in native-runtime-web-context-first.tap. The corrected test awaits the existing API and passes4/4 with no skips/unhandled work; output native-runtime-web-context-prepared.tap. No production predicate was relaxed. Root’s no-key/YAML constraint is a fixture privacy implementation choice; the owner requires secret exclusion from logs/evidence and no personal credential changes. The separate synthetic JSON credential backing retains original native auth without claiming production secret storage.
