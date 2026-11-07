/**
 * The persona rule "keep Chinese punctuation outside bold text" (DESIGN §7 "Bold text and Chinese punctuation", §16 Q-bold-punct).
 *
 * Requirements: R-B1 one rule line, the persona's last line, with the example; R-B2 nothing else in the persona changed
 * (compared with the live branch); R-B3 the rule reaches the model (the mounted row, and Fishball's system prompt but not
 * an ordinary session's). The rendering evidence (R-B4) is in persona-bold-render.test.mjs.
 *
 * | id     | technique               | requirement                                              | expected |
 * |--------|-------------------------|----------------------------------------------------------|----------|
 * | PBD-01 | EP                      | exactly one rule line                                    | one line has both forms of the example; neither form is anywhere else |
 * | PBD-02 | BVA (last line)         | the rule line is the last line                           | its index is the last; not empty; no trailing line break; no carriage return |
 * | PBD-03 | EP (wording)            | the line says bold / Chinese punctuation / outside / **  | all four found |
 * | PBD-04 | DT (order x lead-in)    | "write <good>, not <bad>"                                | good before bad; "write" before good; "not" before bad |
 * | PBD-10 | BVA (count)             | one added line, no more                                  | line count = baseline + 1 (or equal when the baseline already has the rule) |
 * | PBD-11 | EP (every old line)     | earlier lines unchanged, same order                      | line i equals the baseline's line i for every baseline line |
 * | PBD-12 | BVA (first / last old)  | the old edges                                            | line 0 and the last old line unchanged; the rule line follows the last old line at once |
 * | PBD-13 | BVA (blank lines)       | no line break added or lost                              | blank lines at the same indices; same blank count; the rule line is not blank |
 * | PBD-14 | EP (exact text)         | the only difference is the added line                    | persona = baseline + line break + rule line |
 * | PBD-15 | EP (other exports)      | nothing else in the module changed                       | same export names; PERSONA_ROW equal except the prefix; HIDDEN_PROMPT_ENTRIES equal |
 * | PBD-20 | EP (mounted row)        | the row Fishball mounts carries the rule                 | PERSONA_ROW is the dsh-persona row; its prefix is the persona and ends with the rule line |
 * | PBD-21 | DT (session x rule)     | the system prompt carries it only for Fishball           | rule line once in each of Fishball's setup, driven and post-restart requests; in neither ordinary session's |
 * | PBD-22 | EP (prompt shape)       | the persona sits in Fishball's prompt as one block       | the whole persona occurs once in the system prompt (DSH adds a one-line preamble before it, see CASES.md PBD ambiguities); the rule line is where it ends |
 * | PBD-23 | EP (ordinary)           | nothing of the rule in an ordinary prompt                | no rule line, no example, none of the rule's words in either ordinary session |
 * | PBD-24 | ST (restart)            | the rule survives a restart                              | the resumed Fishball session's next request carries it |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { NEEDS_INSTANCE_STUB, PERSONA_BOLD, PRESET, STATUS } from './support/constants.mjs'
import { HOOK, T, turn } from './support/expect.mjs'
import { bootHost, bootLive, newHome } from './support/host.mjs'
import { baselineAvailable, countIn, isRuleLine, loadBaseline, loadCurrent, personaLines, textBefore } from './support/persona-bold.mjs'

const BASELINE_MISSING = baselineAvailable() ? false : 'the baseline ref ' + PERSONA_BOLD.baseline.ref + ' is not in this clone'
/**
 * R-B2 compared the persona with the rebuild/assistant baseline ("nothing else changed"). The slim rounds
 * have since changed the persona on purpose (N5 notify_when_finished, N6/N7 question wording, N9-a answer
 * places), so the comparison is retired; R-B1 still pins the rule line itself.
 */
const BASELINE_RETIRED = 'the persona changed on purpose after the baseline (slim N5, N6, N7, N9-a)'

