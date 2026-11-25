import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromeBinary, launchChromium, sdkRuntime } from '../../../test/v2-page-cases/lite-browser.mjs'
import { FIXTURE } from './fixtures/selection-quote-host.mjs'

const HOST = Object.freeze({
  sdk: '0.2.2-rc.3', launchUrl: /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/,
  viewport: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  bootMs: 45000, shutdownMs: 3000, interactionMs: 5000,
})
const UI = Object.freeze({
  page: 'html[data-fishball-page]',
  message: '[data-chat-flow-kind="fishball-message"]',
  assistant: '[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]',
  turnToggle: 'button[data-turn-process]:not([disabled])',
  editor: '[data-composer-seat] [contenteditable="true"]',
  quote: 'button[aria-label="Quote text"]',
  attachment: '[data-composer-quote]',
  remove: 'button[aria-label="Remove quote"]',
  send: 'button[aria-label="Send message"]',
})
const TEXT = Object.freeze({
  draft: 'Draft stays intact', assistant: '雪', first: 'keep Ωmega', second: 'second line',
})
const excerpt = TEXT.first + '\n' + TEXT.second
const runtime = sdkRuntime(HOST.sdk)
const unavailable = !runtime ? 'DSH ' + HOST.sdk + ' is not installed' : !chromeBinary() ? 'no headless Chromium' : false

async function until(read, what, budget = FIXTURE.waitMs) {
  const deadline = Date.now() + budget
  do {
    const result = await read()
    if (result) return result
    await sleep(FIXTURE.pollMs)
  } while (Date.now() < deadline)
  assert.fail('Timed out waiting for ' + what)
}

async function openFishball(t) {
  const child = fork(new URL('./fixtures/selection-quote-host.mjs', import.meta.url), {
    env: { ...process.env, FBTEST_DSH_RUNTIME: runtime, DSH_TELEMETRY_DISABLED: '1' }, silent: true,
  })
  const exited = once(child, 'exit')
  let output = ''
  for (const stream of [child.stdout, child.stderr]) stream.setEncoding('utf8').on('data', chunk => { output += chunk })
  t.after(async () => {
    if (child.connected) child.disconnect()
    const kill = setTimeout(() => child.kill('SIGKILL'), HOST.shutdownMs)
    try { await exited } finally { clearTimeout(kill) }
  })
  let fixture
  child.once('message', message => { fixture = message })
  const terminal = exited.then(([code, signal]) => { throw new Error('Fixture exited (' + (code ?? signal) + '):\n' + output.replace(HOST.launchUrl, 'DSH Web started')) })
  const [, launchUrl] = await Promise.race([
    until(() => fixture && HOST.launchUrl.exec(output), 'DSH Web and the seeded transcript', HOST.bootMs), terminal,
  ])
  const { sessionId } = fixture
  const url = new URL(launchUrl)
  url.searchParams.set('lang', 'en')
  const { devtools, stop } = await launchChromium()
  t.after(stop)
  const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: tabId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (name, params) => devtools.send(name, params, tabId)
  const page = async (fn, ...args) => {
    const expression = '(' + fn + ')(' + args.map(arg => JSON.stringify(arg)).join(',') + ')'
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    return result.value
  }
  await send('Emulation.setDeviceMetricsOverride', HOST.viewport)
  const errors = []
  const off = devtools.onEvent(event => { if (event.sessionId === tabId && event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description) })
  t.after(off)
  await send('Runtime.enable')
  await send('Page.navigate', { url: url.href })
  const visible = selector => page(selector => [...document.querySelectorAll(selector)].some(element => element.checkVisibility({ visibilityProperty: true })), selector)
  const waitFor = (selector, ms) => until(() => visible(selector), selector, ms)
  await waitFor(UI.page)
  try {
    await waitFor(UI.editor)
    await waitFor(UI.message)
  } catch (error) {
    t.diagnostic(JSON.stringify(await page(() => ({ text: document.body.innerText.slice(0, 800), hiddenText: document.body.textContent.slice(-1500), htmlAttributes: document.documentElement.getAttributeNames(), editors: [...document.querySelectorAll('[contenteditable]')].map(el => el.outerHTML.slice(0, 350)), session: location.hash }))))
    t.diagnostic(JSON.stringify(errors))
    throw error
  }
  return {
    page, waitFor, visible,
    async click(selector) {
      const at = await page(selector => {
        const element = [...document.querySelectorAll(selector)].find(element => element.checkVisibility({ visibilityProperty: true }))
        if (!element) return null
        const box = element.getBoundingClientRect()
        const x = box.left + box.width / 2, y = box.top + box.height / 2
        return element.contains(document.elementFromPoint(x, y)) ? { x, y } : null
      }, selector)
      assert.ok(at, 'Control is not clickable: ' + selector)
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 })
    },
    type: text => send('Input.insertText', { text }),
    async requestWith(text) {
      return until(async () => {
        const pending = once(child, 'message')
        child.send('requests')
        const [requests] = await Promise.race([pending, terminal])
        return requests.find(request => request.sessionId === sessionId && request.last.some(message => message.role === 'user' && message.text.includes(text)))
          ?.last.findLast(message => message.role === 'user')?.text
      }, 'the Fishball model to receive the draft')
    },
  }
}

