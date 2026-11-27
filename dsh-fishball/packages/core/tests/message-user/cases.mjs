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
      f.guards = await h.call('guards')
    },
  ], { packages: corePackages(), extension: CORE_EXTENSION, env: coreEnv({ profileConfig: NATIVE_MANAGER }) })
  const read = async (...keys) => {
    const f = await facts()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const name = (id, text) => ({ id, text })
  const test = (n, fn) => caseTest(n.id, '', n.text, SYS, fn)

  // ------------------------------------------------------------------ items 1, 3: the tool table and the guard entry (unit)
  test(name('MSG-TOOL-EP-01', 'message-tools.js is import-free and exports MESSAGE_TOOL = {send: "message_user"}'), async () => {
    const text = fs.readFileSync(TOOL.module, 'utf8')
    assert.deepEqual(TOOL.importForms.filter((re) => re.test(text)).map(String), [], 'the module imports something')
    const mod = await import(pathToFileURL(TOOL.module).href)
    assert.deepEqual({ ...mod[TOOL.table] }, TOOL.tableValue)
  })
  test(name('MSG-TOOL-EP-02', 'GUARDS.coreTools lists {module: "../manager/message-tools.js", table: "MESSAGE_TOOL"}'), async () => {
    const { GUARDS } = await import(pathToFileURL(TOOL.contracts).href)
    assert.ok(GUARDS.coreTools.some((e) => e.module === TOOL.guardEntry.module && e.table === TOOL.guardEntry.table), show(GUARDS.coreTools))
  })

  // ------------------------------------------------------------------ items 1–3: scope and guard report (system)
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
  test(name('MSG-TOOL-EP-05', 'R-FB-13: the guard report does not count message_user as an extra or overriding manager tool'), async () => {
    const f = await read('guards')
    assert.ok(f.guards, 'no guard report')
    assert.equal((f.guards.extraManagerTools ?? []).includes(TOOL.name), false, show(f.guards))
    assert.equal(show(f.guards.overridden ?? []).includes(TOOL.name), false, show(f.guards))
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
  const sentences = (text) => text.split(PERSONA.sentence).map((s) => s.trim()).filter(Boolean)
  /** Sentence i with its neighbours: a statement may name the tool in the next sentence. */
  const near = (list, i) => list.slice(Math.max(0, i - 1), i + 2).join(' ')
  const nearTool = (list, re) => list.some((s, i) => re.test(s) && near(list, i).includes(TOOL.name))
  test(name('MSG-PERSONA-EP-01', 'the persona names message_user and embed-ui__notify'), async () => {
    const text = await persona()
    assert.ok(text.includes(TOOL.name), 'message_user missing')
    assert.ok(text.includes(PERSONA.notify), PERSONA.notify + ' missing')
  })
  test(name('MSG-PERSONA-EP-02', 'the persona says ordinary replies, reasoning and tool calls are hidden from the user'), async () => {
    const list = sentences(await persona())
    const missing = PERSONA.hiddenSubjects.filter((subject) => !list.some((s, i) => subject.test(s) && PERSONA.hidden.test(near(list, i))))
    assert.deepEqual(missing.map(String), [], 'no "hidden" statement for these')
  })
  test(name('MSG-PERSONA-EP-03', 'the persona says the user sees only what message_user (and notify, when offered) surfaces'), async () => {
    const list = sentences(await persona())
    assert.ok(list.some((s, i) => PERSONA.only.test(s) && near(list, i).includes(TOOL.name)), 'no "only … message_user" statement')
  })
  test(name('MSG-PERSONA-EP-04', 'the persona says what needs attention or action must be sent proactively with message_user, plus a notify notice'), async () => {
    const text = await persona()
    const list = sentences(text)
    assert.ok(nearTool(list, PERSONA.attention) || nearTool(list, PERSONA.action), 'no attention/action statement beside message_user')
    assert.ok(PERSONA.proactive.test(text), 'no "proactively"')
    assert.ok(list.some((s, i) => (PERSONA.attention.test(s) || PERSONA.action.test(s) || PERSONA.proactive.test(s)) && near(list, i).includes(PERSONA.notify)), 'no notify notice beside the attention statement')
  })
  test(name('MSG-PERSONA-EP-05', 'the persona says no messages or notices for routine events, and to batch them'), async () => {
    const text = await persona()
    assert.ok(sentences(text).some((s) => PERSONA.routine.test(s) && /\b(?:no|not|never|don't|do not|avoid|without)\b/i.test(s)), 'no "not for routine events" statement')
    assert.ok(PERSONA.batch.test(text), 'no batching statement')
  })
  test(name('MSG-PERSONA-EP-06', 'the persona says every reply to the user goes through message_user, including the setup greeting and the report after a stop/redirect'), async () => {
    const list = sentences(await persona())
    assert.ok(nearTool(list, PERSONA.everyReply), 'no "every reply … message_user" statement')
    assert.ok(nearTool(list, PERSONA.greeting), 'the setup greeting is not tied to message_user')
    assert.ok(nearTool(list, PERSONA.stop), 'the report after a stop is not tied to message_user')
    assert.ok(nearTool(list, PERSONA.redirect), 'the report after a redirect is not tied to message_user')
  })
  test(name('MSG-PERSONA-EP-07', 'no sentence tells Fishball to tell the user "in this chat" without message_user'), async () => {
    const list = sentences(await persona())
    assert.deepEqual(list.filter((s) => PERSONA.chatSaying.test(s) && !s.includes(TOOL.name)), [])
  })
}
