/**
 * DSH's real web UI of a booted world in headless Chromium (fishball-test-helpers/browser's shared
 * browser), logged in with the boot's owner cookie. Everything read is DSH's public chat markup
 * (data-chat-flow-kind, data-chat-turn, data-chat-group-part, button[data-turn-process] with data-open /
 * disabled, the step-process body, the scrollport [data-conversation-scroll], DSH's "Load earlier"
 * control) and fishball-page's published hooks (<html data-fishball-page>, the fishball-message row,
 * its div[data-fishball-message] bubble, data-fishball-folded); no product file is read. Input is
 * trusted (DevTools Input.dispatchMouseEvent).
 *
 * Copied, not imported (the independence rule forbids reaching another package's tests): the tab
 * opening (cookie, viewport, DevTools events) follows fishball-integration-page-stream's
 * tests/support/page.mjs `openPage`; the snapshot, viewport, gap and aiming probes are the old
 * test/v3/fishball-core/message-user/page.mjs. A candidate for fishball-test-helpers.
 */
import { sharedBrowser } from 'fishball-test-helpers/browser'
import { sleep } from 'fishball-test-helpers/wait'

/** Harness values of the driver (none is a product oracle). */
const DRIVER = Object.freeze({
  blank: 'about:blank', viewport: Object.freeze({ width: 1280, height: 900 }),
  budgetMs: 20000, pollMs: 150, aimTries: 40, exceptionChars: 400,
  /** Trusted wheel input toward the top: steps, pixels per step, pause between steps. */
  wheel: Object.freeze({ steps: 80, delta: 800, pauseMs: 50 }),
  exceptionEvent: 'Runtime.exceptionThrown',
})

/**
 * The label a DSH history control shows. DSH 0.2.2-rc.3 renders every state's label (Load earlier,
 * Loading earlier, …) inside the one button and hides all but the current one (aria-hidden, visibility
 * hidden); 0.2.2-rc.1 renders only the current label. Spliced into the page probes below as SHOWN_LABEL.
 */
function shownLabel(button) {
  const spans = [...button.children].filter((c) => c.tagName === 'SPAN')
  const live = spans.filter((s) => s.getAttribute('aria-hidden') !== 'true')
  return (live.length > 0 ? live.map((s) => s.textContent).join('') : button.textContent).trim()
}
const withLabel = (fn) => String(fn).replace('SHOWN_LABEL', String(shownLabel))

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
  return { page: html.hasAttribute(P.pageMark), rows, controls, folded: document.querySelectorAll('[' + P.folded + ']').length, href: location.href }
})

/** PAGING: the scrollport, every message row's top relative to it, and DSH's "Load earlier" control. */
const VIEWPORT = withLabel(function viewport(P) {
  const label = SHOWN_LABEL
  const scroller = document.querySelector(P.scroller)
  if (!scroller) return { missing: true }
  const top = scroller.getBoundingClientRect().top
  const messages = [...document.querySelectorAll('[' + P.kind + '="' + P.messageKind + '"]')].map((el) => {
    const r = el.getBoundingClientRect()
    return { text: el.textContent.replace(/\s+/g, ' ').trim(), y: r.top - top, height: r.height, visible: el.checkVisibility() }
  })
  const older = [...document.querySelectorAll('button')].find((b) => P.loadOlder.includes(label(b)))
  return { scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, messages, older: older ? { disabled: older.disabled, text: label(older) } : null }
})

/**
 * PAGING-GAP: every hidden assistant reply seat: its own box, and the gap between the nearest visible
 * rows around it, measured with the seat in place and again with every seat taken out of the document
 * (put back in the same task, so nothing renders in between).
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

/** The centre of a control, once it is the topmost element there: DSH's turn control of `turn` (scrolled into view), or "Load earlier". */
const AIM = withLabel(function aim(P, turn) {
  const label = SHOWN_LABEL
  const button = turn === null
    ? [...document.querySelectorAll('button')].find((b) => P.loadOlder.includes(label(b)))
    : document.querySelector(P.control + '[' + P.controlAttr + '="' + turn + '"]')
  if (!button) return { missing: true }
  if (turn !== null) button.scrollIntoView({ block: 'center', behavior: 'instant' })
  const r = button.getBoundingClientRect()
  const x = r.x + r.width / 2
  const y = r.y + r.height / 2
  const hit = document.elementFromPoint(x, y)
  return { x, y, onTarget: Boolean(hit && button.contains(hit)), cover: hit && !button.contains(hit) ? hit.outerHTML.replace(/ class="[^"]*"/g, '').slice(0, 160) : null }
})

/** The scrollport's centre (where wheel input is sent). */
const SCROLLER_POINT = String(function scrollerPoint(P) {
  const r = document.querySelector(P.scroller)?.getBoundingClientRect()
  return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 200), scrollTop: document.querySelector(P.scroller).scrollTop } : null
})

