import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setImmediate as settle } from 'node:timers/promises'
import { createBrowserSandbox } from '../../../test/support/browser-sandbox.mjs'
import { createReactShim, findAll } from '../../../test/support/rp-recommend.mjs'

const HOST = {
  origin: 'https://fishball.test/', lang: 'en', page: 'fishball-page', session: 'manager',
  main: 'main.conversation', slot: 'conversation.chat.node', primitives: '@deepseek-ai/dsh-client-ui-primitives',
  turn: 8, nextTurn: 9, toolCall: 'tool/call', send: 'message_user', callSeq: 12, firstStep: 1,
  attr: {
    slot: 'data-slot', kind: 'data-chat-flow-kind', part: 'data-chat-group-part', turn: 'data-chat-turn',
    process: 'data-turn-process', open: 'data-open', expanded: 'aria-expanded', hidden: 'hidden',
    group: 'data-step-process', activity: 'data-process-activity', body: 'data-step-process-body',
    pending: 'data-pending-steering', echo: 'data-submission-echo', bubble: 'data-fishball-message',
  },
}
const COPY = {
  prompt: 'Please look up the build status.', followup: 'Only tell me if it passed.',
  work: 'Checking the current build.', summary: 'The build has passed.', bubble: 'Build passed.',
  reasoning: 'Check the latest run.', group: 'Called tools', lookup: 'get_build_status',
  blank: ' \n\t ', markdown: '**Build passed.**',
}
const chunk = new URL('../ui/fishball-page/client.js', import.meta.url)
const noop = () => {}
const subscribe = () => noop
const tKey = (key) => key
const { attr } = HOST
const bubbleSelector = '[' + attr.bubble + ']'

// The shared browser sandbox intentionally has no DOM. Add just the transcript-facing DOM and
// batch mutations at a microtask checkpoint, including mutations made by the loaded page.
function transcriptDom(browser) {
  const observers = new Set()
  function record(mutation) {
    for (const observer of observers) {
      const { target, options } = observer
      if (target !== mutation.target && (!options.subtree || !target.contains(mutation.target))) continue
      if (!options[mutation.type] || (mutation.type === 'attributes' && options.attributeFilter
        && !options.attributeFilter.includes(mutation.attributeName))) continue
      const records = observer.records
      if (!records.length) queueMicrotask(() => { if (records.length) observer.callback(records.splice(0)) })
      records.push(mutation)
    }
  }
  class Element {
    nodeType = 1
    children = []
    parentElement = null
    constructor(tag, attrs = {}, text = '') { this.tag = tag; this.attrs = new Map(Object.entries(attrs)); this.text = text }
    get disabled() { return this.hasAttribute('disabled') }
    get textContent() { return this.text + this.children.map(node => node.textContent).join('') }
    getAttribute(name) { return this.attrs.get(name) ?? null }
    hasAttribute(name) { return this.attrs.has(name) }
    setAttribute(name, value) {
      this.attrs.set(name, String(value))
      record({ type: 'attributes', target: this, attributeName: name })
    }
    removeAttribute(name) {
      if (this.attrs.delete(name)) record({ type: 'attributes', target: this, attributeName: name })
    }
    toggleAttribute(name, on = !this.hasAttribute(name)) {
      if (on && !this.hasAttribute(name)) this.setAttribute(name, '')
      if (!on) this.removeAttribute(name)
      return on
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)) }
    matches(selectors) {
      return selectors.split(',').some(selector => {
        const part = selector.trim()
        const tag = part.match(/^[\w-]+/)?.[0]
        if (tag && tag !== this.tag) return false
        return [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, name, value]) =>
          value === undefined ? this.hasAttribute(name) : this.getAttribute(name) === value)
      })
    }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [...child.matches(selector) ? [child] : [], ...child.querySelectorAll(selector)])
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
    insertBefore(node, before = null) {
      node.remove()
      this.children.splice(before === null ? this.children.length : this.children.indexOf(before), 0, node)
      node.parentElement = this
      record({ type: 'childList', target: this, addedNodes: [node], removedNodes: [] })
      return node
    }
    append(...nodes) { for (const node of nodes) this.insertBefore(node) }
    remove() {
      const parent = this.parentElement
      if (parent === null) return
      parent.children.splice(parent.children.indexOf(this), 1)
      this.parentElement = null
      record({ type: 'childList', target: parent, addedNodes: [], removedNodes: [this] })
    }
  }
  const html = new Element('html', { lang: HOST.lang })
  html.lang = HOST.lang
  const body = new Element('body')
  const main = new Element('main', { [attr.slot]: HOST.main })
  html.append(body); body.append(main)
  Object.assign(browser.document, {
    documentElement: html, body, querySelector: html.querySelector.bind(html), querySelectorAll: html.querySelectorAll.bind(html),
  })
  Object.assign(browser.sandbox, {
    Node: { ELEMENT_NODE: 1 }, Element, CSS: { supports: () => false },
    MutationObserver: class {
      records = []
      constructor(callback) { this.callback = callback }
      observe(target, options) { Object.assign(this, { target, options }); observers.add(this) }
      disconnect() { this.records.length = 0; observers.delete(this) }
    },
  })
  browser.window.matchMedia = () => ({ matches: false })
  return { main, element: (tag, attrs, text) => new Element(tag, attrs, text) }
}

