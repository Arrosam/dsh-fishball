/**
 * System level of fishball-ui.connections: a real standalone DSH (the manager world,
 * ../../fishball-core/manager/subject.mjs, extended by world-extension.mjs: core, fishball-ui and
 * fishball-taskboard installed as bundles) read two ways:
 * - the wire (R3/R4): the carrier route read as a server-sent stream from Node with the owner's
 *   cookie (`openWire`), each message parsed as JSON;
 * - the page (R1/R2/R7): DSH's real web UI in the LITE headless Chromium
 *   (../../fishball-core/message-user/page.mjs openDsh). EventSources are counted from DevTools:
 *   `Network.requestWillBeSent` with `type === 'EventSource'` opens one, `Network.loadingFinished` /
 *   `loadingFailed` ends it. DSH's composer, right sidebar and file input are driven with trusted
 *   input through their public markup and English labels.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sleep, until } from '../../../support/util.mjs'
import { openDsh } from '../../fishball-core/message-user/page.mjs'
import { BUDGET, CARRIER, UI } from './constants.mjs'

const EVENT_SOURCE = 'EventSource'
const SSE = Object.freeze({ data: 'data:', separator: /\r?\n\r?\n/, line: /\r?\n/, accept: 'text/event-stream' })

/**
 * The carrier read from Node: every message's parsed data in order (`messages`), `wait(test)` until
 * the messages satisfy `test`, `close()`. `query` is the carrier's query string (lang, tz).
 */
export async function openWire(h, query) {
  const controller = new AbortController()
  const res = await fetch(h.origin + CARRIER.path + query, { headers: { cookie: h.cookie, origin: h.origin, accept: SSE.accept }, signal: controller.signal })
  const wire = { status: res.status, type: res.headers.get('content-type'), messages: [], raw: [] }
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
          wire.raw.push(data)
          try { wire.messages.push(JSON.parse(data)) } catch { wire.messages.push({ unparsable: data }) }
        }
      }
    } catch { /* aborted */ }
  })()
  wire.wait = (test, budgetMs = BUDGET.frameMs) => until(() => test(wire.messages), budgetMs, BUDGET.pollMs)
  /** Messages of one topic. */
  wire.of = (topic) => wire.messages.filter((m) => m?.topic === topic)
  wire.close = async () => { controller.abort(); await pump }
  return wire
}

/** JS run in the page: the centre of the first element matching, or of a button whose label/text is `label`. */
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
const PAGE_READY = String(function pageReady(mark, editor) {
  return document.documentElement.hasAttribute(mark) && Boolean(document.querySelector(editor))
})
const COMPOSER = String(function composer(editor, sending, image, sendLabel) {
  const e = document.querySelector(editor)
  const send = [...document.querySelectorAll('[data-composer-card] button[aria-label]')].find((b) => b.getAttribute('aria-label') === sendLabel)
  return { canSend: Boolean(send && !send.disabled), sending: Boolean(document.querySelector(sending)), text: e ? e.textContent : null, images: document.querySelectorAll(image).length, page: document.documentElement.hasAttribute('data-fishball-page') }
})

/**
 * One logged-in tab on the world's DSH with EventSource accounting from its first request on.
 * `open()` lists the open EventSources' URLs; `ever()` every one made.
 */
