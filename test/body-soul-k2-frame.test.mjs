/**
 * K2 — contract 1.1: the framed path's `lang` (docs/slim-native-design.md §0.9 U4, §18.2 K2;
 * docs/connector-contract.md §1.2 "The language parameter", §2, §10, §11).
 * Observation points:
 * - `fishball-connector/contract` (CONNECTOR_CONTRACT, UI_LANG, negotiateContract,
 *   validateAttachment);
 * - the framed address rule. The connector's `framedUrl(path, lang)` sits inside the browser
 *   bundle's closure (packages/connector/client.js, loaded by DSH's client module loader), so it is
 *   not importable. These cases evaluate that one function's source text in isolation, with
 *   the bundle's own FRAME_UI constants object, and compare with the addresses the contract
 *   states. The iframe `src`, "Open in a tab" and the reload on a locale change are the browser phase.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | K2-V-01 | P | CONNECTOR_CONTRACT = {id: fishball-connector, major 1, minor 1} |
 * | K2-V-02 | P | UI_LANG.parameter = `lang`, values exactly {zh, en} |
 * | K2-V-03 | P | negotiateContract 1.0 → {major 1, minor 0} (a 1.0 instance still attaches) |
 * | K2-V-04 | P | negotiateContract 1.1 → minor 1; 1.5 → minor 1 (lower of the two) |
 * | K2-V-05 | EP | major 0 / 2, another id → contract-version |
 * | K2-V-06 | P | validateAttachment of a 1.0 descriptor with ui {chat, settings} → accepted, ui unchanged |
 * | K2-V-07 | EP | a registered ui path that already carries `lang` is still accepted (descriptor rules unchanged) |
 * | K2-V-08 | P | the instance's own page and the contract agree on the parameter name `lang` |
 * | K2-F-EP-01 | EP (no query) | `/fishball/embed/` + zh → `/fishball/embed/?lang=zh` |
 * | K2-F-EP-02 | EP (query) | `/fishball/embed/?view=settings` + zh → `/fishball/embed/?view=settings&lang=zh` |
 * | K2-F-EP-03 | EP (query + fragment) | `/fishball/embed/?view=settings#x` + zh → `/fishball/embed/?view=settings&lang=zh#x` |
 * | K2-F-EP-04 | EP (fragment, no query) | `/p#x` + en → `/p?lang=en#x` |
 * | K2-F-EP-05 | EP (lang already) | `/p?lang=en` + zh → `/p?lang=zh` |
 * | K2-F-EP-06 | EP (lang twice, between others) | `/p?lang=en&view=settings&lang=fr` + zh → `/p?view=settings&lang=zh` |
 * | K2-F-EP-07 | EP (lang URL-encoded name) | `/p?%6Cang=en` + zh → `/p?lang=zh` (names compared URL-decoded) |
 * | K2-F-EP-08 | EP (`LANG` other case) | `/p?LANG=en` + zh — todo: the contract compares names URL-decoded, it does not say case-folded |
 * | K2-F-EP-09 | EP (other parameters' spelling) | `/p?b=%20x&a=1` keeps `b=%20x&a=1` verbatim, in order |
 * | K2-F-EP-10 | EP (empty & segments) | `/p?&view=settings&&` + en → `/p?view=settings&lang=en` |
 * | K2-F-EP-11 | EP (fragment with `?`/`lang`) | `/p#lang=en?x` + zh → `/p?lang=zh#lang=en?x` (fragment untouched) |
 * | K2-F-P-01 | P (locale en / zh) | the value is exactly the given `zh` or `en`; the page's first `lang` is the connector's |
 * | K2-F-P-02 | P | the framed address round-trips through the instance's languageOf |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, it } from 'node:test'
import { BODY_SOUL, loadInstance } from './support/body-soul-env.mjs'

const contract = await import('fishball-connector/contract')
const { languageOf, LANG: PAGE_LANG } = await loadInstance('src/slim/ui/i18n.js')

/**
 * The connector's framedUrl, cut from client.js with the declarations it reads (FRAME_UI and
 * splitAt), and evaluated alone. Throws when the source no longer has that shape, so a refactor
 * shows here as a harness failure rather than a silent pass.
 */
function loadFramedUrl() {
  const source = fs.readFileSync(path.join(BODY_SOUL.connector, 'client.js'), 'utf8')
  const cut = (startMark, endMark) => {
    const start = source.indexOf(startMark)
    if (start < 0) throw new Error('client.js: ' + startMark + ' not found')
    const end = source.indexOf(endMark, start)
    if (end < 0) throw new Error('client.js: end of ' + startMark + ' not found')
    return source.slice(start, end + endMark.length)
  }
  const frameUi = cut('const FRAME_UI = Object.freeze({', '\n    })')
  const splitAt = cut('function splitAt(', '\n    }')
  const framedUrl = cut('function framedUrl(', '\n    }')
  return vm.runInNewContext(frameUi + '\n' + splitAt + '\n' + framedUrl + '\nframedUrl', { Object, URLSearchParams, encodeURIComponent })
}
const framedUrl = loadFramedUrl()

