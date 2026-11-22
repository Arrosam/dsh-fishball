/**
 * WD-PERSONA rows (the user's decision, 2026-11-22; USE-CASES.md "WD-PERSONA"): when a DSH offers
 * Watchdog (the dsh-connector-watchdog amenity's tools), Fishball starts a session it wants
 * supervised with Watchdog's watchdog_session_start instead of the connector's session_start; that
 * tool takes the same arguments plus the session's purpose and approvable scope, and Watchdog
 * supervises the session from its first request; watchdog_brief only covers what a running session
 * asks after the brief. The tool names come from core's contract (WATCHDOG.tools), the guidance is
 * conditional, and the existing session_start guidance (placement, models) is unchanged.
 *
 * Black box: PERSONA_ROLE and the contract tables are imported as published; the system row reads
 * the manager's real model request from the suite's scenario. Two rows import persona.js from a
 * temporary export outside the repo: the persona before the change (the parent of the commit that
 * brought WATCHDOG into persona.js), and the working tree with WATCHDOG's names swapped in the
 * contract copy (so the names are shown to come from the contract, not from literals).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { SHARED_DIR } from '../support/core-world.mjs'
import { CORE_DIR, MCP, PERSONA_BOLD, PERSONA_FIX, PERSONA_WATCHDOG as WD, WATCHDOG, isRuleLine, personaLines } from './constants.mjs'

const CHINESE_PUNCT = PERSONA_BOLD.chinesePunct

const B = WD.baseline
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), B.tmpPrefix))
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
  fill(dir)
  fs.mkdirSync(path.join(dir, B.nodeModules))
  fs.symlinkSync(SHARED_DIR, path.join(dir, B.nodeModules, B.sharedPackage), 'dir')
  return path.join(dir, B.file)
}
/** git inside core's folder: pathspecs are relative to it. */
const git = (args) => execFileSync('git', args, { cwd: CORE_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** The commit before WATCHDOG first appeared in persona.js, or null when the clone lacks it. */
function baselineRef() {
  try {
    const first = git(['log', '--reverse', '--format=%H', '-S', B.marker, '--', B.file]).split('\n')[0]
    return first ? git(['rev-parse', '--verify', '--quiet', first + '^']) : null
  } catch { return null }
}
async function baselinePersona(ref) {
  return loadPersona(coreCopy((dir) => {
    const tar = path.join(dir, B.tar)
    // git archive in core's folder: the pathspecs are core-relative, and so are the archived paths.
    execFileSync('git', ['archive', '--output', tar, ref, ...B.copied], { cwd: CORE_DIR })
    execFileSync('tar', ['-x', '-f', tar, '-C', dir])
  }))
}
/** The working tree's persona with the contract copy's WATCHDOG tool names replaced by SWAPPED. */
async function swappedPersona() {
  return loadPersona(coreCopy((dir) => {
    for (const entry of B.copied) fs.cpSync(path.join(CORE_DIR, entry), path.join(dir, entry), { recursive: true, filter: (src) => !src.includes(path.sep + B.nodeModules) })
    const file = path.join(dir, WD.contractFile)
    let text = fs.readFileSync(file, 'utf8')
    for (const [key, name] of Object.entries(WATCHDOG.tools)) {
      assert.equal(text.split("'" + name + "'").length - 1, 1, 'harness: the contract copy does not spell ' + name + ' exactly once')
      text = text.replace("'" + name + "'", "'" + SWAPPED[key] + "'")
    }
    fs.writeFileSync(file, text)
  }))
}

/** The one persona sentence telling Fishball to start with watchdog_session_start. */
function startSentence(text) {
  const found = sentencesOf(text).filter((s) => s.includes(WATCHDOG.tools.sessionStart))
  assert.equal(found.length, 1, 'sentences naming ' + WATCHDOG.tools.sessionStart + ': ' + JSON.stringify(found))
  return found[0]
}
/** The persona line (bullet) holding the start sentence: the instruction with its explanation. */
const startLine = (text) => {
  const lines = linesNaming(text, WATCHDOG.tools.sessionStart)
  assert.equal(lines.length, 1, 'lines naming ' + WATCHDOG.tools.sessionStart + ': ' + JSON.stringify(lines))
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

  // ------------------------------------------------------------------ the instruction (EP: what the one sentence must hold)
  test(name('WD-PERSONA-EP-02', 'the persona names WATCHDOG.tools.sessionStart instead of MCP.tools.sessionStart in one sentence conditional on a DSH offering Watchdog'), async () => {
    const s = startSentence(await persona())
    // watchdog_session_start contains session_start, so the connector's tool is looked for with the Watchdog name blanked out.
    const rest = s.replaceAll(WATCHDOG.tools.sessionStart, ' '.repeat(WATCHDOG.tools.sessionStart.length))
    assert.ok(rest.includes(MCP.tools.sessionStart), MCP.tools.sessionStart + ' not named beside it: ' + s)
    assert.match(s, WD.conditional, 'not conditional on a DSH offering Watchdog: ' + s)
    assert.match(s, WD.insteadOf, 'not said to replace ' + MCP.tools.sessionStart + ': ' + s)
    assert.ok(s.indexOf(WATCHDOG.tools.sessionStart) < rest.indexOf(MCP.tools.sessionStart), 'the replaced tool is named before the one to use: ' + s)
  })
  test(name('WD-PERSONA-EP-03', 'the instruction says watchdog_session_start takes the same arguments plus the session\'s purpose and approvable scope'), async () => {
    const line = startLine(await persona())
    const missing = Object.entries({ sameArguments: WD.sameArguments, purpose: WD.purpose, approvableScope: WD.approvableScope }).filter(([, re]) => !re.test(line)).map(([k]) => k)
    assert.deepEqual(missing, [], line)
  })
  test(name('WD-PERSONA-EP-04', 'the instruction says Watchdog supervises the session from its first request'), async () => {
    const line = startLine(await persona())
    assert.match(line, WD.supervises, line)
    assert.match(line, WD.firstRequest, line)
    assert.match(line, WD.watchdog, line)
  })
  test(name('WD-PERSONA-EP-05', 'the persona names WATCHDOG.tools.brief with its limit: it only covers what a running session asks after the brief'), async () => {
    const found = sentencesOf(await persona()).filter((s) => s.includes(WATCHDOG.tools.brief))
    assert.ok(found.length >= 1, WATCHDOG.tools.brief + ' is not named')
    const said = found.filter((s) => WD.only.test(s) && WD.afterBrief.test(s) && WD.running.test(s))
    assert.ok(said.length >= 1, 'no sentence gives ' + WATCHDOG.tools.brief + '\'s post-brief limit: ' + JSON.stringify(found))
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

  // ------------------------------------------------------------------ unchanged session_start guidance
  test(name('WD-PERSONA-EP-07', 'the session_start placement and model guidance is still there: workspaceId from workspaces_list as folder, model from models_list, verified ID or absolute path, workspaceError'), async () => {
    const text = await persona()
    const lines = linesNaming(text, MCP.tools.sessionStart).filter((l) => !l.includes(WATCHDOG.tools.sessionStart))
    const has = (re) => lines.some((l) => re.test(l))
    const want = {
      folder: new RegExp(`workspaceId from ${MCP.tools.workspacesList} as its folder`),
      model: new RegExp(`model string from ${MCP.tools.modelsList} as its model`),
      verifiedId: /verified ID or its registered absolute directory path/,
      workspaceError: /workspaceError/,
      handOver: new RegExp(`Hand it over with ${MCP.tools.sessionMessage} or ${MCP.tools.sessionStart}`),
    }
    assert.deepEqual(Object.entries(want).filter(([, re]) => !has(re)).map(([k]) => k), [])
  })
  const ref = baselineRef()
  test(name('WD-PERSONA-ST-01', 'before → after the change: every line of the earlier persona is still there in the same order, and the only new line is the Watchdog one'), ref ? {} : { skip: WD.skipNoBaseline }, async () => {
    const before = personaLines(await baselinePersona(ref))
    const now = personaLines(await persona())
    assert.equal(before.some((l) => l.includes(WATCHDOG.tools.sessionStart)), false, 'harness: the baseline already has the Watchdog line')
    const added = now.filter((l) => !before.includes(l))
    assert.deepEqual(added, [startLine(now.join(PERSONA_BOLD.lineBreak))], 'lines added besides the Watchdog one')
    assert.deepEqual(now.filter((l) => before.includes(l)), before, 'an earlier line was changed, removed or moved')
  })

  // ------------------------------------------------------------------ persona style (the bold rule, R-B1/R-B2)
  test(name('WD-PERSONA-EP-08', 'style kept: exactly one bold rule line and it is still the last line; no carriage return, no trailing line break'), async () => {
    const text = await persona()
    const lines = personaLines(text)
    assert.equal(lines.filter(isRuleLine).length, 1)
    assert.ok(isRuleLine(lines.at(-1)), 'the last line is ' + JSON.stringify(lines.at(-1)))
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