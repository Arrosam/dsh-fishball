/**
 * Messenger look: round avatars (R7) and the footer under the reply bubble (R8).
 *
 * R7: DSH's theme turns `border-radius: 50%` into a rounded square (`*, :before, :after { corner-shape: var(--dsw-corner-shape) }`,
 * `superellipse(1.5)`). Fishball's reply avatar (the reply row's `::before`) and the sender avatars (`.fbm-avatar`) must
 * compute `corner-shape: round` (Chrome writes it `superellipse(1)`), and no other element changes its shape.
 * R8: DSH's footer under a reply (copy button, time) is its own chat row, `data-chat-flow-kind="turn-tail"`. In
 * Fishball's session its content starts at the reply bubble's left border edge, not under the avatar; in another
 * session the footer is unchanged. Node has no layout engine, so these cases check what the mounted stylesheet says;
 * the real layout and the pixels were checked in Chrome against DSH's own CSS (see the report, not part of the suite).
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | MLY-00 | EP (helpers) | -- | lastCompound, isPseudoElement, winning (important > specificity > order), pxLength and the shorthand's left side |
 * | MLY-01 | EP + BVA (specificity vs DSH's [0,0,1]) | R7 | the reply row's `::before` computes corner-shape round, keeps a circular radius, and outranks DSH's `*, :before, :after` rule |
 * | MLY-02 | EP + BVA | R7 | `.fbm-avatar` computes corner-shape round, keeps a circular radius, and outranks DSH's rule |
 * | MLY-03 | EP (what else may change) | R7 | corner-shape is declared only for avatars; `--dsw-corner-shape` is never redefined |
 * | MLY-04 | EP | R8 | the footer row's left offset equals the reply bubble's left border edge offset, and is not zero |
 * | MLY-05 ×6 | DT (marker x row kind x row part) | R8 R4 R5 | a left offset rule applies to the footer only with the marker; reply rows keep theirs; reasoning and process rows get none |
 * | MLY-06 | EP | R8 | every rule that names the footer row needs the conversation and the marker, and styles the row itself, not what is inside it |
 * | MLY-07 | ST (on, off, on, off, on) | R6 R7 R8 | the avatar and footer rules are mounted each time the look is on and gone each time it is off |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MESSENGER_LAYOUT as LAY, MESSENGER_TABLE as TBL } from './support/constants.mjs'
import { compareSpecificity, applies, isPseudoElement, lastCompound, leftDeclaration, loadMessenger, matching, mountedLook as mounted, parseCss, pxLength, selectorAtoms, shorthandLeft, specificity, winning } from './support/messenger-style.mjs'

const A = { ...TBL.atoms, ...LAY.atoms }
const atoms = (...list) => new Set(list.filter(Boolean))
/** DOM contexts as sets of simple selectors (the DSH DOM nests them in this order). */
const replyRow = (marker) => atoms(A.conversation, marker && A.marker, A.stepKind, A.reply)
const reasoningRow = (marker) => atoms(A.conversation, marker && A.marker, A.stepKind, `[data-chat-group-part="${LAY.parts.reasoning}"]`)
const tailRow = (marker) => atoms(A.conversation, marker && A.marker, A.tailKind)
const processRow = (marker) => atoms(A.conversation, marker && A.marker, A.processKind)
const bubbleOf = (marker) => new Set([...replyRow(marker), A.chatNode])
const senderAvatar = atoms(A.avatar, A.incoming, A.sender)

const isBefore = (selector) => /::?before$/.test(lastCompound(selector))
/** Matches that are about the element itself: no pseudo-element, and at least one atom (`:root` rules match everything). */
const onElement = (matches) => matches.filter((m) => !isPseudoElement(m.selector) && selectorAtoms(m.selector).length > 0)
const INSET_PROPS = ['margin-left', 'padding-left']
/** The left offset (px) a row's own rules give its content: margin-left + padding-left, each from the cascade's winner. */
function leftOffset(matches, props = INSET_PROPS) {
  return props.reduce((sum, prop) => {
    const win = winning(matches, (d) => leftDeclaration(d, prop))
    if (!win) return sum
    const px = pxLength(win.value)
    assert.ok(Number.isFinite(px), `${prop}: ${win.value} ("${win.selector}") is not a px length`)
    return sum + px
  }, 0)
}
const hasInset = (matches) => matches.some((m) => INSET_PROPS.some((prop) => leftDeclaration(m.decls, prop)))
/** A circular radius for the avatar: 50%, or at least half of its size in px. */
const isCircular = (value) => value === '50%' || pxLength(value) >= LAY.avatarSize / 2
const beatsDsh = (win) => win.important || compareSpecificity(win.specificity, LAY.dshCornerSpecificity) > 0

