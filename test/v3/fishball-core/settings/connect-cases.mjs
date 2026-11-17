/**
 * R-FIX-FUI F5 (only the newest status read publishes; unmount stops follow-ups) and F6 (a press's
 * refusal notice lasts until the status changes) black-box rows on core's Connect control
 * (`[data-fishball-connect]`, packages/core/client.settings.js), in the F-SETTINGS scripted page.
 * Every Connect request is held by the case and answered by hand (`connectScript`), so the order in
 * which reads and presses settle is chosen by the case.
 *
 * Techniques:
 * - State transition CONNECT-ST-01…: the races of F5 (read vs newer read, read vs press, settle
 *   after unmount) and the review's "only the latest press opens its page / publishes its notice";
 * - Decision table CONNECT-DT-01: press refusal × first status after the press × later status →
 *   the alert shown or gone (F6), en and zh.
 */
import assert from 'node:assert/strict'
import { textOf } from '../../../support/rp-recommend.mjs'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { CONNECT, DSH, FIXTURE, MARK, OPEN, OUTCOME, ROUTE } from './constants.mjs'
import { createWorld, loadPage, settle } from './page.mjs'

const STORED = Object.freeze({ target: { url: FIXTURE.storedUrl }, connect: { clientMetadataUrl: FIXTURE.storedMetadataUrl }, identity: { id: FIXTURE.coreId, name: FIXTURE.storedName } })
const status = (state, code = null) => ({ status: ROUTE.ok, json: { state, code } })
const S = CONNECT.state
const C = CONNECT.configuration

/** Holds every GET / POST of the Connect route until the case answers it. */
function connectScript(world) {
  const gets = []
  const posts = []
  const held = (list) => () => new Promise((resolve) => { list.push(resolve) })
  world.connect.get = held(gets)
  world.connect.post = held(posts)
  return {
    gets, posts,
    async get(i, answer) { gets[i](answer); await settle() },
    async post(i, answer) { posts[i](answer); await settle() },
  }
}

