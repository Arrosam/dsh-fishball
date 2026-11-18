/** Main-pane state transitions. Each row mounts once; a header badge alone is not a connected pane. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { mountMain, world } from './cases.mjs'
import { ADMIT, ATTR, CHILD, POLISH, ROUTE, TAG, WAIT } from './constants.mjs'
import { byTag, press, textIn, withAttr } from './world.mjs'

const { en, zh } = ADMIT.langs
const failed = CHILD.notReady.find((s) => s.state === 'failed')
const checking = /checking|正在检查|检查中/i
const problem = /fail|error|unavailable|cannot|could not|couldn.t|unable|timed?\s*out|timeout|network|refus|offline|retry|try again|失败|错误|无法|超时|重试|不可用|网络/i
const row = (sdk, part, title, fn) => test(caseName(sdk, 'UDRAW-CHECK', part, title), { timeout: WAIT.testMs }, fn)

/** Hold genuine route replies at the page boundary. An abort rejects fetch; otherwise only the test releases it. */
function network() {
  const held = []
  let rule
  return {
    hold(path) { rule = { path } },
    reject(path) { rule = { path, reject: true } },
    restore() { rule = undefined },
    held,
    async intercept(path, signal, send) {
      if (path !== rule?.path) return send()
      const reject = rule.reject
      const reply = await send()
      if (reject) throw new TypeError('Network request failed')
      return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason)
        held.push(() => { signal?.removeEventListener('abort', abort); resolve(reply) })
        if (signal?.aborted) abort()
        else signal?.addEventListener('abort', abort, { once: true })
      })
    },
  }
}

async function pane(t, sdk, net = network(), { status, onCommit } = {}) {
  const { w, page } = await world(t, sdk, { host: { child: { status } }, page: { lang: en, interceptFetch: net.intercept, onCommit } })
  const view = await mountMain(page)
  return { w, page, view, net }
}
const frames = (view) => byTag(view.tree(), TAG.iframe)
const refresh = (view, lang) => byTag(view.tree(), TAG.button).find((b) => textIn(b) === POLISH.refresh[lang])
const enabled = (button) => button && !button.props.disabled && !button.props.loading && button.props['aria-disabled'] !== 'true'
const details = (view) => `${textIn(view.tree())}; frames=${JSON.stringify(frames(view).map((f) => f.props.src))}; Refresh disabled=${Object.values(POLISH.refresh).some((label) => byTag(view.tree(), TAG.button).some((b) => textIn(b) === label && !enabled(b)))}`
async function ready({ page, view, w }, lang, freshAfter = 0) {
  const matches = () => {
    const [frame] = frames(view)
    return frames(view).length === 1 && w.child.admissions.slice(freshAfter).some((a) => a.lang === lang && a.url === frame.props.src) &&
      withAttr(view.tree(), ATTR.embedState, CHILD.ready.state).some((s) => textIn(s).includes(POLISH.frameState[lang].ready)) &&
      enabled(refresh(view, lang)) && !checking.test(textIn(view.tree()))
  }
  assert.ok(await page.waitFor(matches), `expected a usable ${lang} child frame; ${details(view)}`)
}

/** Treat the first committed navigation as redemption. An unchanged mounted frame does not navigate. */
function frameHistory() {
  let previous = new Map()
  const navigations = []
  const commits = []
  return {
    navigations, commits,
    onCommit(tree, slotOf) {
      const next = new Map(byTag(tree, TAG.iframe).map((frame) => [slotOf(frame), frame.props.src]))
      for (const [slot, src] of next) if (previous.get(slot) !== src) navigations.push(src)
      commits.push([...next.values()])
      previous = next
    },
  }
}

const probeFailure = /(?:cannot|could not|couldn.t|unable to|failed to) (?:check|reach|read|load|fetch|confirm|verify|connect)|(?:check|status|connection|network|request).*(?:fail|unavailable|unknown|error|timed out)|network error|offline/i
const lifecycle = (view, state) => withAttr(view.tree(), ATTR.embedState, state).length > 0
const notClaimedCurrent = (view, state) => !lifecycle(view, state) || /last known|last reported|last confirmed|previously/i.test(textIn(view.tree()))
const statusChecks = (p) => p.page.requests.filter((r) => r.path === ROUTE.status).length
async function loseStatus(p) {
  const before = statusChecks(p)
  p.net.reject(ROUTE.status)
  assert.ok(await p.page.waitFor(() => statusChecks(p) > before, WAIT.followMs), 'no follow-up status probe')
}

