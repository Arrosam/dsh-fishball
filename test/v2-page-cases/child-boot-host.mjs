/**
 * CHILD-BOOT host process (test-owned). Boots one REAL DSH web profile from the selected SDK, the
 * same way the child DSH runs: the SDK's default `web` profile, plus an overlay patch that appends
 * the given rows after the native rows. It prints DSH's own `dsh web: <url>` line and keeps
 * running until its stdin ends (DSH's launcher shuts down on stdin EOF; the parent holds it open).
 *
 * Environment (set by child-boot-support.mjs startHost):
 * - FBTEST_CHILD_RUNTIME: the SDK's node_modules directory;
 * - DSH_HOME: a throwaway home under `.runtime/test-homes`;
 * - FBTEST_CHILD_ROWS: JSON array of cordis rows to insert ({id, name, required?});
 * - FBTEST_CHILD_CONFIG: JSON array of row configuration operations ({id, config}) placed before
 *   the insert (CHILD-BOOT-REOPEN: the fake model as the default, the first-use workspace folder).
 *
 * With an IPC channel (CHILD-BOOT-REOPEN), the parent can ask for host-side observations and one
 * manager turn through `{type:'call', id, op, args}` messages, answered with `{type:'reply', id,
 * ok, value|error}`. The operations use public host services only (sessionController.list,
 * workspaceRegistry.list, agents.get(...).steer) and never call a real model: the turn is answered
 * by the scripted fake model row the parent inserts (test/support/fixtures/fake-llm.mjs).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PROFILE } from '../support/constants.mjs'
import { until } from '../support/util.mjs'

const CHILD_HOST = Object.freeze({
  homeMarker: path.join('.runtime', 'test-homes'),
  overlayFile: 'fbtest-child-boot.overlay.json',
  profileTemplate: 'web',
  envLayer: 'dsh',
  args: Object.freeze(['--no-open', '--port', '0']),
  ipc: Object.freeze({ call: 'call', reply: 'reply' }),
  /** Manager turn: the agent statuses DSH reports, the user-authored source, and host budgets. */
  agent: Object.freeze({ running: 'running', idle: 'idle' }),
  userSource: Object.freeze({ kind: 'user' }),
  turnStartMs: 5000,
  turnEndMs: 30000,
  pollMs: 20,
})

const runtime = process.env.FBTEST_CHILD_RUNTIME
const home = process.env.DSH_HOME
const rows = JSON.parse(process.env.FBTEST_CHILD_ROWS ?? '[]')
const config = JSON.parse(process.env.FBTEST_CHILD_CONFIG ?? '[]')
if (!runtime) throw new Error('child-boot host: FBTEST_CHILD_RUNTIME is not set')
// Never boot against a real home: the profile is created and the overlay written inside DSH_HOME.
if (!home || !home.includes(CHILD_HOST.homeMarker)) throw new Error('child-boot host refuses a DSH_HOME outside .runtime/test-homes')

const sdk = (spec) => import(pathToFileURL(path.join(runtime, spec)).href)
const { runProfile, initializeProfileFromDefault } = await sdk('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await sdk(path.join('@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'))

if (!fs.existsSync(path.join(home, 'profiles', PROFILE))) initializeProfileFromDefault(PROFILE, CHILD_HOST.profileTemplate, home)
const overlay = path.join(home, CHILD_HOST.overlayFile)
// A bare `insert` appends after the native rows, as the product's launch overlay does.
fs.writeFileSync(overlay, JSON.stringify([...config, { insert: rows }], null, 2))
const { ctx } = await runProfile({ environment: loadLayeredEnv(CHILD_HOST.envLayer), profile: PROFILE, patchFiles: [overlay], args: [...CHILD_HOST.args] })

if (process.send) {
  const { createUserMessage } = await sdk(path.join('@deepseek-ai', 'dsh-llm', 'lib', 'index.js'))
  const ops = {
    /** Every visible Session row of the host's own list (the browser's session list source). */
    async sessions() {
      const { items } = await ctx.sessionController.list({})
      return items.map(({ sessionId, blank, cwd }) => ({ sessionId, blank, cwd: cwd ?? null }))
    },
    workspaces() {
      return ctx.workspaceRegistry.list().map(({ id, path: folder, sessionIds }) => ({ id, path: folder, sessionIds: [...sessionIds] }))
    },
    /** One user turn on a live Session, answered by the fake model; resolves once it is idle again. */
    async turn({ sessionId, text }) {
      const agent = ctx.agents.get(sessionId)
      if (!agent) throw new Error('no live agent for ' + sessionId)
      agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: CHILD_HOST.userSource }))
      const started = await until(() => agent.status === CHILD_HOST.agent.running, CHILD_HOST.turnStartMs, CHILD_HOST.pollMs)
      const idle = await until(() => agent.status === CHILD_HOST.agent.idle, CHILD_HOST.turnEndMs, CHILD_HOST.pollMs)
      return { started: Boolean(started), idle: Boolean(idle) }
    },
  }
  process.on('message', async (message) => {
    if (message?.type !== CHILD_HOST.ipc.call) return
    try {
      const op = ops[message.op]
      if (!op) throw new Error('unknown child host op ' + message.op)
      process.send({ type: CHILD_HOST.ipc.reply, id: message.id, ok: true, value: await op(message.args ?? {}) })
    } catch (error) {
      process.send({ type: CHILD_HOST.ipc.reply, id: message.id, ok: false, error: String(error?.message ?? error) })
    }
  })
}
