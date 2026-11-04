/**
 * Independent offline integration: execute the public Messenger module through existing VM harness,
 * render its registered input occupants, and assert host props/content/delegation. NOT browser geometry.
 * BVA: 0/1/2/3 glyphs for CJK/Latin. EP: words, CJK, mixed/emoji/combining/newline, long prose/token.
 * DT: own/ordinary x user/steering/context/trigger; ST: short -> long -> short; look on/off/on.
 * Existing pile-disclosure.integration.test.mjs supplies the unchanged disclosure state regressions.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { B, bubbleClient, hasClass, propsOf, stockText } from './support/messenger-bubble.mjs'

const withClient = (run) => {
  const client = bubbleClient()
  const look = client.host.apply()
  try { run(client) } finally { look.dispose() }
}
const forwarded = (client, kind, props) => {
  const tree = client.render(kind, props)
  assert.equal(client.calls.at(-B.one).node, props.node, 'host gets the identical node object, including Unicode and source')
  assert.equal(client.calls.at(-B.one).attachments, props.attachments, 'attachments are handed through unchanged')
  assert.equal(client.calls.at(-B.one).sessionId, props.sessionId, 'session identity is handed through unchanged')
  assert.equal(client.calls.at(-B.one).useSessionStatus, props.useSessionStatus, 'host hooks are not replaced')
  assert.deepEqual(stockText(tree), [props.node.data.text], 'stock row receives complete text without injected breaks or truncation')
  return tree
}

describe('Messenger bubble: public input-slot integration (offline, no layout)', () => {
  for (const kind of B.kinds.slice(B.zero, B.one + B.one)) for (const [partition, text] of B.texts) {
    it('MBW-I01 BVA/EP ' + kind + ': ' + partition, () => withClient((client) => {
      const tree = forwarded(client, kind, propsOf(text))
      assert.equal(hasClass(tree, B.mine).length, B.one, 'own user input retains its right-side Messenger wrapper')
      assert.equal(hasClass(tree, B.incoming).length, B.zero, 'not recast as an incoming message')
    }))
  }

  for (const kind of B.kinds) it('MBW-I02 DT R3 ordinary session delegates ' + kind + ' without Messenger wrappers', () => withClient((client) => {
    const tree = forwarded(client, kind, propsOf(B.texts[B.one + B.one][B.one], B.ordinary))
    assert.equal(tree.type, 'section', 'ordinary session renders the unchanged stock root, not an extra layout wrapper')
    assert.equal(hasClass(tree, B.mine).length + hasClass(tree, B.incoming).length, B.zero)
  }))

  for (const kind of B.kinds.slice(B.one + B.one)) it('MBW-I03 EP incoming ' + kind + ' keeps its existing author bubble and host row', () => withClient((client) => {
    const tree = forwarded(client, kind, propsOf('等等 Atlas OK 🐟', B.own, true))
    assert.equal(hasClass(tree, B.incoming).length, B.one)
    assert.equal(hasClass(tree, B.body).length, B.one)
    assert.equal(hasClass(tree, B.bubble).length, B.one)
    assert.equal(hasClass(tree, B.mine).length, B.zero)
  }))

  it('MBW-I04 ST short -> long -> short: rendering never caches truncated or manually line-broken content', () => withClient((client) => {
    for (const text of ['等等', 'Please wait 中文 '.repeat(B.repeat), 'OK']) forwarded(client, B.kinds[B.zero], propsOf(text))
  }))

  it('MBW-I05 AC4/AC5: registrations stay at existing chat/header slots, never composer/pile or a replacement reply renderer', () => withClient((client) => {
    const input = client.entries.filter((entry) => entry.options.name === B.slot)
    assert.deepEqual(input.map((entry) => entry.options.key).sort(), [...B.kinds].sort())
    for (const entry of input) {
      assert.equal(entry.options.locale, B.locale, 'stock host locale injection is preserved')
      assert.ok(entry.options.priority < B.zero, 'existing stock-delegating input shadow priority is retained')
    }
    for (const entry of client.entries) assert.ok([B.slot, B.header].includes(entry.options.name), 'no composer/pile registration or reply replacement')
  }))
})
