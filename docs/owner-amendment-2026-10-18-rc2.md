# Owner amendment 2026-10-18: DSH Web 0.2.1-rc.2 host and Claude Opus 5.5 lanes

Recorded by root (Claude Opus 5.5) from direct owner answers in the DSH Web session on 2026-10-18 (Pacific/Auckland):

1. **Host baseline.** In answer to whether to run the pinned alpha.1 `host:setup`, the owner wrote: "Swtich to 0.2.1-rc.2 version to test". The isolated project test host moves from official DSH Web `0.2.1-alpha.1` to official `0.2.1-rc.2`. This is the explicit re-evaluation of a newer release that [compatibility](compatibility.md) requires. It is not a floating dependency: every version, source hash and the whole lock are pinned again to rc.2.
2. **Model routing.** In answer to how to handle the Sol 6.1 author/reviewer routing that this session cannot provide, the owner wrote: "Change to use Claude Opus 5.5". Authors and the independent code and ISTQB reviewers for this work are separate Claude Opus 5.5 sessions. These reviews are recorded as Opus 5.5 reviews. They do not retroactively satisfy, or reroute, the separately blocked historical final CODE investigation.
3. **Direction.** The owner selected "Restore a green full-suite baseline" as the next unit before more NI4–NI6 feature work.

Unchanged: Git stays local (no push even though an `origin` remote exists in this clone), there is no publication, no real model call is made in this unit, no personal profile or credential changes, all 87 criteria remain HOLD, and the release channel stays preview.

## Host provenance (rc.2)

- Source tree: the owner's already installed official rc.2 version directory, `~/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules` (615 packages). Root copied it byte-for-byte into the ignored project-local `.runtime/dsh-web/node_modules`. Nothing was downloaded and no lifecycle scripts ran in this unit. Five packages declare install scripts (`@deepseek-ai/dsh-subprocess-local`, `@google/genai`, `koffi`, `node-pty`, `protobufjs`). Their state is whatever the official installer produced; the DF product does not import them.
- `@deepseek-ai/dsh@0.2.1-rc.2` integrity `sha512-tvY+yhfKRifthbqPe/OK0AYxM5ZkvqfYq/jMYgJcEUxiRRL1Vwra3Ti5TB6AXgSWQdiPHYh/Vp6SJa9yHwMNuw==`, matching the [npm registry record](https://registry.npmjs.org/@deepseek-ai/dsh/0.2.1-rc.2). On 2026-10-18 the registry dist-tags were `latest 0.2.0-rc.2`, `next 0.2.1-rc.2` and `alpha 0.2.1-alpha.5`.
- The tracked [lock](../scripts/dsh-web-runtime-lock.json) was regenerated from the installed tree's own `node_modules/.package-lock.json`. Every package's version and integrity is unchanged. Only the `resolved` host was normalized from the installer's mirror (`registry.npmmirror.com`) to `registry.npmjs.org`, so that a later explicit `host:setup` resolves against the official registry under the same integrity.
- Runtime used: Node `v22.22.2`, Python `3.15.0`. AGENTS.md records 3.14.5, and the manifest builder ran on 3.15.0. The difference is recorded here rather than hidden.

## Breaking host API changes found and how DF adapts

| rc.2 change | DF adaptation | Security note |
| --- | --- | --- |
| `HostConnectionService.operator` ("the operator Peer every admitted request speaks for") was replaced by `browserPeer` ("the Peer every authenticated browser connection shares"). rc.2 also adds independent per-credential **API Peers** minted by the launch-token `/connect` exchange. | `ownerPeerOf(connection) = connection.browserPeer` in [operator-bridge](../src/operator-bridge.mjs), used by the bridge, the installed setup and local results. | Owner authority stays exactly as narrow as in alpha.1: only the shared authenticated browser Peer. API Peers, a stale alpha-shaped `operator` carrier and forged wrappers are refused (`BRIDGE_CONFIG_INVALID` / `OPERATOR_REQUIRED`), and new tests pin this. Admitting API Peers would need a separate owner decision. |
| `BrowserAuth` contract adds `authenticateApi`. | Synthetic test BrowserAuth stubs return `undefined` (no API credentials). | Fail-closed fixture; no product change. |
| `@deepseek-ai/dsh-session-persistence-jsonl` now exports a plugin namespace (`apply`/`Config`/`name`) instead of a default service class. | Provenance binds the exact pinned module namespace held by the Loader entry, `instanceof SessionPersistence` and the backend label `session-persistence-jsonl` ([worker facts](../src/installed-worker-facts.mjs), [native adapter](../src/native-adapter.mjs)). | The base class alone would admit any backend; the label check plus the namespace-identity check keep the binding to the pinned JSONL backend. |
| Source bytes of 38 of 58 pinned host files changed (20 are byte-identical, including Cordis core, the Loader and the token-meter estimator). | Pins remapped by exact file, with each new hash computed from the installed rc.2 tree. | Same fail-closed pin checks; no check removed. |

Remaining failures, their root causes and the review evidence are recorded in [H1 evidence](evidence/H1/rc2-baseline.md).
