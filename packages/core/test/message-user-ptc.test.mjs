import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const UI = Object.freeze({
  source: new URL('../ui/fishball-page/client.js', import.meta.url),
  encoding: 'utf8',
  bubbleSlot: 'conversation.chat.node',
  tool: 'message_user',
  direct: 'tool/call',
  nested: 'tool/ptc-dispatch-start',
  settled: 'tool/ptc-dispatch',
  parent: 'program-call',
  directId: 'direct-message',
  nestedId: 'program-call:ptc:1',
  directText: 'Native **message**',
  nestedText: 'PTC **message**',
  blank: '  \t  ',
  origin: 'https://fishball.test/',
  noSession: 503,
})

const noop = () => {}
const subscribe = () => noop

/** Mount the classic page module on inert browser ports, capturing only its conversation plug-in. */
async function openPage(t) {
  let plugin, definition, Bubble
  const element = { setAttribute: noop, removeAttribute: noop, toggleAttribute: noop }
  const document = {
    documentElement: element, baseURI: UI.origin, body: {}, adoptedStyleSheets: [],
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  }
  const react = { createElement: (type, props, ...children) => ({ type, props, children }), useMemo: (build) => build() }
  const MarkdownText = () => {}
  const primitives = { MarkdownText, FISH_LOGO_PATH: '', FISH_LOGO_VIEWBOX: { width: 1, height: 1 } }
  const modules = { react, '@deepseek-ai/dsh-client-ui-primitives': primitives }
  const window = {
    location: new URL(UI.origin),
    __ModuleLoader__: { load: ({ factory }) => { plugin = factory((name) => modules[name]) } },
    addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false }),
  }
  class CSSStyleSheet { cssRules = []; insertRule() {} }
  class MutationObserver { observe() {} disconnect() {} }
  runInNewContext(await readFile(UI.source, UI.encoding), {
    window, document, URL, AbortController, CSSStyleSheet, MutationObserver,
    CSS: { supports: () => false }, fetch: async () => ({ ok: false, status: UI.noSession }),
  })
  plugin.apply({
    effect: (mount) => t.after(mount()),
    slots: {
      inject: (_slot, register) => register(),
      register: ({ name }, view) => { if (name === UI.bubbleSlot) Bubble = view; return noop },
    },
    uiConversation: { events: { register: (entry) => { definition = entry; return noop } } },
    uiSession: { adapter: { current: { subscribe } } },
    sessions: { list: { subscribe } },
    shortcuts: { catalog: { subscribe } },
    locale: { bind: () => (key) => key, subscribe },
  })
  assert.ok(definition && Bubble, 'Fishball page must register the message projection and renderer')
  return { definition, Bubble, MarkdownText }
}

/** This fixture drives the host's start-match contract, not the page's private event parser. */
function bubbleOf(page, event) {
  const { definition, Bubble, MarkdownText } = page
  const match = definition.match[event.type]?.(event)
  if (match?.role !== 'start') return null
  const start = { event, location: {} }
  const state = definition.start({}, { ...match, ...start })
  const node = definition.buildViewNode({ state, start, current: new Map(), id: match.id })
  if (node === null) return null
  const bubble = Bubble({ node, t: (key) => key })
  const [markdown] = bubble.children
  assert.equal(markdown.type, MarkdownText)
  return { id: node.id, text: markdown.props.text }
}

function event(type, data) { return { type, seq: 1, data: { name: UI.tool, ...data } } }

function direct(id, message) {
  return event(UI.direct, { callId: id, arguments: JSON.stringify({ message }) })
}

function nested(type, id, message) {
  return event(type, { parentCallId: UI.parent, subCallId: id, arguments: { message } })
}

test('message_user projects one ordinary or nested dispatch bubble, with no duplicates or blanks', async (t) => {
  const page = await openPage(t)
  assert.deepEqual(bubbleOf(page, direct(UI.directId, UI.directText)), { id: UI.directId, text: UI.directText })
  assert.deepEqual(bubbleOf(page, nested(UI.nested, UI.nestedId, UI.nestedText)), { id: UI.nestedId, text: UI.nestedText })
  assert.equal(bubbleOf(page, nested(UI.settled, UI.nestedId, UI.nestedText)), null, 'settlement must not start a duplicate bubble')
  assert.equal(bubbleOf(page, direct(UI.directId, UI.blank)), null, 'blank direct call must have no bubble')
  assert.equal(bubbleOf(page, nested(UI.nested, UI.nestedId, UI.blank)), null, 'blank nested call must have no bubble')
})
