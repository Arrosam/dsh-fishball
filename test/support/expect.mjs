/** Small assertion helpers over worker results, shared by the test files. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { PROFILE, ROW_ID, RUNTIME } from './constants.mjs'

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

export const T = { timeout: 55000 }
export const HOOK = { timeout: 60000 }
