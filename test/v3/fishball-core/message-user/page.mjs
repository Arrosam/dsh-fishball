/**
 * MSG-USER's browser side: the real DSH web UI of a booted manager world (../manager/subject.mjs), in the
 * LITE headless Chromium (test/v2-page-cases/lite-browser.mjs launchChromium), logged in with the boot's
 * owner cookie. Everything read is DSH's public chat markup (data-chat-flow-kind, data-chat-turn,
 * data-chat-group-part, button[data-turn-process] with data-open / disabled, the step-process body) and
 * the page's published hooks (<html data-fishball-page>, the fishball-message row, its
 * div[data-fishball-message] bubble, data-fishball-folded); no product file is read.
 */
import { launchChromium } from '../../../v2-page-cases/lite-browser.mjs'
import { sleep } from '../../../support/util.mjs'
import { PAGE } from './constants.mjs'

/** The DOM facts of the conversation, read in the page (one JSON value). */
const SNAPSHOT = String(function snapshot(P) {
  const pick = (el, pseudo) => {
    if (!el) return null
    const s = getComputedStyle(el, pseudo)
    const mask = [s.maskImage, s.webkitMaskImage].find((v) => v && v !== 'none') || 'none'
    return { content: s.content, mask: mask.slice(0, 64), backgroundImage: s.backgroundImage.slice(0, 64), backgroundColor: s.backgroundColor, borderRadius: s.borderRadius, padding: s.padding, display: s.display }
  }
  const rows = [...document.querySelectorAll(P.row)].map((el, index) => {
    const content = el.querySelector(P.content)
    const tool = el.querySelector(P.toolAttr)?.getAttribute(P.toolName) ?? null
    return {
      index, kind: el.getAttribute(P.kind), part: el.getAttribute(P.part), turn: el.getAttribute(P.turn), tool,
      text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200), length: el.textContent.length, height: el.getBoundingClientRect().height, html: content ? content.innerHTML.replace(/ class="[^"]*"/g, '').slice(0, 400) : null,
      visible: el.checkVisibility(), folded: el.hasAttribute(P.folded), inConversation: Boolean(el.closest(P.conversation)),
      inProcess: Boolean(el.closest(P.processBody) || el.hasAttribute(P.processMember)), bubble: Boolean(el.querySelector(P.bubble)),
      before: pick(el, '::before'), after: pick(el, '::after'), inner: pick(content),
    }
  })
  const controls = [...document.querySelectorAll(P.control)].map((el) => ({ turn: el.getAttribute(P.controlAttr), open: el.hasAttribute(P.open), disabled: el.disabled }))
  const html = document.documentElement
  return { page: html.hasAttribute(P.pageMark), brand: html.getAttribute(P.brandAttr), rows, controls, folded: document.querySelectorAll('[' + P.folded + ']').length, href: location.href }
})

/**
 * PAGING rows: the scrollport (DSH's [data-conversation-scroll]) and every message row's top relative to
 * it, DSH's own "Load earlier" control (found by its English label, DSH's chat.loadOlder) and whether
 * it is busy.
 */
const VIEWPORT = String(function viewport(P) {
  const scroller = document.querySelector(P.scroller)
  if (!scroller) return { missing: true }
  const top = scroller.getBoundingClientRect().top
  const messages = [...document.querySelectorAll('[' + P.kind + '="' + P.messageKind + '"]')].map((el) => {
    const r = el.getBoundingClientRect()
    return { text: el.textContent.replace(/\s+/g, ' ').trim(), y: r.top - top, height: r.height, visible: el.checkVisibility() }
  })
  const older = [...document.querySelectorAll('button')].find((b) => P.loadOlder.some((label) => b.textContent.trim() === label))
  return { scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, messages, older: older ? { disabled: older.disabled, text: older.textContent.trim() } : null }
})

/**
 * PAGING-GAP: every hidden assistant reply (assistant-step / response, not visible) among a flow's
 * rows: its own box, and the gap between the nearest visible rows around it, measured with the seat in
 * place and again with every such seat taken out of the document (then put back, in the same task, so
 * nothing renders in between). A seat that "takes no space and leaves no gap" measures the same both ways.
 */
