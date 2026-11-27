/**
 * S5  a private compaction-basic instance (isolated group in P's tree) with a derived policy compacts at the
 *     derived threshold for the assistant only; a summarize() subclass is used.
 * S6  a synthetic CONTEXT_WINDOW_EXCEEDED from llm/stream triggers DSH's overflow compaction and retry.
 * S2b each tool can be traced to the plugin row that registered it (Cordis effect ownership).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { bootDsh, eventTypes, hostPkg, hostRow, message, model, ordinarySession, runSpike, stage, until, REPO } from './harness.mjs'

const { createScope, bindScopeParent, scopeOf } = await hostPkg('dsh-scope')
const { EntryTree } = await hostPkg('cordis-plugin-loader')
const { prepareProfileEntries } = await hostPkg('dsh-app-boot')
const { auditRows } = await hostPkg('dsh-agent-preset-registry')
const { LlmError, CONTEXT_WINDOW_EXCEEDED_CODE } = await hostPkg('dsh-llm')

class PrivateTree extends EntryTree {
  constructor(ctx) { const o = ctx.fiber.entry; const st = o?.subtree; const sg = o?.subgroup; super(ctx); if (o !== undefined) { if (st === undefined) delete o.subtree; else o.subtree = st; if (sg === undefined) delete o.subgroup; else o.subgroup = sg } }
  write() {}
}
const SUBCLASS = path.join(REPO, 'spikes', 'fixtures', 'assistant-compaction.mjs')
const big = (n) => 'x'.repeat(n)

await runSpike('S5-S6-S2b', async () => {
  process.env.SPIKE_CONTEXT_WINDOW = '200000'
  const { ctx, home } = await bootDsh('s5')
  const out = {}
  const P = {}
  const row = await hostRow(ctx, 'fishball-spike-row', ['agents', 'tools', 'loader', 'llm'])
  const pScope = createScope(row, P)
  const pctx = pScope.ctx.extend({ baseUrl: ctx.baseUrl })
  const tree = new PrivateTree(pctx)
  pctx.effect(() => () => tree.root.stop(), 'tree')
  // Effective window 20000 of the model's 200000; output cap 2500.
  const W_EFF = 20000, W_MODEL = 200000, O = 2500
  const headroom = 1000
  const threshold = Math.floor(Math.min(W_EFF * 0.8, W_EFF - O - headroom))
  // compaction-basic computes floor(min(W_model*ratio, W_model - O - headroom)); derive ratio so it equals threshold.
  const derived = { thresholdRatio: threshold / W_MODEL, headroomTokens: headroom, retainTokens: Math.floor((W_EFF - O) * 0.16), maxTokens: O }
  out.derived = { ...derived, threshold }
  stage('mount compaction group')
  await tree.root.update(prepareProfileEntries(pctx, [
    { id: 'compaction', name: 'cordis:group', group: true, isolate: { compaction: true, toolResultPruner: true }, config: [
      { id: 'compaction-basic', name: SUBCLASS, config: derived },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner', config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 } },
    ] },
  ], pctx.baseUrl))
  out.audit = await auditRows(tree)

  stage('create assistant')
  const cwd = path.join(home, 'assistant'); fs.mkdirSync(cwd, { recursive: true })
  const sid = 'session-fishball-s5'
  const handle = await row.agents.create({ sessionId: sid, meta: { cwd }, agentOptions: { provider: 'fishball-spike', model: 'spike-model' }, setup: async (actx) => {
    bindScopeParent(scopeOf(actx), P)
    actx.on('agent/request', async (_p, next) => { const c = await next(); return { ...c, maxTokens: Math.min(c.maxTokens ?? O, O) } }, { prepend: true })
  } })
  const agent = handle.agent
  // Fill the context: each turn ~4000 tokens of text. The model answers each with a long text too.
  for (let i = 0; i < 6; i++) {
    model.queue(sid, [{ text: 'answer ' + i + ' ' + big(8000) }])
    agent.steer(message('turn ' + i + ' ' + big(8000)))
    await until(() => agent.status === 'running', 2000, 5)
    await until(() => agent.status === 'idle', 15000)
  }
  const types = eventTypes(agent.session)
  out.S5 = {
    compactions: types.filter((t) => t === 'compaction/summary').length,
    summarizerUsed: globalThis.__assistantSummarizeCalls ?? 0,
    maxTokensSeen: [...new Set(model.requestsFor(sid).map((r) => r.maxTokens))],
    measured: ctx.tokenMeter.measure(agent.session).totalTokens,
  }
  stage('other session unaffected')
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const other = await ordinarySession(ctx, ws)
  for (let i = 0; i < 6; i++) {
    model.queue(other.id, [{ text: 'answer ' + i + ' ' + big(8000) }])
    other.steer(message('turn ' + i + ' ' + big(8000)))
    await until(() => other.status === 'running', 2000, 5)
    await until(() => other.status === 'idle', 15000)
  }
  out.S5.otherCompactions = eventTypes(other.session).filter((t) => t === 'compaction/summary').length

  stage('S6 synthetic overflow')
  let injected = 0
  const dispose = pctx.on('llm/stream', (options, next) => {
    if (options.sessionId === sid && options.purpose === undefined && injected === 0) {
      injected++
      return (async function* () { yield { type: 'finish', reason: { kind: 'error', failure: { message: 'context window exceeded (synthetic)', code: CONTEXT_WINDOW_EXCEEDED_CODE } } } })()
    }
    return next()
  })
  const before = eventTypes(agent.session).filter((t) => t === 'compaction/summary').length
  model.queue(sid, [{ text: 'after overflow' }])
  agent.steer(message('one more ' + big(2000)))
  await until(() => agent.status === 'running', 2000, 5)
  await until(() => agent.status === 'idle', 20000)
  dispose()
  const after = eventTypes(agent.session).filter((t) => t === 'compaction/summary').length
  const lastAssistant = agent.session.snapshotEvents().filter((e) => e.type === 'assistant/message').at(-1)?.data.message.content.map((b) => b.text).join('')
  out.S6 = { injected, compactedOnOverflow: after > before, retriedAndAnswered: lastAssistant === 'after overflow', tail: eventTypes(agent.session).slice(-14) }

  stage('S2b tool attribution')
  // Every tool definition in the global layer; find which loader entry's fiber owns the registering effect.
  const owners = {}
  for (const entry of ctx.loader.entries?.() ?? []) {
    const fiber = entry.fiber
    if (!fiber) continue
    const walk = (metas, acc) => { for (const m of metas) { acc.push(m.label); walk(m.children ?? [], acc) } return acc }
    const labels = walk(fiber.getEffects?.() ?? [], [])
    if (labels.some((l) => String(l).startsWith('tools.register'))) owners[entry.options.id ?? entry.id] = entry.options.name
  }
  out.S2b = { entriesWithToolEffects: Object.keys(owners).length, sample: Object.entries(owners).slice(0, 12) }

  out.verdict = {
    S5_compacts_at_derived: out.S5.compactions >= 1 && out.S5.summarizerUsed >= 1 && out.S5.maxTokensSeen.every((m) => m <= O),
    S5_other_untouched: out.S5.otherCompactions === 0,
    S6_overflow_recovery: injected === 1 && out.S6.compactedOnOverflow && out.S6.retriedAndAnswered,
  }
  await handle.dispose()
  return { pass: Object.values(out.verdict).every(Boolean), ...out }
})
