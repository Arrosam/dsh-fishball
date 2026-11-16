/**
 * F-WIRE manager cases (USE-CASES.md): reminders in the manager (MGR-REM), the manager singleton
 * and its setup (MGR-SET), the generated identity (MGR-ID) and Fishball's model (MGR-MOD), each
 * on a real standalone DSH with core installed (world.mjs), on the SDK the entry file names.
 *
 * One scenario per SDK: boot A is the home's first start; boot B is the next start of the same
 * home after a downtime long enough for a reminder created at the end of A to come due while DSH
 * is down. Every case reads the facts the two boots collected.
 */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { sleep, until } from '../../../support/util.mjs'
import {
  BUDGET, CONNECT_INPUT, FISHBALL_MODEL, GUARD_OK, HTTP, IDENTITY, MCP, MODEL, OP, PERSONA, PRESET, REMINDER, ROLE,
  RETIRED, ROUTE, SDK, TODO, TOOLS,
} from './constants.mjs'
import { scenario, startFakeTarget } from './subject.mjs'

const isCoreTool = (name) => TOOLS.reminders.includes(name) || name === TOOLS.ask || TOOLS.privateSkill.test(name)
const set = (path, value) => ({ op: OP.set, path: [...path], value })
const unset = (path) => ({ op: OP.unset, path: [...path] })
const post = (h, route) => h.request(route, { method: HTTP.post, body: {} })

/** The schedule entries ({id, title, status}) in a schedule_list result text: every object carrying both, at any depth. */
function scheduleEntries(text) {
  let value
  try { value = JSON.parse(text) } catch {
    const start = text.indexOf('[')
    try { value = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) } catch { return null }
  }
  const found = []
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit)
    if (v === null || typeof v !== 'object') return undefined
    if (typeof v.id === 'string' && typeof v.title === 'string') found.push({ id: v.id, title: v.title, status: v.status })
    return Object.values(v).forEach(visit)
  }
  visit(value)
  return found
}
const entriesOf = (listed) => (listed?.result ? scheduleEntries(listed.result.text) : null)
const titlesOf = (listed) => entriesOf(listed)?.map((e) => e.title) ?? null

/** Whether a request of the manager carries a user-role (not tool-role) message with the reminder's prompt. */
const delivered = (requests, title) => requests.some((r) => r.last.some((m) => m.role === ROLE.user && m.text.includes(REMINDER.promptOf(title))))
async function waitDelivery(h, sessionId, title, since) {
  let seen = false
  await until(async () => { seen = delivered(await h.call('requestsSince', { sessionId, since }), title); return seen }, BUDGET.fireMs, BUDGET.applyPollMs)
  return seen
}

/**
 * The id core's Connect passes to the target (R-OA-22 `agent_id`, R-ID-10): one Connect press from
 * the loopback page, the approval URL read, the attempt cancelled so the next press starts anew.
 */
async function connectAgentId(h) {
  const begin = await post(h, ROUTE.connect)
  await post(h, ROUTE.cancel)
  const url = begin.json?.outcome === CONNECT_INPUT.approvalUrl ? new URL(begin.json.url) : null
  return { status: begin.status, body: begin.json ?? begin.text, agentId: url?.searchParams.get(MCP.oauth.agentIdParameter) ?? null }
}
async function waitAgentId(h, test) {
  let last
  await until(async () => { last = await connectAgentId(h); return test(last.agentId) }, BUDGET.connectMs, BUDGET.applyPollMs)
  return last
}

/** The model of the manager's next turn, polled turn by turn until `want` (a live change needs no restart). */
async function waitModel(h, sessionId, want) {
  let last
  await until(async () => { last = (await h.call('turn', { sessionId }))[0]?.model ?? null; return last === want }, BUDGET.applyMs, BUDGET.applyPollMs)
  return last
}

const callTool = (h, sessionId, tool, args, n) => h.call('callTool', { sessionId, tool, args, id: REMINDER.callPrefix + n })
const createArgs = (row) => ({ title: row.title, prompt: REMINDER.promptOf(row.title), ...row.args })

