import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { runInNewContext } from 'node:vm'
import { dshPackageDir } from 'fishball-test-helpers/dsh'
import { PAGE_CLIENT } from './support/page-files.mjs'

const id = 'MSG-PTC'
const UI = Object.freeze({
  source: PAGE_CLIENT,
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
  bubbleAttr: 'data-fishball-message',
})

const HOST = Object.freeze({
  conversation: 'dsh-client-ui-conversation',
  runCode: 'run_code', result: 'tool/result', turn: 1, step: 1, retryStep: 2,
  rejectedId: 'rejected-direct-message', secondNestedId: 'program-call:ptc:2',
  rejection: Object.freeze({ name: 'ToolNotFoundError', code: 'UNKNOWN_TOOL' }),
  rejectionText: 'Error: unknown tool "message_user": only `run_code` is callable directly — call `message_user` from inside a `run_code` program instead',
  approvalRejection: Object.freeze({ name: 'ApprovalError', code: 'APPROVAL_REJECTED' }),
  approvalRejectionText: 'Error: the user rejected tool "message_user"',
  programDescription: 'Send the update to the user',
  shown: JSON.stringify({ shown: true }),
})
const conversationClient = join(dshPackageDir(HOST.conversation), 'lib', 'client.js')
const sdkTest = { skip: !existsSync(conversationClient) && 'Installed DSH has no conversation client' }

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
  return { id: node.id, text: renderBubble({ Bubble, MarkdownText }, node) }
}

function renderBubble({ Bubble, MarkdownText }, node) {
  const bubble = Bubble({ node, t: (key) => key })
  assert.ok(Object.hasOwn(bubble.props, UI.bubbleAttr), 'the chat slot must render a Fishball message bubble')
  const [markdown] = bubble.children
  assert.equal(markdown.type, MarkdownText)
  return markdown.props.text
}

function event(type, data) { return { type, seq: 1, data: { name: UI.tool, ...data } } }

function direct(id, message) {
  return event(UI.direct, { callId: id, arguments: JSON.stringify({ message }) })
}

function nested(type, id, message) {
  return event(type, { parentCallId: UI.parent, subCallId: id, arguments: { message } })
}

caseTest(id, 'projection', 'message_user projects one ordinary or nested dispatch bubble, with no duplicates or blanks', async (t) => {
  const page = await openPage(t)
  assert.deepEqual(bubbleOf(page, direct(UI.directId, UI.directText)), { id: UI.directId, text: UI.directText })
  assert.deepEqual(bubbleOf(page, nested(UI.nested, UI.nestedId, UI.nestedText)), { id: UI.nestedId, text: UI.nestedText })
  assert.equal(bubbleOf(page, nested(UI.settled, UI.nestedId, UI.nestedText)), null, 'settlement must not start a duplicate bubble')
  assert.equal(bubbleOf(page, direct(UI.directId, UI.blank)), null, 'blank direct call must have no bubble')
  assert.equal(bubbleOf(page, nested(UI.nested, UI.nestedId, UI.blank)), null, 'blank nested call must have no bubble')
})

// DSH owns matching, replay, and incremental updates. The view sink only exposes the visible
// slot output; keeping hidden nodes in the assembler is not the same as rendering a bubble.
async function openConversation(t) {
  const file = conversationClient
  const require = createRequire(file)
  const modules = {
    '@deepseek-ai/cordis': require('@deepseek-ai/cordis'),
    '@deepseek-ai/dsh-client-store': { notifySubscribers: (listeners) => listeners.forEach(listener => listener()) },
    react: { createContext: () => ({}), memo: (view) => view, forwardRef: (view) => view },
    zod: require('zod'),
  }
  let sdk
  runInNewContext(await readFile(file, UI.encoding), {
    window: { __ModuleLoader__: { load: ({ factory }) => { sdk = factory((name) => modules[name] ?? {}) } } },
  })
  const page = await openPage(t)
  const events = new sdk.ConversationEventRegistry({ effect: (mount) => mount() })
  t.after(events.register(page.definition))
  const target = page.definition.target
  const nodeSnapshot = () => {
    const nodes = new Map()
    const collect = (items) => {
      for (const node of items) nodes.set(node.key, node)
      return [...nodes.values()]
    }
    return {
      empty: [],
      replace: ({ nodes: replacement }) => { nodes.clear(); return collect(replacement) },
      apply: ({ upserts }) => collect(upserts),
    }
  }
  const assembler = new sdk.ConversationNodeAssembler(events, { entries: () => [{ target, create: nodeSnapshot }] })
  assembler.activateTarget(target)
  return {
    replay: (entries) => { assembler.replaceWindow(entries, false); assembler.flush() },
    append: (entry) => { assembler.append(entry); assembler.flush() },
    bubbles: () => Array.from(assembler.snapshot(target)).filter(node => node.visibility !== 'hidden')
      .map(node => ({ id: node.id, text: renderBubble(page, node) })),
  }
}

