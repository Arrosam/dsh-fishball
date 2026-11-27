# dsh-connector-watchdog

A helper of the agent that manages a session (such as Fishball): it supervises the session against its purpose and answers its permission requests within the approvable scope. Its own package and DSH bundle; it is also installed by the `dsh-connector-amenities` umbrella.

Design: [watchdog-project-notes.md](../../dsh-connector/docs/watchdog-project-notes.md). It needs `dsh-agent-connector` in the same DSH. Without it, the row loads and stays idle.

- **Tools for the managing agent** (over the connector's MCP, namespaced `dsh-connector-watchdog.*`):
  - `watchdog_session_start({folder, title, message, attachments, model?, reasoningEffort?, purpose, scope?})` starts a session exactly as the connector's `session_start` does, and briefs Watchdog on it before its first message is sent. Watchdog then supervises the session from its very first request. The answer is `session_start`'s plus `supervised`. It is listed only when the connector offers `dshConnectorSessions.start`.
  - `watchdog_brief({sessionId, purpose, scope?})` assigns Watchdog to a session the caller manages. `purpose` is required; `scope` describes the permission requests Watchdog may approve.
  - `watchdog_refine` changes the purpose and/or scope. It does not move the patrol timer.
  - `watchdog_pause` stops the session's turn and pauses supervision; `watchdog_resume` restarts it.
- **Permission requests:** Watchdog decides each one before the manager sees it, through the connector's `dshConnectorSessions` delegate:
  - within the scope → allow (one call only);
  - beyond the purpose and dangerous → reject, with a reason;
  - anything else, including high-risk requests it does not reject → passed to the manager. Watchdog never escalates a request to the user.
  The manager receives a `settlement {by: "delegate"}` for every request Watchdog decided. A request Watchdog passed on arrives as a normal `permission` offer that also carries `delegate: {name: "watchdog", outcome, reason?}`:
  - `outcome: "passed"` with the judge's reason: Watchdog judged the request and left it to the manager;
  - `outcome: "failed"` with the failure's code: the judgement did not happen. The codes are `judge-timeout` (`checkTimeoutSeconds`), `judge-no-answer`, `judge-unreadable` (no valid verdict) and `judge-failed`. Failures are logged too.
  Requesting a wider sandbox (`danger-full-access`) does not by itself put a call outside the scope: the judge decides on what the command does.
  Watchdog only sees requests made after its brief. A request that was already waiting for the manager when the brief arrived stays with the manager. A session started with `session_start` runs before any `watchdog_brief` can reach it, so its first requests can come to the manager; `watchdog_session_start` closes that window.
- **Patrol:** each supervised session is checked every `minCheckIntervalSeconds` (default 1740). A patrol reads only messages newer than the last one judged, and does nothing if there are none.
- **Drift:** if a patrol or a permission check finds the session drifting from its purpose, Watchdog stops the session's turn (the manager's `turn-finished` then reads `stop {kind: "aborted", message: "the turn was cancelled (hook: Watchdog stopped the session (<during>): <reason>)"}`, not "(user)") and emits `dsh-connector-watchdog.drift` to the manager: an event of type `contributed:dsh-connector-watchdog.drift` whose `payload.data` is `{sessionId, during, reason}`. On a drift found at a permission request, the request is rejected first and the turn is stopped right after. The manager can still message the session.
- **Judging** runs in a side session on Watchdog's own read-only agent preset `watchdog`, one side session per supervised session, using Watchdog's configured `model` (independent of DSH's default model). If the configured model is removed or unroutable, judgements fail with `judge-failed` and never fall back to DSH's default model.
- **Persistence:** briefs are kept in `<DSH home>/dsh-connector-watchdog/briefs.json` and survive a restart.
- **Settings:** `model` (`{provider, model, reasoningEffort?}`, unset by default — **Watchdog is disabled while `model` is unset**, registering no tools, permission delegate, or patrol timers while keeping its row active so its settings page remains accessible), `minCheckIntervalSeconds` (60–86400, default 1740), `readMaxMessages` (1–100, default 8), `readMaxBytes` (1024–1048576, default 8192), `checkTimeoutSeconds` (30–900, default 120). Installed through the `dsh-connector-amenities` umbrella, edit them on its component page; a saved change re-applies Watchdog at once (enabling/disabling it when `model` is set or cleared, and re-arming every unpaused brief's patrol with the new interval). Installed alone it has no settings page (it has no browser code): edit its row's `config` in the profile's `cordis.patch.yml`.

## Structure

```
amenities/watchdog/
  index.js          the row: wires core.js to the connector's services, the judge and the store
  src/core.js       the behaviour over injected ports: briefs, permission decisions, patrol, drift
  src/judge.js      the judge: one side session per supervised session on the `watchdog` preset
  src/verdict.js    reads the judge's `{verdict, reason}` answer and its failures
  src/tools.js      the contributed tools (`watchdog_brief`, `_refine`, `_pause`, `_resume`, `watchdog_session_start`)
  src/store.js      briefs persisted in `<DSH home>/dsh-connector-watchdog/briefs.json`
  src/config.js     the settings
  src/model.js      resolves the configured model
  src/constants.js  names, the brief record, tool wording and codes, the judge's instructions
  cordis.patch.yml  inserts the `preset-watchdog` and `dsh-connector-watchdog` rows
  assets/           the icon
  tests/            the package's suites
```

## Testing

```bash
npm test --workspace dsh-connector-watchdog
```

| `tests/` | What it checks |
| --- | --- |
| `core.test.mjs` | `src/core.js` and `src/store.js` over fake connector services, a fake judge and fake timers: briefs, decisions, patrol timing, drift, persistence. No DSH is booted. |
| `model.test.mjs` | Resolves the configured Watchdog model. |
| `live-config/` | Its settings are live: model enable/disable and field bounds, a change re-arms every unpaused brief's patrol ([use cases](<tests/live-config/USE-CASES.md>)). |

Watchdog running beside the connector in one real DSH (WD-L01…13: the delegate path, Stop,
`watchdog_session_start`, the settlements the manager sees) is the integration package
[`integration/connector-watchdog`](<../../dsh-connector/integration/connector-watchdog/README.md>). Its icon is
checked in [`integration/package-icons`](<../../dsh-connector/integration/package-icons/README.md>). Both run
before a release. See [the testing guide](<../../dsh-connector/docs/testing/README.md>).
