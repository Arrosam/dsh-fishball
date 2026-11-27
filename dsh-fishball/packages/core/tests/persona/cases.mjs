/**
 * R-B4: DSH's own markdown parser, run offline, shows why the persona rule exists and that the rule's
 * form works. The parser is cut verbatim out of the current DSH's web frontend bundle
 * (dsh-markdown.mjs). "Shown as bold" means the parse holds a `strong` node; "asterisks shown" means
 * a literal `**` is left in plain text.
 *
 * | id     | technique                  | requirement                                          | expected |
 * |--------|----------------------------|------------------------------------------------------|----------|
 * | PBR-01 | EP (the reported bug)      | **还在进行中：**dsh keeps its asterisks              | no strong node; `**` left in plain text |
 * | PBR-02 | EP (the rule's form)       | **还在进行中**：dsh is bold with no asterisks        | strong "还在进行中"; plain text "：dsh" |
 * | PBR-03 | DT (form x what follows)   | after the punctuation: letter, digit, Chinese, space, end of line, ASCII punctuation | outside form: bold in every row. Inside form: asterisks shown after a letter or digit, bold otherwise |
 * | PBR-04 | EP (each Chinese mark)     | the rule covers every Chinese punctuation mark       | outside form bold; inside form with a letter after it shows asterisks |
 * | PBR-05 | EP (in context)            | a mid-line mark, two bold runs, list items           | every bold run found, no asterisks left over |
 * | PBR-06 | EP (the persona's example) | the examples the persona gives behave as it says     | the form to write is bold, the form not to write shows asterisks when a letter follows |
 */
import assert from 'node:assert/strict'
import { importBound } from 'fishball-test-helpers/bind'
import { caseTest } from 'fishball-test-helpers/cases'
import { AFTER_NON_WORD, AFTER_PUNCT, AFTER_WORD, BOLD_SENTENCES, CHINESE_PUNCT, PERSONA_BOLD } from './constants.mjs'
import { boldSummary, loadRenderer } from './dsh-markdown.mjs'

const { words: WORDS, punct: PUNCT } = PERSONA_BOLD
const outside = (words, punct, after) => PERSONA_BOLD.marker + words + PERSONA_BOLD.marker + punct + after
const inside = (words, punct, after) => PERSONA_BOLD.marker + words + punct + PERSONA_BOLD.marker + after
/** A rule line shows both forms of the example: the one to write and the one not to write. */
const isRuleLine = (line) => line.includes(PERSONA_BOLD.good) && line.includes(PERSONA_BOLD.bad)
const example = (line, form) => line.slice(line.indexOf(form), line.indexOf(form) + form.length)

let renderer
/** The renderer, built once per process (one bundle extraction for every row). */
const show = async (markdown) => boldSummary((await (renderer ??= loadRenderer())).parse(markdown))

export function registerPersonaBoldCases() {
  caseTest('PBR-01', undefined, PERSONA_BOLD.bad + 'dsh keeps its asterisks', async () => {
    const shown = await show(PERSONA_BOLD.bad + AFTER_PUNCT.latin)
    assert.deepEqual(shown.strong, [])
    assert.equal(shown.plain, PERSONA_BOLD.bad + AFTER_PUNCT.latin)
  })

  caseTest('PBR-02', undefined, PERSONA_BOLD.good + 'dsh is bold with no asterisks', async () => {
    const shown = await show(PERSONA_BOLD.good + AFTER_PUNCT.latin)
    assert.deepEqual(shown.strong, [WORDS])
    assert.equal(shown.plain, PUNCT + AFTER_PUNCT.latin)
    assert.equal(shown.plain.includes(PERSONA_BOLD.asterisk), false)
  })

  for (const [name, after] of Object.entries(AFTER_PUNCT)) {
    caseTest('PBR-03', name, 'what follows the punctuation: ' + name + ' (' + JSON.stringify(after) + ')', async () => {
      const closed = await show(outside(WORDS, PUNCT, after))
      assert.deepEqual(closed.strong, [WORDS], 'the rule\'s form is bold')
      assert.equal(closed.plain, PUNCT + after)
      const unclosed = await show(inside(WORDS, PUNCT, after))
      if (AFTER_WORD.includes(name)) {
        assert.deepEqual(unclosed.strong, [], 'the form the rule forbids shows its asterisks')
        assert.equal(unclosed.plain, inside(WORDS, PUNCT, after))
      } else {
        assert.ok(AFTER_NON_WORD.includes(name), name + ' is classified')
        assert.deepEqual(unclosed.strong, [WORDS + PUNCT], 'closed by the renderer here, so the rule is only needed after a letter or digit')
      }
    })
  }

  for (const mark of CHINESE_PUNCT) {
    caseTest('PBR-04', undefined, 'Chinese mark ' + mark, async () => {
      const closed = await show(outside(WORDS, mark, AFTER_PUNCT.latin))
      assert.deepEqual(closed.strong, [WORDS])
      assert.equal(closed.plain, mark + AFTER_PUNCT.latin)
      const unclosed = await show(inside(WORDS, mark, AFTER_PUNCT.latin))
      assert.deepEqual(unclosed.strong, [], 'the form the rule forbids shows its asterisks')
    })
  }

  for (const [name, { text, strong }] of Object.entries(BOLD_SENTENCES)) {
    caseTest('PBR-05', undefined, 'in context: ' + name, async () => {
      const shown = await show(text)
      assert.deepEqual(shown.strong, strong)
      assert.equal(shown.plain.includes(PERSONA_BOLD.asterisk), false, 'no asterisk left in plain text')
    })
  }

  caseTest('PBR-06', undefined, 'the examples the persona gives behave as it says', async () => {
    const persona = (await importBound(PERSONA_BOLD.module))[PERSONA_BOLD.roleExport]
    const line = persona.split(PERSONA_BOLD.lineBreak).find(isRuleLine)
    assert.ok(line, 'the persona has its rule line')
    const good = await show(example(line, PERSONA_BOLD.good) + AFTER_PUNCT.latin)
    assert.deepEqual(good.strong, [WORDS])
    assert.deepEqual((await show(example(line, PERSONA_BOLD.bad) + AFTER_PUNCT.latin)).strong, [])
  })
}
