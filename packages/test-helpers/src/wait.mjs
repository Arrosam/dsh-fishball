/**
 * Waiting without a deadline. Every wait here waits for its condition or event, so a step that never
 * comes shows as a hang, never as a pass (docs/testing/writing-tests.md "No time limits"). Turns are
 * setImmediate turns, which the cases' timer mocks never replace.
 */

export const WAIT = Object.freeze({
  /** How many turns `drain` lets pass by default. */
  drainTurns: 20,
  /** How many consecutive quiet turns make `settled`. */
  quietTurns: 5,
  /** The active-resource names (process.getActiveResourcesInfo) of a file request in flight. */
  fileIo: /^(?:FS|CloseReq|FileHandle)/,
})

/** A promise with its opener: `{promise, open(value)}`; `open` resolves the promise with `value`. */
export function gate() {
  let open
  const promise = new Promise((resolve) => { open = resolve })
  return { promise, open: (value) => open(value) }
}

/**
 * A step that stops until it is released: `enter()` marks it reached and waits for `open()`;
 * `wait(value)` is such a step answering `value` (an async function); `reached` resolves at the
 * first entry.
 */
export function hold() {
  const entered = gate()
  const opened = gate()
  const enter = async () => { entered.open(); await opened.promise }
  return { reached: entered.promise, open: () => opened.open(), enter, wait: (value) => async () => { await enter(); return value } }
}

/** One event-loop turn. */
export const turn = () => new Promise((resolve) => setImmediate(resolve))

/** Wait until `cond()` (sync or async) holds, taking `step()` (default one turn) between checks. */
export async function until(cond, step = turn) {
  while (!(await cond())) await step()
}

/** Let every already queued step run: a fixed number of event-loop turns. */
export async function drain(turns = WAIT.drainTurns) {
  for (let i = 0; i < turns; i++) await turn()
}

const fileIoBusy = () => process.getActiveResourcesInfo().some((name) => WAIT.fileIo.test(name))

/**
 * Wait until the process is quiet: several consecutive event-loop turns with no file request in
 * flight. For code whose only asynchronous work, past the microtask queue, is file I/O.
 */
export async function settled() {
  for (let quiet = 0; quiet < WAIT.quietTurns;) {
    await turn()
    quiet = fileIoBusy() ? 0 : quiet + 1
  }
}

/** Settle, then check `cond()`, settling again before each further check. */
export async function untilQuiet(cond) {
  await settled()
  await until(cond, settled)
}

/** What an async call did: `{value}` or `{error}`. */
export async function settle(fn) {
  try { return { value: await fn() } } catch (error) { return { error } }
}
