/**
 * Stand-ins for the child chat (createChat in packages/instance/src/slim/child/chat.js). The fake
 * document lives in body-soul-dom.mjs, shared with the settings-view tests.
 *
 * The chat stand-in is the Cordis-like context createChat's JSDoc names: `get(name)` for
 * agents, profileContext, sessionQuery, agentDefaultModel and sandboxPolicy, `on(event, fn)` for
 * the live session events. Its agents service creates one live agent without running DSH's setup
 * (sandbox and approval policy are not under test here), and its sessionQuery answers the
 * committed log the test supplies, so GET /api/chat shows exactly how those events are projected.
 */
import { tempDir } from './body-soul-env.mjs'
import { fakeDocument } from './body-soul-dom.mjs'

export { fakeDocument }

export const CHAT_EVENT = Object.freeze({ user: 'user/message', live: 'session/event', cardRecord: 'plugin:fishball/card-record' })

/**
 * `currentModel` is the live agent's model reader; a test passes one to exercise
 * `chat.service.currentModel()`, the admin model snapshot's `active` source. `start: false`
 * leaves the chat unstarted, when a test needs the state before activation.
 */
export async function chatHarness(t, { loadChat, currentModel = () => undefined, start = true }) {
  const { createChat, CHAT } = await loadChat()
  const home = await tempDir(t)
  const listeners = new Map()
  const log = []
  let agent
  const services = {
    profileContext: { home },
    agents: {
      async create({ sessionId }) {
        agent = { id: sessionId, status: 'idle', session: { id: sessionId }, followup() {}, model: { current: currentModel } }
        return { agent }
      },
      get: (id) => (agent !== undefined && agent.id === id ? agent : undefined),
      async resume() { throw new Error('not used') },
    },
    sessionQuery: { async readSession() { return { events: structuredClone(log) } } },
    agentDefaultModel: { currentSelection: () => undefined },
    sandboxPolicy: { resolve: () => ({ mode: 'read-only' }) },
  }
  const ctx = {
    get: (name) => services[name],
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return () => listeners.get(event).delete(fn)
    },
  }
  const chat = createChat(ctx, {})
  if (start) await chat.start()
  t.after(() => chat.close())
  let seq = 0
  return {
    chat,
    /** Commit one event to the stand-in log (seen by the next GET). */
    commit(type, data) { seq += 1; const event = { seq, time: 1_700_000_000_000 + seq, type, data }; log.push(event); return event },
    /** GET /api/chat through the chat's own JSON handler; activates the session first. */
    async entries() {
      const answer = await chat.handle(CHAT.path, { method: 'GET' })
      if (answer.status !== 200) throw new Error('GET /api/chat answered ' + answer.status)
      return answer.body.entries
    },
    /** Deliver one live session event to the chat's subscription and collect what it publishes. */
    live(event) {
      const published = []
      const off = chat.subscribe((frame) => published.push(frame))
      for (const fn of listeners.get(CHAT_EVENT.live) ?? []) fn({ id: agent?.id }, event)
      off()
      return published
    },
  }
}