describe('K2 contract 1.1', () => {
  it('K2-V-01 CONNECTOR_CONTRACT is 1.1 of fishball-connector', () => {
    assert.deepEqual({ ...contract.CONNECTOR_CONTRACT }, { id: 'fishball-connector', major: 1, minor: 1 })
  })
  it('K2-V-02 UI_LANG names `lang` with exactly the values zh and en', () => {
    assert.equal(contract.UI_LANG.parameter, 'lang')
    assert.deepEqual(Object.values(contract.UI_LANG.values).sort(), ['en', 'zh'])
  })
  it('K2-V-03 a 1.0 instance still negotiates (common minor 0)', () => {
    assert.deepEqual({ ...contract.negotiateContract({ id: 'fishball-connector', major: 1, minor: 0 }) }, { id: 'fishball-connector', major: 1, minor: 0 })
  })
  it('K2-V-04 the common minor is the lower of the two', () => {
    assert.equal(contract.negotiateContract({ id: 'fishball-connector', major: 1, minor: 1 }).minor, 1)
    assert.equal(contract.negotiateContract({ id: 'fishball-connector', major: 1, minor: 5 }).minor, 1)
  })
  for (const declared of [{ id: 'fishball-connector', major: 0, minor: 1 }, { id: 'fishball-connector', major: 2, minor: 0 }, { id: 'other', major: 1, minor: 1 }]) {
    it('K2-V-05 ' + JSON.stringify(declared) + ' → contract-version', () => {
      assert.throws(() => contract.negotiateContract(declared), (error) => error.code === 'contract-version')
    })
  }
  const descriptor = (minor, ui) => ({
    id: 'fbtest-instance', name: 'Fbtest instance', contract: { id: 'fishball-connector', major: 1, minor },
    transport: { send() {}, onMessage() {}, onClose() {}, close() {} }, ui,
  })
  it('K2-V-06 a 1.0 descriptor with chat and settings is accepted, its ui unchanged', () => {
    const ui = { chat: '/fishball/embed/', settings: '/fishball/embed/?view=settings' }
    const accepted = contract.validateAttachment(descriptor(0, ui))
    assert.equal(accepted.contract.minor, 0)
    assert.deepEqual({ ...accepted.ui }, ui)
  })
  it('K2-V-07 a registered path that already carries lang is still accepted', () => {
    assert.doesNotThrow(() => contract.validateAttachment(descriptor(1, { chat: '/fishball/embed/?lang=en' })))
  })
  it('K2-V-08 the instance page reads the same parameter name', () => assert.equal(PAGE_LANG.parameter, contract.UI_LANG.parameter))
})

describe('K2 the framed address (connector framedUrl, evaluated from source)', () => {
  const cases = [
    ['K2-F-EP-01 no query gets one', '/fishball/embed/', 'zh', '/fishball/embed/?lang=zh'],
    ['K2-F-EP-02 a query gets lang last', '/fishball/embed/?view=settings', 'zh', '/fishball/embed/?view=settings&lang=zh'],
    ['K2-F-EP-03 query and fragment', '/fishball/embed/?view=settings#x', 'zh', '/fishball/embed/?view=settings&lang=zh#x'],
    ['K2-F-EP-04 fragment without a query', '/p#x', 'en', '/p?lang=en#x'],
    ['K2-F-EP-05 an existing lang is replaced', '/p?lang=en', 'zh', '/p?lang=zh'],
    ['K2-F-EP-06 every existing lang is removed, others kept in order', '/p?lang=en&view=settings&lang=fr', 'zh', '/p?view=settings&lang=zh'],
    ['K2-F-EP-07 a URL-encoded lang name is removed too', '/p?%6Cang=en', 'zh', '/p?lang=zh'],
    ['K2-F-EP-09 other parameters keep their exact spelling and order', '/p?b=%20x&a=1', 'en', '/p?b=%20x&a=1&lang=en'],
    ['K2-F-EP-10 empty & segments are dropped', '/p?&view=settings&&', 'en', '/p?view=settings&lang=en'],
    ['K2-F-EP-11 the fragment is left untouched', '/p#lang=en?x', 'zh', '/p?lang=zh#lang=en?x'],
  ]
  for (const [name, registered, lang, expected] of cases) {
    it(name + ': ' + registered + ' + ' + lang + ' → ' + expected, () => assert.equal(framedUrl(registered, lang), expected))
  }
  it('K2-F-EP-08 a LANG parameter in another case', { todo: 'open question: contract §1.2 compares names "URL-decoded"; it does not say whether `LANG` counts as `lang` (the page reads exactly `lang`)' }, () => {})
  for (const lang of ['zh', 'en']) {
    it('K2-F-P-01 locale ' + lang + ': the page\'s first lang is exactly ' + lang, () => {
      for (const registered of ['/fishball/embed/', '/fishball/embed/?lang=fr&view=settings', '/fishball/embed/?view=settings#x']) {
        const search = new URL(framedUrl(registered, lang), 'http://main.invalid').searchParams
        assert.equal(search.get('lang'), lang)
        assert.deepEqual(search.getAll('lang'), [lang])
      }
    })
    it('K2-F-P-02 locale ' + lang + ': the instance page shows that language', () => {
      for (const registered of ['/fishball/embed/', '/fishball/embed/?lang=en&view=settings']) {
        assert.equal(languageOf(new URL(framedUrl(registered, lang), 'http://main.invalid').search), lang)
      }
    })
  }
})
