/**
 * One Fishball DSH for the F-FACADE cases, built from the installed SDK's real parts (cordis,
 * session, tools, agent loop, storage, logger), as test/v3/f-intercept/world.mjs does. The only
 * fakes are:
 * - the model adapter: it records every request (the tool schemas Fishball's model is offered and
 *   the messages it sees) and can be scripted to call one tool;
 * - core's link (fakes.mjs), K1 shapes only;
 * - for EXT-UC-02 A3, a Watchdog-like interceptor plugin (a real cordis plugin whose registration
 *   is an effect of its fiber).
 * Everything observed is public: the model requests, the link's calls and DSH's tool results.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { importSdk } from '../../private-skills/support/sdk.mjs'
import { until } from '../../support/util.mjs'
import { DSH, FIXTURE, TOOL, WAIT } from './constants.mjs'
import { FakeLink } from './fakes.mjs'
import { eventsModule, makeBridge } from './subject.mjs'

const json = (value) => JSON.stringify(value)

const parts = new Map()
function sdkParts(sdk) {
  if (!parts.has(sdk)) {
    const names = [DSH.cordis, DSH.llm, DSH.storageDomain, DSH.storageJson, DSH.persistence, DSH.checkpoint, DSH.agentLoop, ...DSH.sdkPlugins]
    parts.set(sdk, Promise.all(names.map((n) => importSdk(sdk, n))).then((mods) => Object.fromEntries(names.map((n, i) => [n, mods[i]]))))
  }
  return parts.get(sdk)
}

/** A throwaway root under the canonical (realpath) OS temp directory. */
async function newRoot() {
  return mkdtemp(path.join(await realpath(os.tmpdir()), FIXTURE.tempPrefix))
}

/**
 * Opens the world; `t.after` closes it and removes its root.
 * @param {{tools: object[], status?: object, answers?: object}} linkOptions the fake link
 * @param {{events?: boolean, gate?: object, imagesSupported?: boolean}} options `events`: also run
 *   F-INTERCEPT's module with the façade's `present` as its Fishball presenter (EXT-UC-02 A3);
 *   `gate` and `imagesSupported` go to the façade's factory (subject.mjs)
 */
