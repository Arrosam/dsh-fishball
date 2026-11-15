/**
 * Errors and log diagnostics shared by the host modules. Logs carry stable codes only,
 * never message text (DESIGN §11).
 */

/**
 * A recovery request that does not fit the current state. `code` is the stable API_CODE
 * the HTTP layer answers with (409).
 */
export class LifecycleStateError extends Error {
  /**
   * @param code - API_CODE value naming why the request was refused.
   * @param options.status - HTTP status other than 409 (a 400 invalid setting, a 404 unknown plugin).
   * @param options.fields - extra answer fields (the invalid setting's `path`).
   */
  constructor(code, { status, fields } = {}) {
    super(code)
    this.code = code
    if (status !== undefined) this.status = status
    if (fields !== undefined) this.fields = fields
  }
}

/** Diagnostic used when an error has neither a code nor a class name. */
const UNKNOWN_ERROR = 'Error'

/** A stable diagnostic for logs: the error's code, else its class name. */
export const diagnosticOf = (error) => error?.code ?? error?.name ?? UNKNOWN_ERROR

/**
 * Run `task` in a microtask, logging a failure instead of letting it escape as an
 * uncaught exception (host event listeners must not throw into the emitter).
 */
export function deferLogged(task, logger, label) {
  queueMicrotask(() => {
    try { task() } catch (error) { logger.warn('%s failed (%s)', label, diagnosticOf(error)) }
  })
}
