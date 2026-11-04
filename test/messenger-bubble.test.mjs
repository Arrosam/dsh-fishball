/**
 * Independent requirement-derived regression for the reported short CJK vertical-strip defect.
 * AC1 short CJK/Latin use natural single-line content width; AC2 long text stays capped and can wrap;
 * AC3 mixed Unicode survives; AC4 existing host flex/grid, pile/disclosure/composer remain unchanged;
 * AC5 only Fishball with Messenger enabled is affected.
 *
 * These are mounted-CSS CONTRACT tests, not pixel/line-count tests. The public rc.3 userRow ->
 * userStack -> bubble uses nested end-aligned flex columns and a percentage stack max-width.
 * The Messenger wrapper must not leave the outer userRow shrink-to-fit inside another end-aligned
 * column: the stack's percentage cap would then resolve through an indefinite intrinsic width.
 * Equivalent fixes (definite row inline size, row stretch, or wrapper cross-axis stretch) are accepted.
 *
 * DT R1: own+look-on+short => definite row container, natural inner bubble.
 * DT R2: own+look-on+long => same container, host max-width and wrap retained.
 * DT R3: ordinary => no unscoped host sizing rule. DT R4: look-off => no stylesheet.
 * DT R5: composer/pile/work/reply => not redirected to the userRow sizing contract.
 * BVA glyph counts 0/1/2/3 are integration data only, NOT a substitute for max-width +/-1px.
 * Real line boxes, proportional fonts, narrow viewports and edge alignment remain browser-only.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mountedLook, loadMessenger, parseCss, lastCompound, selectorAtoms } from './support/messenger-style.mjs'
import { B, mineMatches, currentValue, hasFullWidth, valueOf } from './support/messenger-bubble.mjs'

const safeWidth = (value) => value === undefined || B.naturalWidths.includes(value) || B.neutral.includes(value)
const rulesNow = () => mountedLook().rules

function assertDefiniteUserContainer(rules) {
  const row = mineMatches(rules, B.row)
  const mine = mineMatches(rules, B.mine)
  assert.ok(hasFullWidth(row) || valueOf(mine, 'align-items') === B.values.stretch,
    'nested end-aligned user row needs a definite containing width or cross-axis stretch before the host percentage stack cap is applied')
}

describe('Messenger bubble width: public CSS contract (no geometry engine)', () => {
  it('MBW-C01 DT R1/R2: the outer user row no longer shrinks against its percentage-capped child', () => {
    assertDefiniteUserContainer(rulesNow())
  })

  it('MBW-C02 AC1/AC2: short bubbles are not pinned/stretched and long bubbles retain the host cap', () => {
    const rules = rulesNow()
    for (const property of ['width', 'inline-size']) assert.ok(safeWidth(currentValue(rules, B.text, property)), 'inner text ' + property + ' remains content-sized')
    for (const property of ['min-width', 'min-inline-size']) {
      const value = currentValue(rules, B.text, property)
      assert.ok(value === undefined || B.zeroWidths.includes(value) || B.neutral.includes(value), 'no minimum forces short text wider: ' + property)
    }
    assert.equal(currentValue(rules, B.text, 'max-width'), B.values.full, 'text bubble remains capped by its host stack')
    assert.equal(currentValue(rules, B.stack, 'max-width'), 'min(calc(var(--dsh-chat-content-width,748px)*.702),82%)', 'host stack maximum remains relative to the chat/container, not a fixed text width')
  })

  it('MBW-C03 EP short/long/mixed: wrapping, horizontal writing and complete text remain permitted', () => {
    const rules = rulesNow()
    for (const target of [B.mine, B.row, B.stack, B.text, B.incoming, B.body, B.bubble]) {
      const matches = mineMatches(rules, target)
      for (const [property, forbidden] of [['white-space', B.unsafeSpace], ['word-break', B.unsafeWord]]) {
        assert.ok(!forbidden.includes(valueOf(matches, property)), target + ' ' + property + ' does not disable long-text wrapping')
      }
      const writing = valueOf(matches, 'writing-mode')
      assert.ok(writing === undefined || writing === B.values.horizontal || B.neutral.includes(writing), target + ' is not vertical writing')
      assert.notEqual(valueOf(matches, 'text-overflow'), 'ellipsis', target + ' does not truncate mixed or long content')
    }
    assert.equal(currentValue(rules, B.text, 'white-space'), 'pre-wrap', 'existing explicit newlines and normal wraps survive')
    assert.equal(currentValue(rules, B.text, 'word-break'), 'break-word', 'existing long-token wrapping survives')
  })

  it('MBW-C04 DT R3/R5: host user-row sizing overrides are scoped to the Messenger user wrapper or marked conversation', () => {
    const rules = rulesNow()
    const rowRules = rules.filter((rule) => rule.selectors.some((selector) => selector.includes(B.row)))
    for (const rule of rowRules) for (const selector of rule.selectors) {
      const atoms = selectorAtoms(selector)
      assert.ok(atoms.includes(B.mine) || (atoms.includes(B.conversation) && atoms.includes(B.marker)), 'no global host userRow override: ' + selector)
      assert.ok(!selector.includes(B.composer), 'composer is not a user-row sizing target')
    }
  })

  it('MBW-C05 AC4: existing host flex flow and right alignment are not replaced by another grid/flex layout', () => {
    const rules = rulesNow()
    for (const target of [B.row, B.stack]) {
      assert.equal(currentValue(rules, target, 'display'), B.values.flex, 'host display remains flex for ' + target)
      assert.equal(currentValue(rules, target, 'flex-direction'), B.values.column, 'host flow remains column for ' + target)
      assert.equal(currentValue(rules, target, 'align-items'), B.values.end, 'inner content remains right aligned for ' + target)
      assert.equal(currentValue(rules, target, 'grid-template-columns'), undefined, 'no replacement grid tracks')
    }
    assert.equal(currentValue(rules, B.stack, 'min-width'), '0', 'host stack can still shrink on a narrow viewport')
  })

  it('MBW-C06 DT R5 AC4: composer styling stays cosmetic and no pile/disclosure geometry is styled by Messenger', () => {
    const rules = rulesNow()
    for (const rule of rules) for (const selector of rule.selectors) {
      if (selector.includes(B.composer)) assert.deepEqual(Object.keys(rule.decls), ['border-radius'], 'composer keeps its existing cosmetic-only Messenger declaration')
      assert.doesNotMatch(selector, /data-fishball-(?:pile|row|detail)|conversation[.]input[.]dock/, 'pile, disclosure and dock layout remain owned by the existing client/host')
      const last = lastCompound(selector)
      if (last === B.conversation || last === B.composer) for (const property of B.sizing) assert.equal(rule.decls[property], undefined, 'no broad ' + property + ' changes the composer stack')
    }
  })

  it('MBW-C07 ST R4: off -> on -> off -> on restores exactly one corrected stylesheet and leaves none after disposal', () => {
    const host = loadMessenger()
    let look
    for (const enabled of [false, true, false, true, false]) {
      if (enabled) look = host.apply(); else look?.dispose()
      assert.equal(host.styles().length, enabled ? B.one : B.zero, 'look=' + enabled)
      if (enabled) assertDefiniteUserContainer(parseCss(host.styles()[B.zero].textContent))
    }
  })
})
