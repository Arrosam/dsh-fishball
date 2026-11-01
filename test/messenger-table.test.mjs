/**
 * Messenger look: a markdown table in Fishball's reply stays inside the reply bubble (R1-R6).
 *
 * DSH draws a table with 4 or more columns in a wrapper `md-table-wide` and stretches it past the chat column to the
 * chat area's edges; fewer columns get `_tableFill_*`. In Fishball's bubble the stretched wrapper stuck out of the
 * bubble. Node has no layout engine, so these cases check what the mounted stylesheet says; the real layout was
 * measured in Chrome against DSH's own CSS (see the report for this change, not part of the suite).
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | MTB-00 | EP (helpers) | -- | parseCss keeps data: URLs, groups and at-rules whole; specificity ranks DSH's stock selector below the scoped one |
 * | MTB-01 | EP (look on) | R1 | one style element is mounted; it has a rule for the wide wrapper in Fishball's reply rows |
 * | MTB-02 | EP | R1 | that rule gives the wrapper width auto/100%, max-width 100%, margin-left 0 and padding-left 0 |
 * | MTB-03 ×7 | DT (marker x row part x wrapper class) | R1 R3 R4 R5 | a rule applies to wide wrapper + marker + reply row; none applies without the marker or outside reply rows; any rule that applies to a fill wrapper keeps it contained |
 * | MTB-04 | BVA (specificity vs DSH's [0,2,0]) | R1 | each contained declaration wins the cascade over DSH's stock rule: higher specificity or !important |
 * | MTB-05 | EP | R2 | no table rule sets overflow, overflow-x or overflow-y, display:none or visibility:hidden, so DSH's hover scrolling stays |
 * | MTB-06 | EP | R4 R5 | every rule about a table needs the conversation, the marker, the step kind and the reply part |
 * | MTB-07 | EP | R3 | the stylesheet does not name DSH's generated wrapper classes |
 * | MTB-08 | ST (on -dispose-> off) | R6 | disposing removes the style element: no table rule is left in document.head |
 * | MTB-09 | ST (on, off, on, off, on) | R6 | the rule is mounted each time the look is on and gone each time it is off, never twice |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MESSENGER, MESSENGER_TABLE as TBL } from './support/constants.mjs'
import { compareSpecificity, loadMessenger, parseCss, selectorAtoms, specificity } from './support/messenger-style.mjs'

const REPLY_SCOPE = [TBL.atoms.conversation, TBL.atoms.marker, TBL.atoms.stepKind, TBL.atoms.reply]
const CONTAINED_PROPS = [['width', TBL.contained.width], ['max-width', TBL.contained.maxWidth], ['margin-left', TBL.contained.marginLeft], ['padding-left', TBL.contained.paddingLeft]]
const SHORTHAND = { 'margin-left': 'margin', 'padding-left': 'padding' }

/** Mount the look on a fresh load and return the stylesheet's rules. */
function mounted() {
  const host = loadMessenger()
  const look = host.apply()
  const style = host.styles()[0]
  return { host, look, style, rules: parseCss(style?.textContent ?? '') }
}
const tableRules = (rules) => rules.filter((r) => r.selectors.some((s) => TBL.tableSelector.test(s)))
/** True when every simple selector of `selector` is one the context provides (the DSH DOM nests them in this order). */
const applies = (selector, contextAtoms) => selectorAtoms(selector).every((atom) => contextAtoms.has(atom))
/** The rules' selectors that match a context, with the declarations of their rule. */
const matching = (rules, contextAtoms) => rules.flatMap((rule) => rule.selectors.filter((s) => applies(s, contextAtoms)).map((selector) => ({ selector, decls: rule.decls })))
/** The value of a longhand declared directly or through a one-value shorthand (`margin: 0`), else undefined. */
const declared = (decls, prop) => decls[prop] ?? (decls[SHORTHAND[prop]]?.value.split(/\s+/).length === 1 ? decls[SHORTHAND[prop]] : undefined)

