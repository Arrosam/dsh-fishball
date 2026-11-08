/**
 * E1 re-test (P4) — the Fishball page's header is named by its own label, not by its contents.
 *
 * Requirement (the user's E1 report): a screen reader's name for the header started with an HTML
 * comment that sat inside `<header>`. The header's content is only the model picker and the
 * header-actions slot, so its accessible name must be a short localized label ("Fishball header" /
 * "Fishball 页头"), never the derived control text or the comment.
 *
 * Observation points: `ui/shell.html` (which node may contribute to the header's name) and the
 * page dictionary `shell.header`. The browser's computed accessible name is checked in E1's
 * browser pass; these cases pin the two requirements that make it hold.
 *
 * Techniques: EP (en/zh), DT (comment inside/outside the header), BVA (an empty header content
 * leaves the label as the only name), P (no user-visible literal outside the dictionaries).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | P4-EP-01/02 | EP (en, zh) | the label is "Fishball header" / "Fishball 页头" |
 * | P4-DT-01 | DT (comment placement) | no HTML comment sits inside `<header>` |
 * | P4-DT-02 | DT (comment placement) | the explanatory comment stays just before the header |
 * | P4-BVA-01 | BVA (empty content) | the header's text content is empty, so only the label names it |
 * | P4-P-01 | P (label) | the label is short and holds no control text, comment text or file name |
 * | P4-EP-03 | EP (language) | the page's name for the header comes from the dictionary |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { BODY_SOUL, CJK } from './support/body-soul-env.mjs'
import { loadInstance } from './support/body-soul-env.mjs'

const { createI18n } = await loadInstance('src/slim/ui/i18n.js')
const en = createI18n('en')
const zh = createI18n('zh')

const SHELL_HTML = fs.readFileSync(path.join(BODY_SOUL.instance, 'src/slim/ui/shell.html'), 'utf8')
const SHELL_JS = fs.readFileSync(path.join(BODY_SOUL.instance, 'src/slim/ui/shell.js'), 'utf8')
// Address the real element by its exact opening tag: the explanatory comment itself contains the
// word "<header>", so a loose element regex would start inside the comment.
const HEADER_OPEN = '<header class="topbar">'
const HEADER_START = SHELL_HTML.indexOf(HEADER_OPEN)
const HEADER_END = SHELL_HTML.indexOf('</header>', HEADER_START)
const HEADER_INNER = HEADER_START < 0 || HEADER_END < 0 ? '' : SHELL_HTML.slice(HEADER_START + HEADER_OPEN.length, HEADER_END)

function assertNoHeaderComment() {
  assert.ok(HEADER_START >= 0 && HEADER_END > HEADER_START, 'shell.html has the header element')
  assert.equal(HEADER_INNER.includes('<!--'), false, 'no comment inside <header>')
  // Comments are the only nodes here that contribute text without an element; strip tags too.
  assert.equal(HEADER_INNER.replace(/<[^>]+>/g, '').trim(), '', 'the header element has no text content')
}

describe('E1 the page header has its own accessible name', () => {
  it('P4-EP-01 the English label is "Fishball header"', () => {
    assert.equal(en.t('shell.header'), 'Fishball header')
  })

  it('P4-EP-02 the Chinese label is "Fishball 页头"', () => {
    assert.equal(zh.t('shell.header'), 'Fishball 页头')
    assert.match(zh.t('shell.header'), CJK)
  })

  it('P4-DT-01 no comment is inside the header element', () => {
    assertNoHeaderComment()
  })

  it('P4-DT-02 the explanatory comment is outside the header, before it', () => {
    const comment = SHELL_HTML.indexOf('Header actions: Settings in the chat')
    assert.ok(comment >= 0, 'the explanatory comment is kept')
    assert.ok(HEADER_START >= 0)
    assert.ok(comment < HEADER_START, 'the comment precedes <header>')
    assert.equal(HEADER_INNER.includes('Header actions: Settings in the chat'), false)
  })

  it('P4-BVA-01 an empty header leaves the label as the only accessible name', () => {
    assertNoHeaderComment()
    assert.deepEqual(
      [...HEADER_INNER.matchAll(/<(\w+)/g)].map((match) => match[1].toLowerCase()).sort(),
      ['div', 'div'],
      'the header only holds its two empty control slots',
    )
  })

  it('P4-P-01 the label is short and holds no control, comment or file text', () => {
    for (const label of [en.t('shell.header'), zh.t('shell.header')]) {
      assert.ok(label.length <= 32, 'a short landmark name: ' + label)
      for (const forbidden of ['settings', 'back', 'I6', 'ui/shell.js', 'header actions', 'Model', 'Reasoning']) {
        assert.equal(label.toLowerCase().includes(forbidden.toLowerCase()), false, label + ' contains ' + forbidden)
      }
    }
    assert.notEqual(en.t('shell.header'), zh.t('shell.header'))
  })

  it('P4-EP-03 the page names the header from the dictionary', () => {
    // The shell sets the name at run time; requiring the dictionary key keeps the words localized
    // and out of the template. Any literal label here would break the en/zh requirement.
    const line = SHELL_JS.split('\n').find((text) => text.includes('setAttribute') && text.includes("i18n.t('shell.header')"))
    assert.ok(line, 'the shell names the header landmark')
    assert.match(SHELL_JS, /querySelector\('\.topbar'\)[\s\S]{0,400}?setAttribute\(ARIA\.label, i18n\.t\('shell\.header'\)\)/)
  })
})
