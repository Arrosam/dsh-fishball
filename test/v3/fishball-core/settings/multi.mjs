/**
 * MULTI-1 rows for core's settings page (PLAN-MULTI §3.1 "Core settings supports add/remove/edit URL,
 * per-target token entry, Connect/cancel/retry …; all actions address stable targetId"; Q01, Q04,
 * Q07; SEAM_TARGETS routes; TARGETS.credentials; HOSTED_IMPORT for the parent). Integration level:
 * core's real client.settings.js in the scripted page (page.mjs), its fetches answered by the
 * SEAM_TARGETS route table the world holds. Markers are the implementer's relayed ones (MULTI_SET.mark);
 * the token Save and the URL Save are found by behaviour (a card control enabled by the edit).
 *
 * Techniques: EP (list empty / one / several; parent vs remote card; token text classes), BVA (token
 * '' / ' ' / one character), DT (remove / URL edit × confirmed or cancelled), ST (list → add → list;
 * route unavailable → available).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { DSH, FIXTURE, HOSTED_IMPORT, MULTI_SET as M, OPEN, ROUTE, freshToken } from './constants.mjs'
import { createWorld, loadPage, settle } from './page.mjs'
import { STAND_IN } from './primitives.mjs'
import { credentialNamesOf } from '../wire/targets-oracle.mjs'

const show = (v) => JSON.stringify(v)
const A = () => M.view(M.idA)
const B = () => M.view(M.idB, { order: 2, url: M.newUrl })
const PARENT = () => M.view(M.parentId, { kind: 'parent', removable: false, urlEditable: false, order: 0 })
const rel = (path) => (f) => f.url === new URL(path, FIXTURE.base).href
const posts = (world, path) => world.fetches.filter((f) => f.method === ROUTE.post && rel(path)(f)).map((f) => JSON.parse(f.body ?? 'null'))
const ACTION_MARKS = Object.values(M.mark)

async function pageWith(t, sdk, targets, answers = {}) {
  const world = createWorld({ sdk, core: {} })
  world.targets = { version: M.snapshotVersion, targets }
  Object.assign(world.targetAnswers, answers)
  const page = await loadPage(t, world)
  await page.open(DSH.view.page)
  return page
}
const cardOf = (page, id) => page.byAttr(M.mark.card, id)[0]
const inCard = (page, id, mark) => page.byAttr(mark, undefined, [cardOf(page, id)])[0]
const buttonsIn = (page, node) => page.find((n) => n.tag === M.tag.button, [node])
const unmarked = (b) => !ACTION_MARKS.some((m) => b.props[m] !== undefined)
const dialog = (page) => page.find((n) => n.props.role === M.tag.dialog, page.all())[0]
const confirmIn = (page) => page.byAttr(M.mark.confirm, undefined, [dialog(page)]).find((n) => n.tag === M.tag.button)
const cancelIn = (page) => buttonsIn(page, dialog(page)).find((b) => b.props[M.mark.confirm] === undefined && b.props[STAND_IN.modalClose] === undefined)
const type = async (page, node, value) => { node.props.onChange?.({ target: { value }, currentTarget: { value } }); await settle() }
const secretInput = (page, id) => page.find((n) => n.tag === M.tag.input && n.props.type === M.tag.password, [cardOf(page, id)])[0]
/** The card's control a token edit enables (its own Save): unmarked, disabled before, enabled after. */
async function tokenSave(page, id, value) {
  const before = buttonsIn(page, cardOf(page, id)).filter(unmarked).map((b) => b.props.disabled === true)
  await type(page, secretInput(page, id), value)
  const after = buttonsIn(page, cardOf(page, id)).filter(unmarked)
  return after.find((b, i) => b.props.disabled !== true && before[i] === true) ?? after.find((b) => b.props.disabled !== true && b.props[M.mark.url] === undefined && page.find((n) => n.tag === M.tag.input && n.props.type === M.tag.password, [b]).length === 0)
}