export async function worldFor(t, sdk, linkOptions, { events = false, gate, imagesSupported } = {}) {
  const root = await newRoot()
  const closers = []
  t.after(async () => {
    while (closers.length > 0) await closers.pop()()
    assert.ok(root.startsWith(await realpath(os.tmpdir())) && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })

  const p = await sdkParts(sdk)
  const ctx = new p[DSH.cordis].Context()
  closers.push(() => ctx.fiber.dispose())
  const logs = []
  ctx.logger.exporter({ levels: { default: DSH.allLevels }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : json(a))).join(' ') }) })
  for (const n of DSH.sdkPlugins) await ctx.plugin(p[n].default).await()
  if (typeof ctx.tools.setExecutor === 'function') await ctx.plugin(await importSdk(sdk, DSH.executor)).await()
  await ctx.plugin(p[DSH.storageJson], { root: path.join(root, 'domain') }).await()
  await ctx.plugin(p[DSH.storageDomain], { backend: 'json', routes: {} }).await()
  await ctx.plugin(p[DSH.persistence], { root: path.join(root, 'sessions'), compression: 'none' }).await()
  await ctx.plugin(p[DSH.checkpoint]).await()

  // The fake model: one scripted tool call per `callNext`, otherwise a plain answer.
  const requests = []
  const script = []
  let callSeq = 0
  const { LlmAdapter, freezeMessage } = p[DSH.llm]
  class FakeModel extends LlmAdapter {
    async *stream(options) {
      requests.push({ tools: structuredClone(options.tools ?? []), messages: structuredClone(options.messages) })
      const last = options.messages.at(-1)
      const call = last?.role === DSH.toolRole ? undefined : script.shift()
      if (call !== undefined) {
        const block = { type: DSH.block.toolCall, id: FIXTURE.callId + ++callSeq, name: call.name, arguments: json(call.args) }
        yield { type: 'block-start', index: 0, blockType: DSH.block.toolCall }
        yield { type: 'block-end', index: 0, block }
        yield { type: 'finish', reason: { kind: DSH.finish.toolCalls } }
        return
      }
      yield { type: 'block-start', index: 0, blockType: DSH.block.text }
      yield { type: 'block-end', index: 0, block: { type: DSH.block.text, text: FIXTURE.modelText } }
      yield { type: 'finish', reason: { kind: DSH.finish.stop } }
    }
  }
  ctx.llm.registerAdapter([FIXTURE.provider], new FakeModel())
  await ctx.plugin(p[DSH.agentLoop].default, { agents: [], maxParallelToolCalls: 1 }).await()
  const cwd = path.join(root, FIXTURE.cwdName)
  fs.mkdirSync(cwd)
  const handle = await ctx.agentLoop.createAgent(ctx, { sessionId: FIXTURE.session, agentOptions: { provider: FIXTURE.provider, model: FIXTURE.model }, meta: { cwd } })
  closers.push(() => handle.dispose())
  const agent = handle.agent

  const link = new FakeLink(linkOptions)
  const logger = ctx.logger(FIXTURE.loggerName)
  const bridge = await makeBridge(sdk, { ctx, link, logger, gate, imagesSupported })
  closers.push(() => bridge.close())

  let turnSeq = 0
  const world = {
    sdk, root, ctx, agent, link, bridge, logs, requests,
    /** Starts one user turn and waits until Fishball is idle; returns the turn's model requests. */
    async turn(text = FIXTURE.userText) {
      const from = requests.length
      agent.followup(freezeMessage({ id: 'fbtest-u' + ++turnSeq, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }))
      await settle(() => requests.length > from)
      return requests.slice(from)
    },
    /** The tool schemas of the last model request: what Fishball's model is offered. */
    async offered() {
      const [first] = await world.turn()
      assert.ok(first, 'no model request in the turn')
      return first.tools
    },
    /** The model calls `name` with `args` once; returns the tool result message DSH gave it. */
    async modelCalls(name, args) {
      script.push({ name, args })
      const turn = await world.turn()
      const result = turn.flatMap((r) => r.messages).findLast((m) => m.role === DSH.toolRole)
      assert.ok(result, `the model's call of ${name} got no tool result: ${json(turn.map((r) => r.messages.at(-1)))}`)
      return result
    },
    modelRequestsWith: (needle) => requests.filter((r) => json(r.messages).includes(needle)),
    logsWith: (needle) => logs.filter((l) => l.text.includes(needle)),
  }

  async function settle(started) {
    const ok = await until(async () => {
      if (!started()) return false
      await agent.whenIdle()
      return agent.status === DSH.idle
    }, WAIT.settleMs, WAIT.pollMs)
    assert.ok(ok, 'timed out waiting for Fishball\'s turn')
  }

  if (events) {
    const [mod, storageDomain] = await Promise.all([eventsModule(sdk), importSdk(sdk, DSH.storageDomain)])
    const ledger = await mod.openLedger(ctx, storageDomain)
    closers.push(() => ledger.close())
    const core = mod.createEvents({
      table: ledger.table,
      link: { ack: (receipts) => link.callTool(TOOL.inboxAck, { receipts }) },
      fishball: { activate: async () => agent, present: (event) => bridge.present(event) },
      logger,
    })
    closers.push(async () => { core.close() })
    await core.recover()
    world.events = core
    /** A plugin of the Fishball DSH registering `types`; `seen` records what its handler got. */
    world.interceptor = async (pluginId, types) => {
      const seen = []
      const fiber = ctx.plugin({
        name: pluginId,
        apply(pctx) {
          pctx.effect(() => core.service.intercept({ pluginId, types }, async (event, ctl) => {
            seen.push(event)
            await ctl.accept()
          }))
        },
      })
      await fiber
      return { seen }
    }
    /** Hands one polled event to core and waits until Fishball (if woken) is idle again. */
    world.deliver = async (event) => {
      const from = requests.length
      await core.intake(event)
      await until(() => requests.length > from, WAIT.quietMs * 10, WAIT.pollMs)
      await agent.whenIdle()
    }
  }
  return world
}
