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
      text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200), html: content ? content.innerHTML.replace(/ class="[^"]*"/g, '').slice(0, 400) : null,
      visible: el.checkVisibility(), folded: el.hasAttribute(P.folded), inConversation: Boolean(el.closest(P.conversation)),
      inProcess: Boolean(el.closest(P.processBody) || el.hasAttribute(P.processMember)), bubble: Boolean(el.querySelector(P.bubble)),
      before: pick(el, '::before'), after: pick(el, '::after'), inner: pick(content),
    }
  })
  const controls = [...document.querySelectorAll(P.control)].map((el) => ({ turn: el.getAttribute(P.controlAttr), open: el.hasAttribute(P.open), disabled: el.disabled }))
  const html = document.documentElement
  return { page: html.hasAttribute(P.pageMark), brand: html.getAttribute(P.brandAttr), rows, controls, folded: document.querySelectorAll('[' + P.folded + ']').length, href: location.href }
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

/** One tab on the world's DSH web origin, logged in as its owner. */
export async function openDsh(h, route = PAGE.root) {
  const { devtools } = await chromium()
  const { targetId } = await devtools.send('Target.createTarget', { url: PAGE.blank })
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  const [name, ...value] = h.cookie.split(';')[0].split('=')
  await devtools.send('Network.enable', {}, sessionId)
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
    close: () => devtools.send('Target.closeTarget', { targetId }).catch(() => {}),
  }
  await tab.navigate(route)
  return tab
}
