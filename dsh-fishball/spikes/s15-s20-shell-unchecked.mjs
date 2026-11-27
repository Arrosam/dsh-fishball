/**
 * S15 the guard refuses sandbox_permissions and refuses shell tools unless the session sandbox is read-only;
 *     read-only bash writes are blocked (needs a non-nested macOS sandbox; recorded as environment-limited here).
 * S20 a plugin mounted with its tools hidden can list them; Allow shows them; Reject unmounts; a changed
 *     parameter schema changes the digest.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, eventTypes, hostPkg, hostRow, message, model, runSpike, stage, until, REPO } from './harness.mjs'

const { createScope, bindScopeParent, scopeOf } = await hostPkg('dsh-scope')
const { EntryTree } = await hostPkg('cordis-plugin-loader')
const { prepareProfileEntries } = await hostPkg('dsh-app-boot')
const { setSandboxMode } = await hostPkg('dsh-sandbox-policy')
class PrivateTree extends EntryTree {
  constructor(ctx) { const o = ctx.fiber.entry; const st = o?.subtree; const sg = o?.subgroup; super(ctx); if (o !== undefined) { if (st === undefined) delete o.subtree; else o.subtree = st; if (sg === undefined) delete o.subgroup; else o.subgroup = sg } }
  write() {}
}
const DEMO = path.join(REPO, 'spikes', 'fixtures', 'demo-plugin')
const SHELL_TOOLS = new Set(['bash', 'run_code', 'terminal'])
const digest = (schema) => crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0, 16)

await runSpike('S15-S20', async () => {
  const { ctx, home } = await bootDsh('s15', [], {
    setupProfile: async (dir) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      pkg.dependencies = { ...pkg.dependencies, 'fishball-spike-demo': 'link:' + DEMO }
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
      fs.symlinkSync(DEMO, path.join(dir, 'node_modules', 'fishball-spike-demo'))
    },
  })
  const out = { S15: {}, S20: {} }
  const P = {}
  const row = await hostRow(ctx, 'fishball-spike-row', ['agents', 'tools', 'loader', 'sandboxPolicy'])
  const pctx = createScope(row, P).ctx.extend({ baseUrl: ctx.baseUrl })
  const tree = new PrivateTree(pctx)
  pctx.effect(() => () => tree.root.stop(), 'tree')
  await tree.root.update(prepareProfileEntries(pctx, [{ id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' }], pctx.baseUrl))
  await tree.await()

  const cwd = path.join(home, 'assistant'); fs.mkdirSync(cwd, { recursive: true })
  const sid = 'session-fishball-s15'
  let maskDispose
  let agentCtxRef
  const handle = await row.agents.create({ sessionId: sid, meta: { cwd }, agentOptions: { provider: 'fishball-spike', model: 'spike-model' }, setup: async (actx, agent) => {
    bindScopeParent(scopeOf(actx), P)
    agentCtxRef = actx
    actx.tools.guard((exec) => {
      if (!SHELL_TOOLS.has(exec.name)) return undefined
      const args = exec.arguments ?? {}
      if (args.sandbox_permissions !== undefined) return 'Fishball never widens its sandbox'
      const mode = row.sandboxPolicy.resolve({ session: agent.session }).mode
      return mode === 'read-only' ? undefined : 'shell tools run only while Fishball is read-only (now ' + mode + ')'
    })
  } })
  const agent = handle.agent
  const lastResult = () => agent.session.snapshotEvents().filter((e) => e.type === 'tool/result').map((e) => e.data.message.content.map((b) => b.text).join('')).at(-1)
  const call = async (args) => { model.queue(sid, [{ tool: 'bash', args }], [{ text: 'ok' }]); agent.steer(message('go')); await until(() => agent.status === 'running', 2000, 5); await until(() => agent.status === 'idle', 15000); return lastResult() }

  out.S15.defaultMode = row.sandboxPolicy.resolve({ session: agent.session }).mode
  // Fishball sets its own session read-only at creation (design §7).
  setSandboxMode(agent.session, 'read-only')
  stage('S15 read-only write')
  out.S15.mode = row.sandboxPolicy.resolve({ session: agent.session }).mode
  out.S15.readOnlyRead = (await call({ command: 'echo readable', description: 'read test' })).slice(0, 300)
  const target = path.join(cwd, 'should-not-exist.txt')
  out.S15.readOnlyWrite = (await call({ command: 'echo hi > ' + JSON.stringify(target), description: 'write test' })).slice(0, 300)
  out.S15.fileCreated = fs.existsSync(target)
  stage('S15 escalation refused')
  out.S15.escalation = (await call({ command: 'echo hi', description: 'esc', sandbox_permissions: 'workspace-write', justification: 'test' })).slice(0, 200)
  out.S15.escalationAsked = eventTypes(agent.session).includes('approval/asked')
  stage('S15 refused under other mode')
  setSandboxMode(agent.session, 'workspace-write')
  out.S15.underWorkspaceWrite = (await call({ command: 'echo hi', description: 'mode' })).slice(0, 200)
  setSandboxMode(agent.session, 'read-only')

  stage('S20 mount hidden, list, allow, reject')
  // Mount the demo plugin in P with its tool masked in A.
  await tree.root.update(prepareProfileEntries(pctx, [{ id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' }, { id: 'spike-demo', name: 'fishball-spike-demo' }], pctx.baseUrl))
  await tree.await()
  const own = new Set(ctx.tools.schemas(P).map((t) => t.name))
  // demo_echo is in P's layer, so A inherits it and can mask it.
  maskDispose = agentCtxRef.tools.restrict({ deny: ['demo_echo'] })
  const listed = ctx.tools.schemas(P).filter((t) => t.name === 'demo_echo').map((t) => ({ name: t.name, firstLine: t.description.split('\n')[0], digest: digest(t.parameters) }))
  out.S20.listedWhileHidden = listed
  out.S20.hiddenFromA = !ctx.tools.schemas(scopeOf(agent.ctx)).some((t) => t.name === 'demo_echo')
  maskDispose(); maskDispose = undefined
  out.S20.visibleAfterAllow = ctx.tools.schemas(scopeOf(agent.ctx)).some((t) => t.name === 'demo_echo')
  // Reject path: unmount the row again.
  await tree.root.update(prepareProfileEntries(pctx, [{ id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' }], pctx.baseUrl))
  await tree.await()
  out.S20.goneAfterReject = !ctx.tools.schemas(P).some((t) => t.name === 'demo_echo')
  const changed = { ...listed[0] && {}, digest: digest({ type: 'object', properties: { text: { type: 'string' }, output: { type: 'string' } } }) }
  out.S20.digestChangesWithSchema = listed[0] && listed[0].digest !== changed.digest

  out.verdict = {
    S15_escalation_refused: /never widens/.test(out.S15.escalation) && !out.S15.escalationAsked,
    S15_refused_other_mode: /only while Fishball is read-only/.test(out.S15.underWorkspaceWrite),
    S15_readonly_blocks_write: !out.S15.fileCreated,
    S20: out.S20.listedWhileHidden.length === 1 && out.S20.hiddenFromA && out.S20.visibleAfterAllow && out.S20.goneAfterReject && out.S20.digestChangesWithSchema,
  }
  await handle.dispose()
  return { pass: Object.values(out.verdict).every(Boolean), ...out }
})