export function registerCheckingCases(sdk) {
  for (const action of ['refresh', 'switch locale']) {
    row(sdk, `redeemed URL ${action}`, `${action} never commits a navigation back to a redeemed ticket, including before admission settles`, async (t) => {
      const history = frameHistory()
      const p = await pane(t, sdk, network(), history)
      await ready(p, en)
      const issued = p.w.child.admissions.length
      p.net.hold(ROUTE.admit)
      const lang = action === 'refresh' ? en : zh
      if (lang === en) await press(p.page, refresh(p.view, en))
      else p.page.setLang(lang)
      assert.ok(await p.page.waitFor(() => p.net.held.length > 0), 'no fresh admission request')
      p.net.restore(); p.net.held.forEach((release) => release())
      await ready(p, lang, issued)
      assert.equal(new Set(history.navigations).size, history.navigations.length, `a committed iframe navigation replayed a ticket: ${JSON.stringify(history.navigations)}`)
      assert.ok(history.navigations.length >= 2, 'the initial and replacement frames were not observed')
    })
  }

  row(sdk, 'outage after stopped', 'a returned stopped state becomes unverified during an outage; Refresh recovers the actual failed state and code', async (t) => {
    const stopped = CHILD.notReady.find((s) => s.state === 'stopped')
    const p = await pane(t, sdk, network(), { status: stopped })
    assert.ok(await p.page.waitFor(() => lifecycle(p.view, stopped.state)), 'no initial stopped lifecycle state')
    await loseStatus(p)
    assert.ok(await p.page.waitFor(() => probeFailure.test(textIn(p.view.tree())) && enabled(refresh(p.view, en)) &&
      !lifecycle(p.view, failed.state) && notClaimedCurrent(p.view, stopped.state)),
    `expected a readable status-check failure, not a stale or fabricated current state: ${details(p.view)}`)
    p.w.child.set(failed)
    p.net.restore()
    await press(p.page, refresh(p.view, en))
    assert.ok(await p.page.waitFor(() => lifecycle(p.view, failed.state) && withAttr(p.view.tree(), ATTR.embedCode, failed.code).length &&
      textIn(p.view.tree()).includes(POLISH.notReady.en(POLISH.frameState.en.failed)) && !probeFailure.test(textIn(p.view.tree()))), `did not recover actual state: ${details(p.view)}`)
    assert.equal(p.w.child.retries, 0, 'Refresh restarted the child rather than re-reading its state')
  })

  row(sdk, 'outage after ready', 'a status-check failure does not take down the active iframe or consume another ticket, including on probe recovery', async (t) => {
    const history = frameHistory()
    const p = await pane(t, sdk, network(), history)
    await ready(p, en)
    const [src] = history.navigations
    const commitsBefore = history.commits.length
    const issued = p.w.child.admissions.length
    await loseStatus(p)
    assert.ok(await p.page.waitFor(() => probeFailure.test(textIn(p.view.tree())) && !lifecycle(p.view, failed.state) && notClaimedCurrent(p.view, CHILD.ready.state) && enabled(refresh(p.view, en))),
      `expected a readable probe failure alongside the usable chat: ${details(p.view)}`)
    const failedChecks = statusChecks(p)
    p.net.restore()
    assert.ok(await p.page.waitFor(() => statusChecks(p) > failedChecks && !probeFailure.test(textIn(p.view.tree())), WAIT.followMs), 'no recovery after the status service returned')
    await ready(p, en)
    assert.deepEqual(history.navigations, [src], 'a background check navigated or remounted the open chat')
    assert.ok(history.commits.slice(commitsBefore).every((urls) => urls.length === 1 && urls[0] === src), 'a commit temporarily removed the active frame')
    assert.equal(p.w.child.admissions.length, issued, 'a background check minted another ticket for a usable chat')
  })

  row(sdk, 'round trip', 'loaded Fishball follows en → zh → en with a fresh usable child each time', async (t) => {
    const p = await pane(t, sdk)
    await ready(p, en)
    for (const lang of [zh, en]) {
      const before = p.w.child.admissions.length
      p.page.setLang(lang)
      await ready(p, lang, before)
    }
  })

  row(sdk, 'loading', 'switching while the initial English admission is in flight settles in Chinese', async (t) => {
    const net = network()
    net.hold(ROUTE.admit)
    const p = await pane(t, sdk, net)
    assert.ok(await p.page.waitFor(() => net.held.length), 'initial admission did not reach the page transport')
    assert.equal(frames(p.view).length, 0)
    net.restore()
    p.page.setLang(zh)
    await p.page.settle()
    net.held.forEach((release) => release())
    await ready(p, zh)
  })

  row(sdk, 'rapid', 'rapid switches settle at the last selection even after old replies arrive', async (t) => {
    const p = await pane(t, sdk)
    await ready(p, en)
    p.net.hold(ROUTE.admit)
    p.page.setLang(zh)
    assert.ok(await p.page.waitFor(() => p.net.held.length), 'the first switch did not start admission')
    for (const lang of [en, zh, en]) { p.page.setLang(lang); await p.page.settle() }
    p.net.restore()
    const before = p.w.child.admissions.length
    p.page.setLang(zh)
    await p.page.settle()
    // Deliver the older requests last, newest to oldest. No second click or reload repairs the UI.
    for (const release of [...p.net.held].reverse()) { release(); await p.page.settle() }
    await ready(p, zh, before)
  })

  row(sdk, 'child down', 'a host switch with a failed child shows its real state, code and recovery instead of checking', async (t) => {
    const p = await pane(t, sdk)
    await ready(p, en)
    p.w.child.set(failed)
    p.page.setLang(zh)
    assert.ok(await p.page.waitFor(() => withAttr(p.view.tree(), ATTR.embedState, failed.state).length &&
      withAttr(p.view.tree(), ATTR.embedCode, failed.code).length && textIn(p.view.tree()).includes(POLISH.notReady[zh](POLISH.frameState[zh].failed)) &&
      !checking.test(textIn(p.view.tree())) && !frames(p.view).length && enabled(refresh(p.view, zh)) && withAttr(p.view.tree(), ATTR.retryLink).length), details(p.view))
    await press(p.page, withAttr(p.view.tree(), ATTR.retryLink)[0])
    assert.deepEqual(p.page.navigations, [{ openBundle: CHILD.bundle }])
  })

  const checks = [
    ...[ROUTE.status, ROUTE.admit].flatMap((path) => ['reject', 'hold'].map((mode) => ({ path, mode, lang: en }))),
    { path: ROUTE.admit, mode: 'hold', lang: zh },
  ]
  for (const { path, mode, lang } of checks) {
    const opening = lang === en
    row(sdk, `${opening ? 'initial' : 'switch'} ${path} ${mode}`, `${opening ? 'fresh mount' : 'loaded en → zh'}, ${path} ${mode === 'hold' ? 'never answers' : 'rejects'}: checking ends, Refresh recovers in place`, async (t) => {
      const net = network()
      if (opening) net[mode](path)
      const p = await pane(t, sdk, net)
      const requests = p.page.requests.length
      if (!opening) {
        await ready(p, en)
        net[mode](path)
        p.page.setLang(lang)
      }
      assert.ok(await p.page.waitFor(() => p.page.requests.slice(opening ? 0 : requests).some((r) => r.path === path)), 'the pane never checked ' + path)
      const recoveredControl = () => !frames(p.view).length && !checking.test(textIn(p.view.tree())) &&
        problem.test(textIn(p.view.tree())) && enabled(refresh(p.view, lang))
      // User-facing outer budget; the product decides its own timeout and cancellation mechanism.
      assert.ok(await p.page.waitFor(recoveredControl, mode === 'hold' ? WAIT.followMs : WAIT.settleMs), `expected an explanation and enabled Refresh; ${details(p.view)}`)
      const before = p.w.child.admissions.length
      net.restore()
      await press(p.page, refresh(p.view, lang))
      await ready(p, lang, before)
      for (const release of net.held) release()
      await p.page.settle()
      await ready(p, lang, before)
    })
  }
}