// DSH owns event replay, group-tree placement, native seats and Markdown. Feed the published
// event and slot surfaces; this fixture doesn't boot a Host or run real Markdown parsing.
function openPage(t) {
  const browser = createBrowserSandbox({ lang: HOST.lang, baseURI: HOST.origin,
    fetch: async () => ({ ok: true, json: async () => ({ sessionId: HOST.session }) }) })
  const { main, element } = transcriptDom(browser)
  const shim = createReactShim({ stale: noop })
  const { React } = shim
  const MarkdownText = ({ text }) => {
    const bold = /^\*\*(.+)\*\*$/.exec(text)
    return React.createElement('p', null, bold ? React.createElement('strong', null, bold[1]) : text)
  }
  const modules = { react: React, [HOST.primitives]: { MarkdownText, FISH_LOGO_PATH: '', FISH_LOGO_VIEWBOX: { width: 1, height: 1 } } }
  const definitions = new Set()
  const slots = new Map()
  const disposers = []
  const ctx = {
    effect: (mount) => disposers.push(mount()),
    locale: { bind: () => tKey, subscribe },
    slots: {
      inject: (_slot, register) => register(),
      register: ({ name, key }, component) => {
        if (name === HOST.slot) { slots.set(key, component); return () => slots.delete(key) }
        return noop
      },
    },
    uiConversation: { events: { register: (definition) => { definitions.add(definition); return () => definitions.delete(definition) } } },
    uiSession: { adapter: { current: { subscribe, getSnapshot: () => ({ key: HOST.session }) } } },
    sessions: { list: { subscribe, getSnapshot: () => ({ byId: { [HOST.session]: {} } }) } },
    shortcuts: { catalog: { subscribe, getSnapshot: () => [] }, config: { getSnapshot: () => ({ status: 'ready' }) } },
    layout: { selectPanel: noop },
  }
  t.after(() => { for (const dispose of disposers.reverse()) dispose(); browser.clearTimers() })
  browser.run(readFileSync(chunk, 'utf8'), chunk.pathname)
  const registration = browser.registrations.find(({ id }) => id === HOST.page)
  assert.ok(registration, 'Fishball page did not register')
  registration.factory(name => modules[name]).apply(ctx)

  function seat(kind, turn = HOST.turn, attrs = {}, text) {
    return element('div', { [attr.kind]: kind, [attr.turn]: String(turn), ...attrs }, text)
  }
  function fragment(node) {
    if (typeof node === 'string') return element('span', {}, node)
    const dom = element(node.tag, node.props)
    dom.append(...node.children.map(fragment))
    return dom
  }
  function deliver(call, processBody) {
    const location = { kind: 'step', turn: { turn: HOST.turn }, step: { step: HOST.firstStep } }
    const start = { event: call, location }
    for (const definition of definitions) {
      const matcher = definition.match
      const hit = typeof matcher === 'function' ? matcher(call) : matcher[call.type]?.(call)
      if (!hit) continue
      const state = definition.start({}, { ...start, ...hit })
      const node = definition.buildViewNode({ ...hit, key: call.data.callId, start, state, current: new Map() })
      if (node === null || node === undefined || node.visibility === 'hidden') continue
      const Component = slots.get(node.kind)
      assert.ok(Component, 'Dispatched chat node did not register a renderer')
      const row = seat(node.kind, node.location.turn.turn)
      shim.mount(node.key, () => React.createElement(Component, { node, t: tKey }))
      const rendered = shim.tree()
      assert.ok(findAll(rendered, node => node.tag === 'p').length, 'Reply did not delegate to Markdown presentation')
      row.append(...rendered.map(fragment))
      shim.unmountRoot(node.key)
      const parent = node.groupTree === 'turn' ? main : processBody
      parent.append(row)
    }
  }
  return { main, element, seat, deliver }
}

