/**
 * The one seam between the F-LINK cases and `fishball-core`'s link (`packages/core/src/link/`).
 *
 * K1, K2 and K3 freeze no JavaScript entry for the link, so this file names the **assumed** shape
 * once, from design §4.1 (`targetStatus()` → `{state, code}`, K3 `TargetStatus`), §6.3 (the link
 * resolves its secret per connection, as `ctx.credentials.resolve` does; an answer while down
 * resolves `{ok: false, code: 'disconnected'}`, K3 `CommitSendResult`) and R-FB-03 (target URL):
 *
 *   createLink({url, clientId, resolveSecret}) → link
 *     url            the target MCP endpoint ('' = blank target)
 *     clientId       the fishball id (R-FB-04: OAuth client id)
 *     resolveSecret  async () => string | undefined (undefined = the reference holds no value)
 *   link.start(): Promise<void>      begins connecting; resolves without waiting for the target
 *   link.status(): {state, code}     K3 TargetState / TargetCode | null
 *   link.call(tool, args): Promise<structuredContent>   one core tool through the link
 *   link.stop(): Promise<void>
 *
 * If F-LINK chooses other names, only this file changes. Binding: the module is imported with the
 * per-SDK resolve hook, so "[SDK x]" runs it against that SDK's `@deepseek-ai/*` packages; its own
 * packaged `@modelcontextprotocol/client` resolves from core (design §9.1).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { linkContractForSourceRun } from '../../support/contract-link.mjs'
import { until } from '../../support/util.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { HARNESS, LINK } from './constants.mjs'

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

/** The link module bound to one SDK. */
export async function linkModule(sdk) {
  linkContractForSourceRun()
  return importInstance(sdk, path.relative(INSTANCE.dir, path.join(LINK.dir, LINK.entry)))
}

/**
 * Opens one link and registers its stop with the test. `secret` null (HARNESS.noSecret) = no value stored.
 * @param {import('node:test').TestContext} t
 */
export async function openLink(t, sdk, { url, clientId, secret }) {
  const mod = await linkModule(sdk)
  assert.equal(typeof mod[LINK.factory], 'function', `${path.join(LINK.dir, LINK.entry)} exports no ${LINK.factory}()`)
  const link = mod[LINK.factory]({ url, clientId, resolveSecret: async () => secret ?? undefined })
  defer(t, () => link.stop())
  await link.start()
  return link
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
