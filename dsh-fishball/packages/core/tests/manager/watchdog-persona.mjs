/**
 * WD-PERSONA rows (the user's decision, 2026-11-22; USE-CASES.md "WD-PERSONA"): when a DSH offers
 * Watchdog (the dsh-connector-watchdog amenity's tools), Fishball starts a session it wants
 * supervised with Watchdog's watchdog_session_start instead of the connector's session_start;
 * specify the session's purpose and approvable scope. Watchdog
 * supervises the session from its first request; watchdog_brief only covers what a running session
 * asks after the brief. The tool names come from core's contract (WATCHDOG.tools), the guidance is
 * conditional, and the existing session_start placement and model guidance remains.
 *
 * Black box: PERSONA_ROLE and the contract tables are imported as published; the system row reads
 * the manager's real model request from the suite's scenario. A temporary copy swaps WATCHDOG's
 * contract names to show the persona uses the contract, not literal tool names.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { SHARED_DIR } from '../support/core-world.mjs'
import { CORE_DIR, MCP, PERSONA_BOLD, PERSONA_FIX, PERSONA_WATCHDOG as WD, WATCHDOG, personaLines } from './constants.mjs'

const CHINESE_PUNCT = PERSONA_BOLD.chinesePunct

const COPY = WD.tempCopy
const SWAPPED = WD.swapped

const textOf = (role) => (Array.isArray(role) ? role.join('\n') : String(role))
const sentencesOf = (text) => text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
const linesNaming = (text, word) => personaLines(text).filter((l) => l.includes(word))
const loadPersona = async (file) => textOf((await import(pathToFileURL(file).href))[PERSONA_FIX.export])

/**
 * A throwaway copy of core's own folders under the OS temp folder (removed on exit), filled by `fill`,
 * with `node_modules/fishball-shared` linked to fishball-shared as core resolves it (by name; a
 * package's tests never copy another package's folder), so persona.js's imports resolve; returns the
 * copy's persona.js. persona.js reaches fishball-shared's ui-seam only for its target words.
 */
function coreCopy(fill) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), COPY.tmpPrefix))
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
  fill(dir)
  fs.mkdirSync(path.join(dir, COPY.nodeModules))
  fs.symlinkSync(SHARED_DIR, path.join(dir, COPY.nodeModules, COPY.sharedPackage), 'dir')
  return path.join(dir, COPY.file)
}

/** The working tree's persona with the contract copy's WATCHDOG tool names replaced by SWAPPED. */
async function swappedPersona() {
  return loadPersona(coreCopy((dir) => {
    for (const entry of COPY.copied) fs.cpSync(path.join(CORE_DIR, entry), path.join(dir, entry), { recursive: true, filter: (src) => !src.includes(path.sep + COPY.nodeModules) })
    const file = path.join(dir, WD.contractFile)
    let text = fs.readFileSync(file, 'utf8')
    for (const [key, name] of Object.entries(WATCHDOG.tools)) {
      assert.equal(text.split("'" + name + "'").length - 1, 1, 'harness: the contract copy does not spell ' + name + ' exactly once')
      text = text.replace("'" + name + "'", "'" + SWAPPED[key] + "'")
    }
    fs.writeFileSync(file, text)
  }))
}

/** The guidance on the line containing Watchdog start; wording and sentence order can change. */
const startLine = (text) => {
  const lines = linesNaming(text, WATCHDOG.tools.sessionStart)
  assert.ok(lines.length > 0, 'missing ' + WATCHDOG.tools.sessionStart)
  return lines[0]
}

