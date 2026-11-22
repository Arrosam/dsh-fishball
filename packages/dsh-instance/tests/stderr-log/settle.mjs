/**
 * Waiting for the instance to finish what an action set off, without a deadline. The hosted-token
 * logic may run a step after the awaited call resolved (a pair change's retry, a record write), and
 * its only asynchronous work against these fakes is file I/O on hosted.json (every fake answers on
 * the microtask queue). So "settled" is: several consecutive event-loop turns with no file request
 * in flight. A step that never settles shows as a hang, never as a pass.
 */
const IO = /^(?:FS|CloseReq|FileHandle)/
const QUIET_TURNS = 5
const turn = () => new Promise((resolve) => setImmediate(resolve))
const busy = () => process.getActiveResourcesInfo().some((name) => IO.test(name))

export async function settled() {
  for (let quiet = 0; quiet < QUIET_TURNS;) {
    await turn()
    quiet = busy() ? 0 : quiet + 1
  }
}

/** Settle, then poll (each poll settling again) until `cond` holds; no deadline. */
export async function until(cond) {
  await settled()
  while (!(await cond())) { await turn(); await settled() }
}
