/**
 * Fishball page opens the manager only once DSH's session list carries it (dev/v2-open-to-manager),
 * black-box from the requirements R1-R8 over the offline page harness (page-open-session-page.mjs).
 *
 * R1 open lands on the route's manager (GET; POST only when GET answers null).
 * R2 no openSession until the list carries the manager; no "unavailable" because the list is late.
 * R3 the first selection happens exactly once (no re-open storm, no re-POST).
 * R4 list changes never undo the user's in-page navigation.
 * R5 only the Fishball button and Retry select the manager again.
 * R6 dispose drops the list subscription; later list changes open and fetch nothing.
 * R7 dispose while waiting for the list: no open when the row arrives.
 * R8 GET null + POST id + late list: one POST, then one open.
 *
 * Techniques: EP (equivalence partitions), BVA (boundary values), DT (decision table),
 * ST (state transitions). Each case names its technique and requirement.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadPage, settle } from './page-open-session-page.mjs'

const C = Object.freeze({
  managerId: 'session-manager-listed',
  postedId: 'session-manager-posted',
  otherIds: Object.freeze(['session-other-1', 'session-other-2', 'session-other-3']),
  unusedId: 'session-must-not-be-used',
  route: '/api/fishball/session',
  method: Object.freeze({ get: 'GET', post: 'POST' }),
  status: Object.freeze({ ok: 200, unavailable: 503, notAllowed: 405 }),
  code: Object.freeze({ unavailable: 'MANAGER_UNAVAILABLE', notAllowed: 'METHOD_NOT_ALLOWED' }),
  unavailableText: 'Fishball session unavailable',
  fishballLabel: 'Fishball',
  userPanel: 'plugins',
  // BVA on the number of list notifications after the open: none, one, many.
  notifyCounts: Object.freeze([0, 1, 50]),
  // Subscribers on DSH's session list once the page is gone (nothing but the page subscribes).
  listenersAfterDispose: 0,
})

/** Scripted responder: per-method queues of {status, body}; the last entry repeats. */
function script(plan) {
  const used = { [C.method.get]: 0, [C.method.post]: 0 }
  return ({ method }) => {
    const list = plan[method] ?? [{ status: C.status.notAllowed, body: { code: C.code.notAllowed } }]
    return list[Math.min(used[method]++, list.length - 1)]
  }
}
/**
 * The route as specified: GET reads the manager (null until one exists), POST ensures it, after
 * which GET names it. Unlike `script`, a re-read after a successful POST names the posted id.
 */
function managerRoute(initial, ensured) {
  let current = initial
  return ({ method }) => {
    // Route contract: a successful POST ensures and attaches the manager, so later GETs name it.
    if (method === C.method.post) current = ensured
    return ok(current)
  }
}
const ok = (sessionId) => ({ status: C.status.ok, body: { sessionId } })
const down = { status: C.status.unavailable, body: { code: C.code.unavailable } }

function fishballButton(page) {
  const button = page.button(C.fishballLabel)
  assert.ok(button, 'the Fishball button is rendered')
  return button
}

function assertNotUnavailable(page, when) {
  assert.ok(!page.statuses().includes(C.unavailableText), `no "${C.unavailableText}" ${when}`)
}

/** A page whose route names the manager (GET id), with the list optionally late. */
async function openedPage({ listLags = false } = {}) {
  const page = loadPage({ respond: script({ GET: [ok(C.managerId)], POST: [ok(C.unusedId)] }), listLags })
  await settle()
  if (listLags) { page.catalogue(C.managerId); await settle() }
  assert.deepEqual(page.opened, [C.managerId], 'precondition: the manager is open once')
  return page
}

describe('R1/R8 the page opens the route\'s manager', () => {
  // DT: first GET answer {id, null} x list {listed with the answer, late} -> POSTs, opened.
  const table = [
    { label: 'GET id, list on time', initial: C.managerId, listLags: false, posts: 0, opens: C.managerId },
    { label: 'GET id, list late', initial: C.managerId, listLags: true, posts: 0, opens: C.managerId },
    { label: 'GET null, list on time', initial: null, listLags: false, posts: 1, opens: C.postedId },
    { label: 'GET null, list late (R8)', initial: null, listLags: true, posts: 1, opens: C.postedId },
  ]
  for (const row of table) {
    it(`P-01 DT (R1, R2, R8): ${row.label} -> ${row.posts} POST, opens the named manager once`, async () => {
      const page = loadPage({ respond: managerRoute(row.initial, C.postedId), listLags: row.listLags })
      await settle()
      assert.ok(page.gets().length >= 1, 'the manager is read')
      assert.ok(page.fetches.every((call) => call.pathname === C.route), 'only the session route is fetched')
      assert.equal(page.posts().length, row.posts)
      if (row.listLags) {
        assert.deepEqual(page.opened, [], 'not opened before the list carries it')
        page.catalogue(row.opens)
        await settle()
      }
      assert.deepEqual(page.opened, [row.opens])
      assert.equal(page.posts().length, row.posts, 'waiting for the list never POSTs again')
      assertNotUnavailable(page, 'after the open')
      page.dispose()
    })
  }

  it('P-02 ST (R8): GET null -> one POST -> wait (list changes without the row) -> row -> one open', async () => {
    const page = loadPage({ respond: managerRoute(null, C.postedId), listLags: true })
    await settle()
    assert.equal(page.posts().length, 1)
    page.notifySessionsList(); await settle()
    page.catalogue(C.otherIds[0]); await settle()
    assert.deepEqual(page.opened, [], 'still waiting for the posted manager')
    assert.equal(page.posts().length, 1, 'list changes while waiting never POST')
    page.catalogue(C.postedId); await settle()
    assert.deepEqual(page.opened, [C.postedId])
    assert.equal(page.posts().length, 1)
    page.dispose()
  })
})

