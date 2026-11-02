/**
 * Brand fonts do not follow DSH's display language (fix-brand-font). Written from the requirements only.
 *
 * Why it matters: DSH sets <html lang> to its display language, and a bare generic `sans-serif` resolves per language
 * (Helvetica for English, PingFang SC for Chinese on macOS), so the sticker and the count pill looked different.
 * Node has no layout engine, so the observable is the style sheet text the module puts into document.head.
 * The module is executed against a stub host, never read (same approach as support/messenger-style.mjs).
 * The three brand rules are found by what the requirements say about them, not by selector name:
 *   sticker = the rule that rotates by -5deg; pill = weight 800 at 10px; word logo = letter-spacing -0.5px.
 *
 * | id       | technique                       | expected |
 * |----------|---------------------------------|----------|
 * | BFL-01   | EP (sticker)                    | font family list is exactly Helvetica,Arial,sans-serif |
 * | BFL-02   | EP (pill)                       | font family list is exactly Helvetica,Arial,sans-serif |
 * | BFL-03   | EP (shared value)               | sticker and pill carry the identical stack |
 * | BFL-04   | EP (word logo)                  | "Archivo","Helvetica Neue",Helvetica,Arial,sans-serif; weight 900; letter-spacing -0.5px |
 * | BFL-05   | BVA (family list positions)     | in each stack the generic family is last and only last; Helvetica is index 0 (sticker, pill) |
 * | BFL-06   | EP (unchanged look)             | sticker 800 / 9px / 11px / rotate(-5deg); pill 800 / 10px / 16px |
 * | BFL-07   | EP (error guessing, whole sheet)| no font / font-family declaration in the sheet ends on a bare generic family as its only name |
 * | BFL-08   | DT (lang x navigator language)  | the sheet text is identical for en, zh-CN, ja, zh-TW, and an unset lang |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, it } from 'node:test'
import { REPO } from './support/constants.mjs'
import { parseCss } from './support/messenger-style.mjs'

const STACK = 'Helvetica,Arial,sans-serif'
const WORD_STACK = '"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif'
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong'])
const LANGUAGES = [
  { lang: 'en', navigator: 'en-US' }, { lang: 'zh-CN', navigator: 'zh-CN' }, { lang: 'ja', navigator: 'ja-JP' },
  { lang: 'zh-TW', navigator: 'zh-TW' }, { lang: '', navigator: 'en-US' },
]

const inertHost = () => new Proxy(function () {}, { get: (_t, key) => (key === Symbol.toPrimitive ? () => '' : inertHost()), apply: () => inertHost() })

/** Run the browser module with the page language set, and return the text of every style element it mounted. */
function mountedSheets({ lang, navigator: nav }) {
  const children = []
  const head = { children, appendChild(el) { children.push(el); return el } }
  const documentElement = { lang, getAttribute: (k) => (k === 'lang' ? lang : null), setAttribute() {}, classList: { add() {}, remove() {}, contains: () => false } }
  const document = {
    head, body: head, documentElement, addEventListener() {}, removeEventListener() {},
    createElement: (tag) => ({ tag, style: {}, setAttribute() {}, remove() {} }),
    getElementById: (id) => children.find((el) => el.id === id) ?? null,
    querySelector: () => null, querySelectorAll: () => [],
  }
  let definition
  const window = {
    __ModuleLoader__: { load: (def) => { definition = def } }, document, navigator: { language: nav, languages: [nav] },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  }
  vm.runInNewContext(fs.readFileSync(path.join(REPO, 'client.js'), 'utf8'), { window, document, navigator: window.navigator, console, EventSource: class { close() {} }, fetch: async () => ({ ok: false, json: async () => ({}) }) })
  const mod = definition.factory(() => inertHost())
  const ctx = { slots: inertHost(), locale: inertHost(), effect: (fn) => fn() }
  // The sheet may be mounted at load or on apply; a stub host can make apply throw after the sheet exists.
  try { mod.apply(ctx, { useAssistantSessionId: () => 'session', mark: 'mark' }) } catch { /* the sheet is what is observed */ }
  return children.map((el) => el.textContent ?? '').filter(Boolean)
}

/** The font family list of a declaration set, from `font-family` or the `font` shorthand (value after the size/line-height token). */
function familyOf(decls) {
  if (decls['font-family']) return decls['font-family'].value.replace(/\s*,\s*/g, ',').trim()
  const shorthand = decls.font?.value
  if (!shorthand) return null
  const m = shorthand.match(/\d+(?:\.\d+)?(?:px|em|rem|%)(?:\/[^\s,]+)?\s+(.+)$/)
  return m ? m[1].replace(/\s*,\s*/g, ',').trim() : null
}
const sizeOf = (d) => d['font-size']?.value ?? d.font?.value.match(/(\d+(?:\.\d+)?px)(?:\/|\s|$)/)?.[1]
const lineOf = (d) => d['line-height']?.value ?? d.font?.value.match(/\d+(?:\.\d+)?px\/(\S+)/)?.[1]
const weightOf = (d) => d['font-weight']?.value ?? d.font?.value.match(/(?:^|\s)([1-9]00)(?:\s|$)/)?.[1]

