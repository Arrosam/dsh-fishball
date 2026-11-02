/**
 * Spike harness: boots the real installed DSH Web 0.2.1-rc.2 profile in-process,
 * on a throwaway DSH_HOME under .runtime/, with a scripted fake model.
 *
 * Why in-process: the spikes need the composed host (presets, tools, approvals,
 * persistence) exactly as a profile builds it, and direct access to its root
 * Context to inspect the result. Nothing here touches ~/.dsh.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const RUNTIME = process.env.DSH_RUNTIME_ROOT ?? '/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules'
export const REPO = path.resolve(import.meta.dirname, '..')
export const SPIKE_ROOT = path.join(REPO, '.runtime', 'spikes')
export const FAKE_PROVIDER = 'fishball-spike'
export const FAKE_MODEL = 'spike-model'

/** Import an installed host module by path, so it is the same instance DSH loads. */
export const host = (spec) => import(pathToFileURL(path.join(RUNTIME, spec)).href)
export const hostPkg = (name) => host(path.join('@deepseek-ai', name, 'lib', 'index.js'))

/** Write a patch overlay file and return its path. */
export function writePatch(dir, name, rows) {
  const file = path.join(dir, name)
  fs.writeFileSync(file, JSON.stringify(rows, null, 2))
  return file
}

/**
 * Boot a fresh home with the shipped web template plus overlays.
 * @param id - spike id, used for the home folder name.
 * @param extraRows - additional patch rows (YAML is a JSON superset).
 * @param options.bundles - extra profile dependencies { name: spec } and bundles to enable.
 */
export async function bootDsh(id, extraRows = [], { args = ['--no-open', '--port', '0'], setupProfile } = {}) {
  // SPIKE_REUSE_HOME boots an existing home again (restart checks).
  const reuse = process.env.SPIKE_REUSE_HOME
  const home = reuse ?? path.join(SPIKE_ROOT, `${id}-${Date.now()}`)
  fs.mkdirSync(home, { recursive: true })
  process.env.DSH_HOME = home
  const { runProfile, initializeProfileFromDefault } = await host('@deepseek-ai/dsh/lib/profile-boot.js')
  const { loadLayeredEnv } = await hostPkg('dsh-app-boot')
  const profileDir = path.join(home, 'profiles', 'spike')
  if (!reuse) {
    initializeProfileFromDefault('spike', 'web', home)
    if (setupProfile) await setupProfile(profileDir)
  }
  const patch = writePatch(home, 'spike.patch.yml', [
    { id: 'agent-default-model', config: { provider: FAKE_PROVIDER, model: FAKE_MODEL } },
    { insert: [{ id: 'spike-llm', name: path.join(REPO, 'spikes', 'fake-llm.mjs') }] },
    ...extraRows,
  ])
  const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: 'spike', patchFiles: [patch], args })
  return { ctx, shutdown, home, profileDir }
}

/**
 * The scripted model. Responses are queued per session id; a session with an
 * empty queue answers 'done'. Every request is recorded.
 */
export const model = (globalThis.__fishballSpikeModel ??= {
  requests: [],
  queues: new Map(),
  queue(sessionId, ...responses) { const q = this.queues.get(sessionId) ?? []; q.push(...responses); this.queues.set(sessionId, q) },
  respond(options) { return this.queues.get(options.sessionId)?.shift() ?? [{ text: 'done' }] },
  requestsFor(sessionId) { return this.requests.filter((r) => r.sessionId === sessionId) },
})

const { createUserMessage } = await hostPkg('dsh-llm')
/** A user-role message with a minted id and the given source. */
export const message = (text, source = { kind: 'user' }) => createUserMessage({ content: [{ type: 'text', text }], source })

/** Steer one message into an agent and wait until it is idle again. */
export async function drive(agent, text, timeoutMs = 20000) {
  agent.steer(message(text))
  await until(() => agent.status === 'running', 2000, 5)
  await until(() => agent.status === 'idle', timeoutMs)
}

/** Start an ordinary session through DSH's own controller and return its live agent. */
export async function ordinarySession(ctx, cwd, agentPreset) {
  const created = await ctx.sessionController.create({ cwd, ...(agentPreset ? { agentPreset } : {}) })
  return (await ctx.sessionController.agents.resolveAgent(created.sessionId)).agent
}

/** Mount a plain plugin into the booted tree and return its context (the fishball row's position). */
export function hostRow(ctx, name, inject, body = () => {}) {
  return new Promise((resolve, reject) => {
    const fiber = ctx.plugin({ name, inject, apply: (c) => { body(c); resolve(c) } })
    Promise.resolve(fiber).catch(reject)
  })
}

/** Event types of a session log, for evidence. */
export const eventTypes = (session) => session.snapshotEvents().map((e) => e.type)

/** Build stream chunks from a simple script: [{text}] or [{tool, args, id}]. */
export function chunksFor(steps) {
  const out = []
  let index = 0
  let toolCalls = false
  for (const step of steps) {
    if (step.text !== undefined) {
      out.push({ type: 'block-start', index, blockType: 'text' }, { type: 'text-delta', index, text: step.text }, { type: 'block-end', index, block: { type: 'text', text: step.text } })
    } else {
      toolCalls = true
      const id = step.id ?? `call_${Math.random().toString(36).slice(2, 10)}`
      const args = JSON.stringify(step.args ?? {})
      out.push({ type: 'block-start', index, blockType: 'tool-call' }, { type: 'tool-call-delta', index, id, name: step.tool, argumentsDelta: args }, { type: 'block-end', index, block: { type: 'tool-call', id, name: step.tool, arguments: args } })
    }
    index++
  }
  out.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: toolCalls ? 'tool-calls' : 'stop' } })
  return out
}

// Surface why the process ends: DSH's fail-loud handler exits on unhandled rejections.
// The launcher treats stdin EOF as a shutdown request (dsh-cmdline), so spikes run with `< /dev/zero`-style open stdin; see run.sh.
process.on('exit', (code) => { if (code !== 0) console.error('[spike] process exit code', code) })
for (const event of ['unhandledRejection', 'uncaughtException']) {
  process.prependListener(event, (reason) => console.error('[spike]', event, reason?.stack ?? reason))
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function until(predicate, timeoutMs = 10000, stepMs = 20) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) { if (await predicate()) return true; await sleep(stepMs) }
  return Boolean(await predicate())
}

/** Run one spike module and record its result as evidence. */
export const stage = (name) => { globalThis.__spikeStage = name; console.error('[stage]', name) }
const SPIKE_DEADLINE_MS = Number(process.env.SPIKE_DEADLINE_MS ?? 90000)

export async function runSpike(id, fn) {
  const started = new Date().toISOString()
  let result
  const deadline = new Promise((resolve) => setTimeout(() => resolve({ pass: false, error: 'deadline at stage ' + globalThis.__spikeStage }), SPIKE_DEADLINE_MS).unref())
  try { result = await Promise.race([fn(), deadline]) } catch (error) { result = { pass: false, error: String(error?.stack ?? error), stage: globalThis.__spikeStage } }
  const record = { id, started, finished: new Date().toISOString(), runtime: '0.2.1-rc.2', node: process.version, ...result }
  fs.mkdirSync(path.join(REPO, 'spikes', 'results'), { recursive: true })
  fs.writeFileSync(path.join(REPO, 'spikes', 'results', `${id}.json`), JSON.stringify(record, null, 2) + '\n')
  console.log(JSON.stringify(record, null, 2))
  // DSH keeps the process alive; exit once the evidence is written.
  process.exit(0)
}