describe('R2 openSession waits for the session list', () => {
  it('P-03 ST (R2): route first -> no open, no "unavailable" -> row arrives -> opens exactly then', async () => {
    const page = loadPage({ respond: script({ GET: [ok(C.managerId)] }), listLags: true })
    await settle()
    assert.deepEqual(page.opened, [], 'openSession is not called for an unlisted id')
    assertNotUnavailable(page, 'while the list is late')
    page.catalogue(C.managerId)
    await settle()
    assert.deepEqual(page.opened, [C.managerId])
    assertNotUnavailable(page, 'after the row arrives')
    page.dispose()
  })

  it('P-04 EP (R2): list changes that do not carry the manager never open it', async () => {
    const page = loadPage({ respond: script({ GET: [ok(C.managerId)] }), listLags: true })
    await settle()
    page.notifySessionsList(); await settle()
    for (const id of C.otherIds) { page.catalogue(id); await settle() }
    page.focus(); await settle()
    assert.deepEqual(page.opened, [], 'no open while the manager is unlisted')
    assertNotUnavailable(page, 'while waiting')
    page.catalogue(C.managerId); await settle()
    assert.deepEqual(page.opened, [C.managerId], 'the first list change carrying it opens it')
    page.dispose()
  })

  it('P-05 BVA (R2): the row arrives before the route answers -> opens once the route answers', async () => {
    const page = loadPage({ respond: script({ GET: [ok(C.managerId)] }), listLags: true })
    page.catalogue(C.managerId) // before any settle: the list is ahead of the route
    await settle()
    assert.deepEqual(page.opened, [C.managerId])
    assertNotUnavailable(page, 'when the list was early')
    page.dispose()
  })

  it('P-06 ST (R2, R5): the Fishball button while the list is late does not open the unlisted manager', async () => {
    const page = loadPage({ respond: script({ GET: [ok(C.managerId)] }), listLags: true })
    await settle()
    fishballButton(page).props.onClick()
    await settle()
    assert.deepEqual(page.opened, [], 'openSession waits for the list even on an explicit action')
    page.catalogue(C.managerId); await settle()
    assert.ok(page.opened.length >= 1, 'the manager opens once listed')
    assert.ok(page.opened.every((id) => id === C.managerId))
    page.dispose()
  })
})

describe('R3 the first selection happens exactly once', () => {
  for (const listLags of [false, true]) {
    for (const count of C.notifyCounts) {
      it(`P-07 BVA (R3): ${count} list notifications after the open (list late: ${listLags}) -> 0 further opens, 0 POSTs`, async () => {
        const page = await openedPage({ listLags })
        const posts = page.posts().length
        for (let index = 0; index < count; index++) page.notifySessionsList()
        await settle()
        assert.deepEqual(page.opened, [C.managerId])
        assert.equal(page.posts().length, posts)
        page.dispose()
      })
    }
  }

  it('P-08 EP (R3): new rows, re-delivered manager row and focus never re-open or POST', async () => {
    const page = loadPage({ respond: managerRoute(null, C.postedId), listLags: true })
    await settle()
    page.catalogue(C.postedId); await settle()
    assert.deepEqual(page.opened, [C.postedId])
    for (const id of C.otherIds) { page.catalogue(id); await settle() }
    page.catalogue(C.postedId); await settle() // the manager row delivered again
    page.notifySessionsList(); await settle()
    page.focus(); await settle()
    page.focus(); await settle()
    assert.deepEqual(page.opened, [C.postedId])
    assert.equal(page.posts().length, 1)
    page.dispose()
  })
})

describe('R4 list changes leave the user\'s navigation alone', () => {
  for (const listLags of [false, true]) {
    it(`P-09 ST (R4): open -> user shows ${C.userPanel} -> list changes and focus -> panel stays (list late: ${listLags})`, async () => {
      const page = await openedPage({ listLags })
      page.showPanel(C.userPanel)
      page.notifySessionsList(); await settle()
      for (const id of C.otherIds) { page.catalogue(id); await settle() }
      page.focus(); await settle()
      assert.equal(page.panel(), C.userPanel)
      assert.deepEqual(page.opened, [C.managerId], 'no openSession from list changes')
      page.dispose()
    })
  }
})

