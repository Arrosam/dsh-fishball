# dsh-fishball (df)

A native DeepSeek Harness (DSH) implementation of fishball's memory domain and a bounded personal-assistant workflow. DSH owns tools, models, permissions and agent execution; df owns durable coordination, scoped memory and product state. There is no separate harness or daemon. Full DSH quit stops df.

This is local staged development, not an accepted MVP or release. The intended eventual public repository is **Arrosam/dsh-fishball**; no remote exists and no push/publication is authorized before full agreed preview acceptance. The owner chose [MIT](LICENSE); [source and host notices](THIRD_PARTY_NOTICES.md) record the actual incorporated boundary.

The [latest owner amendment](docs/owner-amendment-2026-10-04.md) keeps a provider-neutral chat adapter contract in this phase and moves actual chat software/accounts/provider delivery to a future phase. Mobile fishball controlling DSH through Hydrogen tools is a much later ambition, outside current work. Native DSH execution is independent.

## Current development

The owner approved [all three stages](docs/three-stage-development.md), with unit/module tests and separate independent code/ISTQB reviews throughout, followed by consolidated functional/visual regression after Stage3. Reviewed units squash into local main as development integrations while granular branches survive. Main is not an acceptance, stable or release designation.

Foundation covers bounded DF001/003/006 and minimum DF012. Stage2 implements the coordinator, durable task, native worker, scoped messages/context, resource controls and local result/control loop. Its final security review remains a development gate. Stage3 adds durable memory/events, chat contracts, results, actual native UI and runtime independent review/repair. All applicable full ticket criteria remain required; see [backlog and BUB aliases](docs/tickets/README.md) and [acceptance debt](docs/evidence/acceptance-debt.md).

The memory module translates pinned fishball memory search, TTL, similarity and snapshot/JSONL behavior into ESM. It is not compiled Kotlin/JS or reuse of the whole Kotlin core/application. [Provenance](docs/fishball-provenance.md) identifies exact source bytes, owner contributor history and semantic corrections. Personal fishball files are never inspected or automatically shared/imported. Memory summaries never authorize work; the transactional task/action/approval ledger is authoritative.

## Local workflow and checks

Read [AGENTS.md](AGENTS.md), [development workflow](docs/development-workflow.md), [runtime API](docs/runtime-api.md) and [stage mapping](docs/three-stage-development.md). Ticket files retain BUB names as historical aliases for same-suffix DF IDs; original approved source text stays intact.

The pinned target is **official DSH Web 0.2.1-alpha.1**, verified as the newest published official preview on 2026-10-04. The isolated runtime uses its tracked exact dependency lock with install scripts disabled. Development uses Node22.22.2; the ledger/build use Node built-ins. No new build dependency, SDK runtime, DSH-X launcher, dsh-std, old Desktop shim or Electron acceptance is introduced. [Compatibility](docs/compatibility.md) records exact public API findings and limitations.

```sh
npm run check
npm run host:smoke
# Full npm test regression follows completion of Stage3.
```

`host:setup` is the explicit reviewed downloader; launch/test never downloads dependencies. Tests use synthetic identities/secrets/stores and explicitly mocked providers. Genuine public Cordis/AgentLoop fixtures are distinguished from real external inference; no paid or external model call is authorized. Native owner operations use DSH's admitted operator peer; production identity/key/policy provisioning remains an explicit trusted composition boundary, with default-deny effects.

`host:web` and `host:profile-smoke` operate only on a project-local synthetic Web profile at127.0.0.1:3080. They do not use personal accounts/settings/credentials. Managed approval may be needed for loopback listening; denied actions stop. Current browser automation could not observe the page, and actual native UI/visual/window-close validation remains deferred. No validation host is left running.

The [rename/storage compatibility record](docs/rename-compatibility.md) explains current identifiers, preserved old data paths/contract aliases and any crypto recovery gate. Unsupported or unverifiable records fail closed and remain preserved. Default release channel is preview; stable requires an explicit owner request.