export function registerManagerCases(sdk) {
  let target
  after(async () => target?.stop())

  const facts = scenario('fbmgr-' + sdk.replace(/\W/g, '-'), sdk, [
    async (boot, f) => {
      const h = await boot()
      f.firstStart = await h.call('firstStart')
      f.patchesA = await h.call('patches')
      f.settingsA = await h.call('settings')
      // MGR-SET-ST-01: two concurrent page opens, then a third: one manager.
      f.posts = [...await Promise.all([post(h, ROUTE.session), post(h, ROUTE.session)]), await post(h, ROUTE.session)]
      f.getA = await h.request(ROUTE.session)
      f.serviceA = await h.call('managerId')
      const id = f.posts[2].json?.sessionId
      f.managerA = id
      f.presetsA = await h.call('presets', { sessionId: id })
      f.managerTurn = await h.call('turn', { sessionId: id })
      f.ordinary = await h.call('newSession')
      f.retired = []
      for (const route of RETIRED.api) for (const method of [HTTP.get, HTTP.post]) f.retired.push({ route, method, status: (await h.request(route, { method, ...(method === HTTP.post ? { body: {} } : {}) })).status })
      f.retired.push({ route: RETIRED.embed, method: HTTP.get, status: (await h.request(RETIRED.embed)).status })

      // MGR-REM: the decision-table creates, one call per turn.
      let n = 0
      const started = await h.call('now')
      f.creates = {}
      for (const row of REMINDER.rows) f.creates[row.title] = await callTool(h, id, TOOLS.reminders[0], createArgs(row), ++n)
      f.fired = await waitDelivery(h, id, REMINDER.fire, started)
      f.list1 = await callTool(h, id, TOOLS.reminders[1], {}, ++n)
      const entries = scheduleEntries(f.list1.result?.text ?? '') ?? []
      const idOf = (title) => entries.find((e) => e.title === title)?.id
      f.update = await callTool(h, id, TOOLS.reminders[2], { id: idOf(REMINDER.keep), title: REMINDER.renamed }, ++n)
      f.delete = await callTool(h, id, TOOLS.reminders[3], { id: idOf(REMINDER.deleted) }, ++n)
      f.list2 = await callTool(h, id, TOOLS.reminders[1], {}, ++n)
      f.guardsA = await h.call('guards')

      // MGR-ID: the id Connect passes, with identity.id unset.
      target = await startFakeTarget()
      await h.call('mutate', { ops: [set(CONNECT_INPUT.targetPath, target.url), set(CONNECT_INPUT.metadataPath, CONNECT_INPUT.metadataUrl)] })
      f.settingsConfigured = await h.call('settings')
      f.connectA = await waitAgentId(h, (v) => v !== null)

      // MGR-MOD: unset → set → unroutable → unset → set (kept for boot B's activation).
      f.modelUnset = (await h.call('turn', { sessionId: id }))[0]?.model ?? null
      await h.call('mutate', { ops: [set(FISHBALL_MODEL.path, MODEL.routable)] })
      f.modelSet = await waitModel(h, id, MODEL.routable.model)
      await h.call('mutate', { ops: [set(FISHBALL_MODEL.path, MODEL.unroutable)] })
      f.modelUnroutable = await waitModel(h, id, MODEL.dshDefault.model)
      await h.call('mutate', { ops: [set(FISHBALL_MODEL.path, MODEL.routable)] })
      await waitModel(h, id, MODEL.routable.model)
      await h.call('mutate', { ops: [unset(FISHBALL_MODEL.path)] })
      f.modelUnsetAgain = await waitModel(h, id, MODEL.dshDefault.model)
      await h.call('mutate', { ops: [set(FISHBALL_MODEL.path, MODEL.routable)] })
      f.modelBeforeStop = await waitModel(h, id, MODEL.routable.model)

      // MGR-REM-ST-05: a reminder that comes due while DSH is down.
      f.missedCreate = await callTool(h, id, TOOLS.reminders[0], { title: REMINDER.missed.title, prompt: REMINDER.promptOf(REMINDER.missed.title), after_seconds: REMINDER.missed.after_seconds }, ++n)
    },
    async (boot, f) => {
      await sleep(BUDGET.downtimeMs)
      const h = await boot()
      f.firstStartB = await h.call('firstStart')
      f.postB = await post(h, ROUTE.session)
      f.getB = await h.request(ROUTE.session)
      const id = f.postB.json?.sessionId
      f.modelOnActivation = (await h.call('turn', { sessionId: id }))[0]?.model ?? null
      await h.call('mutate', { ops: [unset(FISHBALL_MODEL.path)] })
      f.modelUnsetB = await waitModel(h, id, MODEL.dshDefault.model)
      f.missedDelivered = await waitDelivery(h, id, REMINDER.missed.title, 0)
      f.listB = await callTool(h, id, TOOLS.reminders[1], {}, 1)
      f.connectB = await waitAgentId(h, (v) => v !== null)
      await h.call('mutate', { ops: [set(IDENTITY.path, IDENTITY.user)] })
      f.connectUser = await waitAgentId(h, (v) => v === IDENTITY.user)
      await h.call('mutate', { ops: [unset(IDENTITY.path)] })
      f.connectBack = await waitAgentId(h, (v) => v !== IDENTITY.user && v !== null)
      f.guardsB = await h.call('guards')
    },
  ])
  /** The facts, failing the case with the scenario's own error when a step failed before them. */
  const read = async (...keys) => {
    const f = await facts()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const name = (id, text) => `${sdk} ${id} ${text}`

  // ------------------------------------------------------------------ MGR-REM: reminders (DESIGN §20)
  test(name('MGR-REM-EP-01', 'the manager\'s model-visible tools include schedule_create/list/update/delete'), async () => {
    const f = await read('managerTurn')
    const tools = f.managerTurn[0]?.tools ?? []
    for (const tool of TOOLS.reminders) assert.ok(tools.includes(tool), `${tool} missing from the manager's tools: ${tools.join(', ')}`)
  })
  test(name('MGR-REM-EP-02', 'an ordinary new session sees none of core\'s tools (reminders, ask_user, private skills)'), async () => {
    const f = await read('ordinary')
    assert.notEqual(f.ordinary.sessionId, f.managerA, 'the new session is the manager')
    const tools = f.ordinary.requests[0]?.tools
    assert.ok(tools, 'the ordinary session made no model request')
    assert.deepEqual(tools.filter(isCoreTool), [], 'core tools leaked outside the manager scope')
  })
  test(name('MGR-REM-EP-03', 'the V2 reminder page API is not served (404)'), async () => {
    const f = await read('retired')
    for (const r of f.retired) assert.equal(r.status, RETIRED.missing, `${r.method} ${r.route} answered ${r.status}`)
  })
  for (const row of REMINDER.rows) {
    test(name('MGR-REM-DT-01', `schedule_create ${row.row}: ${row.accepted ? 'created' : 'refused, never listed'}`), async () => {
      const f = await read('creates', 'list1')
      const call = f.creates[row.title]
      assert.ok(call.offered, 'schedule_create was not offered to the manager')
      assert.notEqual(call.result, null, 'no tool result reached the model')
      const titles = titlesOf(f.list1)
      assert.ok(titles, 'schedule_list result is not readable: ' + JSON.stringify(f.list1.result))
      // The 1 s one-shot may already have fired and ended (MGR-REM-ST-01), so it is not read from the list.
      if (row.fires) return assert.ok(f.fired || titles.includes(row.title), 'the accepted one-shot neither fired nor is listed')
      assert.equal(titles.includes(row.title), row.accepted, `listed titles: ${titles.join(', ')}; create result: ${call.result.text}`)
    })
  }
  // V2 T10 "a one-shot task ends": after it fired it is either gone from the list or listed as no longer active.
  test(name('MGR-REM-ST-01', 'a one-shot reminder fires into the manager as a user message, then has ended'), async () => {
    const f = await read('fired', 'list1', 'list2')
    assert.equal(f.fired, true, 'no manager request carried the reminder\'s prompt within the budget')
    const active = entriesOf(f.list1)?.find((e) => e.title === REMINDER.keep)?.status
    const fired = entriesOf(f.list2)?.find((e) => e.title === REMINDER.fire)
    assert.ok(active !== undefined, 'precondition: a scheduled reminder lists a status: ' + f.list1.result?.text)
    assert.ok(fired === undefined || fired.status !== active, 'still active after it fired: ' + JSON.stringify(fired))
  })
  test(name('MGR-REM-ST-02', 'schedule_update renames a listed reminder in place'), async () => {
    const f = await read('update', 'list2')
    const titles = titlesOf(f.list2)
    assert.ok(titles?.includes(REMINDER.renamed), `after update: ${JSON.stringify(f.list2.result)}; update result: ${JSON.stringify(f.update.result)}`)
    assert.equal(titles.includes(REMINDER.keep), false)
  })
  test(name('MGR-REM-ST-03', 'schedule_delete removes a reminder from the list'), async () => {
    const f = await read('delete', 'list2')
    assert.equal(titlesOf(f.list2)?.includes(REMINDER.deleted), false, `after delete: ${JSON.stringify(f.list2.result)}; delete result: ${JSON.stringify(f.delete.result)}`)
  })
  test(name('MGR-REM-ST-04', 'a reminder survives a restart of the same home'), async () => {
    const f = await read('listB')
    assert.ok(titlesOf(f.listB)?.includes(REMINDER.renamed), 'after restart: ' + JSON.stringify(f.listB.result))
  })
  test(name('MGR-REM-ST-05', 'a reminder that came due while DSH was down is delivered after the next start'), async () => {
    const f = await read('missedCreate', 'missedDelivered')
    assert.equal(f.missedDelivered, true)
  })
  test(name('MGR-REM-EP-04', 'R-FB-13 ignores core\'s own tools: the guard report stays ok after the reminder tools ran, before and after restart'), async () => {
    const f = await read('guardsA', 'guardsB')
    for (const report of [f.guardsA, f.guardsB]) assert.deepEqual({ status: report?.status, overridden: report?.overridden }, { status: GUARD_OK, overridden: [] })
  })

  // ------------------------------------------------------------------ MGR-SET: the manager singleton and setup
  test(name('MGR-SET-ST-01', 'POST /api/fishball/session twice at once and once more: 200 and one id; GET and the service then answer it'), async () => {
    const f = await read('posts', 'getA')
    for (const p of f.posts) assert.equal(p.status, HTTP.ok, JSON.stringify(p.json ?? p.text))
    const ids = f.posts.map((p) => p.json?.sessionId)
    assert.equal(typeof ids[0], 'string')
    assert.ok(ids[0].length > 0)
    assert.deepEqual(new Set(ids).size, 1, 'ids: ' + ids.join(', '))
    assert.equal(f.getA.status, HTTP.ok)
    assert.equal(f.getA.json?.sessionId, ids[0])
    assert.equal(f.serviceA, ids[0])
  })
  test(name('MGR-SET-ST-02', 'after a restart of the same home, POST then GET answer the same manager id'), async () => {
    const f = await read('postB', 'getB', 'managerA')
    assert.equal(f.firstStartB, false, 'precondition: boot B is not a first start')
    assert.equal(f.postB.json?.sessionId, f.managerA)
    assert.equal(f.getB.json?.sessionId, f.managerA)
  })
  test(name('MGR-SET-ST-03', 'GET before any ensure on a fresh home'), { todo: TODO.firstGet }, () => {})
  const reportsPreset = sdk === SDK.presetReporting
  test(name('MGR-SET-EP-01', `the manager runs on core's ${PRESET.fishball} preset, the default`), reportsPreset ? {} : { skip: `R-FB-13: ${sdk} cannot report a session's preset (no presetForSession); the default and the tool list (MGR-SET-EP-02) are checked instead` }, async () => {
    const f = await read('presetsA')
    // Ambiguity reported to F-WIRE: 0.2.2-rc.1 records no preset (null) for the manager, so DSH
    // runs it on the default preset. The requirement names the preset it runs on, not a recorded
    // selection, so the effective preset is the oracle: the recorded one, else the default.
    assert.equal(f.presetsA.preset ?? f.presetsA.defaultId, PRESET.fishball, JSON.stringify(f.presetsA))
  })
  test(name('MGR-SET-EP-01b', `the default agent preset is ${PRESET.fishball}`), async () => {
    const f = await read('presetsA')
    assert.equal(f.presetsA.defaultId, PRESET.fishball)
  })
  test(name('MGR-SET-EP-02', 'the manager\'s tools are exactly read, read_image, working_directory plus core\'s own'), async () => {
    const f = await read('managerTurn')
    const tools = f.managerTurn[0]?.tools ?? []
    assert.deepEqual(tools.filter((t) => !isCoreTool(t)).sort(), [...TOOLS.base].sort())
  })
  test(name('MGR-SET-EP-03', 'the persona names session_message and approval_answer and none of the V2 names'), async () => {
    const f = await read('managerTurn')
    const system = f.managerTurn.map((r) => r.system).join('\n')
    for (const word of PERSONA.present) assert.ok(system.includes(word), word + ' missing from the persona')
    for (const word of PERSONA.absent) assert.equal(system.includes(word), false, word + ' still in the persona')
  })

  // ------------------------------------------------------------------ MGR-ID: generated identity (R-ID-10, DESIGN §20)
  test(name('MGR-ID-EP-01', 'the first start writes no settings document and saves no identity.id into settings'), async () => {
    const f = await read('patchesA', 'settingsA')
    assert.equal(f.firstStart, true, 'precondition: boot A is the home\'s first start')
    for (const file of f.patchesA.files) if (file.before !== undefined) assert.equal(file.now, file.before, file.file + ' was written at first start')
    assert.equal(f.settingsA?.user?.[IDENTITY.group]?.[IDENTITY.key], undefined, 'identity.id was written to the settings document')
  })
  test(name('MGR-ID-EP-02', 'with identity.id unset, the id core sends (Connect agent_id) is fb- + 16 of [a-z2-7]'), async () => {
    const f = await read('connectA', 'settingsConfigured')
    assert.match(String(f.connectA.agentId), IDENTITY.generated, 'Connect answered ' + JSON.stringify(f.connectA))
    assert.equal(f.settingsConfigured?.user?.[IDENTITY.group]?.[IDENTITY.key], undefined, 'identity.id appeared in the settings document')
  })
  test(name('MGR-ID-ST-01', 'the generated id is the same after a restart of the same home'), async () => {
    const f = await read('connectA', 'connectB')
    assert.equal(f.connectB.agentId, f.connectA.agentId)
  })
  test(name('MGR-ID-ST-02', 'a user-set identity.id overrides the generated id'), async () => {
    const f = await read('connectUser')
    assert.equal(f.connectUser.agentId, IDENTITY.user, 'Connect answered ' + JSON.stringify(f.connectUser))
  })
  test(name('MGR-ID-ST-03', 'identity.id unset again: the kept generated id is used again'), async () => {
    const f = await read('connectBack', 'connectA')
    assert.equal(f.connectBack.agentId, f.connectA.agentId)
  })

  // ------------------------------------------------------------------ MGR-MOD: Fishball's model (DESIGN §20)
  const modelRows = [
    ['MGR-MOD-ST-01', 'model unset: the manager runs on DSH\'s default model', 'modelUnset', MODEL.dshDefault.model],
    ['MGR-MOD-ST-02', 'set to a routable model: the live manager uses it, no restart', 'modelSet', MODEL.routable.model],
    ['MGR-MOD-ST-03', 'set to an unroutable model: DSH\'s default is kept', 'modelUnroutable', MODEL.dshDefault.model],
    ['MGR-MOD-ST-04', 'unset again: DSH\'s default', 'modelUnsetAgain', MODEL.dshDefault.model],
    ['MGR-MOD-ST-05', 'set before a restart: the manager uses it on activation', 'modelOnActivation', MODEL.routable.model],
    ['MGR-MOD-ST-06', 'unset after the restart: DSH\'s default', 'modelUnsetB', MODEL.dshDefault.model],
  ]
  for (const [id, text, key, want] of modelRows) {
    test(name(id, text), async () => {
      const f = await read(key)
      assert.equal(f[key], want)
    })
  }
  test(name('MGR-MOD-ST-07', 'an unroutable selection is logged once'), { todo: TODO.unroutableLog }, () => {})
  test(name('MGR-MOD-EP-01', 'model.reasoningEffort reaches the request'), { todo: TODO.reasoningEffort }, () => {})
  test(name('MGR-MOD-ST-08', 'a change of DSH\'s default while model is unset'), { todo: TODO.defaultChange }, () => {})
}
