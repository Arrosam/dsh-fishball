/** Small assertion helpers over worker results, shared by the test files. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { API, DSH_COMPACTION, FIXTURE_BUNDLE, OUTCOME, OUTPUT_CAP_MAX, PROFILE, ROW_ID, RUNTIME } from './constants.mjs'
import { until } from './util.mjs'

export const toolNames = (request) => (request?.tools ?? []).map((t) => t.name)
export const toolSchema = (request, name) => (request?.tools ?? []).find((t) => t.name === name)?.parameters

/** One scripted tool call followed by a closing text answer. */
export const callScript = (tool, args, id) => [[{ tool, args, ...(id ? { id } : {}) }], [{ text: 'done' }]]

const YAML = createRequire(path.join(RUNTIME, 'noop.js'))('yaml')

export const patchFile = (home) => path.join(home, 'profiles', PROFILE, 'cordis.patch.yml')
export const readPatch = (home) => fs.readFileSync(patchFile(home), 'utf8')

/** The fishball row's config as saved in the profile patch, or undefined. */
export function savedRowConfig(home) {
  const doc = YAML.parse(readPatch(home)) ?? []
  const find = (rows) => {
    for (const row of rows ?? []) {
      if (row?.id === ROW_ID && row.config) return row.config
      const nested = find(row?.insert)
      if (nested) return nested
    }
    return undefined
  }
  return find(Array.isArray(doc) ? doc : [])
}

export const realpath = (p) => fs.realpathSync(p)

/** Every stored artifact of one session under a test home (session directories and projection cache). */
export function sessionArtifacts(home, sessionId) {
  const out = []
  const sessions = path.join(home, 'sessions')
  for (const project of fs.existsSync(sessions) ? fs.readdirSync(sessions) : []) {
    const dir = path.join(sessions, project, sessionId)
    if (fs.existsSync(dir)) out.push(dir)
  }
  const cache = path.join(home, 'storages', 'session_projcache', 'sessions', sessionId + '.json')
  if (fs.existsSync(cache)) out.push(cache)
  return out
}

/** Move a session's stored artifacts aside (or back), so the store can lose and regain it. */
export function moveArtifacts(home, sessionId, direction) {
  const aside = path.join(home, 'aside')
  if (direction === 'away') {
    const moved = []
    for (const p of sessionArtifacts(home, sessionId)) {
      const rel = path.relative(home, p)
      const target = path.join(aside, rel)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.renameSync(p, target)
      moved.push(rel)
    }
    fs.writeFileSync(path.join(aside, 'moved.json'), JSON.stringify(moved))
    return moved
  }
  const moved = JSON.parse(fs.readFileSync(path.join(aside, 'moved.json'), 'utf8'))
  for (const rel of moved) fs.renameSync(path.join(aside, rel), path.join(home, rel))
  return moved
}

/** Delete a session's stored artifacts; refuses any path outside .runtime/test-homes. */
export function deleteSession(home, sessionId) {
  const removed = sessionArtifacts(home, sessionId)
  for (const p of removed) {
    if (!p.includes(path.join('.runtime', 'test-homes'))) throw new Error('refusing to delete outside test homes: ' + p)
    fs.rmSync(p, { recursive: true, force: true })
  }
  return removed
}

/** Drive one turn in a live session and require it to finish. */
export async function turn(host, sessionId, script = [], text) {
  const r = await host.call('drive', { sessionId, script, ...(text ? { text } : {}) })
  if (!r.idle) throw new Error('turn did not finish for ' + sessionId)
  return r
}

/** Call one tool from a live session through the fake model; returns the single tool result and the turn record. */
export async function callTool(host, sessionId, tool, args) {
  const r = await turn(host, sessionId, callScript(tool, args))
  if (r.results.length !== 1) throw new Error('expected one tool result for ' + tool + ', got ' + JSON.stringify(r.results))
  return { result: r.results[0], asked: r.asked, requests: r.requests }
}

// ---- P3 helpers ----