describe('persona rule: Chinese punctuation outside bold text (static)', () => {
  let persona
  let lines
  let ruleIndex
  let ruleLine

  before(async () => {
    persona = (await loadCurrent()).PERSONA_ROLE
    lines = personaLines(persona)
    ruleIndex = lines.findIndex(isRuleLine)
    ruleLine = lines[ruleIndex]
  })

  describe('R-B1 the rule line', () => {
    it('PBD-01 exactly one line carries the rule, and neither form of the example appears anywhere else', T, () => {
      assert.equal(lines.filter(isRuleLine).length, 1, 'lines with both forms of the example')
      assert.equal(countIn(persona, PERSONA_BOLD.good), 1, 'the form to write')
      assert.equal(countIn(persona, PERSONA_BOLD.bad), 1, 'the form not to write')
      assert.ok(ruleIndex >= 0)
    })

    it('PBD-02 the rule line is the persona\'s last line, not empty, with no trailing line break', T, () => {
      assert.equal(ruleIndex, lines.length - 1, 'rule line index vs last index')
      assert.notEqual(ruleLine.trim(), '')
      assert.equal(persona.endsWith(PERSONA_BOLD.lineBreak), false, 'a trailing line break would add an empty last line')
      assert.equal(persona.includes(PERSONA_BOLD.carriageReturn), false)
    })

    it('PBD-03 the line says it is about bold text, Chinese punctuation, outside the ** markers', T, () => {
      for (const term of PERSONA_BOLD.terms) assert.ok(ruleLine.toLowerCase().includes(term.toLowerCase()), 'missing "' + term + '" in: ' + ruleLine)
      assert.ok(ruleLine.includes(PERSONA_BOLD.marker), 'the marker is named')
    })

    it('PBD-04 the example reads "write <form to write>, not <form not to write>"', T, () => {
      const good = ruleLine.indexOf(PERSONA_BOLD.good)
      const bad = ruleLine.indexOf(PERSONA_BOLD.bad)
      assert.ok(good < bad, 'the form to write comes first')
      assert.match(textBefore(ruleLine, PERSONA_BOLD.good), PERSONA_BOLD.before.good)
      assert.match(textBefore(ruleLine, PERSONA_BOLD.bad), PERSONA_BOLD.before.bad)
    })
  })

  describe('R-B2 nothing else changed', { skip: BASELINE_RETIRED || BASELINE_MISSING }, () => {
    let baseModule
    let currentModule
    let baseLines
    let baseHasRule

    before(async () => {
      currentModule = await loadCurrent()
      baseModule = await loadBaseline()
      baseLines = personaLines(baseModule.PERSONA_ROLE)
      // Once the live branch has taken the rule in, "the added line" is already part of the baseline.
      baseHasRule = baseLines.some(isRuleLine)
      assert.ok(baseLines.length > 1, 'precondition: the baseline persona has several lines')
    })

    const added = () => (baseHasRule ? 0 : 1)

    it('PBD-10 exactly one line was added', T, () => {
      assert.equal(lines.length, baseLines.length + added())
    })

    it('PBD-11 every earlier line is still there, unchanged and in the same order', T, () => {
      baseLines.forEach((line, i) => assert.equal(lines[i], line, 'line ' + i + ' changed'))
    })

    it('PBD-12 the first and last old lines are unchanged and the rule line follows the last old line at once', T, () => {
      assert.equal(lines[0], baseLines[0])
      assert.equal(lines[baseLines.length - 1], baseLines.at(-1))
      assert.equal(lines[baseLines.length - (baseHasRule ? 1 : 0)], ruleLine)
    })

    it('PBD-13 no blank line was added or removed', T, () => {
      const blanks = (all) => all.flatMap((line, i) => (line === '' ? [i] : []))
      assert.deepEqual(blanks(lines), blanks(baseLines))
      assert.notEqual(ruleLine, '')
    })

    it('PBD-14 the persona is the baseline plus a line break and the rule line, and nothing more', T, () => {
      const base = baseModule.PERSONA_ROLE
      assert.equal(currentModule.PERSONA_ROLE, baseHasRule ? base : base + PERSONA_BOLD.lineBreak + ruleLine)
    })

    it('PBD-15 the module exports the same names, the same row but for the prefix, and the same hidden entries', T, () => {
      assert.deepEqual(Object.keys(currentModule).sort(), Object.keys(baseModule).sort())
      assert.deepEqual(Object.keys(currentModule).sort(), PERSONA_BOLD.exports)
      const withoutPrefix = (row) => ({ ...row, config: { ...row.config, prefix: undefined } })
      assert.deepEqual(withoutPrefix(currentModule.PERSONA_ROW), withoutPrefix(baseModule.PERSONA_ROW))
      assert.deepEqual(currentModule.HIDDEN_PROMPT_ENTRIES, baseModule.HIDDEN_PROMPT_ENTRIES)
    })
  })

  describe('R-B3 the mounted row', () => {
    it('PBD-20 the persona row is the dsh-persona row and its prefix is the persona, ending with the rule line', T, async () => {
      const { PERSONA_ROW } = await loadCurrent()
      assert.equal(PERSONA_ROW.name, PERSONA_BOLD.rowName)
      assert.equal(PERSONA_ROW.config.prefix, persona)
      assert.equal(personaLines(PERSONA_ROW.config.prefix).at(-1), ruleLine)
    })
  })
})