/** Set a real browser Range over visible fixture text; do not call the quote plugin or editor API. */
async function select(tab, selector, start, end = start, { collapsed = false } = {}) {
  const rangeText = await tab.page(async (selector, start, end, collapsed) => {
    const row = [...document.querySelectorAll(selector)].find(el => el.checkVisibility() && el.textContent.includes(start))
    if (!row) throw new Error('Selection source is not visible: ' + selector + ' / ' + start)
    row.scrollIntoView({ block: 'center', behavior: 'instant' })
    const nodes = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
    const point = (text, after) => {
      nodes.currentNode = row
      for (let node; (node = nodes.nextNode());) {
        const offset = node.data.indexOf(text)
        if (offset >= 0 && node.parentElement.checkVisibility()) return [node, offset + (after ? text.length : 0)]
      }
      throw new Error('No visible text node contains ' + text)
    }
    const range = document.createRange()
    range.setStart(...point(start, false))
    range.setEnd(...point(end, !collapsed))
    const selection = document.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    // Let Chromium deliver selectionchange and let React lay out the interaction before observing absence.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return selection.toString()
  }, selector, start, end, collapsed)
  if (collapsed) assert.equal(rangeText, '')
  else { assert.ok(rangeText.startsWith(start), rangeText); assert.ok(rangeText.endsWith(end), rangeText) }
}

const draftState = tab => tab.page(({ editor, attachment, quote }) => {
  const input = document.querySelector(editor)
  const quoteNodes = [...input.querySelectorAll(attachment)]
  const plain = input.cloneNode(true)
  plain.querySelectorAll(attachment).forEach(node => node.remove())
  return {
    draft: plain.textContent.trim(),
    text: quoteNodes.map(node => node.querySelector('[title]')?.getAttribute('title') ?? node.textContent),
    quoteVisible: [...document.querySelectorAll(quote)].some(el => el.checkVisibility({ visibilityProperty: true })),
  }
}, UI)

async function enterDraft(tab) {
  await tab.click(UI.editor)
  await tab.type(TEXT.draft)
  await until(async () => (await draftState(tab)).draft === TEXT.draft, 'the draft to appear')
}

async function attach(tab, source, first, last, expected) {
  await select(tab, source, first, last)
  await tab.waitFor(UI.quote, HOST.interactionMs)
  await tab.click(UI.quote)
  await tab.waitFor(UI.attachment)
  await tab.waitFor(UI.remove)
  assert.deepEqual(await draftState(tab), { draft: TEXT.draft, text: [expected], quoteVisible: false })
}

test('selection-to-quote in the Fishball conversation', { skip: unavailable }, async t => {
  const tab = await openFishball(t)
  await enterDraft(tab)

  await t.test('outside the transcript or at zero selection length: no Quote text action', async () => {
    await select(tab, UI.editor, TEXT.draft)
    assert.equal(await tab.visible(UI.quote), false, 'composer text is outside the transcript')
    await select(tab, UI.message, TEXT.first, TEXT.first, { collapsed: true })
    assert.equal(await tab.visible(UI.quote), false, 'a caret is not an excerpt')
    assert.deepEqual(await draftState(tab), { draft: TEXT.draft, text: [], quoteVisible: false })
  })

  await t.test('opened assistant response: one Unicode character attaches to the existing draft', async () => {
    await tab.click(UI.turnToggle)
    await tab.waitFor(UI.assistant)
    await attach(tab, UI.assistant, TEXT.assistant, TEXT.assistant, TEXT.assistant)
    await tab.click(UI.remove)
    assert.deepEqual(await draftState(tab), { draft: TEXT.draft, text: [], quoteVisible: false })
  })

  // Stock DSH excludes ordinary tool details, even when open. The Fishball bubble is the user-visible message.
  await t.test('message_user: partial multiline excerpt becomes a native quote and reaches the manager on Send', async () => {
    await attach(tab, UI.message, TEXT.first, TEXT.second, excerpt)
    await tab.click(UI.send)
    assert.equal(await tab.requestWith(TEXT.draft), TEXT.draft + '\n\n> ' + TEXT.first + '\n> ' + TEXT.second)
  })
})
