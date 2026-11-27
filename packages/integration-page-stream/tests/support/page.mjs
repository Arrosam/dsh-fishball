/**
 * DSH's real web UI of a booted world in headless Chromium (fishball-test-helpers/browser), logged in
 * with the boot's owner cookie, with EventSource accounting from DevTools: `Network.requestWillBeSent`
 * with type EventSource opens one, `Network.loadingFinished` / `loadingFailed` ends it. DSH's composer,
 * right sidebar and file input are driven with trusted input through their public markup and English
 * labels (constants.mjs UI). Ported from the old fishball-ui/connections system.mjs and
 * fishball-core/message-user page.mjs.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sharedBrowser } from 'fishball-test-helpers/browser'
import { sleep, until } from 'fishball-test-helpers/wait'
import { BUDGET, CARRIER, PAGE, UI } from '../constants.mjs'

const SSE = Object.freeze({ data: 'data:', separator: /\r?\n\r?\n/, line: /\r?\n/, accept: 'text/event-stream', eventSource: 'EventSource' })

/** The carrier read from Node: parsed messages in order, `wait(test)`, `of(topic)`, `close()`. */
export async function openWire(h, query) {
  const controller = new AbortController()
  const res = await fetch(h.origin + CARRIER.path + query, { headers: { cookie: h.cookie, origin: h.origin, accept: SSE.accept }, signal: controller.signal })
  const wire = { status: res.status, type: res.headers.get('content-type'), messages: [] }
  const decoder = new TextDecoder()
  let buffer = ''
  const pump = (async () => {
    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true })
        const blocks = buffer.split(SSE.separator)
        buffer = blocks.pop()
        for (const block of blocks) {
          const data = block.split(SSE.line).filter((l) => l.startsWith(SSE.data)).map((l) => l.slice(SSE.data.length).replace(/^ /, '')).join('\n')
          if (data === '') continue
          try { wire.messages.push(JSON.parse(data)) } catch { wire.messages.push({ unparsable: data }) }
        }
      }
    } catch { /* aborted */ }
  })()
  wire.wait = (test, budgetMs = BUDGET.frameMs) => until(() => test(wire.messages), budgetMs, BUDGET.pollMs)
  wire.of = (topic) => wire.messages.filter((m) => m?.topic === topic)
  wire.close = async () => { controller.abort(); await pump }
  return wire
}

