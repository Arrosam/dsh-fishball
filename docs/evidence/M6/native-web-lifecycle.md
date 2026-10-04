# Actual native Web runtime lifecycle

Result: the bounded synthetic runtime profile at application commit `6c830ca` passes original native authentication, owner HTTP operations, full DSH quit and same-key/database restart. This is actual pinned DSH Web0.2.1-alpha.1 CLI execution on Node22.22.2/macOS, with the runtime factory selected. It does not accept complete BUB tickets, a portable production installation, rendered UI, useful worker inference or the full MVP. Independent final CODE remains blocked.

The supported configuration adds the public Loader entry dependency `inject: [webServer]` to the original Connection row with explicit `trustedHosts: []`. Its package, namespace, Config/apply, native BrowserAuth and RPC framing remain unchanged; no diagnostic wrapper is selected and no upstream package/global DSH file is patched. The [minimal three-case reproducer](../S3/native-connection-reproducer.md) retains the exact pinned upstream case. Generic unconfigured Connection defaults still reproduce the missing dependency. Keeping the shipped dynamic trustedHosts expression also requires retaining webRuntime injection.

The separate synthetic profile disables the default credentials row and inserts its uniquely identified provider using the shipped public layer compiler. Before ACTIVE, it verifies the actual provider class, native grant metadata, exact private backing path/mode and provider continuity across await. The [selection correction](../S3/native-runtime-web-provider-selection.md) preserves first compiler/equality/path-binding failures. Actual readback reports the verified FixtureCredentialProvider, configured grant and unchanged native BrowserAuth; the earlier literal label is not reused as proof.

| Observation | Initial cycle | Retained restart |
| --- | --- | --- |
| Owned CLI PID / wrapper PID |50460 /50458 |50587 /50585 |
| Launch exec session / final exit |30221 /0 |1469 /0 |
| Native token exchange / anonymous / forged / cross-origin / owner RPC |303 /401 /401 /403 /200 |303 /401 /401 /403 /200 |
| First / duplicate intake deduplicated |false /true |true /true |
| Tasks / protected contexts / sources |1 /1 /1 |1 /1 /1 |
| Task version / authorization epoch / control |3 /1 /paused |3 /1 /paused |
| Actions / workers / executions / sessions / providers |0 /0 /0 /0 /0 |0 /0 /0 /0 /0 |
| Inference / tool / recipient attempts |0 /0 /0 |0 /0 /0 |
| Full-stop readback |disposed; stale reference denied; access file absent; no listener |same; cumulative loads3/unloads3/cleanupCalls6 |

Root ran `node scripts/runtime-web.mjs` with fixed127.0.0.1:3080 and --no-open; then `node scripts/runtime-web-smoke.mjs initial 50460`. After owned SIGTERM50460 and exit0/readback, root ran the same launcher and `node scripts/runtime-web-smoke.mjs restart 50587`, then owned SIGTERM50587 and exit0/readback. All listener/HTTP/SIGTERM actions received managed approval. The launcher uses an explicit five-key child environment and project-owned synthetic paths. No profile reset, key regeneration, credential migration/deletion, model/provider/tool/recipient call or personal/global settings change occurred.

Raw sanitized launch and smoke output: [initial launch](native-web-initial-launch.txt), [initial smoke](native-web-initial-smoke.txt), [restart launch](native-web-restart-launch.txt), [restart smoke](native-web-restart-smoke.txt). Smoke JSON retains exact task/context references and digest: [initial](native-web-initial-smoke.json), [restart](native-web-restart-smoke.json). Their identical references/version/context digest establish retained committed facts without exposing protected content.

Allowlisted readbacks: [initial active](native-web-initial-active.json), [initial stopped](native-web-initial-stopped.json), [restart active](native-web-restart-active.json), [restart stopped](native-web-restart-stopped.json). The32-byte0600 key remained unchanged; the95-byte0600 synthetic auth JSON retained its inode/size/mode/mtime across restart. The pre-existing161-byte0600 YAML under the new synthetic home retained its metadata; its contents were never read, imported or modified. Tokens/cookies/key/grant values are absent from tracked evidence. Private access is ephemeral and removed after each full stop. Final lsof3080 exits1 with empty stdout/stderr.

The native permission-presets plugin remains pending on intentionally disabled shell. The synthetic runtime permission callback denies, and no tool/model path was exercised. Capability flags indicate installed configuration presence only; model readiness explicitly remains unavailable. These observations do not prove configured production permissions or useful nonempty tools.

The first actual dependency failure and subsequent pre-HTTP credential-selection failure remain immutable in [the first launch report](../S3/native-runtime-web-root-first.md) and [the original-profile failure](../S3/native-runtime-web-original-profile-first.md). No failed attempt is converted into a pass. Browser/render/keyboard/window-close/logout, portable installed-host resolution, production policies, real inference/audit quality and independent final CODE remain in [acceptance debt](../acceptance-debt.md). The host is stopped; no daemon or process is left to continue work.