export async function openPage(h) {
  const live = new Map()
  const ever = []
  const consoleLines = []
  const onEvent = (event) => {
    const p = event.params
    if (event.method === 'Network.requestWillBeSent' && p.type === EVENT_SOURCE) { live.set(p.requestId, p.request.url); ever.push(p.request.url) }
    if (event.method === 'Network.loadingFinished' || event.method === 'Network.loadingFailed') live.delete(p.requestId)
    if (event.method === 'Runtime.consoleAPICalled') consoleLines.push({ type: p.type, text: p.args.map((a) => a.value ?? a.description ?? '').join(' ') })
  }
  const tab = await openDsh(h, '/', { onEvent })
  const { devtools, sessionId, evaluate } = tab
  const mouse = async (at) => { for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 }, sessionId) }
  const page = {
    tab,
    open: () => [...live.values()],
    ever: () => [...ever],
    console: () => [...consoleLines],
    /** Open EventSources split: Fishball's (to its routes), DSH's own, and to other origins. */
    split() {
      const urls = page.open().map((u) => new URL(u))
      const sameOrigin = urls.filter((u) => u.origin === h.origin)
      return { origin: sameOrigin.map((u) => u.pathname + u.search), fishball: sameOrigin.filter((u) => /\/api\/fishball/.test(u.pathname)).map((u) => u.pathname + u.search), other: urls.filter((u) => u.origin !== h.origin).map(String) }
    },
    /** Waits until the Fishball page is drawn with DSH's composer; clicks any Preview Notice's Continue. */
    async ready() {
      const ok = await until(() => evaluate(PAGE_READY, UI.pageMark, UI.editor).catch(() => false), BUDGET.pageMs, BUDGET.pollMs * 3)
      for (let i = 0; i < 3; i++) {
        const at = await evaluate(DIALOG_CONTINUE, UI.dialog, UI.previewContinue.source).catch(() => null)
        if (!at) break
        await mouse(at)
        await sleep(BUDGET.settleMs / 2)
      }
      return Boolean(ok)
    },
    /** A trusted click on an element (selector) or a control named `label`; false when none is shown. */
    async click(selector, label) {
      const at = await until(() => evaluate(AIM, selector, label).catch(() => null), BUDGET.uiMs, BUDGET.pollMs * 2)
      if (!at) return false
      await mouse(at)
      return true
    },
    /** Opens the right sidebar's Task board tab (the expand button, then the guide entry). */
    async openTaskBoard() {
      if (!(await page.click(null, UI.openRight))) return 'no ' + UI.openRight + ' control'
      if (!(await page.click(null, UI.taskBoard))) return 'no ' + UI.taskBoard + ' guide entry'
      return true
    },
    async collapseRight() { return page.click(null, UI.collapseRight) },
    /** Waits until `test(split())` holds; answers the last split. */
    async settled(test, budgetMs = BUDGET.uiMs) {
      let last
      await until(() => { last = page.split(); return test(last) }, budgetMs, BUDGET.pollMs)
      await sleep(BUDGET.quietMs)
      return page.split()
    },
    composer: () => evaluate(COMPOSER, UI.editor, UI.sending, UI.composerImage, UI.sendLabel),
    /** Attaches the fixture PNG through the composer's file input. */
    async attachImage() {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fbtest-conn-')), UI.pngName)
      fs.writeFileSync(file, Buffer.from(UI.png, 'base64'))
      const { root } = await devtools.send('DOM.getDocument', { depth: 0 }, sessionId)
      const { nodeId } = await devtools.send('DOM.querySelector', { nodeId: root.nodeId, selector: UI.fileInput }, sessionId)
      if (!nodeId) return 'no ' + UI.fileInput
      await devtools.send('DOM.setFileInputFiles', { nodeId, files: [file] }, sessionId)
      // Ready as a user sees it: the image is in the composer and DSH's Send control is enabled (the upload finished).
      return Boolean(await until(async () => { const c = await page.composer(); return c.images > 0 && c.canSend }, BUDGET.uiMs, BUDGET.pollMs))
    },
    /**
     * Types `text` in DSH's composer and presses Enter. Answers {ms, received, left, state}: whether
     * the model received a request and the composer left its sending state (no [data-sending],
     * the editor empty) within BUDGET.sendMs.
     */
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
        const state = await page.composer()
        result.state = state
        result.left = !state.sending && (state.text ?? '').trim() === ''
        return result.received && result.left
      }, BUDGET.sendMs, BUDGET.pollMs)
      result.ms = Date.now() - started
      result.carries = await h.call('requestsCarry', { from: before, text })
      return result
    },
    close: () => tab.close(),
  }
  return page
}