describe('R-B3 the rule reaches the model: the system prompt of a Fishball request, and of an ordinary session', { skip: NEEDS_INSTANCE_STUB }, () => {
  let home
  let host
  let fb
  let ruleLine
  let persona
  /** One system prompt per kind of session. */
  const prompts = {}

  /** The system prompt of one plain turn's last request. */
  const promptOf = async (sessionId) => (await turn(host, sessionId, [[{ text: 'hi' }]])).requests.at(-1).system

  before(async () => {
    persona = (await loadCurrent()).PERSONA_ROLE
    ruleLine = personaLines(persona).find(isRuleLine)
    home = newHome('persona-bold')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    // The first request of the first-creation setup turn (the session went live only after it), then a driven turn.
    prompts.setup = (await host.call('requests', { sessionId: fb }))[0]?.system
    prompts.driven = await promptOf(fb)
    for (const [kind, preset] of [['bare', PRESET.bare], ['standard', PRESET.standard]]) {
      const created = await host.call('ordinary', { preset, folder: kind })
      assert.equal(created.error, null, 'precondition: the ' + kind + ' ordinary session resolves')
      prompts[kind] = await promptOf(created.sessionId)
    }
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('precondition: every prompt was captured', T, () => {
    for (const kind of ['setup', 'driven', 'bare', 'standard']) assert.equal(typeof prompts[kind], 'string', kind)
    assert.ok(ruleLine, 'the persona has its rule line (PBD-01)')
  })

  for (const kind of ['setup', 'driven']) {
    it('PBD-21 ' + PERSONA_BOLD.sessions[kind] + ': the system prompt contains the rule line, once', T, () => {
      assert.equal(countIn(prompts[kind], ruleLine), 1)
      assert.ok(prompts[kind].includes(PERSONA_BOLD.good))
    })
  }

  for (const kind of ['bare', 'standard']) {
    it('PBD-21 ' + PERSONA_BOLD.sessions[kind] + ': the system prompt does not contain the rule line', T, () => {
      assert.equal(prompts[kind].includes(ruleLine), false)
    })
    it('PBD-23 ' + PERSONA_BOLD.sessions[kind] + ': no example and none of the rule\'s words', T, () => {
      for (const needle of [PERSONA_BOLD.good, PERSONA_BOLD.bad, ...PERSONA_BOLD.absentFromOrdinary]) assert.equal(prompts[kind].includes(needle), false, needle)
    })
  }

  it('PBD-22 Fishball\'s system prompt holds the whole persona once, and the rule line is where it ends', T, () => {
    for (const kind of ['setup', 'driven']) {
      assert.equal(countIn(prompts[kind], persona), 1, kind + ': the persona as one block')
      assert.equal(prompts[kind].indexOf(persona) + persona.length, prompts[kind].indexOf(ruleLine) + ruleLine.length, kind + ': the rule line ends the persona')
    }
  })

  it('PBD-24 after a restart the resumed Fishball session\'s request still carries the rule line, once', T, async () => {
    await host.stop()
    host = await bootHost(home)
    const state = await host.waitStatus(STATUS.live)
    assert.equal(state?.sessionId, fb, 'the same session resumed')
    prompts.restarted = await promptOf(fb)
    assert.equal(countIn(prompts.restarted, ruleLine), 1, PERSONA_BOLD.sessions.restarted)
    assert.equal(countIn(prompts.restarted, persona), 1)
  })
})