const GAPS = String(function gaps(P) {
  const shown = (el) => el.checkVisibility() && el.getBoundingClientRect().height > 0
  const seats = [...document.querySelectorAll('[' + P.kind + '="' + P.replyKind + '"][' + P.part + '="' + P.response + '"]')].filter((el) => !el.checkVisibility())
  const around = (el) => {
    let prev = el.previousElementSibling
    while (prev && !shown(prev)) prev = prev.previousElementSibling
    let next = el.nextElementSibling
    while (next && !shown(next)) next = next.nextElementSibling
    return { prev, next }
  }
  const pairs = seats.map((el) => ({ el, ...around(el) })).filter((p) => p.prev && p.next)
  const gap = (p) => p.next.getBoundingClientRect().top - p.prev.getBoundingClientRect().bottom
  const label = (el) => (el.getAttribute(P.kind) ?? el.tagName.toLowerCase()) + ':' + el.textContent.replace(/\s+/g, ' ').trim().slice(0, 24)
  const withSeat = pairs.map(gap)
  const boxes = seats.map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim().slice(0, 24), height: r.height, width: r.width } })
  const taken = seats.map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }))
  for (const t of taken) t.el.remove()
  const withoutSeat = pairs.map(gap)
  for (const t of taken.reverse()) t.parent.insertBefore(t.el, t.next)
  return { seats: boxes, pairs: pairs.map((p, i) => ({ seat: p.el.textContent.trim().slice(0, 24), prev: label(p.prev), next: label(p.next), withSeat: withSeat[i], withoutSeat: withoutSeat[i] })) }
})

/** The "Load earlier" control's centre, once it is the topmost element there. */
const AIM_OLDER = String(function aimOlder(P) {
  const button = [...document.querySelectorAll('button')].find((b) => P.loadOlder.some((label) => b.textContent.trim() === label))
  if (!button) return { missing: true }
  const r = button.getBoundingClientRect()
  const x = r.x + r.width / 2
  const y = r.y + r.height / 2
  const hit = document.elementFromPoint(x, y)
  return { x, y, onTarget: Boolean(hit && button.contains(hit)) }
})

/** The scrollport's centre (where wheel input is sent). */
const SCROLLER_POINT = String(function scrollerPoint(P) {
  const r = document.querySelector(P.scroller)?.getBoundingClientRect()
  return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 200), scrollTop: document.querySelector(P.scroller).scrollTop } : null
})

