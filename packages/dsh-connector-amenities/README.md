# dsh-connector-amenities

Optional DSH Connector amenity components. Configure each amenity from its component settings under **Plugins → DSH Connector Amenities → Components**.

| Component | Folder | Role |
| --- | --- | --- |
| `dsh-connector-adapter` | `./adapter/` | Lets this DSH sign in to another DSH's connector through DSH's stock MCP client. |
| `dsh-connector-watchdog` | `./watchdog/` | A helper of the agent that manages a session (such as Fishball). See below. |

## dsh-connector-watchdog

Design: [watchdog-project-notes.md](../../docs/watchdog-project-notes.md). It needs `dsh-agent-connector` in the same DSH. Without it, the row loads and stays idle.

- **Tools for the managing agent** (over the connector's MCP, namespaced `dsh-connector-amenities.*`):
  - `watchdog_brief({sessionId, purpose, scope?})` assigns Watchdog to a session the caller manages. `purpose` is required; `scope` describes the permission requests Watchdog may approve.
  - `watchdog_refine` changes the purpose and/or scope. It does not move the patrol timer.
  - `watchdog_pause` stops the session's turn and pauses supervision; `watchdog_resume` restarts it.
- **Permission requests:** Watchdog decides each one before the manager sees it, through the connector's `dshConnectorSessions` delegate:
  - within the scope → allow (one call only);
  - beyond the purpose and dangerous → reject, with a reason;
  - anything else → passed to the manager.
  The manager receives a `settlement {by: "delegate"}` for every request Watchdog decided.
- **Patrol:** each supervised session is checked every `minCheckIntervalSeconds` (default 1740). A patrol reads only messages newer than the last one judged, and does nothing if there are none.
- **Drift:** if a patrol or a permission check finds the session drifting from its purpose, Watchdog stops the session's turn and emits `dsh-connector-amenities.drift` `{sessionId, during, reason}` to the manager. The manager can still message the session.
- **Judging** runs in a side session on Watchdog's own read-only agent preset `watchdog`, one side session per supervised session.
- **Persistence:** briefs are kept in `<DSH home>/dsh-connector-watchdog/briefs.json` and survive a restart.
- **Not yet:** escalating high-risk requests to the user (these are passed to the manager for now).
