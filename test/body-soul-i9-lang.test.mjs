/**
 * I9 — two language variants of the custom page: the `lang` rule and the dictionaries
 * (docs/slim-native-design.md §0.5 "Languages", §0.9 U6/U7, §18.2 I9; contract §1.2 UI_LANG).
 * Observation point: packages/instance/src/slim/ui/i18n.js (DOM-free; the page and the main 503
 * page both use it). Expected values come from the design only:
 * - the variant is the URL's FIRST `lang` parameter; exactly `zh` is Chinese, anything else or no
 *   `lang` is English; `<html lang>` is `zh-CN` or `en`;
 * - the two dictionaries have the same keys (R3); the page's `record.*` words equal the
 *   connector's `record.*` words key for key in both languages (U6);
 * - a refused action shows the page's own words with the refusal code (R7).
 * The DOM halves (shell, theme mirror, every rendered string) are the browser phase.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | I9-P-01 | P | `?lang=zh` → zh, locale zh-CN |
 * | I9-P-02 | P | `?lang=en` → en, locale en |
 * | I9-EP-01 | EP | no `lang` → en |
 * | I9-EP-02 | EP | `lang=` (empty) → en |
 * | I9-EP-03 | EP | `lang=ZH` → en (exact value only) |
 * | I9-EP-04 | EP | `lang=zh-CN` → en |
 * | I9-EP-05 | EP | `lang=zh&lang=en` → zh (first wins) |
 * | I9-EP-06 | EP | `lang=en&lang=zh` → en (first wins) |
 * | I9-EP-07 | EP | `lang=zh` after another parameter (`view=settings&lang=zh`) → zh |
 * | I9-EP-08 | EP | `lang` = `fr`, `zh ` (trailing space) → en |
 * | I9-EP-09 | EP | non-string input (undefined, null, number, object, array) → en, never throws |
 * | I9-EP-10 | EP | i18nOf(search) gives the same language and locale as languageOf + the mapping |
 * | I9-DT-01 | DT | language × view (`view=settings` present / absent) → language follows `lang` only |
 * | I9-ST-01 | ST | language survives view switch: search with and without `view=settings` keeps `lang` |
 * | I9-R3-01 | P | en and zh dictionaries have identical key sets |
 * | I9-R3-02 | BVA | no value is empty (length 0 or whitespace) in either dictionary |
 * | I9-R3-03 | P | per key, the `{placeholder}` names are the same set in en and zh |
 * | I9-R3-04 | P | every zh value differs from en or is a proper name (no untranslated English sentence) — todo |
 * | I9-U6-01 | P | the page has every connector `record.*` key, en |
 * | I9-U6-02 | P | the page has every connector `record.*` key, zh |
 * | I9-U6-03 | P | page `record.*` words equal the connector's word for word, en |
 * | I9-U6-04 | P | page `record.*` words equal the connector's word for word, zh |
 * | I9-U6-05 | P | the page has no `record.*` key the connector lacks |
 * | I9-R7-01 | P | failure(key, code) contains the page's own words for key and the code, en and zh |
 * | I9-R7-02 | EP | failure(key) without a code is exactly the words |
 * | I9-R7-03 | EP | failure(key, '') (empty code) — todo: open question |
 * | I9-R7-04 | P | failure in zh contains Chinese words and the code verbatim (code not translated) |
 * | I9-AC-02 | static | no `textContent = '<English>'` literal in src/slim/ui/*.js outside i18n.js |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { BODY_SOUL, CJK, connectorRecordWords, loadInstance } from './support/body-soul-env.mjs'

const i18n = await loadInstance('src/slim/ui/i18n.js')
const { languageOf, i18nOf, createI18n, DICTIONARIES } = i18n

/** The design's two variants and DSH's <html lang> mapping (§0.5 "Languages"). */
const LANG = Object.freeze({ en: 'en', zh: 'zh' })
const HTML_LANG = Object.freeze({ en: 'en', zh: 'zh-CN' })
const placeholders = (value) => new Set([...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))

