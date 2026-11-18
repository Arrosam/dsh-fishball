/** In-memory transport boundary: retain the URL reader and observe every attempt, even after stop. */
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { McpLink } from '../../../../packages/core/src/link/link.js'
import { FIXTURE } from '../identity/constants.mjs'
import { MCP } from './targets-oracle.mjs'

export * from '../../../../packages/core/src/link/link.js'
export const linkScope = new AsyncLocalStorage()

export function createLink(options) {
  const { links, acceptAt } = linkScope.getStore()
  const trace = { target: options.target, starts: [], probes: [], sends: [] }
  links.push(trace)
  const attempt = async (href) => {
    const url = new URL(href)
    const credential = await options.credentials({ url, origin: url.origin })
    trace.probes.push(href)
    if (!credential) return
    const { clientId, kind, ref } = credential
    const key = { origin: url.origin, clientId, kind, ref }
    if (await options.gate.hold(key)) return
    trace.sends.push({ href, secret: credential.secret, ref })
    // An accepted token exchange saves before pairing; other attempts leave pending material intact.
    const accepted = href === acceptAt
    if (accepted) await credential.accepted?.()
    await options.gate.admit(key, { scope: MCP.scope.full, call: async (name) => {
      assert.equal(name, MCP.tools.pair)
      if (accepted) return { ok: true, paired: true, id: clientId, name: FIXTURE.boundName }
      return { ok: false, code: MCP.refusal.alreadyPaired, bound: { idMatches: true, boundId: clientId, name: FIXTURE.boundName } }
    } })
  }
  // Use the normal idle link's readers/listeners. Neither start nor reconnect ever enters its transport.
  class OfflineLink extends McpLink {
    start() {
      const href = options.target()
      trace.starts.push(href)
      trace.done = attempt(href)
      // Observers await done explicitly; don't turn a fixture failure into an unhandled rejection.
      trace.done.catch(() => {})
    }
    reconnect() { this.start() }
  }
  return new OfflineLink(options)
}