describe('R5 explicit actions select the manager again', () => {
  it(`P-10 ST (R5): ${C.userPanel} shown -> Fishball button -> panel closed, manager is the view`, async () => {
    const page = await openedPage({ listLags: true })
    page.showPanel(C.userPanel)
    fishballButton(page).props.onClick()
    await settle()
    assert.equal(page.panel(), null, 'the Fishball button returns to the conversation')
    assert.equal(page.opened.at(-1), C.managerId, 'the manager is the selected Session')
    assert.ok(page.opened.every((id) => id === C.managerId))
    page.dispose()
  })

  it('P-11 BVA (R5): Fishball button with no panel open -> still no panel, manager is the view', async () => {
    const page = await openedPage()
    fishballButton(page).props.onClick()
    await settle()
    assert.equal(page.panel(), null)
    assert.equal(page.opened.at(-1), C.managerId)
    page.dispose()
  })

  it('P-12 ST (R5, R3): after a Fishball return, list changes still never re-open', async () => {
    const page = await openedPage({ listLags: true })
    page.showPanel(C.userPanel)
    fishballButton(page).props.onClick(); await settle()
    const opens = page.opened.length
    page.showPanel(C.userPanel)
    for (let index = 0; index < C.notifyCounts.at(-1); index++) page.notifySessionsList()
    await settle()
    assert.equal(page.opened.length, opens)
    assert.equal(page.panel(), C.userPanel)
    page.dispose()
  })

  it('P-13 ST (R5, R2): GET 503 -> Retry -> GET id with the list late -> waits, then opens once', async () => {
    const page = loadPage({ respond: script({ GET: [down, ok(C.managerId)], POST: [ok(C.unusedId)] }), listLags: true })
    await settle()
    assert.ok(page.statuses().includes(C.unavailableText), 'precondition: the route failed')
    const gets = page.gets().length
    page.retry().props.onClick()
    await settle()
    assert.ok(page.gets().length > gets, 'Retry re-reads')
    assert.deepEqual(page.opened, [], 'not opened before the list carries it')
    assertNotUnavailable(page, 'while the list is late after Retry')
    page.catalogue(C.managerId); await settle()
    assert.deepEqual(page.opened, [C.managerId])
    assert.equal(page.posts().length, 0)
    assertNotUnavailable(page, 'after the open')
    page.dispose()
  })

  it('P-14 ST (R5): GET null -> POST 503 -> Retry -> POST id (list on time) -> selects it once', async () => {
    const page = loadPage({ respond: script({ GET: [ok(null)], POST: [down, ok(C.postedId)] }) })
    await settle()
    assert.deepEqual(page.opened, [])
    page.retry().props.onClick()
    await settle()
    assert.deepEqual(page.opened, [C.postedId])
    assert.equal(page.posts().length, 2)
    page.dispose()
  })
})

describe('R6/R7 disposal', () => {
  for (const listLags of [false, true]) {
    it(`P-15 ST (R6): open -> dispose -> list changes open and fetch nothing (list late: ${listLags})`, async () => {
      const page = await openedPage({ listLags })
      page.dispose()
      assert.equal(page.listeners().sessionsList, C.listenersAfterDispose, 'no session-list subscription left')
      const fetches = page.fetches.length
      page.notifySessionsList(); await settle()
      for (const id of C.otherIds) { page.catalogue(id); await settle() }
      assert.deepEqual(page.opened, [C.managerId], 'no openSession after dispose')
      assert.equal(page.fetches.length, fetches, 'no fetch after dispose')
    })
  }

  it('P-16 ST (R7): waiting for the list -> dispose -> manager row arrives -> no open, no fetch', async () => {
    const page = loadPage({ respond: script({ GET: [ok(C.managerId)] }), listLags: true })
    await settle()
    assert.deepEqual(page.opened, [])
    page.dispose()
    assert.equal(page.listeners().sessionsList, C.listenersAfterDispose)
    const fetches = page.fetches.length
    page.catalogue(C.managerId); await settle()
    page.notifySessionsList(); await settle()
    assert.deepEqual(page.opened, [])
    assert.equal(page.fetches.length, fetches)
  })

  it('P-17 ST (R7, R8): GET null -> POST id -> dispose while waiting -> row arrives -> no open', async () => {
    const page = loadPage({ respond: managerRoute(null, C.postedId), listLags: true })
    await settle()
    assert.equal(page.posts().length, 1)
    page.dispose()
    page.catalogue(C.postedId); await settle()
    assert.deepEqual(page.opened, [])
    assert.equal(page.posts().length, 1)
  })
})
