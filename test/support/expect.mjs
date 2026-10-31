/** Small assertion helpers over worker results, shared by the test files. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { ACTION, API, AUTHOR_KIND, DSH_COMPACTION, DSH_STATE, FISHBALL_GROUP_KEYS, FISHBALL_PLUGINS_DIR, FIXTURE_BUNDLE, KIND, MANAGER_API, OUTCOME, OUTPUT_CAP_MAX, PLUGIN_STATUS, PRIVATE_ROW_PREFIX, PROFILE, PROMPT_ARROW, ROW_ID, RUNS, RUNTIME, SETTINGS_ACTION, SETTINGS_FIXTURE, SETTINGS_TABLE, STORE } from './constants.mjs'
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
export async function turn(host, sessionId, script = [], text, timeoutMs) {
  // timeoutMs: a turn that installs a package (pnpm) may need longer than the worker's default 20 s.
  const r = timeoutMs ? await host.call('drive', { sessionId, script, timeoutMs, ...(text ? { text } : {}) }, timeoutMs + 10000) : await host.call('drive', { sessionId, script, ...(text ? { text } : {}) })
  if (!r.idle) throw new Error('turn did not finish for ' + sessionId)
  return r
}

/** Call one tool from a live session through the fake model; returns the single tool result and the turn record. */
export async function callTool(host, sessionId, tool, args, timeoutMs) {
  const r = await turn(host, sessionId, callScript(tool, args), undefined, timeoutMs)
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
export async function fishballTool(host, sessionId, tool, args, outcome = OUTCOME.reject, timeoutMs) {
  // outcome may be one answer, or a list answered in order (later questions get the last one).
  const answers = [].concat(outcome)
  await host.call('setApprover', { outcome: answers.at(-1), queue: answers.slice(0, -1) })
  const before = (await host.call('approvals', { sessionId })).length
  try {
    const { result, asked, requests } = await callTool(host, sessionId, tool, args, timeoutMs)
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

// ---- Plugin statuses helpers ----

/** Turns that install or remove a package run pnpm; they get this budget. */
export const INSTALL_MS = 90000
export const LONG_T = { timeout: 150000 }

/** The status a catalog entry must report, from its kind and its desired on/off state (decision table). */
export function expectedStatus(p) {
  if (p.kind === KIND.builtin) return PLUGIN_STATUS.builtin
  if (p.kind === KIND.installed) return PLUGIN_STATUS.installed
  return p.on ? PLUGIN_STATUS.dshEnabled : PLUGIN_STATUS.dshDisabled
}
/** The actions a catalog entry must offer, in order: none while removing; uninstall only for Fishball-installed plugins. */
export function expectedActions(p) {
  if (p.removing) return []
  const toggle = p.on ? ACTION.disable : ACTION.enable
  return p.kind === KIND.installed ? [toggle, ACTION.uninstall] : [toggle]
}
/** Assert that one entry's status, actions and removing follow the requirement's table. */
export function assertEntryContract(assert, p) {
  assert.equal(typeof p.removing, 'boolean', p.plugin + ' removing')
  assert.equal(p.status, expectedStatus(p), p.plugin + ' status for kind ' + p.kind + ', on ' + p.on)
  assert.deepEqual(p.actions, expectedActions(p), p.plugin + ' actions')
}

/** Fishball's own package folder: its package.json dependencies ({} when absent). */
export function fishballDeps(home) {
  try { return JSON.parse(fs.readFileSync(path.join(FISHBALL_PLUGINS_DIR(home), 'package.json'), 'utf8')).dependencies ?? {} } catch { return {} }
}
/** Whether a package is installed in Fishball's folder (node_modules entry or dependency). */
export const inFishballFolder = (home, name) => fs.existsSync(path.join(FISHBALL_PLUGINS_DIR(home), 'node_modules', name)) || Object.hasOwn(fishballDeps(home), name)
/** Whether a package is installed in the DSH profile (node_modules entry or dependency). */
export function inProfile(home, name) {
  const dir = path.join(home, 'profiles', PROFILE)
  const deps = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).dependencies ?? {}
  return Object.hasOwn(deps, name) || fs.existsSync(path.join(dir, 'node_modules', name))
}
/** The DSH profile's own files, including its lockfile when there is one: a Fishball install must leave them byte-identical. */
export function profileSnapshot(home) {
  const lock = path.join(home, 'profiles', PROFILE, 'pnpm-lock.yaml')
  return { ...profileFiles(home), lock: fs.existsSync(lock) ? fs.readFileSync(lock, 'utf8') : null }
}
/** add_plugin with every prompt answered `outcome`. */
export const addPlugin = (host, fb, spec, outcome, reason = 'fbtest add') => fishballTool(host, fb, 'add_plugin', { spec, reason }, outcome, INSTALL_MS)
/** remove_plugin with every prompt answered `outcome`. */
export const removePlugin = (host, fb, plugin, outcome, reason = 'fbtest remove') => fishballTool(host, fb, 'remove_plugin', { plugin, reason }, outcome, INSTALL_MS)
/** The catalog from GET state once every change applied. */
export async function catalogSettled(host) { await settle(host); return (await host.state()).catalog }
/** Wait until GET state's catalog satisfies pred(catalog); returns the catalog that did, or false. */
export const untilCatalog = (host, pred, timeoutMs = 15000) => until(async () => { const c = (await host.state())?.catalog; return c && pred(c) ? c : false }, timeoutMs, 100)
/** Hold Fishball inside a turn: its next model request waits until releaseHold. */
export async function holdFishball(host, fb) {
  await settledIdle(host, fb)
  await host.call('holdNext', { sessionId: fb })
  await host.call('driveStart', { sessionId: fb, text: 'held turn' })
  if (!(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 50))) throw new Error('precondition: Fishball is held in a turn')
}
/** plugin_changes rows of the store. */
export const auditRows = (home) => Object.values(JSON.parse(fs.readFileSync(path.join(home, 'storages', 'fishball.json'), 'utf8')).tables?.plugin_changes ?? {})

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

// ---- P5 helpers (messaging, intake, outbox) ----

/** Wait until a session's live agent has been idle for two polls in a row (no turn running or starting). */
export async function settledIdle(host, sessionId, timeoutMs = 20000) {
  let idleSeen = 0
  return Boolean(await until(async () => {
    idleSeen = (await host.call('agentStatus', { sessionId })) === 'idle' ? idleSeen + 1 : 0
    return idleSeen >= 3
  }, timeoutMs, 150))
}

/** Fishball's user/message events whose text contains needle. */
export async function fishballMessages(host, fb, needle) {
  const events = (await host.call('inspect', { sessionId: fb, events: true })).events ?? []
  return events.filter((e) => e.type === 'user/message' && e.text.includes(needle))
}

/** Fishball's model requests whose message text contains needle. */
export const requestsWith = async (host, sessionId, needle) => (await host.call('requests', { sessionId })).filter((r) => r.texts.includes(needle))

/** Wait until one of Fishball's model requests contains needle, then until Fishball is idle again. */
export async function untilSeen(host, fb, needle, timeoutMs = 15000) {
  const seen = await until(async () => (await requestsWith(host, fb, needle)).length > 0, timeoutMs, 100)
  await settledIdle(host, fb)
  return Boolean(seen)
}

/** One message_fishball call from a session; returns the parsed answer and the raw result. */
export async function messageFishball(host, sessionId, args, callId) {
  const r = await turn(host, sessionId, callScript('message_fishball', args, callId))
  if (r.results.length !== 1) throw new Error('expected one message_fishball result, got ' + JSON.stringify(r.results))
  return { json: jsonOf(r.results[0]), result: r.results[0], requests: r.requests }
}

/** One of Fishball's own tools called in a Fishball turn (waits for Fishball to be idle first). */
export async function fishballCall(host, fb, tool, args) {
  await settledIdle(host, fb)
  const { result, requests } = await callTool(host, fb, tool, args)
  return { json: jsonOf(result), result, requests }
}

/**
 * P5 framing (review update): a trusted header, then one block <untrusted-ID> ... </untrusted-ID>
 * whose lines are `key: <JSON value>`. Returns the parts, or null when the text has no block.
 */
export function untrustedBlock(text) {
  const open = /<untrusted-([^>\s]+)>/.exec(text)
  if (!open) return null
  const id = open[1]
  const close = '</untrusted-' + id + '>'
  const end = text.indexOf(close)
  if (end < 0) return { id, header: text.slice(0, open.index), fields: {}, closes: 0, inner: null }
  const inner = text.slice(open.index + open[0].length, end)
  const fields = {}
  const raw = {}
  for (const line of inner.split('\n')) {
    const m = /^([a-z_]+): (.*)$/.exec(line)
    if (!m) continue
    raw[m[1]] = (raw[m[1]] ?? 0) + 1
    try { fields[m[1]] = JSON.parse(m[2]) } catch { fields[m[1]] = { unparsed: m[2] } }
  }
  return { id, header: text.slice(0, open.index), inner, fields, counts: raw, closes: text.split(close).length - 1, opens: text.split(open[0]).length - 1, after: text.slice(end + close.length) }
}

export const intakeNow = async (host) => (await host.state()).intake
export const outboxNow = async (host) => (await host.state()).outbox.entries
/** A string of exactly n UTF-8 bytes made of 2-byte characters (n even), or ASCII when ascii is set. */
export const bytesOf = (n, ascii = false) => (ascii ? 'b'.repeat(n) : 'é'.repeat(n / 2))

/** The served client combo script that carries dsh-fishball/client.js, read like a browser (M5). */
export async function fishballClientBundle(host) {
  const index = await host.get('/')
  // Bootstrap batches load with <script src>, application batches are preloaded with <link href>.
  const urls = [...index.text.matchAll(/(?:src|href)="([^"]*dsh-fishball\/client\.js[^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'))
  if (urls.length === 0) return { found: false, status: index.status }
  const res = await host.get('/' + urls[0])
  return { found: true, status: res.status, text: res.text }
}

// ---- P6 helpers (watches) ----

export const watchesNow = async (host) => (await host.state()).watches
export const watchById = async (host, id) => (await watchesNow(host))?.watches.find((w) => w.id === id)
export const watchesOn = async (host, sessionId) => ((await watchesNow(host))?.watches ?? []).filter((w) => w.targetSessionId === sessionId)

/** Fishball's watch notices: fishball-notice user messages that name the watch id. */
export async function watchNotices(host, fb, watchId) {
  const events = (await host.call('inspect', { sessionId: fb, events: true })).events ?? []
  return events.filter((e) => e.type === 'user/message' && e.source?.kind === 'fishball-notice' && e.text.includes(watchId))
}

/** Wait until at least n notices for the watch exist, then until Fishball and the count are quiet; returns the notices. */
export async function noticesSettled(host, fb, watchId, n, { timeoutMs = 12000, quietMs = 1500 } = {}) {
  if (n > 0) await until(async () => (await watchNotices(host, fb, watchId)).length >= n, timeoutMs, 150)
  await new Promise((resolve) => setTimeout(resolve, quietMs))
  await settledIdle(host, fb)
  return watchNotices(host, fb, watchId)
}

// ---- P7 helpers (ApprovalBroker) ----

/** Fishball's permission-request messages (fishball-notice user messages starting '[permission request') containing needle. */
export async function requestMessages(host, fb, needle = '') {
  const events = (await host.call('inspect', { sessionId: fb, events: true })).events ?? []
  return events.filter((e) => e.type === 'user/message' && e.source?.kind === 'fishball-notice' && e.text.startsWith('[permission request') && e.text.includes(needle))
}
/** Wait for the one request message containing needle; returns it with its id and parsed block (or undefined). */
export async function waitRequest(host, fb, needle, timeoutMs = 10000) {
  await until(async () => (await requestMessages(host, fb, needle)).length > 0, timeoutMs, 50)
  const m = (await requestMessages(host, fb, needle)).at(-1)
  if (!m) return undefined
  return { ...m, id: /^\[permission request (apr_[0-9a-f]+)\]/.exec(m.text)?.[1], block: untrustedBlock(m.text) }
}
/** Start a turn in session sid whose model calls the asking tool once with args (does not wait). */
export const startAsk = (host, sid, tool, args, text = 'fbtest ask turn', source) => host.call('driveStart', { sessionId: sid, text, script: callScript(tool, args), ...(source ? { source } : {}) })
/** Wait until the asking tool's call with this text has an outcome; returns its record. */
export async function askSettled(host, text, timeoutMs = 15000) {
  await until(async () => (await host.call('asks', {})).find((a) => a.text === text && a.outcome !== null), timeoutMs, 50)
  return (await host.call('asks', {})).find((a) => a.text === text)
}
/** The parsed result of Fishball's tool call with this call id (a planned answer_approval), or undefined. */
export async function resultOfCall(host, fb, callId, timeoutMs = 10000) {
  const find = async () => ((await host.call('inspect', { sessionId: fb, events: true })).events ?? []).find((e) => e.type === 'tool/result' && e.result.callId === callId)
  await until(find, timeoutMs, 50)
  const e = await find()
  return e ? { json: jsonOf(e.result), isError: e.result.isError, text: e.result.text } : undefined
}
export const approvalsNow = async (host) => (await host.state()).approvals
/** UTF-8 byte length. */
export const bytes = (s) => Buffer.byteLength(String(s), 'utf8')

// ---- P8 helpers (ctx.fishball sources) ----

export const sourcesNow = async (host) => (await host.state()).sources
export const sourceIn = async (host, identity) => (await sourcesNow(host))?.sources?.find((s) => s.identity === identity)
/** Fishball's plugin-event notices (fishball-notice user messages) containing needle. */
export async function pluginNotices(host, fb, needle) {
  const events = (await host.call('inspect', { sessionId: fb, events: true })).events ?? []
  return events.filter((e) => e.type === 'user/message' && e.source?.kind === 'fishball-notice' && e.text.includes(needle))
}
/** Register a source as a fixture row; throws when the precondition (a captured context) is missing. */
export async function register(host, label, def, key) {
  const r = await host.call('sourceRegister', { label, def, ...(key ? { key } : {}) })
  if (r.error?.code === 'FBTEST_NO_CONTEXT') throw new Error('precondition: ' + r.error.message)
  return r
}
/** publish on a kept source: {ok, value} or {ok:false, error:{code}}. */
export const publish = (host, key, event) => host.call('sourcePublish', { key, event })

export const T = { timeout: 55000 }
export const HOOK = { timeout: 60000 }

// ---- P11 helpers (authors, R4) ----

/**
 * The author R4 expects for an input from session sessionId: that session's title as DSH reports it
 * (name absent when the title is empty) and the session id as seed. Callers use it where the title has
 * not changed since the message arrived and is within the 200-byte bound (the fake model's title).
 */
export async function sessionAuthor(host, kind, sessionId) {
  const title = await host.call('sessionTitle', { sessionId })
  return { kind, ...(title ? { name: title } : {}), seed: sessionId }
}
/** R4: a plugin source's author: its registered title and its identity. */
export const pluginAuthor = (title, identity) => ({ kind: AUTHOR_KIND.plugin, name: title, seed: identity })

// ---- P12 helpers (plugin manager, DESIGN §10d) ----

/** DSH's Schemastery, the instance plugins and the Host use (the browser rebuilds schemas with it). */
export const Schema = await (async () => { const m = await import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai', 'schemastery', 'lib', 'index.mjs')).href); return m.default ?? m })()

/** The `dsh` value a catalog entry must report for its kind (decision table). */
/** Revision 10c: the five entries of the Fishball group are built-ins whose dsh is 'fishball'. */
export const expectedDsh = (p) => (FISHBALL_GROUP_KEYS.includes(p.plugin) ? DSH_STATE.fishball : ({ [KIND.profile]: DSH_STATE.on, [KIND.only]: DSH_STATE.off, [KIND.builtin]: DSH_STATE.builtin, [KIND.installed]: DSH_STATE.none })[p.kind])
/** The `runs` value from the desired on/off states: a profile plugin runs in DSH whatever Fishball chose. */
export function expectedRuns(p) {
  if (p.kind === KIND.profile) return p.on ? RUNS.everywhere : RUNS.dsh
  return p.on ? RUNS.fishball : RUNS.nowhere
}

const pluginQuery = (key) => '?plugin=' + encodeURIComponent(key)
export const getDetail = (host, key) => host.get(MANAGER_API.detail + pluginQuery(key))
export const getIcon = (host, key) => host.get(MANAGER_API.icon + pluginQuery(key))
/** The detail of one plugin; throws when the route does not answer 200 {ok:true}. */
export async function detailOf(host, key) {
  const r = await getDetail(host, key)
  if (r.status !== 200 || r.json?.ok !== true) throw new Error('detail of ' + key + ' answered ' + r.status + ': ' + r.text.slice(0, 500))
  return r.json.detail
}
export const rowIn = (detail, row) => detail?.rows?.find((r) => r.row === row)
/** Your stored values for one row as the detail route reports them ({} when none). */
export const userOf = async (host, key, row) => rowIn(await detailOf(host, key), row)?.user ?? {}
export const valueOf = async (host, key, row) => rowIn(await detailOf(host, key), row)?.value
export const saveSettings = (host, body, opts) => host.post(MANAGER_API.settings, body, opts)
/** A secret path as a dotted string, whether it came as an array of segments or a string. */
export const pathText = (p) => (Array.isArray(p) ? p.join('.') : String(p))

/** The stored plugin_settings records (domain fishball, §9); {} when the table is missing. */
export function storedSettings(home) {
  try { return JSON.parse(fs.readFileSync(STORE.file(home), 'utf8')).tables?.[SETTINGS_TABLE] ?? {} } catch { return {} }
}
/** The stored record whose rows hold this row id (row ids are unique across the fixtures), or undefined. */
export const storedRecord = (home, rowId) => Object.values(storedSettings(home)).find((r) => r?.rows && Object.hasOwn(r.rows, rowId))

/** Assert a text carries neither fixture secret (the patch's nor the one the user set). */
export function assertNoSecret(assert, text, label) {
  for (const secret of [SETTINGS_FIXTURE.patchSecret, SETTINGS_FIXTURE.nestedSecret, SETTINGS_FIXTURE.listSecret, SETTINGS_FIXTURE.errorSecret, SETTINGS_FIXTURE.userSecret]) assert.equal(String(text ?? '').includes(secret), false, label + ' carries a secret value')
}

/** A fixture config as the plugin received it, with the patch's three secrets taken out (compare with SETTINGS_FIXTURE.base). */
export function withoutSecrets(config) {
  const { token, auth, accounts, ...rest } = config ?? {}
  return { ...rest, auth: { user: auth?.user }, accounts: (accounts ?? []).map(({ secret, ...a }) => a) }
}
/** Assert a schema error message left the Host cut: nothing from " but got " on, and no secret. */
export function assertCutError(assert, message, label) {
  assert.equal(typeof message, 'string', label + ' error is a message')
  assert.ok(message.length > 0, label + ' error is not empty')
  assert.equal(message.includes(SETTINGS_FIXTURE.errorCut.trim()), false, label + ' error repeats the rejected data: ' + message)
  assertNoSecret(assert, message, label + ' error')
}

/** Settings audit rows (action 'settings') of one plugin. */
export const settingsAudit = (home, plugin) => auditRows(home).filter((r) => r.plugin === plugin && r.action === SETTINGS_ACTION)

/** apply events of one settings-fixture row mounted in Fishball's private tree. */
export const privateApplies = async (host, plugin, row) => (await host.call('settingsEvents', { plugin, row })).filter((e) => e.type === 'apply' && String(e.entryId ?? '').startsWith(PRIVATE_ROW_PREFIX))
/** Wait until a private-tree apply after the first `skip` ones satisfies pred(config); returns it or undefined. */
export async function untilApply(host, plugin, row, skip, pred, timeoutMs = 10000) {
  let found
  await until(async () => { found = (await privateApplies(host, plugin, row)).slice(skip).find((e) => pred(e.config)); return found }, timeoutMs, 100)
  return found
}

/** The line of a set_plugin_settings prompt that lists one field as `path: old → new`, split into its parts. */
export function promptLine(reason, fieldPath) {
  const line = String(reason ?? '').split('\n').find((l) => l.includes(fieldPath + ': ') && l.includes(PROMPT_ARROW))
  if (!line) return undefined
  const start = line.indexOf(fieldPath + ': ') + fieldPath.length + 2
  const arrow = line.indexOf(PROMPT_ARROW, start)
  return { line, old: line.slice(start, arrow).trim(), new: line.slice(arrow + PROMPT_ARROW.length).trim() }
}

/** Let `ms` pass (a negative check: something must NOT happen in that time). */
export const quiet = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