const base = LANGUAGES[0]
const sheetText = () => mountedSheets(base).join('\n')
const rules = () => parseCss(sheetText())
const declsOf = (pred) => { const hits = rules().filter((r) => pred(r.decls)); return hits }
const rotated = (d) => /rotate\(\s*-5deg\s*\)/.test(d.transform?.value ?? '')
const pill = (d) => weightOf(d) === '800' && sizeOf(d) === '10px'
const word = (d) => d['letter-spacing']?.value === '-0.5px'

function only(pred, what) {
  const hits = declsOf(pred)
  assert.equal(hits.length, 1, what + ': exactly one rule found, got ' + hits.length)
  return hits[0].decls
}

describe('fix-brand-font: brand text uses Latin font families whatever the display language', () => {
  it('BFL-01 the "Deepseek Harness" sticker names Helvetica, Arial, then sans-serif', () => {
    assert.equal(familyOf(only(rotated, 'sticker')), STACK)
  })
  it('BFL-02 the unread-count pill names Helvetica, Arial, then sans-serif', () => {
    assert.equal(familyOf(only(pill, 'pill')), STACK)
  })
  it('BFL-03 the sticker and the pill use the identical stack', () => {
    assert.equal(familyOf(only(rotated, 'sticker')), familyOf(only(pill, 'pill')))
  })
  it('BFL-04 the word logo keeps Archivo, Helvetica Neue, then the Latin stack, at weight 900 and -0.5px', () => {
    const d = only(word, 'word logo')
    assert.equal(familyOf(d), WORD_STACK)
    assert.equal(weightOf(d), '900')
    assert.equal(d['letter-spacing'].value, '-0.5px')
  })
  for (const [name, pred] of [['sticker', rotated], ['pill', pill], ['word logo', word]]) {
    it('BFL-05 ' + name + ': the generic family is last and only last; no bare generic stack', () => {
      const names = familyOf(only(pred, name)).split(',')
      assert.ok(names.length >= 2, 'more than one name')
      assert.equal(GENERIC.has(names.at(-1)), true, 'a generic family closes the list')
      assert.deepEqual(names.slice(0, -1).filter((n) => GENERIC.has(n)), [], 'no generic family before the last')
      assert.notEqual(names[0], 'sans-serif', 'the first name is not generic')
    })
  }
  it('BFL-05 the sticker and the pill start with Helvetica, then Arial', () => {
    for (const pred of [rotated, pill]) assert.deepEqual(familyOf(only(pred, 'brand text')).split(',').slice(0, 2), ['Helvetica', 'Arial'])
  })
  it('BFL-06 the sticker keeps 800 / 9px / 11px / -5deg and the pill keeps 800 / 10px / 16px', () => {
    const tag = only(rotated, 'sticker')
    assert.deepEqual([weightOf(tag), sizeOf(tag), lineOf(tag)], ['800', '9px', '11px'])
    const badge = only(pill, 'pill')
    assert.deepEqual([weightOf(badge), sizeOf(badge), lineOf(badge)], ['800', '10px', '16px'])
  })
  it('BFL-07 no font / font-family declaration in the sheet is a bare generic family', () => {
    let seen = 0
    for (const r of rules()) {
      const fam = familyOf(r.decls)
      if (fam === null) continue
      const first = fam.split(',')[0]
      // var(...) / inherit forms name no family here; they are judged by their own fallbacks, not as bare generics
      if (/^(inherit|initial|unset|var\()/.test(first)) continue
      seen++
      assert.equal(fam.split(',').length === 1 && GENERIC.has(fam), false, r.selectors.join(',') + ' ends on a bare generic family: ' + fam)
      assert.equal(GENERIC.has(first) && !/^(ui-|system-ui)/.test(first), false, r.selectors.join(',') + ' starts with a generic family: ' + fam)
    }
    assert.ok(seen >= 3, 'the sheet declares at least the three brand font lists (saw ' + seen + ')')
  })
  it('BFL-08 the sheet text is the same in every display language', () => {
    const [first, ...rest] = LANGUAGES.map((l) => mountedSheets(l).join('\n'))
    assert.ok(first.length > 0, 'a sheet is mounted')
    for (const [i, text] of rest.entries()) assert.equal(text, first, 'sheet for ' + JSON.stringify(LANGUAGES[i + 1]) + ' differs from ' + JSON.stringify(LANGUAGES[0]))
  })
})