/**
 * One logged-in tab on the world's DSH origin at `route`. `selectors` are DSH's and the page's markup
 * words (the caller's constants). Uncaught page exceptions are recorded with their script URL.
 */
export async function openDsh(h, route, selectors) {
  const { devtools } = await sharedBrowser()
  const { targetId } = await devtools.send('Target.createTarget', { url: DRIVER.blank })
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  const exceptions = []
  const off = devtools.onEvent((event) => {
    if (event.sessionId !== sessionId || event.method !== DRIVER.exceptionEvent) return
    const d = event.params.exceptionDetails
    exceptions.push({ text: String(d.exception?.description ?? d.text).slice(0, DRIVER.exceptionChars), url: d.url ?? d.stackTrace?.callFrames?.[0]?.url ?? null })
  })
  const [name, ...value] = h.cookie.split(';')[0].split('=')
  await devtools.send('Network.enable', {}, sessionId)
  await devtools.send('Runtime.enable', {}, sessionId)
  await devtools.send('Network.setCookie', { name, value: value.join('='), url: h.origin }, sessionId)
  await devtools.send('Emulation.setDeviceMetricsOverride', { ...DRIVER.viewport, deviceScaleFactor: 1, mobile: false }, sessionId)
  const evaluate = async (fn, ...args) => {
    const result = await devtools.send('Runtime.evaluate', { expression: '(' + fn + ')(' + args.map((a) => JSON.stringify(a)).join(',') + ')', awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
    return result.result.value
  }
  const mouse = async (at) => { for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 }, sessionId) }
  /** A trusted click on a control AIM finds (a turn's, or "Load earlier" for null): true, or why not. */
  const clickAimed = async (turn) => {
    let at
    for (let i = 0; i < DRIVER.aimTries; i++) {
      at = await evaluate(AIM, selectors, turn)
      if (at.missing) return 'no control ' + (turn ?? 'Load earlier')
      if (at.onTarget) { await mouse(at); return true }
      await sleep(DRIVER.pollMs)
    }
    return 'covered by ' + at?.cover
  }
  const tab = {
    snapshot: () => evaluate(SNAPSHOT, selectors),
    /** Polls the snapshot until `test(snapshot)`; answers the last snapshot either way. */
    async until(test, budgetMs = DRIVER.budgetMs) {
      const start = Date.now()
      let last
      for (;;) {
        try { last = await tab.snapshot() } catch { last = undefined }
        if (last && test(last)) return last
        if (Date.now() - start > budgetMs) return last
        await sleep(DRIVER.pollMs)
      }
    },
    reload: () => devtools.send('Page.reload', {}, sessionId),
    /** A trusted click on DSH's own turn-process control of `turn`. */
    clickControl: (turn) => clickAimed(String(turn)),
    /** A trusted click on DSH's own "Load earlier" control. */
    clickLoadOlder: () => clickAimed(null),
    exceptions: () => [...exceptions],
    viewport: () => evaluate(VIEWPORT, selectors),
    gaps: () => evaluate(GAPS, selectors),
    /**
     * One trusted wheel step toward the top of the scrollport: the distance it asked to scroll (its delta,
     * capped by the distance left to the top), or 0 when there is no scrollport or it is at the top.
     */
    async wheelUp() {
      const at = await evaluate(SCROLLER_POINT, selectors)
      if (!at || at.scrollTop <= 0) return 0
      await devtools.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: -DRIVER.wheel.delta }, sessionId)
      await sleep(DRIVER.wheel.pauseMs)
      return Math.min(DRIVER.wheel.delta, at.scrollTop)
    },
    /** Trusted wheel input on the scrollport until it is at the top (or the step budget runs out). */
    async scrollToTop() {
      for (let i = 0; i < DRIVER.wheel.steps && (await tab.wheelUp()); i++) { /* one step each */ }
      return (await evaluate(SCROLLER_POINT, selectors))?.scrollTop <= 0
    },
    close: () => { off(); return devtools.send('Target.closeTarget', { targetId }).catch(() => {}) },
  }
  await devtools.send('Page.navigate', { url: h.origin + route }, sessionId)
  return tab
}