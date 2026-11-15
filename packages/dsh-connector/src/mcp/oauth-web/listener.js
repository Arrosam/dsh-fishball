/**
 * The approval listener's socket (R-OA-20, AUTH-DT-09; design §5.5a "Listeners"; K1 APPROVAL_LISTENER;
 * the user's decision 2026-11-14: it binds DSH's listener host on its own port, sharing host and TLS).
 *
 * - Open whenever the connector runs (C-WIRE calls `start` once and `close` on dispose); it is
 *   never closed between requests (rule 7).
 * - A bind failure of any kind (EADDRINUSE, EACCES, …; Fishball 2026-11-14, item 11) leaves it
 *   closed with status CONNECTOR_STATUS.approvalPortInUse and ONE diagnostic per clash, and retries
 *   the same port every APPROVAL_LISTENER.retryMs while the connector runs (K1 README, AUTH-DT-09
 *   row 4), so a freed port is bound again without a restart (rules 3, 4, 6).
 * - `setPort` rebinds at once (rule 5): the old socket is closed first, then the new port bound.
 * - Nothing here touches DSH's listener, so a failure here never affects the MCP endpoint or
 *   machine exchange.
 */
import http from 'node:http'
import { APPROVAL_LISTENER, CONNECTOR_STATUS } from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { LISTENER_STATUS, LOG, MISUSE, PORT_RANGE, SERVER_EVENT } from './constants.js'
import { SILENT_LOGGER } from './io.js'

const assertPort = (port) => {
  if (!Number.isInteger(port) || port < PORT_RANGE.min || port > PORT_RANGE.max) throw new TypeError(MISUSE.port)
}

/**
 * @param options.handler the node:http request handler (`./approval.js`)
 * @param options.host DSH's `webServer.host` (the bind address)
 * @param options.port the port setting (APPROVAL_LISTENER.defaultPort unless the user set one)
 * @param options.createServer `(handler) => net.Server`; C-WIRE passes an https one when DSH's
 *   listener has TLS (Fishball 2026-11-14, item 5); default node:http
 * @param options.timers `{setTimeout, clearTimeout}` for the retry (default: the global ones)
 * @param options.logger `{warn}`: diagnostics by code only
 * @param options.onStatus `(status) => void`, called on every status change (C-WIRE's status column)
 * @returns `{start(), setPort(port), close(), status(), port(), listening()}`
 */
export function createApprovalListener({
  handler, host, port, createServer = http.createServer, timers = globalThis, logger = SILENT_LOGGER, onStatus = () => {},
}) {
  assertPort(port)
  let configured = port
  let server
  // `ok` until a bind fails: C-WIRE calls `start` as it mounts, and AUTH-DT-09 has no third status
  // for the moment before the first bind settles.
  let status = LISTENER_STATUS.ok
  let retryTimer
  let closed = false
  /** The one bind or rebind in progress: setPort and the retry wait for it, so binds never overlap. */
  let busy = Promise.resolve()

  function setStatus(next) {
    if (next === status) return
    status = next
    onStatus(next)
  }

  function clearRetry() {
    if (retryTimer !== undefined) timers.clearTimeout(retryTimer)
    retryTimer = undefined
  }

  function scheduleRetry() {
    clearRetry()
    retryTimer = timers.setTimeout(() => {
      retryTimer = undefined
      serial(() => bind(false))
    }, APPROVAL_LISTENER.retryMs)
    retryTimer?.unref?.()
  }

  /** A bind failure: status, one diagnostic per clash (`report`), and the retry. */
  function bindFailed(error, report) {
    if (report) logger.warn(LOG.format, LOG.bindFailed, diagnosticOf(error))
    setStatus(CONNECTOR_STATUS.approvalPortInUse)
    if (!closed) scheduleRetry()
  }

  /**
   * Binds `configured`. `report` is false for a retry of the same clash, so it logs once per clash.
   * Any failure counts, a `createServer` that throws (bad TLS material) included (Fishball
   * 2026-11-14, item 11: any listen error).
   */
  function bind(report) {
    if (closed || server !== undefined) return Promise.resolve()
    return new Promise((resolve) => {
      let candidate
      try {
        candidate = createServer(handler)
      } catch (error) {
        bindFailed(error, report)
        resolve()
        return
      }
      const onError = (error) => {
        candidate.removeListener(SERVER_EVENT.listening, onListening)
        bindFailed(error, report)
        resolve()
      }
      const onListening = () => {
        candidate.removeListener(SERVER_EVENT.error, onError)
        if (closed) {
          candidate.close()
        } else {
          server = candidate
          // A later server error (an accept failure such as EMFILE) must not escape as an uncaught
          // 'error' event and take DSH down with it (R-OA-20); it is logged by code.
          server.on(SERVER_EVENT.error, (error) => logger.warn(LOG.format, LOG.listenerFailed, diagnosticOf(error)))
          setStatus(LISTENER_STATUS.ok)
        }
        resolve()
      }
      candidate.once(SERVER_EVENT.error, onError)
      candidate.once(SERVER_EVENT.listening, onListening)
      candidate.listen(configured, host)
    })
  }

  async function unbind() {
    clearRetry()
    const current = server
    server = undefined
    if (current === undefined) return
    current.closeAllConnections?.()
    await new Promise((resolve) => current.close(() => resolve()))
  }

  function serial(task) {
    busy = busy.then(task).catch((error) => logger.warn(LOG.format, LOG.listenerFailed, diagnosticOf(error)))
    return busy
  }

  return Object.freeze({
    /** Binds the configured port; resolves once bound or once the clash is recorded. */
    start: () => serial(() => bind(true)),
    /** A change of the port setting rebinds at once (AUTH-DT-09 rule 5); the same port is a no-op. */
    setPort(next) {
      assertPort(next)
      if (next === configured) return busy
      configured = next
      return serial(async () => {
        await unbind()
        await bind(true)
      })
    },
    close() {
      closed = true
      return serial(unbind)
    },
    status: () => status,
    /** The bound port (the OS's when the setting is 0), else the configured one, which the metadata keeps naming. */
    port: () => server?.address()?.port ?? configured,
    listening: () => server !== undefined,
  })
}
