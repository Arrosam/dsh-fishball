/**
 * The listen streams of the MCP endpoint (task C-HTTP; design §3.3; R-EVT-04, R-ID-06, R-TOK-05,
 * R-EVS-03; EVT-EP-04 rows 3–4; spike V3-S1 F2, S7 §4.4).
 *
 * One SDK handler, with its own event bus, per pair: the SDK's listen router fans every bus event
 * out to every stream of its handler and never sees who opened it (S1 F2), so a shared handler
 * would wake every agent for one pair's commit. These handlers serve `subscriptions/listen` only:
 * closing one (a revocation) then ends exactly that pair's streams and aborts no ordinary request,
 * which must complete once past the token check (AUTH-DT-04 row 2a, R-TOK-05).
 *
 * The registry is also the one `Presence` (K1 CONNECTED: connected = at least one open stream whose
 * filter names `fishball://events`) and the K1 `HintSink` C-MAILBOX calls after each commit.
 */
import { createMcpHandler } from '@modelcontextprotocol/server'
import { CONNECTED, ENDPOINT_LIMITS } from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { HTTP_HEADER, LOG, MEDIA_TYPE } from './constants.js'

/** Whether a listen request's filter names the event resource (the CONNECTED definition). */
export const listensForEvents = (message) => {
  const uris = message?.params?.notifications?.resourceSubscriptions
  return Array.isArray(uris) && uris.includes(CONNECTED.listenResource)
}

/**
 * @param {object} ports
 * @param {(ctx: object) => object} ports.factory the endpoint's McpServer factory (same surface as every request)
 * @param {object} ports.handlerOptions createMcpHandler options shared with the request handler
 * @param {{warn(...args: unknown[]): void}} ports.logger
 */
export function createListenStreams({ factory, handlerOptions, logger }) {
  /** principalKey → {handler, entryKey, open, events (open streams on fishball://events), reserved, closed} */
  const pairs = new Map()
  const listeners = new Set()
  // After `close()` (connector dispose) no listen opens: a stream on a handler nobody will close
  // again would outlive the connector.
  let disposed = false

  function notifyPresence(principalKey, connected) {
    for (const listener of [...listeners]) {
      try { listener(principalKey, connected) } catch (error) { logger.warn(LOG.format, LOG.presenceListenerFailed, diagnosticOf(error)) }
    }
  }

  function pairOf(principalKey, entryKey) {
    let pair = pairs.get(principalKey)
    if (pair === undefined) {
      pair = { handler: createMcpHandler(factory, handlerOptions), entryKey, open: 0, events: 0, reserved: 0, closed: false }
      pairs.set(principalKey, pair)
    }
    return pair
  }

  /**
   * Reserves one of the principal's ENDPOINT_LIMITS.listenStreamsPerPrincipal stream slots
   * (counting streams still being opened, so two racing listens cannot both take the last one).
   * @returns the reservation, or undefined at the cap or after `close()`
   */
  function reserve(principalKey, entryKey) {
    if (disposed) return undefined
    const pair = pairOf(principalKey, entryKey)
    if (pair.open + pair.reserved >= ENDPOINT_LIMITS.listenStreamsPerPrincipal) return undefined
    pair.reserved += 1
    let settled = false
    const release = () => {
      if (settled) return
      settled = true
      pair.reserved -= 1
    }
    return {
      /**
       * The SDK fetch face of this pair's handler. An answer that is an event stream counts as an
       * open stream until `res` closes; any other answer (a bad filter, a version refusal) opens
       * nothing and frees the slot.
       *
       * Two races end before the stream counts. The client may hang up while the SDK builds the
       * answer: `res` has then already closed and a late close listener would never fire, so the
       * stream would count as open forever. Or a revocation may close this pair's handler in the
       * same window: its router opened the stream after `closeAll`, so nobody would ever end it
       * (R-TOK-05). Either way the stream is cancelled here and nothing is counted or announced.
       */
      fetch: async (request, options, { res, events }) => {
        try {
          const response = await pair.handler.fetch(request, options)
          if (!response.headers.get(HTTP_HEADER.contentType)?.startsWith(MEDIA_TYPE.eventStream)) return response
          if (pair.closed || res.destroyed || res.writableFinished) {
            await response.body?.cancel()
            return response
          }
          opened(principalKey, pair, events, res)
          return response
        } finally {
          release()
        }
      },
      release,
    }
  }

  function opened(principalKey, pair, events, res) {
    pair.open += 1
    if (events) {
      pair.events += 1
      if (pair.events === 1) notifyPresence(principalKey, true)
    }
    res.once('close', () => {
      pair.open -= 1
      if (!events) return
      pair.events -= 1
      // A closed pair already reported its offline edge; a newer handler of the same principal
      // owns presence from then on.
      if (pair.events === 0 && !pair.closed) notifyPresence(principalKey, false)
    })
  }

  /** K1 HintSink: a commit's hint goes to its own pair's streams only (R-EVT-04, EVT-EP-04). */
  const hints = Object.freeze({
    resourceUpdated(principalKey, uri) {
      pairs.get(principalKey)?.handler.notify.resourceUpdated(uri)
    },
  })

  /** K1 Presence. */
  const presence = Object.freeze({
    isConnected: (principalKey) => (pairs.get(principalKey)?.events ?? 0) > 0,
    onChange(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })

  /** `notifications/tools/list_changed` goes to every pair's streams that opted in (design §13.4). */
  function toolsChanged() {
    for (const pair of pairs.values()) pair.handler.notify.toolsChanged()
  }

  /** Ends a pair's handler: each of its open streams completes gracefully (AUTH-DT-04 row 1). */
  function closePair(principalKey, pair) {
    pairs.delete(principalKey)
    pair.closed = true
    if (pair.events > 0) notifyPresence(principalKey, false)
    pair.handler.close().catch((error) => logger.warn(LOG.format, LOG.closeFailed, diagnosticOf(error)))
  }

  /**
   * A revocation of `entryKey` (R-TOK-05): closes that entry's pair's listen streams and nobody
   * else's (EVT-EP-04 row 4). A later listen builds a fresh handler.
   */
  function closeEntry(entryKey) {
    for (const [principalKey, pair] of [...pairs]) if (pair.entryKey === entryKey) closePair(principalKey, pair)
  }

  function close() {
    disposed = true
    for (const [principalKey, pair] of [...pairs]) closePair(principalKey, pair)
  }

  return Object.freeze({ reserve, hints, presence, toolsChanged, closeEntry, close })
}