export function registerWatchdogPersonaCases({ read, name, test }) {
  const persona = async () => loadPersona(PERSONA_FIX.entry)

  // ------------------------------------------------------------------ the contract table
  test(name('WD-PERSONA-EP-01', 'core\'s contract WATCHDOG is frozen and its tools are exactly sessionStart: watchdog_session_start and brief: watchdog_brief'), () => {
    assert.ok(Object.isFrozen(WATCHDOG), 'WATCHDOG is not frozen')
    assert.ok(Object.isFrozen(WATCHDOG.tools), 'WATCHDOG.tools is not frozen')
    assert.deepEqual({ ...WATCHDOG.tools }, { ...WD.tools })
    assert.equal(Object.keys(WATCHDOG.tools).length, Object.keys(WD.tools).length)
  })
  test(name('WD-PERSONA-EP-01b', 'the connector tool it replaces is still MCP.tools.sessionStart: session_start'), () => {
    assert.equal(MCP.tools.sessionStart, WD.connectorStart)
  })

  // ------------------------------------------------------------------ the instruction
  test(name('WD-PERSONA-EP-02', 'when Watchdog is available, use its start for supervised sessions instead of session_start'), async () => {
    const rule = startLine(await persona())
    // watchdog_session_start contains session_start: look for the standalone connector name.
    assert.ok(rule.replaceAll(WATCHDOG.tools.sessionStart, '').includes(MCP.tools.sessionStart), 'missing the connector start alternative')
    assert.match(rule, WD.conditional)
    assert.match(rule, WD.insteadOf)
    assert.match(rule, WD.supervises)
  })
  test(name('WD-PERSONA-EP-03', 'Watchdog start specifies the session purpose and approvable scope'), async () => {
    const rule = startLine(await persona())
    assert.match(rule, WD.purpose)
    assert.match(rule, WD.approvableScope)
  })
  test(name('WD-PERSONA-EP-04', 'Watchdog start supervises from the first request'), async () => {
    const rule = startLine(await persona())
    assert.match(rule, WD.supervises)
    assert.match(rule, WD.firstRequest)
  })
  test(name('WD-PERSONA-EP-05', 'Watchdog brief only covers subsequent requests from a running session'), async () => {
    const found = linesNaming(await persona(), WATCHDOG.tools.brief)
    assert.ok(found.some((rule) => WD.only.test(rule) && WD.afterBrief.test(rule) && WD.running.test(rule)), 'missing the running-session, post-brief limit')
  })
  test(name('WD-PERSONA-EP-06', 'the persona takes both Watchdog tool names from core\'s contract (a contract copy with other names shows those, not the literals)'), async () => {
    const text = await swappedPersona()
    for (const [key, name] of Object.entries(WATCHDOG.tools)) {
      assert.ok(text.includes(SWAPPED[key]), SWAPPED[key] + ' (the swapped WATCHDOG.tools.' + key + ') is not in the persona')
      assert.equal(text.includes(name), false, name + ' is still in the persona: a literal, not WATCHDOG.tools.' + key)
    }
  })

  // ------------------------------------------------------------------ DT: the condition decides the tool
  // | Watchdog offered | start a supervised session with |
  // | yes              | watchdog_session_start          | every line naming a Watchdog tool is under the condition
  // | no               | session_start (as before)       | session_start's own guidance stays unconditional and is never forbidden
  test(name('WD-PERSONA-DT-01', 'Watchdog offered: every persona line naming a Watchdog tool states the condition (a DSH offering Watchdog); none names one unconditionally'), async () => {
    const text = await persona()
    const lines = Object.values(WATCHDOG.tools).flatMap((n) => linesNaming(text, n))
    assert.ok(lines.length >= 1, 'no persona line names a Watchdog tool')
    assert.deepEqual([...new Set(lines)].filter((l) => !WD.conditional.test(l)), [])
  })
  test(name('WD-PERSONA-DT-02', 'Watchdog not offered: session_start guidance stays in lines that do not mention Watchdog, and no line forbids session_start outright'), async () => {
    const text = await persona()
    const plain = linesNaming(text, MCP.tools.sessionStart).filter((l) => !WD.watchdog.test(l) && !l.includes(WATCHDOG.tools.sessionStart))
    assert.ok(plain.length >= 1, 'no session_start guidance outside the Watchdog line')
    const forbids = sentencesOf(text).filter((s) => WD.forbidsStart(MCP.tools.sessionStart, WATCHDOG.tools.sessionStart).test(s))
    assert.deepEqual(forbids, [])
  })

  // ------------------------------------------------------------------ placement and handoff
  test(name('WD-PERSONA-EP-07', 'start in the requested workspace, and report placement errors without starting a replacement'), async () => {
    const text = await persona()
    const lines = personaLines(text)
    const placement = lines.filter((l) => /workspaceId|registered absolute|Ungrouped/i.test(l)).join(' ')
    const error = lines.filter((l) => /workspaceError/.test(l))
    assert.ok(placement.includes(MCP.tools.workspacesList), 'discover the workspace before starting')
    assert.match(placement, /\bworkspaceId\b[^.\n]*\bfolder\b|\bfolder\b[^.\n]*\bworkspaceId\b/i)
    assert.match(placement, /\bregistered\s+absolute\s+(?:directory\s+)?path\b/i)
    assert.match(placement, /\b(?:no|never|not|don['’]t|without)\b[^.]*\bUngrouped\b/i)
    assert.ok(error.some((l) => /\bsession[ _-]?id\b/i.test(l) && /\b(?:no|never|not|don['’]t|without)\b[^.]*\breplacement\b/i.test(l)), 'report workspaceError with the session ID and no replacement')
    assert.ok(lines.some((l) => l.includes(MCP.tools.modelsList) && /\bmodel\b/i.test(l)), 'discover available models')
    assert.ok(lines.some((l) => l.includes(MCP.tools.sessionMessage) && /\b(?:steer|same task|follow[ -]?up)\b/i.test(l)), 'use session_message to steer existing work')
  })


  // ------------------------------------------------------------------ persona style (the bold rule, R-B1/R-B2)
  test(name('WD-PERSONA-EP-08', 'the persona is cleanly delimited without carriage returns or a trailing line break'), async () => {
    const text = await persona()
    assert.equal(text.includes(PERSONA_BOLD.carriageReturn), false)
    assert.equal(text.endsWith(PERSONA_BOLD.lineBreak), false)
  })
  test(name('WD-PERSONA-EP-09', 'style kept: the Watchdog line has balanced bold markers and no Chinese punctuation just inside a closing **'), async () => {
    const line = startLine(await persona())
    assert.equal(line.split(PERSONA_BOLD.marker).length % 2, 1, 'odd number of ** in ' + line)
    assert.deepEqual(CHINESE_PUNCT.filter((p) => line.includes(p + PERSONA_BOLD.marker)), [])
  })

  // ------------------------------------------------------------------ system: what the manager's model reads
  test(name('WD-PERSONA-SYS-01', 'the manager\'s real model request carries the Watchdog instruction line, naming both Watchdog tools and session_start'), async () => {
    const f = await read('managerTurn')
    const system = f.managerTurn.map((r) => r.system).join('\n')
    assert.ok(system.includes(startLine(await persona())), 'the Watchdog line is not in the manager\'s system prompt')
    for (const word of [...Object.values(WATCHDOG.tools), MCP.tools.sessionStart]) assert.ok(system.includes(word), word + ' missing from the manager\'s system prompt')
  })
}