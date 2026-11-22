/**
 * The one seam between the F-LINK cases and fishball-core's link (core's `./link` export,
 * packages/core/src/link/).
 *
 * The cases use one small shape, named here once from design §4.1 (`{state, code}`, K3
 * `TargetStatus`), §6.3 (the link resolves its secret per connection; an answer while down
 * resolves `{ok: false, code: 'disconnected'}`, K3 `CommitSendResult`) and R-FB-03 (target URL):
 *
 *   openLink(t, {url, clientId, secret}) → link
 *     url       the target MCP endpoint ('' = blank target)
 *     clientId  the fishball id (R-FB-04: OAuth client id)
 *     secret    the token value; null (HARNESS.noSecret) = the reference holds no value
 *   link.status(): {state, code}     K3 TargetState / TargetCode | null
 *   link.call(tool, args): Promise<structuredContent>   one core tool through the link
 *   link.stop(): Promise<void>
 *
 * F-LINK's real entry (`createLink`) takes `target: () => url`, `credentials: async () =>
 * {clientId, secret}` and an optional `sdk` (the `@modelcontextprotocol/client` module); its call
 * is `callTool`. Only this file maps one onto the other.
 *
 * Binding: the module is imported with fishball-test-helpers/bind (its DSH imports bound to the
 * current DSH), and the link runs on the current DSH's own `@modelcontextprotocol/client` copy
 * (DSH_CLIENT). Core's own packaged client resolves from the repository's node_modules; only the
 * F-FIX-3 rows (`openRawLink` without `sdk`) load it, through the link's own lazy import.
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { importBound } from 'fishball-test-helpers/bind'
import { until } from 'fishball-test-helpers/wait'
import { DSH_CLIENT, HARNESS, LINK_MODULE } from './constants.mjs'

const stacks = new WeakMap()
/**
 * Registers `fn` to run after the test, last registered first. The link is opened after its fake
 * connector, so it is stopped before the fake goes away: a fake that closes under a running link
 * would make the link reconnect during teardown, into the next test's network window.
 */
export function defer(t, fn) {
  if (!stacks.has(t)) {
    const stack = []
    stacks.set(t, stack)
    t.after(async () => { while (stack.length > 0) await stack.pop()() })
  }
  stacks.get(t).push(fn)
}

/** The link module bound to the current DSH. */
export async function linkModule() {
  const mod = await importBound(LINK_MODULE.entry)
  assert.equal(typeof mod[LINK_MODULE.factory], 'function', `${LINK_MODULE.entry} exports no ${LINK_MODULE.factory}()`)
  return mod
}
/** The current DSH's MCP client (the `sdk` the cases hand the link). */
export const mcpClient = () => import(pathToFileURL(DSH_CLIENT.file).href)

/**
 * Opens one link and registers its stop with the test. `secret` null (HARNESS.noSecret) = no value stored.
 * @param {import('node:test').TestContext} t
 */
export async function openLink(t, { url, clientId, secret }) {
  const mod = await linkModule()
  const link = mod[LINK_MODULE.factory]({
    target: () => url,
    credentials: async () => ({ clientId, secret: secret ?? undefined }),
    sdk: await mcpClient(),
  })
  defer(t, () => link.stop())
  link.start()
  return {
    status: () => link.status(),
    call: (tool, args) => link.callTool(tool, args),
    stop: () => link.stop(),
  }
}

/**
 * F-FIX-3: the real `createLink` with raw options, its timers held by the test. `options` are passed
 * as they are (no `sdk` unless given), so the link imports its own MCP client. Retries are scheduled
 * through `setTimer` and run only when the test calls `fire()`, so "one warning per failed attempt"
 * is counted attempt by attempt with no wall-clock wait. Returns `{link, timers, pending, fire()}`.
 */
export async function openRawLink(t, options) {
  const mod = await linkModule()
  const timers = []
  const link = mod[LINK_MODULE.factory]({
    setTimer: (fn, ms) => { const handle = { fn, ms, cleared: false }; timers.push(handle); return handle },
    clearTimer: (handle) => { if (handle) handle.cleared = true },
    ...options,
  })
  defer(t, () => link.stop())
  const pending = () => timers.filter((h) => !h.cleared && !h.fired)
  return {
    link, timers, pending,
    /** Runs every pending retry timer once. Returns how many ran. */
    fire() { const due = pending(); for (const h of due) { h.fired = true; h.fn() } return due.length },
  }
}

/** Waits until the link reports `state`; returns the last status (the assertion message shows it). */
export async function untilState(link, state, timeoutMs = HARNESS.settleMs) {
  await until(() => link.status()?.state === state, timeoutMs, HARNESS.pollMs)
  const status = link.status()
  assert.equal(status?.state, state, `target status after ${timeoutMs} ms: ${JSON.stringify(status)}`)
  return status
}

/** Waits until `predicate()` holds (harness wait only). */
export const untilTrue = (predicate, timeoutMs = HARNESS.settleMs) => until(predicate, timeoutMs, HARNESS.pollMs)
