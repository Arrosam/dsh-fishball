/**
 * MSG-USER (USE-CASES.md): Fishball's manager-only `message_user` tool (spec items 1–3) and its persona
 * (item 4), on the current DSH. Black box: the tool table, the guard contract and PERSONA_ROLE are
 * imported as published; the rest runs core as an installed bundle in a real standalone DSH
 * (../support/core-world.mjs over fishball-test-helpers dsh-world). The Fishball page's message rows
 * and hidden replies (items 5–7: MSG-PAGE, MSG-PAGING, MSG-STREAM) draw fishball-ui's fishball-page in
 * Chromium: integration rows (they need fishball-ui installed beside core).
 *
 * One scenario collects the facts in order; each case reads them. A failing step is kept as the
 * scenario's error and every case that needs a later fact reports it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { caseTest } from 'fishball-test-helpers/cases'
import { scenario } from 'fishball-test-helpers/dsh-world'
import { CORE_EXTENSION, CORE_WORLD, NATIVE_MANAGER, coreEnv, corePackages, post } from '../support/core-world.mjs'
import { HOME_LABEL, MODEL_PATH, PERSONA, RESULT_ROWS, ROUTABLE, SYS, TOOL } from './constants.mjs'

const show = (v) => JSON.stringify(v)
const call = (n, args) => ({ tool: TOOL.name, args, id: TOOL.callPrefix + n })
const parse = (text) => { try { return JSON.parse(text) } catch { return undefined } }
const SESSION_ROUTE = '/api/fishball/session'

export function registerMessageUserCases() {
  const facts = scenario(HOME_LABEL, [
    async (boot, f) => {
      const h = await boot()
      const id = (await post(h, SESSION_ROUTE)).json?.sessionId
      if (typeof id !== 'string') throw new Error('no manager session')
      f.manager = id
      await h.call('mutate', { ns: CORE_WORLD.core, ops: [{ op: 'set', path: [...MODEL_PATH], value: ROUTABLE }] })
      // Items 1–2: the result table, one call per turn.
      let n = 0
      f.results = []
      for (const row of RESULT_ROWS) {
        const requests = await h.call('turn', { sessionId: id, scripts: [[call(++n, row.args)]] })
        const result = requests[1]?.last.filter((m) => m.role === 'tool').at(-1) ?? null
        f.results.push({ row: row.row, offered: requests[0]?.tools.includes(TOOL.name) ?? false, result })
      }
      f.spec = await h.call('toolSpec', { sessionId: id, name: TOOL.name })
      const { sessionId } = await h.call('create')
      f.ordinary = { sessionId, requests: await h.call('turn', { sessionId }) }
    },
  ], { packages: corePackages(), extension: CORE_EXTENSION, env: coreEnv({ profileConfig: NATIVE_MANAGER }) })
  const read = async (...keys) => {
    const f = await facts()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const name = (id, text) => ({ id, text })
  const test = (n, fn) => caseTest(n.id, '', n.text, SYS, fn)

  // ------------------------------------------------------------------ item 1: the tool table (unit)
  test(name('MSG-TOOL-EP-01', 'message-tools.js is import-free and exports MESSAGE_TOOL = {send: "message_user"}'), async () => {
    const text = fs.readFileSync(TOOL.module, 'utf8')
    assert.deepEqual(TOOL.importForms.filter((re) => re.test(text)).map(String), [], 'the module imports something')
    const mod = await import(pathToFileURL(TOOL.module).href)
    assert.deepEqual({ ...mod[TOOL.table] }, TOOL.tableValue)
  })
  // ------------------------------------------------------------------ items 1–3: tool scope (system)
  test(name('MSG-TOOL-EP-03', 'the manager is offered message_user: a required string parameter "message", described as Markdown'), async () => {
    const f = await read('results', 'spec')
    assert.ok(f.results.every((r) => r.offered), 'not offered in every manager turn: ' + show(f.results.map((r) => [r.row, r.offered])))
    assert.ok(f.spec, 'no message_user in the manager request')
    const p = f.spec.parameters
    assert.equal(p?.properties?.[TOOL.parameter]?.type, 'string', show(p))
    assert.ok(p.required?.includes(TOOL.parameter), 'message is not required: ' + show(p))
    assert.match(show(f.spec), /markdown/i, 'neither the tool nor its parameter mentions Markdown')
  })
  test(name('MSG-TOOL-EP-04', 'an ordinary new session is not offered message_user (manager only)'), async () => {
    const f = await read('ordinary')
    const tools = f.ordinary.requests[0]?.tools
    assert.ok(tools, 'the ordinary session made no model request')
    assert.equal(tools.includes(TOOL.name), false, tools.join(', '))
  })
  // ------------------------------------------------------------------ item 2: decision table of the model-facing result
  RESULT_ROWS.forEach((row, i) => {
    const want = row.want === 'shown' ? show(TOOL.shown) : row.want === 'empty' ? show(TOOL.empty) : "DSH's argument validation error"
    test(name('MSG-TOOL-DT-01', `${row.row} ${show(row.args)} -> ${want}`), async () => {
      const f = await read('results')
      const got = f.results[i]
      assert.ok(got.result, 'no tool result reached the model: ' + show(got))
      if (row.want === 'refused') {
        assert.equal(got.result.isError, true, 'not an error result: ' + show(got.result))
        assert.equal(parse(got.result.text)?.shown, undefined, 'the tool itself answered: ' + got.result.text)
        return
      }
      assert.notEqual(got.result.isError, true, 'an error result: ' + show(got.result))
      assert.deepEqual(parse(got.result.text), row.want === 'shown' ? TOOL.shown : TOOL.empty, got.result.text)
    })
  })

  // ------------------------------------------------------------------ item 4: the persona (unit)
  const persona = async () => {
    const mod = await import(pathToFileURL(PERSONA.entry).href)
    const role = mod[PERSONA.export]
    assert.equal(typeof role, 'string', PERSONA.export + ' is not a string')
    return role
  }
  const clauses = (text) => text.split(PERSONA.clause).map((s) => s.trim()).filter(Boolean)
  test(name('MSG-PERSONA-EP-01', 'internal replies, reasoning and tool calls stay hidden; every user reply uses message_user'), async () => {
    const list = clauses(await persona())
    const messages = list.filter((s) => s.includes(TOOL.name))
    assert.ok(messages.some((s) => PERSONA.only.test(s) && s.includes(PERSONA.notify)), 'no exclusive rule naming both user-facing tools')
    for (const [subject, rule] of Object.entries(PERSONA.hiddenSubjects)) {
      assert.ok(list.some((s) => rule.test(s) && PERSONA.hidden.test(s)), subject + ' must be hidden')
    }
    for (const [occasion, rule] of Object.entries(PERSONA.throughMessage)) {
      assert.ok(messages.some((s) => rule.test(s)), occasion + ' must use ' + TOOL.name)
    }
  })
  test(name('MSG-PERSONA-EP-04', 'surface items needing attention or action with message_user and notify'), async () => {
    const lines = (await persona()).split('\n')
    assert.ok(lines.some((line) => PERSONA.attention.test(line) && line.includes(PERSONA.notify)), 'no attention/action rule for notices')
  })
  test(name('MSG-PERSONA-EP-05', 'batch or drop routine updates rather than sending each to the user'), async () => {
    const lines = (await persona()).split('\n')
    assert.ok(lines.some((line) => PERSONA.routine.test(line) && PERSONA.batch.test(line) && PERSONA.drop.test(line)), 'no batch-or-drop rule for routine updates')
  })
  test(name('MSG-PERSONA-EP-07', 'no clause tells Fishball to tell the user "in this chat" without message_user'), async () => {
    const list = clauses(await persona())
    assert.deepEqual(list.filter((s) => PERSONA.chatSaying.test(s) && !s.includes(TOOL.name)), [])
  })
}