const AIM = String(function aim(selector, label) {
  const visible = (el) => el && el.checkVisibility() && el.getBoundingClientRect().width > 0
  let el = selector ? document.querySelector(selector) : null
  if (!el && label) {
    const all = [...document.querySelectorAll('button, [role=button], a')]
    el = all.find((b) => visible(b) && (b.getAttribute('aria-label') === label || b.textContent.trim() === label))
      ?? all.find((b) => visible(b) && b.textContent.replace(/\s+/g, ' ').trim().startsWith(label))
  }
  if (!visible(el)) return null
  const r = el.getBoundingClientRect()
  return { x: r.x + Math.min(r.width / 2, 40), y: r.y + r.height / 2 }
})
const DIALOG_CONTINUE = String(function dialogContinue(dialog, words) {
  const re = new RegExp(words)
  const b = [...document.querySelectorAll(dialog + ' button')].find((x) => re.test(x.textContent.trim()))
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
const PAGE_READY = String(function pageReady(mark, editor) { return document.documentElement.hasAttribute(mark) && Boolean(document.querySelector(editor)) })
const COMPOSER = String(function composer(editor, sending, image, sendLabel, mark) {
  const e = document.querySelector(editor)
  const send = [...document.querySelectorAll('[data-composer-card] button[aria-label]')].find((b) => b.getAttribute('aria-label') === sendLabel)
  return { canSend: Boolean(send && !send.disabled), sending: Boolean(document.querySelector(sending)), text: e ? e.textContent : null, images: document.querySelectorAll(image).length, page: document.documentElement.hasAttribute(mark) }
})

/** One logged-in tab on the world's DSH origin (at `route`) with EventSource accounting from its first request. */
export async function openPage(h, route = PAGE.root) {
  const { devtools } = await sharedBrowser()
  const { targetId } = await devtools.send('Target.createTarget', { url: PAGE.blank })
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  const live = new Map()
  const ever = []
  const consoleLines = []
  const exceptions = []
  const off = devtools.onEvent((event) => {
    if (event.sessionId !== sessionId) return
    const p = event.params
    if (event.method === 'Network.requestWillBeSent' && p.type === SSE.eventSource) { live.set(p.requestId, p.request.url); ever.push(p.request.url) }
    if (event.method === 'Network.loadingFinished' || event.method === 'Network.loadingFailed') live.delete(p.requestId)
    if (event.method === 'Runtime.consoleAPICalled') consoleLines.push({ type: p.type, text: p.args.map((a) => a.value ?? a.description ?? '').join(' ') })
    if (event.method === 'Runtime.exceptionThrown') exceptions.push(String(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).slice(0, 400))
  })
  const [name, ...value] = h.cookie.split(';')[0].split('=')
  await devtools.send('Network.enable', {}, sessionId)
  await devtools.send('Runtime.enable', {}, sessionId)
  await devtools.send('Network.setCookie', { name, value: value.join('='), url: h.origin }, sessionId)
  await devtools.send('Emulation.setDeviceMetricsOverride', { ...PAGE.viewport, deviceScaleFactor: 1, mobile: false }, sessionId)
  const evaluate = async (fn, ...args) => {
    const result = await devtools.send('Runtime.evaluate', { expression: '(' + fn + ')(' + args.map((a) => JSON.stringify(a)).join(',') + ')', awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
    return result.result.value
  }
  const mouse = async (at) => { for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 }, sessionId) }
  await devtools.send('Page.navigate', { url: h.origin + route }, sessionId)
  const page = {
    devtools, sessionId, evaluate,
    open: () => [...live.values()],
    ever: () => [...ever],
    console: () => [...consoleLines],
    exceptions: () => [...exceptions],
    /** Open EventSources: to the origin, Fishball's (its routes), and to other origins. */
    split() {
      const urls = page.open().map((u) => new URL(u))
      const same = urls.filter((u) => u.origin === h.origin)
      return { origin: same.map((u) => u.pathname + u.search), fishball: same.filter((u) => CARRIER.fishballRoutes.test(u.pathname)).map((u) => u.pathname + u.search), other: urls.filter((u) => u.origin !== h.origin).map(String) }
    },
    /** The Fishball page drawn with DSH's composer; any Preview Notice's Continue is clicked. */
    async ready() {
      const ok = await until(() => evaluate(PAGE_READY, UI.pageMark, UI.editor).catch(() => false), BUDGET.pageMs, BUDGET.pollMs * 3)
      for (let i = 0; i < UI.noticeTries; i++) {
        const at = await evaluate(DIALOG_CONTINUE, UI.dialog, UI.previewContinue.source).catch(() => null)
        if (!at) break
        await mouse(at)
        await sleep(BUDGET.settleMs / 2)
      }
      return Boolean(ok)
    },
    async click(selector, label) {
      const at = await until(() => evaluate(AIM, selector, label).catch(() => null), BUDGET.uiMs, BUDGET.pollMs * 2)
      if (!at) return false
      await mouse(at)
      return true
    },
    async openTaskBoard() {
      if (!(await page.click(null, UI.openRight))) return 'no ' + UI.openRight + ' control'
      if (!(await page.click(null, UI.taskBoard))) return 'no ' + UI.taskBoard + ' guide entry'
      return true
    },
    collapseRight: () => page.click(null, UI.collapseRight),
    async settled(test, budgetMs = BUDGET.uiMs) {
      await until(() => test(page.split()), budgetMs, BUDGET.pollMs)
      await sleep(BUDGET.quietMs)
      return page.split()
    },
    composer: () => evaluate(COMPOSER, UI.editor, UI.sending, UI.composerImage, UI.sendLabel, UI.pageMark),
    async attachImage() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), UI.tempPrefix))
      const file = path.join(dir, UI.pngName)
      fs.writeFileSync(file, Buffer.from(UI.png, 'base64'))
      const { root } = await devtools.send('DOM.getDocument', { depth: 0 }, sessionId)
      const { nodeId } = await devtools.send('DOM.querySelector', { nodeId: root.nodeId, selector: UI.fileInput }, sessionId)
      if (!nodeId) return 'no ' + UI.fileInput
      await devtools.send('DOM.setFileInputFiles', { nodeId, files: [file] }, sessionId)
      return Boolean(await until(async () => { const c = await page.composer(); return c.images > 0 && c.canSend }, BUDGET.uiMs, BUDGET.pollMs))
    },
    /** Types `text`, presses Enter: {ms, received, left, state, carries} within BUDGET.sendMs. */
    async send(text) {
      if (!(await page.click(UI.editor))) return { error: 'no composer editor' }
      await devtools.send('Input.insertText', { text }, sessionId)
      await until(async () => (await page.composer()).canSend, BUDGET.uiMs, BUDGET.pollMs)
      const before = await h.call('requestCount')
      const started = Date.now()
      await devtools.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, sessionId)
      await devtools.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId)
      const result = { received: false, left: false }
      await until(async () => {
        result.received ||= (await h.call('requestCount')) > before
        result.state = await page.composer()
        result.left = !result.state.sending && (result.state.text ?? '').trim() === ''
        return result.received && result.left
      }, BUDGET.sendMs, BUDGET.pollMs)
      result.ms = Date.now() - started
      result.carries = await h.call('requestsCarry', { from: before, text })
      return result
    },
    close: () => { off(); return devtools.send('Target.closeTarget', { targetId }).catch(() => {}) },
  }
  return page
}