const call = (message, seq = HOST.callSeq) => ({ type: HOST.toolCall, seq,
  data: { name: HOST.send, callId: 'call-' + seq, arguments: JSON.stringify({ message }) } })
const shown = (node) => node !== null && !node.hasAttribute(attr.hidden) && (node.parentElement === null || shown(node.parentElement))

function turn(page, message = COPY.markdown) {
  const { main, seat, element, deliver } = page
  const input = seat('user', HOST.turn, {}, COPY.prompt)
  const reply = (text) => seat('assistant-step', HOST.turn, { [attr.part]: 'response' }, text)
  const work = reply(COPY.work)
  const answer = reply(COPY.summary)
  const reasoning = seat('assistant-step', HOST.turn, { [attr.part]: 'reasoning' }, COPY.reasoning)
  const group = element('div', { [attr.group]: '', [attr.turn]: String(HOST.turn) })
  const process = element('button', { [attr.activity]: 'tool', [attr.expanded]: 'false' }, COPY.group)
  const body = element('div', { [attr.body]: '', [attr.hidden]: 'until-found' })
  const tool = (name) => seat('tool-call', HOST.turn, {}, name)
  group.append(process, body)
  body.append(reasoning, tool(COPY.lookup))
  const native = element('button', { [attr.process]: String(HOST.turn) })
  const setOuter = (open) => { native.toggleAttribute(attr.open, open); native.setAttribute(attr.expanded, String(open)) }
  const start = () => main.append(input, work, group)
  const dispatch = () => {
    if (message === null) return
    body.append(tool(HOST.send))
    deliver(call(message), body)
  }
  const steer = () => main.append(seat('steering', HOST.turn, {}, COPY.followup))
  const finish = ({ interleaved = false, open = false, disabled = false } = {}) => {
    // A committed steering row forces the native outer control open without an actual disclosure.
    setOuter(open || interleaved)
    if (interleaved || disabled) native.setAttribute('disabled', '')
    if (interleaved) native.removeAttribute(attr.expanded)
    main.insertBefore(seat('turn-process'), work).append(native)
    main.append(answer)
  }
  return { dispatch, start, steer, finish, setOuter, work, answer, process }
}

function assertVisibleReply(page, { work, answer }, phase, { final = true } = {}) {
  const bubbles = page.main.querySelectorAll(bubbleSelector)
  assert.deepEqual(bubbles.filter(shown).map(row => row.querySelector('strong')?.textContent), [COPY.bubble],
    phase + ': the nonblank dispatched message is the one visible Markdown bubble')
  const replies = final ? [work, answer] : [work]
  assert.deepEqual(replies.filter(shown).map(row => row.textContent), [],
    phase + ': ordinary assistant Markdown must stay hidden when process was not expanded by the user')
}

