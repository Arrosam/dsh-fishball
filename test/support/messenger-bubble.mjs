/** Requirement-owned Messenger bubble vocabulary; fixture CSS is the public rc.3 host contract, not geometry. */
import assert from 'node:assert/strict'
import { loadMessenger, lastCompound, matching, winning, parseCss } from './messenger-style.mjs'
import { nodes as elements } from './dedicated-model-client.mjs'

const LONG_REPEAT = 96
export const B = Object.freeze({
  zero: 0, one: 1, repeat: LONG_REPEAT,
  own: 'fishball-bubble-test', ordinary: 'ordinary-bubble-control', name: 'Atlas 中文', seed: 'atlas',
  kinds: Object.freeze(['user', 'steering', 'context', 'turn-trigger']),
  slot: 'conversation.chat.node', header: 'conversation.session.header.actions', locale: 'chat',
  mine: '.fbm-mine', incoming: '.fbm-incoming', body: '.fbm-body', bubble: '.fbm-bubble',
  row: '[class$="_userRow"]', stack: '[class$="_userStack"]', text: '[class$="_bubble"]',
  conversation: '[data-slot="main.conversation"]', marker: '[data-fishball-messenger]',
  composer: '[data-slot="conversation.composer.bar"]',
  sizing: Object.freeze(['width', 'inline-size', 'min-width', 'min-inline-size', 'max-width', 'max-inline-size', 'align-self', 'flex', 'flex-basis']),
  hostCss: '[class$="_userRow"]{display:flex;flex-direction:column;align-items:flex-end}[class$="_userStack"]{display:flex;flex-direction:column;align-items:flex-end;min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px)*.702),82%)}[class$="_bubble"]{max-width:100%;white-space:pre-wrap;word-break:break-word}',
  texts: Object.freeze([
    ['empty boundary', ''], ['one CJK', '等'], ['reported two CJK', '等等'], ['three CJK', '等等我'],
    ['one Latin', 'a'], ['two Latin', 'OK'], ['three Latin', 'yes'], ['short Latin words', 'wait now'],
    ['mixed', '等等 OK 2分钟'], ['emoji and combining mark', '等🐟e\u0301 OK'], ['explicit newline', '等等\nwait'],
    ['long CJK', '请稍等我马上回来'.repeat(LONG_REPEAT)], ['long Latin words', 'Please wait for the next update. '.repeat(LONG_REPEAT)],
    ['long Latin token', 'abcdefghijklmnopqrstuvwxyz'.repeat(LONG_REPEAT)],
  ]),
  values: Object.freeze({ full: '100%', stretch: 'stretch', auto: 'auto', flex: 'flex', column: 'column', end: 'flex-end', horizontal: 'horizontal-tb' }),
  unsafeSpace: Object.freeze(['nowrap', 'pre']), unsafeWord: Object.freeze(['keep-all']),
  zeroWidths: Object.freeze(['0', '0px', 'auto']), naturalWidths: Object.freeze(['auto', 'fit-content', 'max-content']),
  neutral: Object.freeze(['initial', 'inherit', 'unset', 'revert', 'revert-layer']),
})

/** Match only this known public DOM vocabulary; no attempt to model a browser selector engine or layout. */
export function onTarget(rules, target, ancestors = []) {
  const atoms = new Set([...ancestors, target])
  return matching(rules, atoms).filter((match) => {
    const last = lastCompound(match.selector)
    return last === target || (last === '*' && match.selector.trim() !== '*')
  })
}
export const valueOf = (matches, property) => winning(matches, (decls) => decls[property])?.value
export const hostRules = () => parseCss(B.hostCss)
export const mineMatches = (rules, target) => onTarget(rules, target, target === B.mine ? [] : [B.mine])
export const currentValue = (rules, target, property) => valueOf([...onTarget(hostRules(), target), ...mineMatches(rules, target)], property)
export const hasFullWidth = (matches) => [B.values.full, B.values.stretch].includes(valueOf(matches, 'width')) || [B.values.full, B.values.stretch].includes(valueOf(matches, 'inline-size')) || valueOf(matches, 'align-self') === B.values.stretch

/** This adapter extends the existing VM loader only at DSH's documented slot/React/locale boundaries. */
export function bubbleClient() {
  const entries = []
  const calls = []
  const effects = []
  const noop = () => undefined
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: (initial) => ({ current: initial }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
    useEffect: (fn) => effects.push(fn), useLayoutEffect: (fn) => effects.push(fn),
    useMemo: (fn) => fn(), useCallback: (fn) => fn,
  }
  const stock = B.kinds.map((key) => ({
    options: { name: B.slot, key, locale: B.locale, priority: B.zero },
    component: function StockRow(props) {
      calls.push(props)
      return React.createElement('section', { 'data-stock-kind': key, node: props.node, attachments: props.attachments }, props.node.data.text)
    },
  }))
  const slots = {
    entries: (name) => [...stock, ...entries].filter((entry) => entry.options.name === name),
    register(options, component) {
      const entry = { options, component }; entries.push(entry)
      return () => { const index = entries.indexOf(entry); if (index >= B.zero) entries.splice(index, B.one) }
    },
    inject(_name, factory) {
      const result = factory()
      const cleanup = typeof result === 'function' ? [result] : result == null ? [] : [...result]
      return () => { for (const dispose of cleanup.reverse()) dispose?.() }
    },
  }
  const host = loadMessenger(undefined, {
    require: (name) => { assert.equal(name, 'react', 'browser half depends only on its public React face'); return React },
    ctx: { slots, locale: { register: noop, bind: () => (key) => key } },
    config: { useAssistantSessionId: () => B.own },
  })
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand)
    if (node == null || typeof node !== 'object') return node
    return typeof node.type === 'function' ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children) } }
  }
  function render(key, props) {
    const entry = entries.find((item) => item.options.name === B.slot && item.options.key === key)
    assert.ok(entry, 'public input occupant exists for ' + key)
    const tree = expand(React.createElement(entry.component, props))
    // No fake refs or geometry: browser-only grouping effects intentionally do not run in this adapter.
    effects.length = B.zero
    return tree
  }
  return { host, entries, calls, render }
}
export const hasClass = (tree, classSelector) => elements(tree, (node) => node.props.className?.split(/\s+/).includes(classSelector.slice(B.one)))
export const stockText = (tree) => elements(tree, (node) => node.props['data-stock-kind'] !== undefined).map((node) => node.props.children.flat().join(''))
export const sourceOf = (incoming = false) => incoming ? { kind: 'agent-message', author: { kind: 'session', name: B.name, seed: B.seed } } : { kind: 'user' }
export const propsOf = (text, sessionId = B.own, incoming = false) => ({ sessionId, node: { data: { text, source: sourceOf(incoming) } }, attachments: [{ name: '鱼.txt', type: 'text/plain' }], useSessionStatus: () => undefined })