describe('I9 language rule (first `lang`, exactly `zh`)', () => {
  const cases = [
    ['I9-P-01 lang=zh shows Chinese', '?lang=zh', LANG.zh],
    ['I9-P-02 lang=en shows English', '?lang=en', LANG.en],
    ['I9-EP-01 no lang shows English', '', LANG.en],
    ['I9-EP-01b no lang, other parameter, shows English', '?view=settings', LANG.en],
    ['I9-EP-02 empty lang shows English', '?lang=', LANG.en],
    ['I9-EP-03 lang=ZH shows English', '?lang=ZH', LANG.en],
    ['I9-EP-04 lang=zh-CN shows English', '?lang=zh-CN', LANG.en],
    ['I9-EP-05 lang=zh&lang=en: the first wins (Chinese)', '?lang=zh&lang=en', LANG.zh],
    ['I9-EP-06 lang=en&lang=zh: the first wins (English)', '?lang=en&lang=zh', LANG.en],
    ['I9-EP-07 lang=zh after another parameter shows Chinese', '?view=settings&lang=zh', LANG.zh],
    ['I9-EP-08 lang=fr shows English', '?lang=fr', LANG.en],
    ['I9-EP-08b lang with a trailing space shows English', '?lang=zh%20', LANG.en],
    ['I9-EP-08c search without the leading ? still reads lang', 'lang=zh', LANG.zh],
  ]
  for (const [name, search, expected] of cases) {
    it(name, () => {
      assert.equal(languageOf(search), expected)
      const words = i18nOf(search)
      assert.equal(words.lang, expected)
      assert.equal(words.locale, HTML_LANG[expected])
    })
  }

  for (const [label, value] of [['undefined', undefined], ['null', null], ['a number', 42], ['an object', { lang: 'zh' }], ['an array', ['lang=zh']]]) {
    it('I9-EP-09 non-string input (' + label + ') shows English and does not throw', () => {
      assert.equal(languageOf(value), LANG.en)
      assert.equal(i18nOf(value).locale, HTML_LANG.en)
    })
  }

  it('I9-EP-10 createI18n maps each language to its <html lang> (zh-CN / en)', () => {
    assert.equal(createI18n(LANG.zh).locale, HTML_LANG.zh)
    assert.equal(createI18n(LANG.en).locale, HTML_LANG.en)
  })

  for (const lang of [LANG.en, LANG.zh]) {
    for (const view of ['', 'view=settings']) {
      it('I9-DT-01 lang=' + lang + ' × view ' + (view || 'chat') + ' → ' + lang, () => {
        const search = '?' + [view, 'lang=' + lang].filter(Boolean).join('&')
        assert.equal(languageOf(search), lang)
      })
    }
  }

  it('I9-ST-01 chat → settings → chat keeps the language (the view parameter does not change it)', () => {
    const chat = new URLSearchParams('lang=zh')
    const settings = new URLSearchParams(chat); settings.set('view', 'settings')
    const back = new URLSearchParams(settings); back.delete('view')
    assert.deepEqual([chat, settings, back].map((p) => languageOf('?' + p)), [LANG.zh, LANG.zh, LANG.zh])
  })
})

describe('I9 R3 dictionaries', () => {
  const en = DICTIONARIES[LANG.en]
  const zh = DICTIONARIES[LANG.zh]

  it('I9-R3-01 en and zh have identical key sets', () => {
    const onlyEn = Object.keys(en).filter((k) => !Object.hasOwn(zh, k))
    const onlyZh = Object.keys(zh).filter((k) => !Object.hasOwn(en, k))
    assert.deepEqual({ onlyEn, onlyZh }, { onlyEn: [], onlyZh: [] })
  })

  it('I9-R3-02 no value is empty in either dictionary', () => {
    const empty = []
    for (const [lang, words] of Object.entries({ en, zh })) {
      for (const [key, value] of Object.entries(words)) if (typeof value !== 'string' || value.trim() === '') empty.push(lang + ':' + key)
    }
    assert.deepEqual(empty, [])
  })

  it('I9-R3-03 each key has the same {placeholder} names in en and zh', () => {
    const differ = Object.keys(en).filter((key) => {
      const a = placeholders(en[key]); const b = placeholders(zh[key])
      return a.size !== b.size || [...a].some((n) => !b.has(n))
    })
    assert.deepEqual(differ, [])
  })

  it('I9-R3-04 zh holds Chinese text, not English copies', { todo: 'open question: the design names no rule for which zh values may stay Latin (proper names such as "Fishball", codes); a reviewer should list allowed ones' }, () => {})

  it('I9-R3-05 the Chinese dictionary is Chinese at all (some value contains CJK)', () => {
    assert.ok(Object.values(zh).some((v) => CJK.test(v)))
    assert.ok(!Object.values(en).some((v) => CJK.test(v)), 'the English dictionary carries no CJK text')
  })
})