/** The control's centre in viewport pixels, once it is the topmost element there (after scrolling). */
const AIM = String(function aim(P, turn) {
  const button = document.querySelector(P.control + '[' + P.controlAttr + '="' + turn + '"]')
  if (!button) return { missing: true }
  button.scrollIntoView({ block: 'center', behavior: 'instant' })
  const r = button.getBoundingClientRect()
  const x = r.x + r.width / 2
  const y = r.y + r.height / 2
  const hit = document.elementFromPoint(x, y)
  return { x, y, onTarget: Boolean(hit && button.contains(hit)), cover: hit && !button.contains(hit) ? hit.outerHTML.replace(/ class="[^"]*"/g, '').slice(0, 160) : null }
})

let browser = null
export async function stopBrowser() {
  const started = await browser?.catch(() => null)
  browser = null
  await started?.stop()
}
const chromium = () => (browser ??= launchChromium().then((started) => {
  if (!started) throw new Error('no Chromium binary')
  return started
}))

/**
 * One tab on the world's DSH web origin, logged in as its owner. `onEvent` sees this tab's DevTools
 * protocol events from before the first navigation (fishball-ui.connections counts EventSources).
 */
export async function openDsh(h, route = PAGE.root, { onEvent } = {}) {
  const { devtools } = await chromium()
  const { targetId } = await devtools.send('Target.createTarget', { url: PAGE.blank })
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  const [name, ...value] = h.cookie.split(';')[0].split('=')
  await devtools.send('Network.enable', {}, sessionId)
  // PAGING / STREAM rows: uncaught page exceptions, with their script URL (a page that "keeps working" throws none).
  const exceptions = []
  const offEvents = devtools.onEvent((event) => {
    if (event.sessionId !== sessionId) return
    onEvent?.(event)
    if (event.method !== 'Runtime.exceptionThrown') return
    const d = event.params.exceptionDetails
    exceptions.push({ text: String(d.exception?.description ?? d.text).slice(0, 400), url: d.url ?? d.stackTrace?.callFrames?.[0]?.url ?? null })
  })
  await devtools.send('Runtime.enable', {}, sessionId)
  await devtools.send('Network.setCookie', { name, value: value.join('='), url: h.origin }, sessionId)
  await devtools.send('Emulation.setDeviceMetricsOverride', { ...PAGE.viewport, deviceScaleFactor: 1, mobile: false }, sessionId)
  const evaluate = async (fn, ...args) => {
    const expression = '(' + fn + ')(' + args.map((a) => JSON.stringify(a)).join(',') + ')'
    const result = await devtools.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
    return result.result.value
  }
  const tab = {
    snapshot: () => evaluate(SNAPSHOT, PAGE.selectors),
    /** Polls the snapshot until `test(snapshot)`; answers the last snapshot either way. */
    async until(test, budgetMs = PAGE.budgetMs) {
      const start = Date.now()
      let last
      for (;;) {
        try { last = await tab.snapshot() } catch { last = undefined }
        if (last && test(last)) return last
        if (Date.now() - start > budgetMs) return last
        await sleep(PAGE.pollMs)
      }
    },
    async navigate(path) {
      await devtools.send('Page.navigate', { url: h.origin + path }, sessionId)
      await tab.until((s) => s.href.endsWith(path) || path === PAGE.root, PAGE.budgetMs)
    },
    async reload() { await devtools.send('Page.reload', {}, sessionId) },
    /** A trusted mouse click on DSH's own turn-process control of `turn`: true, or what kept it from being clicked. */
    async clickControl(turn) {
      let at
      for (let i = 0; i < PAGE.aimTries; i++) {
        at = await evaluate(AIM, PAGE.selectors, String(turn))
        if (at.missing) return 'no control for turn ' + turn
        if (at.onTarget) {
          for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 }, sessionId)
          return true
        }
        await sleep(PAGE.pollMs)
      }
      return 'covered by ' + at?.cover
    },
    exceptions: () => [...exceptions],
    /** The raw DevTools channel of this tab, and a page evaluation (fishball-ui.connections drives DSH's composer). */
    devtools, sessionId, evaluate,
    viewport: () => evaluate(VIEWPORT, PAGE.selectors),
    gaps: () => evaluate(GAPS, PAGE.selectors),
    /** Trusted wheel input on the scrollport until it is at the top (or the step budget runs out). */
    async scrollToTop() {
      for (let i = 0; i < PAGE.wheel.steps; i++) {
        const at = await evaluate(SCROLLER_POINT, PAGE.selectors)
        if (!at) return false
        if (at.scrollTop <= 0) return true
        await devtools.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: -PAGE.wheel.delta }, sessionId)
        await sleep(PAGE.wheel.pauseMs)
      }
      return (await evaluate(SCROLLER_POINT, PAGE.selectors))?.scrollTop <= 0
    },
    /** A trusted click on DSH's own "Load earlier" control: true, or why it could not be clicked. */
    async clickLoadOlder() {
      for (let i = 0; i < PAGE.aimTries; i++) {
        const at = await evaluate(AIM_OLDER, PAGE.selectors)
        if (at.missing) return 'no Load earlier control'
        if (at.onTarget) {
          for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 }, sessionId)
          return true
        }
        await sleep(PAGE.pollMs)
      }
      return 'Load earlier stayed covered'
    },
    close: () => { offEvents(); return devtools.send('Target.closeTarget', { targetId }).catch(() => {}) },
  }
  await tab.navigate(route)
  return tab
}