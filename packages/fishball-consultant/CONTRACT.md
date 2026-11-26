# Private Consultant port v1

This is a host dependency, not a public MCP tool or an extension of the ordinary worker bridge.
Production does not inject it. The amenity tests use a recording fake; a capability object cannot
certify a connector by itself. Only wire a private adapter after the connector and host pass the
isolation and receipt acceptance matrix.

## Capability and send


authorizedBriefOnly, requestBoundReceipts and noExecution must be exactly true on a host-supplied
version 1 capability with send, status and close methods. Negotiation receives destination metadata
only: ownerId, targetId, endpointEpoch, workspaceId, model and the explicit reasoningEffort,
if set. The host adapter must authenticate and bind the original owner and endpoint; a DSH-local
principal label does not suffice as a remote credential. Workspaces supplied by ordinary discovery
are not proof of neutral placement. Prove approved placement before provider access.

send receives requestId, destination, instruction, brief, digest, and for follow-ups the previous
bindingId and sessionId. The digest covers the ordered JSON object containing instruction,
destination, brief, requestId and previous (omitted for the initial ask); it is not a signature or
an authorization token. The approved brief contains the full question, optional evidence and same
thread replay. Before every provider call, verify the authenticated envelope against final
assembled provider input and actual destination. Withhold guesses, ambient system/plugin context,
attachments, working files, credentials and other topics. Guard all wake paths before publishing or
restoring a session; neither tool discovery nor execution is allowed. The adapter must atomically
consume the protected request once and bind it to its actual turn. No automatic resend.

Every reply that changes state carries event fishball-consultant.receipt.v1. send returns accepted with a ref, or not-delivered when it can prove there is no delivery/activity. Not-delivered also echoes requestId, ownerId, targetId, endpointEpoch and workspaceId.
Other outcomes hold the reservation. A ref includes requestId, ownerId, targetId, endpointEpoch,
workspaceId, bindingId, sessionId and turnId. Follow-ups keep the binding/session but get a new turn.

## Private receipts and cleanup

status only reconciles an existing request, using the original identity. On lost acknowledgement
initial lookup may omit binding/session/turn IDs; never search for last assistant text. Status
can confirm accepted or return a terminal receipt with matching ref and event
fishball-consultant.receipt.v1. Terminal status is advice, empty, stopped or failed. Advice requires
nonempty text and an explicit truncated boolean; optional usage is request-specific. Full replay
must be exactly reconstructible from the trusted record, or the next ask is refused. Persist the
terminal result before waking the manager. Connect a host-only completion signal to reconcile;
completion cannot be a public worker mailbox event. Status/read-only recovery never calls send.

close takes the original identity, fences further activity, stops it, verifies archive at the
original target, then releases it. Return archived only with a matching ref. Uncertain cleanup
stays sealed and pending locally. No erase semantics. The connector still owes provenance checks,
private credentials, lifetime ownership and recovery guarantees; do not substitute prompts,
permission presets, stop/release worker methods or current turn-finished events.

Release acceptance: capture real provider requests through a recording fake for initial and
follow-up calls, exercise startup failures, forced/dynamic tools, alternate wake and GUI paths,
competing owners/epochs, restart, dropped and duplicate acknowledgements, empty/stopped/failed
turns and verified cleanup. Forbidden paths must show zero leaked brief bytes, sessions/model calls
where admission was refused, and zero execution side effects. The Fishball package tests do not
establish these remote facts.