describe('I9 U6 record words equal the connector\'s', () => {
  const connector = connectorRecordWords()
  const pageRecord = (lang) => Object.fromEntries(Object.entries(DICTIONARIES[lang]).filter(([k]) => k.startsWith('record.')))

  it('precondition: the connector source has record.* words in both languages', () => {
    assert.ok(Object.keys(connector.en).length > 0)
    assert.ok(Object.keys(connector.zh).length > 0)
  })
  for (const [id, lang] of [['I9-U6-01', LANG.en], ['I9-U6-02', LANG.zh]]) {
    it(id + ' the page has every connector record.* key (' + lang + ')', () => {
      const missing = Object.keys(connector[lang]).filter((k) => !Object.hasOwn(DICTIONARIES[lang], k))
      assert.deepEqual(missing, [])
    })
  }
  for (const [id, lang] of [['I9-U6-03', LANG.en], ['I9-U6-04', LANG.zh]]) {
    it(id + ' the page\'s record.* words equal the connector\'s word for word (' + lang + ')', () => {
      const differ = Object.keys(connector[lang]).filter((k) => DICTIONARIES[lang][k] !== connector[lang][k])
      assert.deepEqual(differ, [])
    })
  }
  it('I9-U6-05 the page has no record.* key the connector lacks (both languages)', () => {
    for (const lang of [LANG.en, LANG.zh]) {
      const extra = Object.keys(pageRecord(lang)).filter((k) => !Object.hasOwn(connector[lang], k))
      assert.deepEqual(extra, [], lang)
    }
  })
})

describe('I9 R7 failure words', () => {
  // Any plain key works for the rule; one whose zh words are Chinese (not a proper name) is taken.
  const key = Object.keys(DICTIONARIES[LANG.en]).find((k) => placeholders(DICTIONARIES[LANG.en][k]).size === 0 && !k.startsWith('common.') && CJK.test(DICTIONARIES[LANG.zh][k]))
  const code = 'fbtest-refusal-code'

  for (const lang of [LANG.en, LANG.zh]) {
    it('I9-R7-01 failure(key, code) shows the page\'s own words and the code (' + lang + ')', () => {
      const words = createI18n(lang)
      const text = words.failure(key, code)
      assert.ok(text.includes(words.t(key)), 'the page\'s own words are shown')
      assert.ok(text.includes(code), 'the refusal code is shown')
    })
    it('I9-R7-02 failure(key) without a code is exactly the words (' + lang + ')', () => {
      const words = createI18n(lang)
      assert.equal(words.failure(key), words.t(key))
      assert.equal(words.failure(key, undefined), words.t(key))
    })
  }
  it('I9-R7-03 failure(key, \'\') with an empty code', { todo: 'open question: the design does not say whether an empty refusal code counts as "no code"' }, () => {})
  it('I9-R7-04 in zh the words are Chinese and the code stays verbatim', () => {
    const text = createI18n(LANG.zh).failure(key, code)
    assert.ok(CJK.test(text))
    assert.ok(text.includes(code))
  })
})

describe('I9 AC: no user-visible literal outside the dictionaries (static)', () => {
  const ui = path.join(BODY_SOUL.instance, 'src', 'slim', 'ui')
  const files = fs.readdirSync(ui).filter((f) => f.endsWith('.js') && f !== 'i18n.js')
  // A heuristic for the AC's scan: an English word assigned as visible text or as an accessible name.
  const visible = /(?:\.textContent\s*=|\.title\s*=|\.placeholder\s*=|setAttribute\(\s*['"](?:aria-label|title|placeholder)['"]\s*,)\s*['"`][^'"`]*[A-Za-z]{2,}[^'"`]*['"`]/
  it('I9-AC-02 precondition: the ui folder has modules besides i18n.js', () => assert.ok(files.length > 0))
  for (const file of files) {
    it('I9-AC-02 ' + file + ' assigns no English literal as visible text', () => {
      const hits = fs.readFileSync(path.join(ui, file), 'utf8').split('\n').flatMap((line, i) => (visible.test(line) ? [file + ':' + (i + 1) + ' ' + line.trim()] : []))
      assert.deepEqual(hits, [])
    })
  }
})
