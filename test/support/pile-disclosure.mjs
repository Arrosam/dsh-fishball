/** Requirement-owned fixtures and public host/client adapter; no implementation helpers are imported. */
import assert from 'node:assert/strict'
import { UI, clientHarness, nodes, textOf } from './dedicated-model-client.mjs'
import { MODEL_CASE } from './dedicated-model.mjs'
import { sleep } from './util.mjs'

export const D = Object.freeze({
  zero: 0, one: 1, two: 2, many: 12,
  timeoutMs: 3000, pollMs: 10, frameMs: 250,
  slot: 'fishball-pile', dock: 'conversation.input.dock',
  own: UI.fishball, ordinary: UI.ordinary,
  headings: Object.freeze({ pending: /Waiting for you/i, grants: /Standing grants/i }),
  action: Object.freeze({ allow: /^Allow once$/, reject: /^Reject$/, revoke: /^Revoke$/, back: /^Back$/ }),
  attr: Object.freeze({ row: 'data-fishball-row', detail: 'data-fishball-detail' }),
  names: Object.freeze(['Atlas task', 'Boreal task', 'Cedar task']),
  expiresMs: 3600000, command: 'echo disclosure ', why: 'The agent needs this command',
  note: 'Please review this permission.', escape: 'Escape',
})
export const request = (index = D.zero) => ({
  requestId: 'apr_disclosure_' + index, callId: 'call_disclosure_' + index,
  sessionId: 'session_disclosure_' + index, title: D.names[index] ?? 'Task ' + index,
  kind: 'asked', toolName: 'fbtest_ask', arguments: JSON.stringify({ text: D.command + index }),
  argumentsStatus: 'complete', why: D.why, since: Date.now() + index,
  note: D.note, quotes: [], thread: [],
})
export const grant = (index = D.zero) => ({
  grantId: 'gnt_disclosure_' + index, sessionId: 'session_grant_' + index,
  title: 'Grant task ' + index, toolName: 'bash', kind: 'prefix', prefix: D.command + index,
  expiresAt: Date.now() + D.expiresMs, uses: index, status: 'active',
})
const event = () => ({ stopPropagation() {}, preventDefault() {}, nativeEvent: { isComposing: false }, target: { closest: () => null } })
export const visible = (tree) => {
  if (Array.isArray(tree)) return tree.map(visible)
  if (tree == null || typeof tree !== 'object') return tree
  if (tree.props?.hidden || tree.props?.['aria-hidden'] === true || tree.props?.style?.display === 'none') return null
  return { ...tree, props: { ...tree.props, children: visible(tree.props?.children) } }
}
export const controls = (tree, label) => nodes(visible(tree), (node) => typeof node.props?.onClick === 'function' && label.test(textOf(node).trim()))
export const marked = (tree, attribute) => nodes(visible(tree), (node) => node.props?.[attribute] !== undefined)

export class PileClient {
  static async create(options = {}) {
    const client = new PileClient()
    client.h = await clientHarness(options)
    client.snapshot = { ...client.h.state(MODEL_CASE.selection), features: { approvals: true, messages: true }, pile: [], grants: [] }
    return client
  }
  async mount(patch = {}, sessionId = D.own) {
    await this.push(patch)
    const entry = this.h.registrations.find((item) => item.id === D.slot && item.name === D.dock)
    assert.ok(entry, 'existing host dock registration is available')
    this.tree = await this.h.render(entry.Component, { sessionId })
    return this.settle()
  }
  async settle() { await sleep(D.frameMs); this.tree = await this.h.flush(); return this.tree }
  async push(patch) { this.snapshot = { ...this.snapshot, ...patch }; this.tree = await this.h.emitSnapshot(this.snapshot); return this.tree }
  header(kind) {
    const matches = controls(this.tree, D.headings[kind]).filter((node) => node.type === 'button' || node.props?.role === 'button')
    assert.equal(matches.length, D.one, kind + ' has exactly one accessible title control')
    return matches[D.zero]
  }
  expanded(kind, expected) { assert.equal(this.header(kind).props['aria-expanded'], expected, kind + ' aria-expanded') }
  count(kind, expected) { assert.match(textOf(this.header(kind)), new RegExp('[(（]\\s*' + expected + '\\s*[)）]'), kind + ' count stays current') }
  async click(node) { assert.ok(node, 'target control exists'); assert.notEqual(node.props?.disabled, true); const result = node.props.onClick(event()); this.tree = await this.h.flush(); return { result } }
  async toggle(kind) { await this.click(this.header(kind)); return this.settle() }
  rows() { return marked(this.tree, D.attr.row) }
  details() { return marked(this.tree, D.attr.detail) }
  button(label, scope = this.tree) { const matches = controls(scope, label); assert.ok(matches.length, 'action exists: ' + label); return matches[D.zero] }
  async detail(index = D.zero) { await this.click(this.rows()[index]); return this.settle() }
  async escape() { const root = this.details()[D.zero]; assert.ok(root); root.props.onKeyDown?.({ ...event(), key: D.escape }); return this.settle() }
  dispose() { this.h.dispose() }
}
export async function withPile(run, options = {}) {
  const client = await PileClient.create(options)
  try { await run(client) } finally { client.dispose() }
}
export { UI, nodes, textOf }
