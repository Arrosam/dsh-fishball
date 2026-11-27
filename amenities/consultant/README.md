# Fishball Consultant

An independent Fishball amenity for advisory-only second opinions. Fishball remains responsible for
checking advice, making decisions and acting on them. Install through Fishball Amenities or as a
standalone bundle, not both. No compatible Fishball core means no manager tools; the owner can
still view the local settings and retained threads.

**Current connectors cannot consult.** No protected port is wired in production. Once a valid
model and target are selected, an otherwise admissible ask returns `UNAVAILABLE` with reason
`missing-guarantee`: no brief, session, model call, or ordinary-worker fallback. Catalog reads are
limited to workspace and model discovery. A blank or removed model is `CONFIGURE_MODEL`; a
transiently unavailable model or target does not clear the saved selection.

## Using the amenity

Open the Consultant row in Plugins. Choose the paired target/endpoint, an available neutral
workspace and an exact provider/model route; choose an effort only if the catalog offers one.
New configuration starts without a model. The only budget units are attempts: 3 per topic and
10 per profile per UTC day by default. Ambiguous delivery holds the original reservation;
there are no automatic ask retries. Token use may be unknown and the budgets are not cost caps.

Create a topic explicitly in **Threads**, then give Fishball its stable ID. Only the owner can
stop and archive; the manager tool requests that action. A thread is not closed by an answer,
inactivity or a changed setting. Task subjects are unavailable without a trusted, replayable
host task terminal log. No Taskboard integration is used.

With an approved protected port, the manager calls `consultant_ask({subject,question,evidence?})` via
PTC `run_code` (or natively if PTC is off). It returns immediately. Ordinary non-blocking
`ask_user` can clarify; its `cardId` answer message is **not** authorization. The dedicated owner
card in Threads presents the exact destination and brief, including replayed history. The owner
can allow only that request or decline. The current host does not extend the core chat card deck;
its trusted disclosure surface is the Consultant thread detail. Current staging generates no such
card because it fails preflight. Pending cards expire on reload; no request is replayed.

The isolated private receipt is marked as untrusted Consultant advice, with origin and truncation
shown. Without verified complete history, no follow-up can be sent. Use **Check status** to inspect
an uncertain request, not to resend it. **Discard** stops and archives; if remote disposition
cannot be verified, the thread stays sealed and cleanup-pending. Archive is not erase and has no
reactivate action. Starting over creates an empty topic with a new ID.

## Installing and removing

The standalone tarball has its own patch and client. The collection installs it as a pinned bundled
member and loads the same client. Do not activate both insert sources. In collection mode a user can
**disable only the row**; physical member removal without removing siblings requires changes to the
separate profile/instance installer. Removing the standalone bundle does not delete data or caches.
The owner can inspect retained archival history with the row present or after reinstalling; there is
no separate installed history viewer when the code is removed.

## Enabling real consultations

The injected private capability v1 must be scoped to the verified principal, target ID and endpoint
epoch, workspace and exact route. No model or browser can negotiate or supply this port. The port
must verify final provider payload against the once-approved digest, isolate the first and every
subsequent wake (including GUI, plugins and recovery), and disable all tool discovery and execution.
It must persist per-request idempotency and turn/cursor receipts (including empty/stopped/failed),
provide a private completion signal for host reconciliation, keep ordinary worker events separate,
and support identity-fenced status and verified stop/archival. Prove these in the real connector
and host with captured fake-provider payloads and zero tool/execution side effects before wiring it.
See [the private port contract](CONTRACT.md) for details.