describe('Messenger look: round avatars and the footer under the reply bubble', () => {
  it('MLY-00 helpers: the last compound, pseudo-elements, the cascade winner and px lengths', () => {
    assert.equal(lastCompound('[a="x y"]:has(.b .c) .d>[e]::before'), '[e]::before')
    assert.equal(lastCompound('.a'), '.a')
    assert.equal(lastCompound('.a:not(.b .c)'), '.a:not(.b .c)', 'whitespace inside parentheses does not split')
    assert.equal(isPseudoElement('.a [e]::before'), true)
    assert.equal(isPseudoElement('.a:after'), true)
    assert.equal(isPseudoElement('.a:has(.b::before)'), false, 'a pseudo-element inside :has() is not the target')
    assert.equal(isPseudoElement('.a [e]'), false)
    const d = (value, important = false) => ({ x: { value, important } })
    assert.equal(winning([{ selector: '.a', decls: d('1'), order: 0 }, { selector: '.a', decls: d('2'), order: 1 }], (decls) => decls.x).value, '2', 'equal specificity: the later rule')
    assert.equal(winning([{ selector: '.a.b', decls: d('1'), order: 0 }, { selector: '.a', decls: d('2'), order: 1 }], (decls) => decls.x).value, '1', 'higher specificity beats a later rule')
    assert.equal(winning([{ selector: '.a', decls: d('1', true), order: 0 }, { selector: '#a.b', decls: d('2'), order: 1 }], (decls) => decls.x).value, '1', '!important beats specificity')
    assert.equal(winning([{ selector: '.a', decls: {}, order: 0 }], (decls) => decls.x), undefined)
    assert.equal(pxLength('36px'), 36); assert.equal(pxLength('0'), 0); assert.equal(pxLength('-6px'), -6); assert.equal(pxLength('2.5px'), 2.5)
    assert.ok(Number.isNaN(pxLength('20%')) && Number.isNaN(pxLength('2em')) && Number.isNaN(pxLength('calc(1px)')))
    assert.deepEqual(['1px', '1px 2px', '1px 2px 3px', '1px 2px 3px 4px'].map(shorthandLeft), ['1px', '2px', '2px', '4px'])
    assert.equal(leftDeclaration({ padding: { value: '18px 0 0 36px', important: false } }, 'padding-left').value, '36px')
    assert.equal(leftDeclaration({ padding: { value: '1px', important: false }, 'padding-left': { value: '5px', important: false } }, 'padding-left').value, '5px', 'a longhand wins over the shorthand')
  })

  it('MLY-01 the reply avatar (the reply row\'s ::before) is a circle, and its corner-shape outranks DSH\'s', () => {
    const { rules } = mounted()
    const before = matching(rules, replyRow(true)).filter((m) => isBefore(m.selector))
    assert.ok(before.some((m) => m.decls.content), 'precondition: the reply row draws an avatar with ::before')
    const corner = winning(before, (d) => d[LAY.corner.prop])
    assert.ok(corner, 'a ::before rule sets corner-shape: ' + JSON.stringify(before.map((m) => m.selector)))
    assert.ok(LAY.round.includes(corner.value), `corner-shape ${corner.value} is one of ${JSON.stringify(LAY.round)}`)
    assert.ok(beatsDsh(corner), `"${corner.selector}" ${specificity(corner.selector)} does not outrank DSH's ${LAY.dshCornerSpecificity} rule`)
    const radius = winning(before, (d) => d['border-radius'])
    assert.ok(radius && isCircular(radius.value), `border-radius ${radius?.value} keeps the avatar a circle`)
  })

  it('MLY-02 the sender avatar (.fbm-avatar) is a circle, and its corner-shape outranks DSH\'s', () => {
    const { rules } = mounted()
    const onAvatar = matching(rules, senderAvatar).filter((m) => lastCompound(m.selector).includes(A.avatar))
    assert.ok(onAvatar.length > 0, 'precondition: a rule is about .fbm-avatar')
    const corner = winning(onAvatar, (d) => d[LAY.corner.prop])
    assert.ok(corner, 'a rule sets corner-shape on .fbm-avatar: ' + JSON.stringify(onAvatar.map((m) => m.selector)))
    assert.ok(LAY.round.includes(corner.value), `corner-shape ${corner.value} is one of ${JSON.stringify(LAY.round)}`)
    assert.ok(beatsDsh(corner), `"${corner.selector}" ${specificity(corner.selector)} does not outrank DSH's ${LAY.dshCornerSpecificity} rule`)
    const radius = winning(onAvatar, (d) => d['border-radius'])
    assert.ok(radius && isCircular(radius.value), `border-radius ${radius?.value} keeps the avatar a circle`)
  })

  it('MLY-03 only the avatars change their corner-shape, and the theme\'s own shape is never redefined', () => {
    const { rules, style } = mounted()
    const shaped = rules.filter((r) => r.decls[LAY.corner.prop])
    assert.ok(shaped.length >= 2, 'precondition: the reply avatar and the sender avatar set corner-shape')
    for (const rule of shaped) {
      for (const selector of rule.selectors) {
        const reply = isBefore(selector) && applies(selector, replyRow(true))
        const avatar = !isPseudoElement(selector) && lastCompound(selector).includes(A.avatar)
        assert.ok(reply || avatar, `"${selector}" sets corner-shape but is not an avatar`)
      }
    }
    assert.equal(style.textContent.includes(LAY.corner.themeVar), false, `${LAY.corner.themeVar} is DSH's: the look does not write it`)
  })

  it('MLY-04 the footer row\'s left offset equals the reply bubble\'s left border edge offset', () => {
    const { rules } = mounted()
    const tail = onElement(matching(rules, tailRow(true)))
    assert.ok(hasInset(tail), 'a rule gives the footer row a left margin or padding')
    const replyOffset = leftOffset(onElement(matching(rules, replyRow(true))))
    // the bubble is the reply row's chat node child: a rule that needs the chat node is about the bubble, not the row
    const bubbleMargin = leftOffset(onElement(matching(rules, bubbleOf(true))).filter((m) => !applies(m.selector, replyRow(true))), ['margin-left'])
    const footerOffset = leftOffset(tail)
    assert.ok(replyOffset > 0, 'precondition: the reply row leaves room for the avatar on the left')
    assert.ok(footerOffset > 0, 'the footer is not under the avatar: its offset is more than 0')
    assert.equal(footerOffset, replyOffset + bubbleMargin, 'footer content-left = bubble left border edge (relative to the chat column)')
  })

  // Decision table: which rows get a left offset rule: marker (Fishball's session) x row kind x row part.
  const DT = [
    { name: 'Fishball footer (turn-tail)', ctx: tailRow(true), expect: true, why: 'R8 content starts at the bubble edge' },
    { name: 'another session\'s footer', ctx: tailRow(false), expect: false, why: 'R8 R4 the footer is unchanged' },
    { name: 'Fishball reply row', ctx: replyRow(true), expect: true, why: 'positive control: the reply row leaves room for the avatar' },
    { name: 'another session\'s reply row', ctx: replyRow(false), expect: false, why: 'R4 other sessions keep their layout' },
    { name: 'Fishball reasoning row', ctx: reasoningRow(true), expect: false, why: 'R5 reasoning keeps DSH\'s layout' },
    { name: 'Fishball process row (turn-process)', ctx: processRow(true), expect: false, why: 'R5 other row kinds are not shifted' },
  ]
  for (const [i, row] of DT.entries()) {
    it(`MLY-05 #${i + 1} ${row.name}: left offset rule ${row.expect ? 'applies' : 'does not apply'} (${row.why})`, () => {
      const { rules } = mounted()
      const found = onElement(matching(rules, row.ctx)).filter((m) => INSET_PROPS.some((prop) => leftDeclaration(m.decls, prop)))
      if (row.expect) assert.ok(found.length > 0, 'a rule gives the row a left margin or padding')
      else assert.deepEqual(found.map((m) => m.selector), [])
    })
  }

  it('MLY-06 every rule that names the footer row needs the conversation and the marker, and styles the row itself', () => {
    const { rules } = mounted()
    const selectors = rules.flatMap((r) => r.selectors).filter((s) => s.includes(A.tailKind))
    assert.ok(selectors.length > 0, 'precondition: a rule names the footer row')
    for (const selector of selectors) {
      const atomsOf = selectorAtoms(selector)
      for (const need of [A.conversation, A.marker]) assert.ok(atomsOf.includes(need), `"${selector}" lacks ${need}`)
      // DSH's −6px margin on the copy button lines its icon up with the bubble edge: nothing inside the row is touched
      assert.equal(lastCompound(selector), A.tailKind, `"${selector}" styles something inside the footer row`)
    }
  })

  it('MLY-07 on, off, on, off, on: the avatar and footer rules are there each time the look is on and gone each time it is off', () => {
    const host = loadMessenger()
    let look
    for (const on of [true, false, true, false, true]) {
      if (on) look = host.apply(); else look.dispose()
      const styles = host.styles()
      assert.equal(styles.length, on ? 1 : 0, `on=${on}`)
      if (!on) continue
      const rules = parseCss(styles[0].textContent)
      assert.ok(winning(matching(rules, replyRow(true)).filter((m) => isBefore(m.selector)), (d) => d[LAY.corner.prop]), 'the reply avatar rule is mounted')
      assert.ok(winning(matching(rules, senderAvatar).filter((m) => lastCompound(m.selector).includes(A.avatar)), (d) => d[LAY.corner.prop]), 'the sender avatar rule is mounted')
      assert.ok(hasInset(onElement(matching(rules, tailRow(true)))), 'the footer rule is mounted')
    }
  })
})