/** A DOM context as a set of simple selectors: Fishball's marker or not, a row part, a wrapper class. */
const context = ({ marker, part, wide }) => new Set([
  TBL.atoms.conversation,
  ...(marker ? [TBL.atoms.marker] : []),
  TBL.atoms.stepKind,
  `[data-chat-group-part="${part}"]`,
  ...(wide ? [TBL.atoms.wide] : [`.${TBL.hashedClasses[1]}`]),
])

describe('Messenger look: tables inside the reply bubble', () => {
  it('MTB-00 helpers: parseCss keeps strings, groups and at-rules whole; specificity orders the cascade', () => {
    const rules = parseCss('a,b>c{x:1;y:url("data:image/svg+xml;utf8,<svg a=\'{\'/>") !important}/* gone */@media (min-width:1px){.d{z:2}}')
    assert.deepEqual(rules.map((r) => r.selectors), [['a', 'b>c'], ['.d']])
    assert.deepEqual(rules[0].decls.x, { value: '1', important: false })
    assert.equal(rules[0].decls.y.important, true)
    assert.match(rules[0].decls.y.value, /^url\("data:image\/svg\+xml;utf8,<svg/)
    assert.equal(rules[1].at, '@media (min-width:1px)')
    const reply = `${TBL.atoms.conversation}:has(${TBL.atoms.marker}) ${TBL.atoms.stepKind}${TBL.atoms.reply} ${TBL.atoms.wide}`
    assert.deepEqual(specificity(reply), [0, 5, 0])
    assert.deepEqual(specificity('.hWmORq_body .md-table-wide'), TBL.dshWideSpecificity)
    assert.deepEqual(specificity('#a .b:hover table'), [1, 2, 1])
    assert.deepEqual(specificity(':where(.a:has(.b) .c) .d'), [0, 1, 0], ':where counts nothing, even with nested parentheses')
    assert.equal(compareSpecificity(specificity(reply), TBL.dshWideSpecificity), 1)
    assert.equal(compareSpecificity(TBL.dshWideSpecificity, TBL.dshWideSpecificity), 0)
  })

  it('MTB-01 look on: one style element holds a rule for the wide wrapper in Fishball\'s reply rows', () => {
    const { host, style, rules } = mounted()
    assert.equal(host.moduleId, MESSENGER.moduleId, 'precondition: the module under test')
    assert.equal(host.styles().length, 1, 'one style element')
    assert.equal(typeof style.textContent, 'string')
    const wide = matching(tableRules(rules), context({ marker: true, part: TBL.parts.reply, wide: true }))
    assert.ok(wide.length > 0, 'a rule applies to the wide wrapper: ' + JSON.stringify(tableRules(rules).map((r) => r.selectors)))
  })

  it('MTB-02 the wide wrapper gets contained width, max-width, margin-left and padding-left', () => {
    const { rules } = mounted()
    const wide = matching(tableRules(rules), context({ marker: true, part: TBL.parts.reply, wide: true }))
    for (const [prop, allowed] of CONTAINED_PROPS) {
      const values = wide.map((m) => declared(m.decls, prop)?.value).filter((v) => v !== undefined)
      assert.ok(values.length > 0, prop + ' is declared')
      for (const v of values) assert.ok(allowed.includes(v), `${prop}: ${v} is one of ${JSON.stringify(allowed)}`)
    }
  })

  // Decision table: the marker (Fishball's session), the row part, the wrapper class (wide = 4+ columns, fill = fewer).
  const DT = [
    { marker: true, part: TBL.parts.reply, wide: true, expect: true, why: 'R1 Fishball reply, wide table' },
    { marker: false, part: TBL.parts.reply, wide: true, expect: false, why: 'R4 another session keeps DSH\'s stock breakout' },
    { marker: true, part: TBL.parts.reasoning, wide: true, expect: false, why: 'R5 reasoning row is not changed' },
    { marker: true, part: TBL.parts.other, wide: true, expect: false, why: 'R5 any other row part is not changed' },
    { marker: false, part: TBL.parts.reasoning, wide: true, expect: false, why: 'R4+R5 neither' },
    { marker: false, part: TBL.parts.reply, wide: false, expect: false, why: 'R4 fill table in another session' },
    { marker: true, part: TBL.parts.reasoning, wide: false, expect: false, why: 'R5 fill table in a reasoning row' },
  ]
  for (const [i, row] of DT.entries()) {
    it(`MTB-03 #${i + 1} marker=${row.marker} part=${row.part} wrapper=${row.wide ? 'wide' : 'fill'}: ${row.why}`, () => {
      const { rules } = mounted()
      const found = matching(tableRules(rules), context(row))
      if (row.expect) assert.ok(found.length > 0, 'a table rule applies')
      else assert.deepEqual(found.map((m) => m.selector), [], 'no table rule applies')
    })
  }

  it('MTB-03 R3 any rule that applies to a fill wrapper in Fishball\'s reply keeps it contained', () => {
    const { rules } = mounted()
    for (const m of matching(tableRules(rules), context({ marker: true, part: TBL.parts.reply, wide: false }))) {
      for (const [prop, allowed] of CONTAINED_PROPS) {
        const d = declared(m.decls, prop)
        if (d) assert.ok(allowed.includes(d.value), `${m.selector}: ${prop} ${d.value}`)
      }
    }
  })

  it('MTB-04 each contained declaration beats DSH\'s stock rule in the cascade', () => {
    const { rules } = mounted()
    const wide = matching(tableRules(rules), context({ marker: true, part: TBL.parts.reply, wide: true }))
    for (const m of wide) {
      for (const [prop] of CONTAINED_PROPS) {
        const d = declared(m.decls, prop)
        if (!d) continue
        const wins = d.important || compareSpecificity(specificity(m.selector), TBL.dshWideSpecificity) > 0
        assert.ok(wins, `${prop} in "${m.selector}" is outranked by DSH's ${TBL.dshWideSpecificity} rule`)
      }
    }
  })

  it('MTB-05 no table rule clips or hides the wrapper, so hover scrolling keeps working', () => {
    const { rules } = mounted()
    assert.ok(tableRules(rules).length > 0, 'precondition: table rules exist')
    for (const rule of tableRules(rules)) {
      for (const prop of TBL.clipping) assert.equal(rule.decls[prop], undefined, `${rule.selectors}: ${prop}`)
      assert.notEqual(rule.decls.display?.value, TBL.hidden.display, `${rule.selectors}: display`)
      assert.notEqual(rule.decls.visibility?.value, TBL.hidden.visibility, `${rule.selectors}: visibility`)
    }
  })

  it('MTB-06 every rule about a table needs the conversation, the marker, the step kind and the reply part', () => {
    const { rules } = mounted()
    assert.ok(tableRules(rules).length > 0, 'precondition: table rules exist')
    for (const rule of tableRules(rules)) {
      for (const selector of rule.selectors) {
        const atoms = selectorAtoms(selector)
        for (const need of REPLY_SCOPE) assert.ok(atoms.includes(need), `"${selector}" lacks ${need}`)
      }
    }
  })

  it('MTB-07 the stylesheet does not name DSH\'s generated wrapper classes', () => {
    const { style } = mounted()
    for (const name of TBL.hashedClasses) assert.equal(style.textContent.includes(name), false, name)
  })

  it('MTB-08 disposing the look removes the style element and with it the table rule', () => {
    const { host, look } = mounted()
    assert.equal(host.styles().length, 1, 'precondition: on')
    look.dispose()
    assert.equal(host.styles().length, 0, 'style element removed')
    assert.equal(host.document.head.children.length, 0, 'nothing left in document.head')
  })

  it('MTB-09 on, off, on, off, on: mounted once while on, gone while off', () => {
    const host = loadMessenger()
    const steps = []
    let text
    for (const on of [true, false, true, false, true]) {
      if (on) { steps.push({ on, look: host.apply() }) } else { steps.at(-1).look.dispose() }
      const styles = host.styles()
      assert.equal(styles.length, on ? 1 : 0, `on=${on}`)
      if (on) {
        const rules = parseCss(styles[0].textContent)
        assert.ok(matching(tableRules(rules), context({ marker: true, part: TBL.parts.reply, wide: true })).length > 0, 'the table rule is mounted')
        text ??= styles[0].textContent
        assert.equal(styles[0].textContent, text, 'the same stylesheet every time')
      }
    }
  })
})