for (const [placement, interleaved] of [['queued', false], ['steered', true]]) {
  for (const phase of ['model', 'tool']) {
    test('message_user is the only visible reply with a ' + placement + ' follow-up during ' + phase, async (t) => {
      const page = openPage(t)
      const fixture = turn(page)
      fixture.start()
      // During tool work the call is already dispatched; during model streaming it arrives later.
      if (phase === 'tool') fixture.dispatch()
      await settle()
      assert.equal(shown(fixture.work), false, 'streaming assistant text should start hidden')
      if (interleaved) {
        const echo = page.element('div', { [attr.pending]: 'true', [attr.echo]: 'true' }, COPY.followup)
        page.main.append(echo)
        await settle()
        assert.equal(shown(fixture.work), false, 'pending steering must not reveal streaming text')
        echo.remove()
        fixture.steer()
      }
      // DSH does not render a queued transcript echo; a new Turn claims it after this one closes.
      if (phase === 'model') fixture.dispatch()
      await settle()
      assertVisibleReply(page, fixture, 'running', { final: false })
      fixture.finish({ interleaved })
      if (!interleaved) page.main.append(page.seat('user', HOST.nextTurn, {}, COPY.followup))
      await settle()
      assert.equal(fixture.process.getAttribute(attr.expanded), 'false', 'Called tools remains collapsed')
      assertVisibleReply(page, fixture, 'settled')
    })
  }
  test('message_user is the only visible reply when history reloads after a ' + placement + ' follow-up', async (t) => {
    const page = openPage(t)
    const fixture = turn(page)
    fixture.start()
    fixture.dispatch()
    if (interleaved) fixture.steer()
    fixture.finish({ interleaved })
    if (!interleaved) page.main.append(page.seat('user', HOST.nextTurn, {}, COPY.followup))
    await settle()
    assertVisibleReply(page, fixture, 'replayed transcript')
  })
}

test('explicitly expanding and collapsing the native process reveals and refolds assistant Markdown', async (t) => {
  const page = openPage(t)
  const fixture = turn(page)
  fixture.start(); fixture.dispatch(); fixture.finish()
  await settle()
  assertVisibleReply(page, fixture, 'collapsed')
  fixture.setOuter(true)
  await settle()
  assert.ok([fixture.work, fixture.answer].every(shown), 'expanded process reveals both assistant replies')
  assert.equal(page.main.querySelectorAll(bubbleSelector).filter(shown).length, 1)
  fixture.setOuter(false)
  await settle()
  assertVisibleReply(page, fixture, 'recollapsed')
})

test('updates reply visibility when the existing native control changes only aria-expanded', async (t) => {
  const page = openPage(t)
  const fixture = turn(page)
  fixture.start(); fixture.dispatch(); fixture.steer(); fixture.finish({ interleaved: true })
  await settle()
  assertVisibleReply(page, fixture, 'forced open without a disclosure')

  // DSH may update whether a native control has expandable content without replacing it.
  const control = page.main.querySelector('button[' + attr.process + ']')
  control.setAttribute(attr.expanded, 'true')
  await settle()
  assert.ok([fixture.work, fixture.answer].every(shown), 'existing open control with expandable content reveals both replies')
  control.removeAttribute(attr.expanded)
  await settle()
  assertVisibleReply(page, fixture, 'disclosure absent again')
})

for (const [description, message] of [['no message_user call', null], ['only blank message_user', COPY.blank]]) {
  test('keeps the native text fallback after steering with ' + description, async (t) => {
    const page = openPage(t)
    const fixture = turn(page, message)
    fixture.start(); fixture.dispatch(); fixture.steer(); fixture.finish({ interleaved: true })
    await settle()
    assert.equal(page.main.querySelectorAll(bubbleSelector).length, 0, 'no visible message bubble was dispatched')
    assert.equal(shown(fixture.answer), true, 'native fallback reply remains visible')
  })
}

test('preserves the native reveal on an ordinary stopped turn', async (t) => {
  const page = openPage(t)
  const fixture = turn(page)
  fixture.start(); fixture.dispatch(); fixture.finish({ open: true, disabled: true })
  await settle()
  assert.ok([fixture.work, fixture.answer].every(shown), 'stopped process leaves its assistant replies visible')
  assert.equal(page.main.querySelectorAll(bubbleSelector).filter(shown).length, 1)
})
