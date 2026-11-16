/**
 * K2 — the framed path's `lang` (the V2 contract rows K2-V-* and the slim page's K2-F-P-02 left with
 * the V2 child path, REMOVE-V2) (docs/slim-native-design.md §0.9 U4, §18.2 K2;
 * docs/connector-contract.md §1.2 "The language parameter", §2, §10, §11).
 * Observation points:
 * - the framed address rule. The connector's `framedUrl(path, lang)` sits inside the browser
 *   bundle's closure (packages/dsh-connector-ui/src/client/client.shell.js since U-SHELL's split, loaded by DSH's client module loader), so it is
 *   not importable. These cases evaluate that one function's source text in isolation, with
 *   the bundle's own FRAME_UI constants object, and compare with the addresses the contract
 *   states. The iframe `src`, "Open in a tab" and the reload on a locale change are the browser phase.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
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
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { describe, it } from 'node:test'
import { EMBED_UI } from './support/constants.mjs'

/**
 * The connector's framedUrl, cut from client.js with the declarations it reads (FRAME_UI and
 * splitAt), and evaluated alone. Throws when the source no longer has that shape, so a refactor
 * shows here as a harness failure rather than a silent pass.
 */
function loadFramedUrl() {
  const source = fs.readFileSync(EMBED_UI.connectorClient, 'utf8')
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
  }
})