export function registerMultiSettingsCases(sdk) {
  const row = (id, part, title, fn) => caseTest(sdk, id, part, title, fn)

  // ------------------------------------------------------------------ the list
  for (const [part, targets] of [['empty', []], ['one', [A()]], ['parent and two', [PARENT(), A(), B()]]]) {
    row('MULTI-SET-EP-01', part, `GET api/fishball/targets (document-relative, same-origin, no-store) → one card per target, keyed by targetId, in list order (${part})`, async (t) => {
      const page = await pageWith(t, sdk, targets)
      const read = page.world.fetches.find(rel(M.rel.list))
      assert.ok(read, 'the page did not read the target list: ' + show(page.world.fetches))
      assert.equal(read.method, ROUTE.get); assert.equal(read.credentials, ROUTE.credentials); assert.equal(read.cache, ROUTE.cache)
      assert.deepEqual(page.byAttr(M.mark.card).map((n) => n.props[M.mark.card]), targets.map((v) => v.targetId))
      assert.equal(page.byAttr(M.mark.addUrl).length, 1, 'no Add URL field'); assert.equal(page.byAttr(M.mark.add).length, 1, 'no Add control')
    })
  }
  row('MULTI-SET-EP-02', 'parent vs remote', 'the parent card (removable/urlEditable false) has no Remove and no URL field; a remote card has both; both have Connect, Retry and their own token field', async (t) => {
    const page = await pageWith(t, sdk, [PARENT(), A()])
    assert.equal(inCard(page, M.parentId, M.mark.remove), undefined, 'the parent can be removed')
    assert.equal(inCard(page, M.parentId, M.mark.url), undefined, 'the parent URL is editable')
    assert.ok(inCard(page, M.idA, M.mark.remove)); assert.ok(inCard(page, M.idA, M.mark.url))
    for (const id of [M.parentId, M.idA]) {
      assert.ok(inCard(page, id, M.mark.begin), id + ' has no Connect'); assert.ok(inCard(page, id, M.mark.retry), id + ' has no Retry')
      assert.ok(secretInput(page, id), id + ' has no token field')
    }
  })
  row('MULTI-SET-EP-03', 'unnamed', 'Q01: a target with name null shows no URL-derived name (the card text holds no hostname of its URL outside its URL field)', async (t) => {
    const page = await pageWith(t, sdk, [B()])
    const host = new URL(M.newUrl).hostname
    const card = cardOf(page, M.idB)
    const outside = page.find((n) => n.props[M.mark.url] === undefined && (n.children ?? []).some((c) => typeof c === 'string' && c.includes(host)), [card])
    assert.deepEqual(outside.map((n) => n.tag), [], 'the URL host is shown as a name')
  })
  row('MULTI-SET-ST-01', 'unavailable', 'the list route answers 503 → no card, nothing failed; it answers again → the cards appear after a re-read (window focus)', async (t) => {
    const world = createWorld({ sdk, core: {} })
    let available = false
    world.targets = () => (available ? { status: ROUTE.ok, json: { version: M.snapshotVersion, targets: [A()] } } : { status: M.http.unavailable, json: { code: M.unavailableCode } })
    const page = await loadPage(t, world)
    await page.open(DSH.view.page)
    assert.equal(page.byAttr(M.mark.card).length, 0)
    assert.deepEqual(world.failedFibers, [])
    available = true
    world.dispatchWindow(DSH.focus)
    await settle()
    assert.deepEqual(page.byAttr(M.mark.card).map((n) => n.props[M.mark.card]), [M.idA])
  })

  // ------------------------------------------------------------------ per-target token
  for (const [part, view, ref] of [
    ['remote', A, () => credentialNamesOf(A()).tokenRef],
    ['parent', PARENT, () => HOSTED_IMPORT.credentialRef],
  ]) {
    row('MULTI-SET-UC-01', part, `a token pasted in the ${part} card and saved is written with remote.credentials.set(${part === 'parent' ? 'DSH_AGENT_TOKEN' : 'FISHBALL_TARGET_TOKEN_<id>__<epoch>'}, trimmed value) only; the field is blank again; the value is never rendered, logged or fetched`, async (t) => {
      const page = await pageWith(t, sdk, [view()])
      const value = freshToken()
      const save = await tokenSave(page, view().targetId, ' ' + value + ' ')
      assert.ok(save, 'no token Save enabled by the edit')
      await page.press(save)
      assert.deepEqual(page.world.credentialSets.map((c) => [c.ref, c.value]), [[ref(), value]])
      assert.equal(secretInput(page, view().targetId)?.props.value, '', 'the token field is not blank again')
      assert.equal(page.visibleStrings().some((s) => s.includes(value)), false, 'rendered')
      assert.equal(page.world.console.some((l) => l.includes(value)), false, 'logged')
      assert.equal(page.world.fetches.some((f) => (f.body ?? '').includes(value) || f.url.includes(value)), false, 'fetched')
      assert.deepEqual(page.world.mutations, [], 'the token went into the settings')
    })
  }
  row('MULTI-SET-UC-01', 'two cards', 'a token saved in B\'s card goes only to B\'s reference, never A\'s', async (t) => {
    const page = await pageWith(t, sdk, [A(), B()])
    const value = freshToken()
    await page.press(await tokenSave(page, M.idB, value))
    assert.deepEqual(page.world.credentialSets.map((c) => c.ref), [credentialNamesOf(B()).tokenRef])
  })
  for (const [part, text] of [['empty', ''], ['one space', ' ']]) {
    row('MULTI-SET-BVA-01', part, `token text ${show(text)} → nothing written`, async (t) => {
      const page = await pageWith(t, sdk, [A()])
      const save = await tokenSave(page, M.idA, text)
      if (save !== undefined && save.props.disabled !== true) await page.press(save)
      assert.deepEqual(page.world.credentialSets, [])
    })
  }

  // ------------------------------------------------------------------ actions by targetId
  for (const [part, mark, path] of [['connect', M.mark.begin, M.rel.connect], ['retry', M.mark.retry, M.rel.retry]]) {
    row('MULTI-SET-UC-02', part, `pressing B's ${part} posts {targetId: B} to ${path} and nothing for A`, async (t) => {
      const page = await pageWith(t, sdk, [A(), B()], { [M.rel.connect]: () => ({ status: ROUTE.ok, json: { outcome: 'authorized' } }) })
      await page.press(inCard(page, M.idB, mark))
      assert.deepEqual(posts(page.world, path), [{ [M.route.targetIdField]: M.idB }])
    })
  }
  row('MULTI-SET-UC-02', 'cancel', 'a card whose control is cancel posts {targetId} to the cancel route', async (t) => {
    const page = await pageWith(t, sdk, [M.view(M.idA, { control: M.control.cancel, state: M.state.connecting, connect: { state: 'authorizing', code: null } })])
    const cancel = inCard(page, M.idA, M.mark.cancel)
    assert.ok(cancel, 'no cancel control on a pending attempt')
    await page.press(cancel)
    assert.deepEqual(posts(page.world, M.rel.cancel), [{ [M.route.targetIdField]: M.idA }])
  })
  row('MULTI-SET-UC-02', 'approval url', 'Connect answering approval-url opens it with window.open(url, "_blank", "noopener") once', async (t) => {
    const page = await pageWith(t, sdk, [A()], { [M.rel.connect]: () => ({ status: ROUTE.ok, json: { outcome: 'approval-url', url: FIXTURE.approvalUrl } }) })
    await page.press(inCard(page, M.idA, M.mark.begin))
    assert.deepEqual(page.world.opened, [[FIXTURE.approvalUrl, OPEN.target, OPEN.features]])
  })

  // ------------------------------------------------------------------ add (Q04)
  for (const [part, answer, appears] of [
    ['accepted', () => ({ status: ROUTE.ok, json: { ok: true, targetId: M.idB } }), true],
    ['duplicate', () => ({ status: M.http.conflict, json: { ok: false, code: M.refusal.targetDuplicate } }), false],
    ['insecure', () => ({ status: M.http.badRequest, json: { ok: false, code: M.code.insecure } }), false],
  ]) {
    row('MULTI-SET-ST-02', 'add ' + part, `Add posts {url}; ${appears ? 'the list is read again and the new card appears' : 'the refusal is shown (an alert) and no card is added'}`, async (t) => {
      let added = false
      const world = createWorld({ sdk, core: {} })
      world.targets = () => ({ status: ROUTE.ok, json: { version: M.snapshotVersion, targets: added ? [A(), B()] : [A()] } })
      world.targetAnswers[M.rel.add] = (body) => { const a = answer(body); added = a.status === ROUTE.ok; return a }
      const page = await loadPage(t, world)
      await page.open(DSH.view.page)
      await type(page, page.byAttr(M.mark.addUrl)[0], M.newUrl)
      await page.press(page.byAttr(M.mark.add).find((n) => n.tag === M.tag.button) ?? page.byAttr(M.mark.add)[0])
      assert.deepEqual(posts(world, M.rel.add).map((b) => b?.[M.route.fields.url]), [M.newUrl])
      assert.deepEqual(page.byAttr(M.mark.card).map((n) => n.props[M.mark.card]), appears ? [M.idA, M.idB] : [M.idA])
      if (!appears) assert.ok(page.alerts().length > 0, 'the refusal is not shown')
    })
  }

  // ------------------------------------------------------------------ remove / URL edit need confirmation (Q07)
  for (const [part, decide, confirmed] of [['confirmed', confirmIn, true], ['cancelled', cancelIn, false]]) {
    row('MULTI-SET-DT-01', 'remove ' + part, `Remove opens DSH's confirmation dialog; no {confirmed: true} is posted before the user confirms; ${confirmed ? 'confirming posts {targetId, confirmed: true} once' : 'cancelling posts none'}`, async (t) => {
      const page = await pageWith(t, sdk, [A()], { [M.rel.remove]: (b) => (b?.[M.route.fields.confirmed] === true ? { status: ROUTE.ok, json: { ok: true } } : { status: M.http.conflict, json: { ok: false, code: M.refusal.confirmationRequired } }) })
      await page.press(inCard(page, M.idA, M.mark.remove))
      assert.ok(dialog(page), 'no confirmation dialog')
      assert.deepEqual(posts(page.world, M.rel.remove).filter((b) => b?.[M.route.fields.confirmed] === true), [], 'confirmed before the user confirmed')
      await page.press(decide(page))
      assert.deepEqual(posts(page.world, M.rel.remove).filter((b) => b?.[M.route.fields.confirmed] === true), confirmed ? [{ [M.route.targetIdField]: M.idA, [M.route.fields.confirmed]: true }] : [])
      assert.ok(posts(page.world, M.rel.remove).every((b) => b?.[M.route.targetIdField] === M.idA), 'a remove for another target')
    })
    row('MULTI-SET-DT-01', 'url ' + part, `editing A's URL and saving asks for confirmation; ${confirmed ? 'confirming posts {targetId: A, url, confirmed: true} once' : 'cancelling posts none confirmed'}`, async (t) => {
      const page = await pageWith(t, sdk, [A()], { [M.rel.url]: (b) => (b?.[M.route.fields.confirmed] === true ? { status: ROUTE.ok, json: { ok: true } } : { status: M.http.conflict, json: { ok: false, code: M.refusal.confirmationRequired } }) })
      const field = inCard(page, M.idA, M.mark.url)
      const before = buttonsIn(page, cardOf(page, M.idA)).filter(unmarked).map((b) => b.props.disabled === true)
      await type(page, field, M.newUrl)
      const save = buttonsIn(page, cardOf(page, M.idA)).filter(unmarked).find((b, i) => before[i] === true && b.props.disabled !== true)
      assert.ok(save, 'no URL Save enabled by the edit')
      await page.press(save)
      if (dialog(page)) await page.press(decide(page))
      else assert.fail('no confirmation dialog for a URL change')
      const confirmedPosts = posts(page.world, M.rel.url).filter((b) => b?.[M.route.fields.confirmed] === true)
      assert.deepEqual(confirmedPosts, confirmed ? [{ [M.route.targetIdField]: M.idA, [M.route.fields.url]: M.newUrl, [M.route.fields.confirmed]: true }] : [])
    })
  }
}