function sessionWindow() {
  let seq = 0
  const entry = (type, data, surface = {}) => ({ type: 'event', event: { type, seq: seq++, time: seq, data, ...surface } })
  const call = (name, callId, args, step = HOST.step) => entry(UI.direct, {
    turn: HOST.turn, step, name, callId, arguments: JSON.stringify(args),
  })
  const result = (started, text, error) => {
    const { event: { seq, data: { callId, turn, step } } } = started
    return entry(HOST.result, {
      turn, step,
      message: { id: callId + '-result', role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId,
        content: [{ type: 'text', text }], isError: error !== undefined },
      ...(error ? { error } : {}),
    }, { surfaceOp: 'append', sourceEventSeqs: [seq] })
  }
  const program = (ids, message, step = HOST.step) => {
    const code = ids.map(() => 'await tools.' + UI.tool + '(' + JSON.stringify({ message }) + ')').join('; ')
    const started = call(HOST.runCode, UI.parent, { code, description: HOST.programDescription }, step)
    const dispatches = ids.flatMap((subCallId) => {
      const payload = { rootCallId: UI.parent, parentCallId: UI.parent, subCallId, name: UI.tool, arguments: { message } }
      return [entry(UI.nested, payload), entry(UI.settled, { ...payload, isError: false, content: [{ type: 'text', text: HOST.shown }] })]
    })
    return [started, ...dispatches, result(started, '')]
  }
  return { call, result, program }
}

function rejectedThenRetried() {
  const { call, result, program } = sessionWindow()
  const rejected = call(UI.tool, HOST.rejectedId, { message: UI.nestedText })
  return [rejected, result(rejected, HOST.rejectionText, HOST.rejection), ...program([UI.nestedId], UI.nestedText, HOST.retryStep)]
}

for (const [mode, deliver] of [
  ['live settlement', (page, entries) => entries.forEach(page.append)],
  ['history replay', (page, entries) => page.replay(entries)],
]) {
  caseTest(id, mode, 'a PTC-rejected direct send followed by the same nested send shows one bubble on ' + mode, sdkTest, async (t) => {
    const page = await openConversation(t)
    deliver(page, rejectedThenRetried())
    assert.deepEqual(page.bubbles(), [{ id: UI.nestedId, text: UI.nestedText }], 'only the nested send is visible')
  })
}

function nativeTranscript({ call, result }, outcome, error) {
  const started = call(UI.tool, UI.directId, { message: UI.directText })
  return [started, result(started, outcome, error)]
}

const nativeBubble = [{ id: UI.directId, text: UI.directText }]
const settledCases = [
  ['one successful native call', (window) => nativeTranscript(window, HOST.shown), nativeBubble],
  ['a dispatched native call refused by approval',
    (window) => nativeTranscript(window, HOST.approvalRejectionText, HOST.approvalRejection), nativeBubble],
  ['one successful nested call', ({ program }) => program([UI.nestedId], UI.nestedText),
    [{ id: UI.nestedId, text: UI.nestedText }]],
  ['two successful nested calls with identical text', ({ program }) => program([UI.nestedId, HOST.secondNestedId], UI.nestedText),
    [UI.nestedId, HOST.secondNestedId].map(id => ({ id, text: UI.nestedText }))],
]
for (const [scenario, transcript, expected] of settledCases) {
  caseTest(id, scenario, 'renders the right number of message bubbles for ' + scenario, sdkTest, async (t) => {
    const page = await openConversation(t)
    const entries = transcript(sessionWindow())
    for (const entry of entries) page.append(entry)
    assert.deepEqual(page.bubbles(), expected, 'live transcript')
    page.replay(entries)
    assert.deepEqual(page.bubbles(), expected, 'replayed transcript')
  })
}