/** A Fishball tool's JSON answer: the result text parsed, or undefined when it is not JSON. */
export function jsonOf(result) {
  const text = result?.text ?? ''
  try { return JSON.parse(text) } catch { /* fall through */ }
  const start = text.indexOf('{')
  if (start < 0) return undefined
  try { return JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)) } catch { return undefined }
}

/**
 * Call one Fishball tool with the scripted approver set to `outcome` (default: reject, so an
 * unexpected prompt cannot pass). Returns the parsed answer, the raw result, the approval
 * questions this call raised, the turn's requests and the number of approval/asked events.
 */
export async function fishballTool(host, sessionId, tool, args, outcome = OUTCOME.reject) {
  // outcome may be one answer, or a list answered in order (later questions get the last one).
  const answers = [].concat(outcome)
  await host.call('setApprover', { outcome: answers.at(-1), queue: answers.slice(0, -1) })
  const before = (await host.call('approvals', { sessionId })).length
  try {
    const { result, asked, requests } = await callTool(host, sessionId, tool, args)
    const approvals = (await host.call('approvals', { sessionId })).slice(before)
    return { json: jsonOf(result), result, asked, approvals, requests }
  } finally {
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }
}

export const setPlugin = (host, sessionId, plugin, on, outcome) => fishballTool(host, sessionId, 'set_plugin_enabled', { plugin, on }, outcome)

/** Fishball's catalog through list_plugins. */
export async function listPlugins(host, sessionId) {
  const r = await fishballTool(host, sessionId, 'list_plugins', {})
  if (!r.json) throw new Error('list_plugins did not answer JSON: ' + r.result.text.slice(0, 500))
  return r.json
}

export const pluginIn = (catalog, key) => catalog?.plugins?.find((p) => p.plugin === key)
export const toolIn = (catalog, key, name) => pluginIn(catalog, key)?.tools?.find((t) => t.name === name)
/** Status of a tool anywhere in the catalog (under a plugin or in otherTools). */
export function statusIn(catalog, name) {
  for (const p of catalog?.plugins ?? []) { const t = p.tools?.find((x) => x.name === name); if (t) return t.status }
  return catalog?.otherTools?.find((t) => t.name === name)?.status
}

/**
 * Wait until the catalog reports every plugin's choice as in effect (applied === on, as
 * observed: an off plugin reports applied false; CASES.md A20). Never fails: a refused or
 * broken plugin can stay unapplied, and the test then checks the request itself.
 */
export async function settle(host, timeoutMs = 3000) {
  await until(async () => {
    const catalog = (await host.state())?.catalog
    return catalog && catalog.plugins.every((p) => p.applied === p.on)
  }, timeoutMs, 50)
}

/** The tool names of Fishball's next request (one plain turn after the plugin changes settled). */
export async function nextTools(host, sessionId) {
  await settle(host)
  return toolNames((await turn(host, sessionId, [[{ text: 'next' }]])).requests.at(-1))
}

/** Make the fbtest-tools fixture tools visible to Fishball the supported way: set_plugin_enabled answered Allow once. */
export async function allowFixtures(host, sessionId, plugin = FIXTURE_BUNDLE.name) {
  const r = await setPlugin(host, sessionId, plugin, true, OUTCOME.allow)
  if (r.json?.ok !== true) throw new Error('precondition: allowing ' + plugin + ' failed: ' + r.result.text.slice(0, 500))
  await settle(host)
  return r
}

/**
 * Drive one Fishball turn made of several scripted steps with the approver answering `outcome`;
 * returns the turn record and the approval questions it raised.
 */
export async function scriptedTurn(host, sessionId, script, outcome = OUTCOME.reject) {
  await host.call('setApprover', { outcome })
  const before = (await host.call('approvals', { sessionId })).length
  try {
    const r = await turn(host, sessionId, script)
    return { ...r, approvals: (await host.call('approvals', { sessionId })).slice(before) }
  } finally {
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }
}

// ---- P4 helpers (formulas from the P4 requirements C2, C4, C5) ----