export function registerConnectRaceCases(sdk) {
  const t = (id, row, title, fn) => caseTest(sdk, id, row, title, fn)
  async function pageWith(c, lang = 'en') {
    const world = createWorld({ sdk, lang, core: STORED })
    const script = connectScript(world)
    const page = await loadPage(c, world)
    await page.open(DSH.view.page)
    const block = () => page.byAttr(MARK.connect)[0]
    return {
      world, script, page,
      state: () => block()?.props[MARK.connectState],
      alerts: () => (block() ? page.alerts([block()]) : []),
      press: () => page.press(page.byAttr(MARK.connectBegin)[0]),
      focus: async () => { world.dispatchWindow(DSH.focus); await settle() },
    }
  }

  // ======================================================================== F5
  t('CONNECT-ST-01', 'older read after newer', 'read 1 (mount) pending → focus starts read 2 → read 2 answers authorized → read 1 answers needs-configuration late: the state stays authorized', async (c) => {
    const p = await pageWith(c)
    assert.equal(p.script.gets.length, 1, 'precondition: the mount read')
    await p.focus()
    assert.equal(p.script.gets.length, 2)
    await p.script.get(1, status(S.authorized))
    assert.equal(p.state(), S.authorized)
    await p.script.get(0, status(S.needsConfiguration, C.metadataUrlMissing))
    assert.equal(p.state(), S.authorized, 'an older read published')
    assert.deepEqual(p.alerts(), [])
  })
  t('CONNECT-ST-01', 'newer read wins in order too', 'read 1 answers first, read 2 after: the state is read 2\'s', async (c) => {
    const p = await pageWith(c)
    await p.focus()
    await p.script.get(0, status(S.authorizing))
    await p.script.get(1, status(S.authorized))
    assert.equal(p.state(), S.authorized)
  })
  t('CONNECT-ST-02', 'read before a press', 'read 1 pending → Connect pressed (POST) → read 1 answers needs-authorization: ignored; the read after the press answers authorized: shown', async (c) => {
    const p = await pageWith(c)
    await p.press()
    assert.equal(p.script.posts.length, 1)
    await p.script.get(0, status(S.failed))
    assert.notEqual(p.state(), S.failed, 'a read started before the press published')
    await p.script.post(0, { status: ROUTE.ok, json: { outcome: OUTCOME.authorized } })
    assert.equal(p.script.gets.length, 2, 'no read after the press')
    await p.script.get(1, status(S.authorized))
    assert.equal(p.state(), S.authorized)
  })
  t('CONNECT-ST-03', 'press settles after unmount', 'press pending → the page unmounts → the POST answers approval-url: no window.open, no follow-up GET, no state update', async (c) => {
    const p = await pageWith(c)
    await p.script.get(0, status(S.needsAuthorization))
    await p.press()
    await p.page.close()
    const stale = p.world.staleUpdates
    const gets = p.script.gets.length
    await p.script.post(0, { status: ROUTE.ok, json: { outcome: OUTCOME.approval, url: FIXTURE.approvalUrl } })
    assert.deepEqual(p.world.opened, [])
    assert.equal(p.script.gets.length, gets, 'a GET after unmount')
    assert.equal(p.world.staleUpdates, stale, 'a state update after unmount')
  })
  t('CONNECT-ST-03', 'read settles after unmount', 'read pending → unmount → it answers: no state update', async (c) => {
    const p = await pageWith(c)
    await p.page.close()
    const stale = p.world.staleUpdates
    await p.script.get(0, status(S.authorized))
    assert.equal(p.world.staleUpdates, stale)
  })
  t('CONNECT-ST-03', 'follow-up read after unmount', 'press answered → its follow-up read pending → unmount → the read answers: no state update', async (c) => {
    const p = await pageWith(c)
    await p.script.get(0, status(S.needsAuthorization))
    await p.press()
    await p.script.post(0, { status: ROUTE.ok, json: { outcome: OUTCOME.authorized } })
    assert.equal(p.script.gets.length, 2, 'precondition: the follow-up read')
    await p.page.close()
    const stale = p.world.staleUpdates
    await p.script.get(1, status(S.authorized))
    assert.equal(p.world.staleUpdates, stale)
  })
  t('CONNECT-ST-04', 'latest press opens', 'press 1 pending → press 2 answers approval URL B → press 1 answers approval URL A late: only B is opened', async (c) => {
    const p = await pageWith(c)
    await p.script.get(0, status(S.needsAuthorization))
    await p.press()
    await p.press()
    assert.equal(p.script.posts.length, 2)
    const other = FIXTURE.approvalUrl + '-second'
    await p.script.post(1, { status: ROUTE.ok, json: { outcome: OUTCOME.approval, url: other } })
    await p.script.post(0, { status: ROUTE.ok, json: { outcome: OUTCOME.approval, url: FIXTURE.approvalUrl } })
    assert.deepEqual(p.world.opened, [[other, OPEN.target, OPEN.features]])
  })
  t('CONNECT-ST-04', 'latest press notice', 'press 1 pending → press 2 answers authorized → press 1 answers needs-configuration late: no notice', async (c) => {
    const p = await pageWith(c)
    await p.script.get(0, status(S.needsAuthorization))
    await p.press()
    await p.press()
    await p.script.post(1, { status: ROUTE.ok, json: { outcome: OUTCOME.authorized } })
    await p.script.post(0, { status: ROUTE.ok, json: { outcome: OUTCOME.configuration, code: C.metadataUrlMissing } })
    for (const resolve of p.script.gets.slice(1)) resolve(status(S.authorized))
    await settle()
    assert.deepEqual(p.alerts(), [])
  })

  // ======================================================================== F6 (decision table, en and zh)
  /** [rule, press answer, first status after the press, later statuses (each after a focus) → alert after each]. */
  const rules = [
    ['missing → corrected → authorized', { outcome: OUTCOME.configuration, code: C.metadataUrlMissing }, status(S.needsConfiguration, C.metadataUrlMissing), [[status(S.authorized), false]], S.authorized],
    ['missing → corrected → needs-authorization', { outcome: OUTCOME.configuration, code: C.metadataUrlMissing }, status(S.needsConfiguration, C.metadataUrlMissing), [[status(S.needsAuthorization), false]], S.needsAuthorization],
    ['unchanged status on refocus', { outcome: OUTCOME.configuration, code: C.metadataUrlMissing }, status(S.needsConfiguration, C.metadataUrlMissing), [[status(S.needsConfiguration, C.metadataUrlMissing), true], [status(S.needsConfiguration, C.metadataUrlMissing), true]], S.needsConfiguration],
    ['another code of the same state', { outcome: OUTCOME.configuration, code: C.metadataUrlMissing }, status(S.needsConfiguration, C.metadataUrlMissing), [[status(S.needsConfiguration, C.metadataUrlNotHttps), true]], S.needsConfiguration, 'changed'],
    ['web-callback-insecure, status needs-authorization', { outcome: OUTCOME.configuration, code: C.webCallbackInsecure }, status(S.needsAuthorization), [[status(S.needsAuthorization), true], [status(S.needsAuthorization), true], [status(S.authorized), false]], S.authorized],
    ['unavailable press, status unchanged then changed', null, status(S.needsAuthorization), [[status(S.needsAuthorization), true], [status(S.failed), false]], S.failed],
  ]
  for (const lang of DSH.locales) {
    for (const [rule, press, first, later, finalState, codeChange] of rules) {
      t('CONNECT-DT-01', `${rule} ${lang}`, `(${lang}) press refused → first status after it → ${later.map(([s, a]) => `${s.json.state}${s.json.code ? '/' + s.json.code : ''}: alert ${a ? 'shown' : 'gone'}`).join(' → ')}`, async (c) => {
        const p = await pageWith(c, lang)
        await p.script.get(0, first)
        await p.press()
        await p.script.post(0, press === null ? { status: ROUTE.unavailable.status, json: ROUTE.unavailable.body } : { status: ROUTE.ok, json: press })
        assert.equal(p.script.gets.length, 2, 'no read after the press')
        await p.script.get(1, first)
        assert.equal(p.alerts().length, 1, 'no notice after the press')
        const pressText = textOf(p.alerts()[0])
        for (const [i, [answer, shown]] of later.entries()) {
          await p.focus()
          await p.script.get(2 + i, answer)
          assert.equal(p.alerts().length, shown ? 1 : 0, `after status ${i + 1}: alerts ${p.alerts().length}`)
        }
        assert.equal(p.state(), finalState)
        // A different (state, code) with a code of its own (rule "another code"): the press's notice is
        // gone; the one alert left is the status's own code (the page's existing needs-configuration line).
        if (codeChange) assert.notEqual(textOf(p.alerts()[0]), pressText)
      })
    }
  }
}
