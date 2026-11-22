/**
 * R-FIX-FUI F5 (only the newest status read publishes; unmount stops follow-ups) and F6 (a press's
 * refusal notice lasts until the status changes) black-box rows on core's Connect control, in
 * fishball-test-helpers' scripted page with core's client alone (page.mjs). MULTI-1 re-baseline: the control is per target since MULTI-0 (one card
 * per TargetView, its Connect `[data-fishball-connect-begin]` posting `{targetId}` to
 * SEAM_TARGETS.route.connect; the status is the card's TargetView from GET `api/fishball/targets`).
 * Every list read and every Connect press is held by the case and answered by hand (`connectScript`),
 * so the order in which reads and presses settle is chosen by the case. The rows run on card A, with a
 * second card B listed beside it that must never be touched.
 *
 * Techniques:
 * - State transition CONNECT-ST-01…: the races of F5 (read vs newer read, read vs press, settle
 *   after unmount) and the review's "only the latest press opens its page / publishes its notice";
 * - Decision table CONNECT-DT-01: press refusal × first status after the press × later status →
 *   the alert shown or gone (F6), en and zh.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { textOf } from 'fishball-test-helpers/react-shim'
import { CONNECT, DSH, FIXTURE, MULTI_SET as M, OPEN, OUTCOME, ROUTE } from './constants.mjs'
import { coreWorld, loadCorePage, settle } from './page.mjs'

const STORED = Object.freeze({ connect: { clientMetadataUrl: FIXTURE.storedMetadataUrl }, identity: { id: FIXTURE.coreId, name: FIXTURE.storedName } })
/**
 * The list answer whose card A carries Connect status (state, code). Its public state follows the
 * SEAM_TARGETS.state rule for a link not connected unless authorized (a fixture choice): authorized
 * → connected, authorizing → connecting, failed → failed, the two needs-* → not-set.
 */
const PUBLIC_OF = Object.freeze({
  [CONNECT.state.authorized]: M.state.connected, [CONNECT.state.authorizing]: M.state.connecting, [CONNECT.state.failed]: M.state.failed,
  [CONNECT.state.needsAuthorization]: M.state.notSet, [CONNECT.state.needsConfiguration]: M.state.notSet,
})
const status = (state, code = null) => ({
  status: ROUTE.ok,
  json: { version: M.snapshotVersion, targets: [M.view(M.idA, { state: PUBLIC_OF[state], connect: { state, code }, line: { kind: state, code } }), M.view(M.idB, { order: 2 })] },
  state, code,
})
const S = CONNECT.state
const C = CONNECT.configuration

/** Holds every GET of the target list and every POST of the connect route until the case answers it. */
function connectScript(world) {
  const gets = []
  const posts = []
  const bodies = []
  const held = (list) => () => new Promise((resolve) => { list.push(resolve) })
  world.targets = held(gets)
  world.targetAnswers[M.rel.connect] = (body) => { bodies.push(body); return held(posts)() }
  return {
    gets, posts, bodies,
    async get(i, answer) { gets[i](answer); await settle() },
    async post(i, answer) { posts[i](answer); await settle() },
  }
}

export function registerConnectRaceCases() {
  const t = (id, row, title, fn) => caseTest(id, row, title, fn)
  async function pageWith(c, lang = DSH.locales[0]) {
    const world = coreWorld({ lang, core: STORED })
    const script = connectScript(world)
    const page = await loadCorePage(c, world)
    await page.open(DSH.view.page)
    const block = () => page.byAttr(M.mark.card, M.idA)[0]
    return {
      world, script, page,
      /** Card A's shown public state (the relayed `data-fishball-target-state`). */
      state: () => block()?.props[M.mark.state],
      alerts: () => (block() ? page.alerts([block()]) : []),
      press: () => page.press(page.byAttr(M.mark.begin, undefined, [block()])[0]),
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
    assert.equal(p.state(), PUBLIC_OF[S.authorized])
    await p.script.get(0, status(S.needsConfiguration, C.metadataUrlMissing))
    assert.equal(p.state(), PUBLIC_OF[S.authorized], 'an older read published')
    assert.deepEqual(p.alerts(), [])
  })
  t('CONNECT-ST-01', 'newer read wins in order too', 'read 1 answers first, read 2 after: the state is read 2\'s', async (c) => {
    const p = await pageWith(c)
    await p.focus()
    await p.script.get(0, status(S.authorizing))
    await p.script.get(1, status(S.authorized))
    assert.equal(p.state(), PUBLIC_OF[S.authorized])
  })
  // MULTI-1: a card exists only once a list read answered, so "a read pending at the press" is a
  // refocus read started after the first list; its late answer must not publish over the press's follow-up.
  t('CONNECT-ST-02', 'read before a press', 'list answered → refocus read pending → Connect pressed (POST) → the older read answers failed: ignored; the read after the press answers authorized: shown', async (c) => {
    const p = await pageWith(c)
    await p.script.get(0, status(S.needsAuthorization))
    await p.focus()
    assert.equal(p.script.gets.length, 2, 'precondition: the refocus read')
    await p.press()
    assert.equal(p.script.posts.length, 1)
    await p.script.get(1, status(S.failed))
    assert.notEqual(p.state(), PUBLIC_OF[S.failed], 'a read started before the press published')
    await p.script.post(0, { status: ROUTE.ok, json: { outcome: OUTCOME.authorized } })
    assert.equal(p.script.gets.length, 3, 'no read after the press')
    await p.script.get(2, status(S.authorized))
    assert.equal(p.state(), PUBLIC_OF[S.authorized])
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
      t('CONNECT-DT-01', `${rule} ${lang}`, `(${lang}) press refused → first status after it → ${later.map(([s, a]) => `${s.state}${s.code ? '/' + s.code : ''}: alert ${a ? 'shown' : 'gone'}`).join(' → ')}`, async (c) => {
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
        assert.equal(p.state(), PUBLIC_OF[finalState])
        assert.ok(p.script.bodies.every((b) => b?.[M.route.targetIdField] === M.idA), 'a press for another target')
        // A different (state, code) with a code of its own (rule "another code"): the press's notice is
        // gone; the one alert left is the status's own code (the page's existing needs-configuration line).
        if (codeChange) assert.notEqual(textOf(p.alerts()[0]), pressText)
      })
    }
  }
}
