/**
 * Core's one page stream with fishball-ui and fishball-taskboard installed (DESIGN §34; old
 * fishball-ui.connections system rows CONN-SYS-*, and the coverage gap PS-TB: fishball-taskboard
 * registers its board as the page-stream topic `fishball-taskboard` while it is bound to the instance).
 *
 * Levels: system. A real standalone DSH (fishball-test-helpers/dsh-world) with fishball-core,
 * fishball-ui (core's ./ui component row) and fishball-taskboard installed as DSH's add installs them;
 * the carrier read from Node with the owner's cookie (R3/R4); DSH's real web UI in headless Chromium,
 * EventSources counted from DevTools (R1/R2/R7; skipped without Chromium).
 *
 * Techniques: EP (R3's topic and provider arguments; topic names new / taken), DT (CONN-SYS-DT-01 page
 * state → EventSources; PS-TB-DT-01 taskboard bound × topic), BVA (0 / 1 / 5 amenity topics; the 5 s
 * send), ST (change / same value / registered while open / throwing provider / disposed; the
 * taskboard's row on → off → on), UC (the sends with every panel).
 *
 * PS-TB is meaningful only if it fails where the condition is absent. `--against` cannot show that here
 * (it swaps only the package under test, this integration package), so a controlled world stands in:
 * the same DSH with fishball-taskboard NOT bound (its row switched off through DSH's plugin manager, and
 * a second home where it is not installed at all) must carry no `fishball-taskboard` topic, while the
 * core and ui topics stay; switching the row back on brings the topic back.
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { BROWSER, chromeBinary, stopBrowser } from 'fishball-test-helpers/browser'
import { caseTest } from 'fishball-test-helpers/cases'
import { scenario } from 'fishball-test-helpers/dsh-world'
import { BUDGET, CARRIER, COUNT, HOME, MODEL, NO_WARNING, SESSION_ROUTE, TASKBOARD, TOPIC, UI, fakeFrame } from '../constants.mjs'
import { NAMES } from '../support/names.mjs'
import { openPage, openWire } from '../support/page.mjs'
import { EXTENSION, corePackages, taskboardPackage } from '../support/world.mjs'

const show = (v) => JSON.stringify(v)
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const query = (lang) => '?' + new URLSearchParams({ [CARRIER.langParam]: lang, [CARRIER.tzParam]: zone })
const quiet = () => new Promise((resolve) => setTimeout(resolve, BUDGET.quietMs))
const BUILT_IN = Object.freeze([TOPIC.asks, TOPIC.strip, TOPIC.taskboard])
const topicsOf = (messages) => [...new Set(messages.map((m) => m?.topic))].sort()

/** One carrier opened and read until the built-in core/ui topics arrived; answers its messages at open. */
async function atOpen(h, want) {
  const wire = await openWire(h, query('en'))
  await wire.wait((m) => want.every((t) => m.some((x) => x?.topic === t)))
  await quiet()
  const messages = [...wire.messages]
  await wire.close()
  return { status: wire.status, type: wire.type, messages }
}

