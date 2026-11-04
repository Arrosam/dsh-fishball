# Model Save response synchronization repair

## Report and reproduced boundary

The owner reported that selecting a Fishball model and pressing Save cleared the selection. Browser inspection could not authenticate the current DSH instance; the other previously-open instance refused the connection. No live Save, installation, profile modification or restart was performed. Therefore actual live persistence loss is **not established**.

A separate requirement-only test author reproduced a concrete client defect against the unchanged archived baseline: when a successful `POST /api/fishball/model` returned the confirmed model state but SSE was withheld, an initially absent selection returned to empty and a replacement returned to the previous model. The client discarded its draft while ignoring the response's authoritative state. Source investigation found no normal settings-union stripping/reset path in persistence.

## Scoped repair

- Model Save accepts its exact session/provider/model/optional-effort confirmation from the successful HTTP body, or an already-confirming SSE state. A bare 2xx is not proof of consent.
- Only the confirmed `modelSelection` field merges into the latest shared state; unrelated state and an already-observed different selection/session are not rolled back.
- Pending/failed/malformed/mismatched receipts retain the draft and error rather than granting an unconfirmed selection. Later authoritative SSE remains effective.
- No changes to global command handling, host persistence, model routing or other settings. The repair is a separate local commit so it can be integrated with the concurrent permission-panel branch independently.

## Known boundary

The existing SSE/HTTP transport has no shared revision. A delayed older SSE frame arriving after a confirmed response can temporarily restore an old view until a later stream frame. This focused receipt repair fixes the independently reproduced absent/stalled-stream case; it does not claim to solve transport ordering or prove the exact failing live instance. A robust ordering redesign would need host-generation/revision metadata and separate coverage.

## Verification

Independent registered-client tests compare the unchanged archived baseline with the repair, without the implementation author reading test code. The exact final response-confirmation regression file passes **42/42** on the repair, while the unchanged archived baseline passes **5/42** and fails **37/42**, including both successful-save/no-SSE reproductions. Existing dedicated model client/pending/real-host regression checks pass **19/19**, and broader brand/model/managed-list/messenger checks pass **48/48** with a worktree-local HOME/npm cache. Production syntax (`node --check client.js`), whitespace checks and an independent code review passed. Full repository-suite results for the preceding feature are recorded separately in [start-session model validation](<start-session-model-validation.md>); the entire suite was not rerun after this client-only repair. No tests were weakened to hide environment failures.
