/**
 * R-B4: DSH's own markdown parser, run offline, shows why the persona rule exists and that the rule's form works.
 *
 * The parser is cut verbatim out of the installed DSH web frontend bundle (support/dsh-markdown.mjs); it is not another
 * markdown library. A version of DSH that is not installed, or whose bundle has a different shape, skips its cases with the
 * reason. "Shown as bold" means the parse holds a `strong` node; "asterisks shown" means a literal `**` is left in plain text.
 *
 * | id     | technique                  | requirement                                          | expected |
 * |--------|----------------------------|------------------------------------------------------|----------|
 * | PBR-01 | EP (the reported bug)      | **还在进行中：**dsh keeps its asterisks              | no strong node; `**` left in plain text |
 * | PBR-02 | EP (the rule's form)       | **还在进行中**：dsh is bold with no asterisks        | strong "还在进行中"; plain text "：dsh" |
 * | PBR-03 | DT (form x what follows)   | after the punctuation: letter, digit, Chinese, space, end of line, ASCII punctuation | outside form: bold in every row. Inside form: asterisks shown after a letter or digit, bold otherwise |
 * | PBR-04 | EP (each Chinese mark)     | the rule covers every Chinese punctuation mark       | outside form bold; inside form with a letter after it shows asterisks |
 * | PBR-05 | EP (in context)            | a mid-line mark, two bold runs, list items           | every bold run found, no asterisks left over |
 * | PBR-06 | EP (the persona's example) | the examples the persona gives behave as stated      | the form to write is bold, the form not to write shows asterisks when a letter follows |
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { AFTER_NON_WORD, AFTER_PUNCT, AFTER_WORD, BOLD_SENTENCES, CHINESE_PUNCT, DSH_MARKDOWN, PERSONA_BOLD } from './support/constants.mjs'
import { T } from './support/expect.mjs'
import { boldSummary, loadRenderer } from './support/dsh-markdown.mjs'
import { loadCurrent, personaLines, isRuleLine } from './support/persona-bold.mjs'

const { words: WORDS, punct: PUNCT } = PERSONA_BOLD
const outside = (words, punct, after) => PERSONA_BOLD.marker + words + PERSONA_BOLD.marker + punct + after
const inside = (words, punct, after) => PERSONA_BOLD.marker + words + punct + PERSONA_BOLD.marker + after

for (const version of DSH_MARKDOWN.versions) {
  describe('R-B4 DSH ' + version + ' markdown parser', () => {
    let renderer
    before(async () => { renderer = await loadRenderer(version) })

    /** Parse, or skip the running case with the reason the renderer is missing. */
    const show = (t, markdown) => {
      if (renderer.skip) { t.skip(renderer.skip); return undefined }
      return boldSummary(renderer.parse(markdown))
    }

    it('PBR-01 ' + PERSONA_BOLD.bad + 'dsh keeps its asterisks', T, (t) => {
      const shown = show(t, PERSONA_BOLD.bad + AFTER_PUNCT.latin)
      if (!shown) return
      assert.deepEqual(shown.strong, [])
      assert.equal(shown.plain, PERSONA_BOLD.bad + AFTER_PUNCT.latin)
    })

    it('PBR-02 ' + PERSONA_BOLD.good + 'dsh is bold with no asterisks', T, (t) => {
      const shown = show(t, PERSONA_BOLD.good + AFTER_PUNCT.latin)
      if (!shown) return
      assert.deepEqual(shown.strong, [WORDS])
      assert.equal(shown.plain, PUNCT + AFTER_PUNCT.latin)
      assert.equal(shown.plain.includes(PERSONA_BOLD.asterisk), false)
    })

    for (const [name, after] of Object.entries(AFTER_PUNCT)) {
      it('PBR-03 what follows the punctuation: ' + name + ' (' + JSON.stringify(after) + ')', T, (t) => {
        const closed = show(t, outside(WORDS, PUNCT, after))
        if (!closed) return
        assert.deepEqual(closed.strong, [WORDS], 'the rule\'s form is bold')
        assert.equal(closed.plain, PUNCT + after)
        const unclosed = boldSummary(renderer.parse(inside(WORDS, PUNCT, after)))
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
      it('PBR-04 Chinese mark ' + mark, T, (t) => {
        const closed = show(t, outside(WORDS, mark, AFTER_PUNCT.latin))
        if (!closed) return
        assert.deepEqual(closed.strong, [WORDS])
        assert.equal(closed.plain, mark + AFTER_PUNCT.latin)
        const unclosed = boldSummary(renderer.parse(inside(WORDS, mark, AFTER_PUNCT.latin)))
        assert.deepEqual(unclosed.strong, [], 'the form the rule forbids shows its asterisks')
      })
    }

    for (const [name, { text, strong }] of Object.entries(BOLD_SENTENCES)) {
      it('PBR-05 in context: ' + name, T, (t) => {
        const shown = show(t, text)
        if (!shown) return
        assert.deepEqual(shown.strong, strong)
        assert.equal(shown.plain.includes(PERSONA_BOLD.asterisk), false, 'no asterisk left in plain text')
      })
    }

    it('PBR-06 the examples the persona gives behave as it says', T, async (t) => {
      const line = personaLines((await loadCurrent()).PERSONA_ROLE).find(isRuleLine)
      assert.ok(line, 'the persona has its rule line')
      const toWrite = line.slice(line.indexOf(PERSONA_BOLD.good), line.indexOf(PERSONA_BOLD.good) + PERSONA_BOLD.good.length)
      const notToWrite = line.slice(line.indexOf(PERSONA_BOLD.bad), line.indexOf(PERSONA_BOLD.bad) + PERSONA_BOLD.bad.length)
      const good = show(t, toWrite + AFTER_PUNCT.latin)
      if (!good) return
      assert.deepEqual(good.strong, [WORDS])
      assert.deepEqual(boldSummary(renderer.parse(notToWrite + AFTER_PUNCT.latin)).strong, [])
    })
  })
}
