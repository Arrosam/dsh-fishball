/**
 * Independent requirement-derived black-box integration coverage.
 * AC: grants initially closed; pending initially open; each title freely toggles its whole group;
 * per-card detail stays exclusive; snapshots/counts/actions/model UI and reduced motion keep working.
 * BVA: zero/one/two/twelve entries. EP: pending/grant/mixed/ordinary; normal/reduced motion.
 * Decision table: pending open/closed x grants open/closed => independent visibility (all four rules).
 * State: default -> toggle -> inverse -> restore; close -> arrivals/removals -> reopen;
 * list -> detail -> Back/Escape/external disappearance -> list; action -> response -> snapshot.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CLICK, GRANT_API, PILE_API } from './support/constants.mjs'
import { MODEL_CASE } from './support/dedicated-model.mjs'
import { D, grant, request, withPile, textOf, nodes } from './support/pile-disclosure.mjs'

const cards = (count) => Array.from({ length: count }, (_, index) => request(index))
const grants = (count) => Array.from({ length: count }, (_, index) => grant(index))

for (const reducedMotion of [false, true]) describe('Pile groups: integration, reduced motion=' + reducedMotion, () => {
  const run = (test) => withPile(test, { reducedMotion })
  for (const count of [D.zero, D.one, D.two, D.many]) it('PD-I01 BVA: pending=' + count + ' starts open and grants start closed', () => run(async (c) => {
    await c.mount({ pile: cards(count), grants: grants(D.two) })
    if (count) { c.expanded('pending', true); c.count('pending', count) }
    else assert.equal(c.rows().length, D.zero)
    assert.equal(c.rows().length, count)
    c.expanded('grants', false); c.count('grants', D.two)
    assert.equal(nodes(c.tree, (node) => textOf(node).trim() === 'Revoke').length, D.zero, 'closed grants expose no revoke actions')
  }))

  it('PD-I09 EP: titles use keyboard-compatible button semantics and never submit the composer', () => run(async (c) => {
    await c.mount({ pile: cards(D.one), grants: grants(D.one) })
    for (const kind of Object.keys(D.headings)) {
      const title = c.header(kind)
      if (title.type === 'button') assert.equal(title.props.type, 'button', 'native title does not submit its containing composer')
      else {
        assert.equal(title.props.role, 'button'); assert.equal(title.props.tabIndex, D.zero)
        assert.equal(typeof title.props.onKeyDown, 'function', 'custom title needs native-equivalent keyboard support')
      }
      assert.notEqual(title.props.tabIndex, -D.one, 'title remains reachable by keyboard')
      assert.equal(typeof title.props['aria-expanded'], 'boolean')
    }
  }))

  it('PD-I02 DT R1-R4: whole-group visibility is independent and reversible', () => run(async (c) => {
    await c.mount({ pile: cards(D.two), grants: grants(D.two) })
    for (const [pending, standing] of [[true, false], [true, true], [false, true], [false, false], [true, false]]) {
      if (c.header('pending').props['aria-expanded'] !== pending) await c.toggle('pending')
      if (c.header('grants').props['aria-expanded'] !== standing) await c.toggle('grants')
      c.expanded('pending', pending); c.expanded('grants', standing)
      assert.equal(c.rows().length, pending ? D.two : D.zero, 'one title hides/shows all pending rows, never expands their details')
      assert.equal(c.details().length, D.zero)
      const revokes = nodes(c.tree, (node) => textOf(node).trim() === 'Revoke' && typeof node.props?.onClick === 'function')
      assert.equal(revokes.length, standing ? D.two : D.zero)
    }
  }))

  it('PD-I03 ST/BVA: folded groups keep live counts and new/updated data without reopening', () => run(async (c) => {
    await c.mount({ pile: cards(D.one), grants: grants(D.one) }); await c.toggle('pending')
    for (const count of [D.two, D.many, D.one]) {
      await c.push({ pile: cards(count), grants: grants(count) }); await c.settle()
      c.expanded('pending', false); c.expanded('grants', false)
      c.count('pending', count); c.count('grants', count); assert.equal(c.rows().length, D.zero)
    }
    const changed = { ...request(), note: 'Updated permission note', title: 'Updated task title' }
    await c.push({ pile: [changed], grants: [{ ...grant(), uses: D.two }] }); await c.settle()
    c.expanded('pending', false); c.expanded('grants', false)
    await c.toggle('pending'); assert.match(textOf(c.tree), /Updated permission note/); assert.match(textOf(c.tree), /Updated task title/)
    await c.toggle('grants'); assert.match(textOf(c.tree), /used 2 times/i)
  }))

  it('PD-I04 ST: detail is still single-card, hides other rows/grants, Back and Escape restore group states', () => run(async (c) => {
    await c.mount({ pile: cards(D.two), grants: grants(D.one) }); await c.toggle('grants')
    await c.detail(); assert.equal(c.details().length, D.one)
    assert.equal(c.rows().length, D.zero, 'list rows are hidden in a single detail')
    assert.equal(nodes(c.tree, (node) => textOf(node).trim() === 'Revoke' && typeof node.props?.onClick === 'function').length, D.zero)
    await c.click(c.button(D.action.back)); await c.settle()
    assert.equal(c.details().length, D.zero); assert.equal(c.rows().length, D.two); c.expanded('grants', true)
    await c.detail(D.one); await c.escape()
    assert.equal(c.details().length, D.zero); assert.equal(c.rows().length, D.two); c.expanded('pending', true); c.expanded('grants', true)
  }))

  it('PD-I05 ST: arrival while detail open does not open another detail; disappearing selected request returns to list', () => run(async (c) => {
    await c.mount({ pile: cards(D.two), grants: grants(D.one) }); await c.detail()
    const selected = c.details()[D.zero].props[D.attr.detail]
    await c.push({ pile: cards(D.two + D.one) }); await c.settle()
    assert.equal(c.details().length, D.one); assert.equal(c.details()[D.zero].props[D.attr.detail], selected)
    c.count('pending', D.two + D.one); assert.equal(c.rows().length, D.zero)
    await c.push({ pile: c.snapshot.pile.filter((card) => card.requestId !== selected) }); await c.settle()
    assert.equal(c.details().length, D.zero); assert.equal(c.rows().length, D.two); c.expanded('grants', false)
  }))

  for (const [action, label] of [[CLICK.allow, D.action.allow], [CLICK.reject, D.action.reject]]) it('PD-I06 EP: ' + action + ' still reaches the existing answer route after collapse/reopen', () => run(async (c) => {
    const card = request()
    await c.mount({ pile: [card] }); await c.toggle('pending'); await c.toggle('pending')
    const { result } = await c.click(c.button(label));
    assert.deepEqual(c.h.sent.at(-D.one), { pathname: PILE_API.answer, body: { requestId: card.requestId, decision: action } })
    await c.h.reply(true, { ok: true, state: { ...c.snapshot, pile: [] } }); await result
    // The public event stream is the authoritative live-data update, independent of a POST response.
    await c.push({ pile: [] }); await c.settle()
    assert.equal(c.rows().length, D.zero)
  }))

  it('PD-I07 EP: grants open, collapse, reopen then Revoke still reaches existing route and preserves pending', () => run(async (c) => {
    const standing = grant()
    await c.mount({ pile: cards(D.one), grants: [standing] }); await c.toggle('grants'); await c.toggle('grants'); await c.toggle('grants')
    const { result } = await c.click(c.button(D.action.revoke))
    assert.deepEqual(c.h.sent.at(-D.one), { pathname: GRANT_API.revoke, body: { grantId: standing.grantId } })
    await c.h.reply(true, { ok: true, state: { ...c.snapshot, grants: [] } }); await result; await c.settle()
    assert.equal(c.rows().length, D.one); c.count('pending', D.one)
  }))

  it('PD-I08 EP/DT: ordinary composer never gets Fishball groups and folding never changes model confirmation', () => run(async (c) => {
    await c.mount({ pile: cards(D.two), grants: grants(D.one), modelSelection: null })
    assert.ok(c.h.blocks.has(D.own)); await c.toggle('pending'); await c.toggle('grants'); assert.ok(c.h.blocks.has(D.own))
    await c.push({ modelSelection: MODEL_CASE.selection }); assert.equal(c.h.blocks.has(D.own), false)
    await c.mount({}, D.ordinary); assert.equal(c.rows().length, D.zero); assert.equal(c.details().length, D.zero)
    assert.equal(c.h.blocks.has(D.ordinary), false)
  }))
})