/** DSH's default compaction threshold for window W and reply cap R (C2). */
export const defaultThreshold = (W, R) => Math.floor(Math.min(W * DSH_COMPACTION.thresholdRatio, W - R - DSH_COMPACTION.headroom))
/** The reply cap a smaller window N gets when maxOutputTokens is unset (C4). */
export const defaultOutputCap = (N) => Math.min(OUTPUT_CAP_MAX, Math.floor(N / 8))
/** Headroom, also the summary's cap, for a smaller window N (C5). */
export const headroomFor = (N) => Math.min(DSH_COMPACTION.headroom, Math.floor(N / 8))
/** Threshold for a smaller window N with reply cap O (C5). */
export const smallThreshold = (N, O) => Math.floor(Math.min(N * DSH_COMPACTION.thresholdRatio, N - O - headroomFor(N)))

/** POST the context-window setting; both keys always sent unless a raw body is given. */
export const saveWindow = (host, contextWindowTokens, maxOutputTokens) => host.post(API.contextWindow, { contextWindowTokens, maxOutputTokens })
export const windowNow = async (host) => (await host.state())?.contextWindow

/** One plain load turn: a user message of `chars` characters (letter varies with i), answered 'ok'. */
export const loadTurn = (host, sessionId, i, chars) => turn(host, sessionId, [[{ text: 'ok' }]], String.fromCharCode(97 + (i % 26)).repeat(chars))

/**
 * Load turns until one compacts (or maxTurns). Each entry records pressureTokens before and after
 * the turn, its compaction events, request caps and turn ends.
 */
export async function loadUntilCompaction(host, sessionId, chars, maxTurns) {
  const turns = []
  for (let i = 0; i < maxTurns; i++) {
    const before = (await windowNow(host)).pressureTokens
    const r = await loadTurn(host, sessionId, i, chars)
    turns.push({ before, after: (await windowNow(host)).pressureTokens, compactions: r.compactions, caps: r.requests.map((q) => q.maxTokens), turnEnds: r.turnEnds })
    if (r.compactions.length > 0) break
  }
  return turns
}

/**
 * C5 for a threshold T and load turns adding about `turnTokens` each: no turn that ends more
 * than 1000 tokens below T compacts, the session compacts no later than the first turn that
 * starts at or above T, and the compacting turn reaches T (before + turnTokens >= T).
 * Returns the index of the compacting turn.
 */
export function assertCompactsAt(turns, threshold, turnTokens, assert) {
  const first = turns.findIndex((x) => x.compactions.includes('compaction/summary'))
  assert.ok(first >= 0, 'a compaction happened: ' + JSON.stringify(turns.map((x) => x.before)) + ' threshold ' + threshold)
  for (const x of turns.slice(0, first)) assert.ok(x.before < threshold, 'a turn started at ' + x.before + ' >= threshold ' + threshold + ' without compacting')
  for (const x of turns) if (x.before + turnTokens < threshold - 1000) assert.deepEqual(x.compactions, [], 'compacted too early at ' + x.before + ' (threshold ' + threshold + ')')
  assert.ok(turns[first].before + turnTokens >= threshold, 'compacted at ' + turns[first].before + ', too far below threshold ' + threshold)
  return first
}

/** C6/C7 (review update): DSH's engine accepts reply cap O on the full window W iff O < W, W-O-65536 > 0 and the retained tail < threshold. */
export function engineAcceptsCap(W, O) {
  const threshold = defaultThreshold(W, O)
  return O < W && W - O - DSH_COMPACTION.headroom > 0 && Math.floor((W - O) * DSH_COMPACTION.retainRatio) < threshold
}

/** Profile files Fishball's toggles must leave byte-identical (R5). */
export function profileFiles(home) {
  const dir = path.join(home, 'profiles', PROFILE)
  return { packageJson: fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), patch: fs.readFileSync(path.join(dir, 'cordis.patch.yml'), 'utf8') }
}

export const T = { timeout: 55000 }
export const HOOK = { timeout: 60000 }
