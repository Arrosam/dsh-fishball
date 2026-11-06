/**
 * Standalone narrow control bridge. Only authenticated local carriers may enter attach().
 * Socket lifecycle and concrete DSH callbacks are intentionally supplied by the owner.
 *
 * Host attach identity is locally established, never read from envelope payloads.
 * Each envelope has {version,hostId,sessionId,requestId,type,operation,payload}.
 * Handshake uses sessionId:null; all other messages name a host-local session.
 * Client attach() resolves {capabilities,hostInstanceId}. Call request(operation,sessionId,payload)
 * afterwards; onEvent receives a complete validated event envelope. Reattach closes the old
 * connection and rejects its pending work. Fetch status and approval.list explicitly afterwards.
 *
 * Callbacks authorizeTarget(context), deliverMessage({...context,messageId,text}),
 * getStatus(context), watchSession(context,emit) never receive wire-selected functions.
 * context includes {hostId,principalId,connectionId,sessionId,operation,signal}.
 * Deliver returns {status:'delivered'|'unconfirmed'}, status returns {state,lastSequence},
 * Deliver may throw ControlError('forbidden') only for a proven pre-effect authority refusal:
 * that terminal refusal is retained for same-ID send/status without replay. Other exceptions
 * mean uncertain delivery, including cancellation whose timing relative to handoff is unknown.
 * watch returns a disposer (or a promise for one). Authorization must return exactly true.
 * It must check current host-local management membership, not just session existence.
 *
 * registerApproval({sessionId,approvalId,kind,prompt,choices,expiresAt,isLive,answer})
 * retains callbacks locally and returns a cancel disposer. Native owner must cancel on settlement.
 * isLive is synchronous; answer accepts {decision:'allow'|'reject'} or {text} for a question.
 * An offer is connection-specific. No answer is a future execution grant. Disconnect removes
 * offers, not host-native pending authority. Host close releases bridge references only.
 * Registration also bounds the complete live approval list per session to one response envelope;
 * overflow rejects the new bridge registration before retaining its callback, never truncates lists.
 *
 * Dedupe reserves exact principal/messageId/session/text before delivery, survives reconnect
 * within this host instance, and never evicts uncertain IDs. Saturation rejects new IDs.
 * No durable dedupe is claimed across process restart: the epoch changes, status is unknown,
 * and the client refuses its remembered message IDs across epochs. A new client must not import
 * or replay old unconfirmed work. Recovery requires owner reconciliation, never automatic retry.
 */
export { CONTROL, CONTROL_CAPABILITIES, DEFAULT_CONTROL_LIMITS, ControlError, controlLimits } from './constants.js'
export { encodeEnvelope, decodeEnvelope, validateEnvelope, makeEnvelope } from './protocol.js'
export { ControlChannel, serializedTransport } from './channel.js'
export { ControlHost, createControlHost } from './host.js'
export { ControlClient, createControlClient } from './client.js'