export function registerStreamCases() {
  const browser = Boolean(chromeBinary())
  after(stopBrowser)
  const facts = scenario(HOME.stream, [
    async (boot, f) => {
      const h = await boot()
      f.manager = (await h.request(SESSION_ROUTE, { method: 'POST', body: {} })).json?.sessionId
      if (typeof f.manager !== 'string') throw new Error('no manager session')
      await h.call('mutate', { ns: MODEL.namespace, ops: [{ op: 'set', path: [...MODEL.path], value: MODEL.routable }] })
      await h.call('idle', { sessionId: f.manager })
      f.face = await h.call('pageFace')

      // R3: the registration contract.
      f.badTopics = {}
      for (const [label, topic] of TOPIC.badTopics) f.badTopics[label] = await h.call('pageRegisterRaw', { topic, provider: 'ok' })
      f.badProviders = {}
      for (const shape of TOPIC.badProviders) f.badProviders[shape] = await h.call('pageRegisterRaw', { topic: TOPIC.fake('bad-' + shape), provider: shape })
      f.first = await h.call('pageRegister', { topic: TOPIC.fake(0), value: fakeFrame(0) })
      f.duplicate = await h.call('pageRegister', { topic: TOPIC.fake(0), value: fakeFrame(0, 1) })
      f.builtinDuplicate = {}
      for (const name of BUILT_IN) f.builtinDuplicate[name] = await h.call('pageRegister', { topic: name, value: null })

      // R4: one carrier (en), changes, a second carrier (zh).
      const en = await openWire(h, query('en'))
      f.wireStatus = { status: en.status, type: en.type }
      await en.wait((m) => [...BUILT_IN, TOPIC.fake(0)].every((topic) => m.some((x) => x?.topic === topic)))
      await quiet()
      f.atOpen = [...en.messages]
      f.board = (await h.request(TASKBOARD.board)).json
      f.urls = await h.call('pageUrls', { topic: TOPIC.fake(0) })
      // PS-TB-ST-02: a committed board change is one more fishball-taskboard frame, equal to the new GET body.
      const saved = await h.request(TASKBOARD.board, { method: 'POST', body: { baseRevision: f.board?.revision ?? 0, tasks: [TASKBOARD.task(TASKBOARD.title)], memos: [] } })
      f.boardSave = { status: saved.status, json: saved.json }
      await en.wait((m) => m.filter((x) => x?.topic === TOPIC.taskboard).length >= 2)
      await quiet()
      f.boardAfter = (await h.request(TASKBOARD.board)).json
      f.boardFrames = en.of(TOPIC.taskboard).map((m) => m.frame)
      await h.call('pageChange', { topic: TOPIC.fake(0), value: fakeFrame(0, 1) })
      await en.wait((m) => m.filter((x) => x?.topic === TOPIC.fake(0)).length >= 2)
      await h.call('pageTouch', { topic: TOPIC.fake(0) })
      await h.call('pageChange', { topic: TOPIC.fake(0), value: fakeFrame(0, 1) })
      await quiet()
      f.afterChange = en.of(TOPIC.fake(0)).map((m) => m.frame)
      f.late = await h.call('pageRegister', { topic: TOPIC.fake(1), value: fakeFrame(1) })
      await en.wait((m) => m.some((x) => x?.topic === TOPIC.fake(1)))
      f.lateFrames = en.of(TOPIC.fake(1)).map((m) => m.frame)
      await h.call('pageThrow', { topic: TOPIC.fake(1), throws: true })
      await h.call('pageChange', { topic: TOPIC.fake(1), value: fakeFrame(1, 1) })
      await h.call('pageChange', { topic: TOPIC.fake(0), value: fakeFrame(0, 2) })
      await en.wait((m) => m.some((x) => x?.topic === TOPIC.fake(0) && x.frame?.n === 2))
      await quiet()
      f.throwing = { thrower: en.of(TOPIC.fake(1)).map((m) => m.frame), other: en.of(TOPIC.fake(0)).map((m) => m.frame) }
      const zh = await openWire(h, query('zh'))
      await zh.wait((m) => m.some((x) => x?.topic === TOPIC.strip) && m.some((x) => x?.topic === TOPIC.fake(0)))
      await quiet()
      f.zhAtOpen = [...zh.messages]
      await h.call('pageThrow', { topic: TOPIC.fake(1), throws: false })
      await h.call('pageDispose', { topic: TOPIC.fake(0) })
      await h.call('pageChange', { topic: TOPIC.fake(0), value: fakeFrame(0, 3) })
      await h.call('pageChange', { topic: TOPIC.fake(1), value: fakeFrame(1, 2) })
      await en.wait((m) => m.some((x) => x?.topic === TOPIC.fake(1) && x.frame?.n === 2))
      await quiet()
      f.afterDispose = en.of(TOPIC.fake(0)).map((m) => m.frame)
      await en.close()
      await zh.close()
      await h.call('pageDisposeAll')

      // PS-TB-ST-01: the taskboard row switched off (unbound) → no topic; on again (bound) → the topic is back.
      await h.call('setRowEnabled', { id: NAMES.taskboardRow, enabled: false })
      f.offRows = await h.call('rows', { ids: [NAMES.taskboardRow] })
      f.whenOff = await atOpen(h, [TOPIC.asks, TOPIC.strip])
      await h.call('setRowEnabled', { id: NAMES.taskboardRow, enabled: true })
      f.whenOn = await atOpen(h, BUILT_IN)
      if (!browser) return

      // R1/R2/R7: DSH's real page, every panel, 0 → 1 → 5 amenity topics, the Task board shown and hidden.
      const page = await openPage(h)
      f.pageReady = await page.ready()
      const counts = {}
      const measure = async (label) => { counts[label] = await page.settled((s) => s.fishball.length >= COUNT.fishball) }
      await measure('topics 0')
      await h.call('pageRegister', { topic: TOPIC.fake('p0'), value: fakeFrame(0) })
      await measure('topics 1')
      for (let i = 1; i < COUNT.topics.at(-1); i++) await h.call('pageRegister', { topic: TOPIC.fake('p' + i), value: fakeFrame(i) })
      await measure('topics 5')
      f.boardOpened = await page.openTaskBoard()
      await measure('Task board shown')
      f.send = await page.send(UI.text)
      f.imageAttached = await page.attachImage()
      f.imageSend = await page.send(UI.imageText)
      await measure('after the sends')
      f.collapsed = await page.collapseRight()
      await measure('Task board hidden')
      await h.call('pageDisposeAll')
      await measure('topics withdrawn')
      f.counts = counts
      f.ever = page.ever()
      f.pageConsole = page.console()
      await page.close()
    },
  ], { packages: [...corePackages(), taskboardPackage()], extension: EXTENSION })

  // A second home, fishball-taskboard never installed: the controlled world of PS-TB-DT-01.
  const unbound = scenario(HOME.unbound, [
    async (boot, f) => {
      const h = await boot()
      f.rows = await h.call('rows', { ids: [NAMES.taskboardRow] })
      f.atOpen = await atOpen(h, [TOPIC.asks, TOPIC.strip])
    },
  ], { packages: corePackages(), extension: EXTENSION })

  const reader = (source) => async (...keys) => {
    const f = await source()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const read = reader(facts)
  const readUnbound = reader(unbound)
  const wireTest = (id, row, title, fn) => caseTest(id, row, title, { timeout: BUDGET.caseMs }, fn)
  const pageTest = (id, row, title, fn) => caseTest(id, row, title, browser ? { timeout: BUDGET.caseMs } : { skip: BROWSER.skipNoChrome }, fn)
  const frameOf = (messages, topic) => messages.find((m) => m.topic === topic)?.frame

  // ------------------------------------------------------------------ PS-TB: the taskboard's topic (coverage gap, DESIGN §34)
  wireTest('PS-TB-DT-01', 'bound', 'fishball-taskboard installed and bound to the instance: the carrier sends a fishball-taskboard topic at open, its frame equal to GET /api/fishball-taskboard/board', async () => {
    const f = await read('atOpen', 'board')
    assert.ok(f.atOpen.some((m) => m.topic === TOPIC.taskboard), 'no fishball-taskboard topic: ' + show(topicsOf(f.atOpen)))
    assert.deepEqual(frameOf(f.atOpen, TOPIC.taskboard), f.board)
  })
  wireTest('PS-TB-DT-01', 'not installed', 'controlled world, fishball-taskboard not installed: the carrier sends asks and strip and no fishball-taskboard topic', async () => {
    const f = await readUnbound('atOpen', 'rows')
    assert.equal(f.rows[0].present, false, 'precondition: no taskboard row ' + show(f.rows))
    const topics = topicsOf(f.atOpen.messages)
    assert.ok([TOPIC.asks, TOPIC.strip].every((t) => topics.includes(t)), show(topics))
    assert.equal(topics.includes(TOPIC.taskboard), false, show(topics))
  })
  wireTest('PS-TB-ST-01', 'row off → on', "controlled world: fishball-taskboard's row switched off through DSH's plugin manager (unbound) → a new carrier has no fishball-taskboard topic; switched on again → it is back", async () => {
    const f = await read('whenOff', 'whenOn', 'offRows')
    assert.equal(f.offRows[0].disabled, true, 'precondition: the row is off ' + show(f.offRows))
    assert.equal(topicsOf(f.whenOff.messages).includes(TOPIC.taskboard), false, 'off: ' + show(topicsOf(f.whenOff.messages)))
    assert.ok(topicsOf(f.whenOn.messages).includes(TOPIC.taskboard), 'on again: ' + show(topicsOf(f.whenOn.messages)))
  })
  wireTest('PS-TB-ST-02', 'board change', 'a committed board change (POST /api/fishball-taskboard/board) sends one more fishball-taskboard frame, equal to the new GET body', async () => {
    const f = await read('boardFrames', 'boardAfter', 'boardSave')
    assert.equal(f.boardSave.status, 200, show(f.boardSave))
    assert.ok(f.boardFrames.length >= 2, show(f.boardFrames))
    assert.deepEqual(f.boardFrames.at(-1), f.boardAfter)
    assert.ok(f.boardAfter.tasks.some((t) => t.title === TASKBOARD.title), show(f.boardAfter))
  })

  // ------------------------------------------------------------------ R3: the Host registration
  wireTest('CONN-SYS-EP-01', 'face', `ctx.get('${TOPIC.service}') is apiVersion ${TOPIC.apiVersion} with page.register a function; register answers a dispose function`, async () => {
    const f = await read('face', 'first')
    assert.deepEqual(f.face, { apiVersion: TOPIC.apiVersion, register: 'function' })
    assert.deepEqual(f.first, { ok: true, dispose: 'function' })
  })
  for (const [label] of TOPIC.badTopics) {
    wireTest('CONN-SYS-EP-02', 'topic ' + label, `a topic that is ${label === 'empty' ? 'the empty string' : 'a ' + label} → TypeError`, async () => {
      const f = await read('badTopics')
      assert.equal(f.badTopics[label]?.name, TOPIC.typeError, show(f.badTopics[label]))
    })
  }
  for (const shape of TOPIC.badProviders) {
    wireTest('CONN-SYS-EP-03', 'provider ' + shape, `a provider that is ${shape} (not {frame(url), onChange(fn)}) → TypeError`, async () => {
      const f = await read('badProviders')
      assert.equal(f.badProviders[shape]?.name, TOPIC.typeError, show(f.badProviders[shape]))
    })
  }
  wireTest('CONN-SYS-EP-04', 'duplicate', 'registering a topic name already registered throws (a fake topic twice, and each built-in name: asks, strip, fishball-taskboard)', async () => {
    const f = await read('duplicate', 'builtinDuplicate')
    assert.equal(f.duplicate.ok, false, show(f.duplicate))
    for (const [name, answer] of Object.entries(f.builtinDuplicate)) assert.equal(answer.ok, false, name + ': ' + show(answer))
  })

  // ------------------------------------------------------------------ R4: the wire
  wireTest('CONN-SYS-UC-01', 'open', `GET ${CARRIER.path}?lang&tz → 200 text/event-stream; at open exactly one {topic, frame} message per registered topic (asks, strip, fishball-taskboard and the fake one)`, async () => {
    const f = await read('wireStatus', 'atOpen')
    assert.equal(f.wireStatus.status, 200)
    assert.match(String(f.wireStatus.type), /^text\/event-stream/)
    for (const m of f.atOpen) assert.deepEqual(Object.keys(m ?? {}).sort(), [...TOPIC.wireKeys], 'not {topic, frame}: ' + show(m))
    assert.deepEqual(f.atOpen.map((m) => m.topic).sort(), [...BUILT_IN, TOPIC.fake(0)].sort(), 'not one message per topic')
  })
  wireTest('CONN-SYS-EP-05', 'built-in frames', 'asks frame is {managerSessionId: the manager, cards: [...]}; strip frame carries on and brandStyle', async () => {
    const f = await read('atOpen', 'manager')
    assert.equal(frameOf(f.atOpen, TOPIC.asks)?.managerSessionId, f.manager)
    assert.ok(Array.isArray(frameOf(f.atOpen, TOPIC.asks)?.cards), show(frameOf(f.atOpen, TOPIC.asks)))
    assert.equal(typeof frameOf(f.atOpen, TOPIC.strip)?.on, 'boolean', show(frameOf(f.atOpen, TOPIC.strip)))
    assert.ok(Object.hasOwn(frameOf(f.atOpen, TOPIC.strip) ?? {}, 'brandStyle'), 'no brandStyle in the strip frame')
  })
  wireTest('CONN-SYS-EP-06', 'frame(url)', "a provider is asked frame(url) with the carrier's request URL: its path and the lang and tz it was opened with", async () => {
    const f = await read('urls')
    assert.ok(f.urls.length > 0, 'frame(url) was never called')
    const url = new URL(f.urls[0])
    assert.equal(url.pathname, CARRIER.path)
    assert.equal(url.searchParams.get(CARRIER.langParam), 'en')
    assert.equal(url.searchParams.get(CARRIER.tzParam), zone)
  })
  wireTest('CONN-SYS-EP-07', 'strip in the language', "the strip frame is drawn in the carrier's language: the zh carrier's strip frame differs from the en one", async () => {
    const f = await read('atOpen', 'zhAtOpen')
    const en = frameOf(f.atOpen, TOPIC.strip)
    const zh = frameOf(f.zhAtOpen, TOPIC.strip)
    assert.ok(en && zh, 'a strip frame is missing')
    assert.notDeepEqual(zh, en)
  })
  wireTest('CONN-SYS-ST-01', 'change, no repeat', 'onChange with a new value → one message with it; onChange with the same value (told twice) → no message', async () => {
    const f = await read('afterChange')
    assert.deepEqual(f.afterChange, [fakeFrame(0), fakeFrame(0, 1)])
  })
  wireTest('CONN-SYS-ST-02', 'registered while open', 'a topic registered while the carrier is open is sent to it at once', async () => {
    const f = await read('late', 'lateFrames')
    assert.equal(f.late.ok, true)
    assert.deepEqual(f.lateFrames, [fakeFrame(1)])
  })
  wireTest('CONN-SYS-ST-03', 'a throwing provider', "a provider whose frame() throws: that topic is skipped, another topic's change still arrives; a carrier opened meanwhile still sends the other topics", async () => {
    const f = await read('throwing', 'zhAtOpen')
    assert.deepEqual(f.throwing.thrower, [fakeFrame(1)], 'the throwing topic sent something')
    assert.deepEqual(f.throwing.other.at(-1), fakeFrame(0, 2), 'the other topic stopped')
    const zhTopics = f.zhAtOpen.map((m) => m.topic)
    assert.ok([...BUILT_IN, TOPIC.fake(0)].every((topic) => zhTopics.includes(topic)), show(zhTopics))
    assert.equal(zhTopics.includes(TOPIC.fake(1)), false, 'the throwing topic was sent at open')
  })
  wireTest('CONN-SYS-ST-04', 'disposed topic', 'after its dispose a topic sends nothing more, while another still does', async () => {
    const f = await read('afterDispose')
    assert.equal(f.afterDispose.some((frame) => frame?.n === 3), false, show(f.afterDispose))
  })

  // ------------------------------------------------------------------ R1/R2/R7: DSH's real page
  pageTest('CONN-SYS-DT-01', 'constant count', `DSH's real Fishball page with every panel: 0, 1, 5 amenity topics, the Task board shown, after two sends, the Task board hidden, topics withdrawn → each time exactly ${COUNT.origin} EventSources to the origin (DSH's /plugins/events and the carrier), ${COUNT.fishball} of them Fishball's`, async () => {
    const f = await read('counts', 'pageReady')
    assert.equal(f.pageReady, true, "the Fishball page with DSH's composer never appeared")
    for (const [label, split] of Object.entries(f.counts)) {
      assert.equal(split.fishball.length, COUNT.fishball, label + ': ' + show(split))
      assert.equal(split.fishball[0].split('?')[0], CARRIER.path, label + ': ' + show(split))
      assert.equal(split.origin.length, COUNT.origin, label + ': ' + show(split))
      assert.ok(split.origin.some((p) => COUNT.dshStream.test(p.split('?')[0])), label + ': no DSH /plugins/events ' + show(split))
      assert.deepEqual(split.other, [], label)
    }
  })
  pageTest('CONN-SYS-ST-05', 'never reopened', 'over the whole page life (topics registered and withdrawn, Task board opened and hidden, sends) the carrier was opened once, and no retired route was ever opened', async () => {
    const f = await read('ever')
    const paths = f.ever.map((u) => new URL(u).pathname)
    assert.deepEqual(paths.filter((p) => CARRIER.retired.includes(p)), [], show(f.ever))
    assert.equal(paths.filter((p) => p === CARRIER.path).length, 1, show(f.ever))
    assert.ok(f.ever.filter((u) => new URL(u).pathname === CARRIER.path).every((u) => new URL(u).searchParams.get(CARRIER.tzParam) === zone && new URL(u).searchParams.has(CARRIER.langParam)), show(f.ever))
  })
  for (const [id, key, attached, title] of [['CONN-SYS-UC-02', 'send', null, 'a text send'], ['CONN-SYS-UC-03', 'imageSend', 'imageAttached', 'a send with an image attached through the composer\'s file input']]) {
    pageTest(id, key === 'send' ? 'send' : 'send with an image', `every panel mounted and the Task board tab open: ${title} reaches the model and the composer leaves its sending state (no [data-sending], editor empty) within ${BUDGET.sendMs} ms`, async () => {
      const f = await read(key, 'boardOpened', ...(attached ? [attached] : []))
      assert.equal(f.boardOpened, true, String(f.boardOpened))
      if (attached) assert.equal(f[attached], true, 'the image never reached the composer: ' + show(f[attached]))
      assert.equal(f[key].received, true, 'the model never received the send: ' + show(f[key]))
      assert.equal(f[key].left, true, 'the composer stayed sending: ' + show(f[key].state))
      assert.equal(f[key].carries, true, 'no model request of the send carries its text')
    })
  }
  pageTest('CONN-SYS-EP-08', 'no budget warning', 'the page logs no connection-budget warning', async () => {
    const f = await read('pageConsole')
    assert.deepEqual(f.pageConsole.filter((l) => l.text.startsWith(NO_WARNING.prefix) || NO_WARNING.word.test(l.text)), [])
  })
}
