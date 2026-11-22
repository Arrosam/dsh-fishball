/**
 * fishball-test-helpers ./wcag and ./browser.
 * Techniques: BVA for the contrast ratio at its ends (1:1, 21:1) and either side of the AA
 * thresholds (#767676 / #777777 on white around 4.5; #949494 / #959595 around 3), EP for the colour
 * syntaxes and alpha compositing, and one real Chromium launch that measures a known colour pair
 * with DSH's own page styles loaded (skipped, with BROWSER.skipNoChrome, only when no Chromium is
 * installed).
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import test from 'node:test'
import { BROWSER, DSH_STYLES, PROBE, chromeBinary, documentOf, dshSheetCount, frontendStyles, htmlOf, keyFor, measure, startEnvironment, stopBrowser, themeSheets } from '../browser.mjs'
import { DSH_VERSION } from '../dsh.mjs'
import { STAND_IN } from '../dsh-primitives.mjs'
import { WCAG, backdrop, contrast, luminance, meets, over, parseColour, shown } from '../wcag.mjs'

const C = Object.freeze({ white: '#ffffff', black: '#000000', aaPass: '#767676', aaFail: '#777777', shapePass: '#949494', shapeFail: '#959595' })

const RATIO_ROWS = Object.freeze([
  { row: 1, a: C.white, b: C.white, shown: '1.00', text: false, shape: false, why: 'same colour: the minimum 1' },
  { row: 2, a: C.black, b: C.white, shown: '21.00', text: true, shape: true, why: 'black on white: the maximum 21' },
  { row: 3, a: C.aaPass, b: C.white, shown: '4.54', text: true, shape: true, why: 'just above 4.5' },
  { row: 4, a: C.aaFail, b: C.white, shown: '4.48', text: false, shape: true, why: 'just below 4.5' },
  { row: 5, a: C.shapePass, b: C.white, shown: '3.03', text: false, shape: true, why: 'just above 3' },
  // 2.998: reported as 3.00, still below 3 — the minimum is compared unrounded, as WCAG compares it.
  { row: 6, a: C.shapeFail, b: C.white, shown: '3.00', text: false, shape: false, why: 'just below 3 (shown 3.00)' },
])
for (const r of RATIO_ROWS) {
  test(`HLP-WCAG-BVA-01 row ${r.row} ${r.a} on ${r.b}: ${r.why} → ${r.shown}:1, text ${r.text ? 'meets' : 'fails'} ${WCAG.text}, shape ${r.shape ? 'meets' : 'fails'} ${WCAG.shape}`, () => {
    const ratio = contrast(r.a, r.b)
    assert.equal(shown(ratio), r.shown)
    assert.equal(meets(ratio, WCAG.text), r.text)
    assert.equal(meets(ratio, WCAG.shape), r.shape)
    assert.equal(contrast(r.b, r.a), ratio, 'symmetric')
  })
}

const SYNTAX_ROWS = Object.freeze([
  ['rgb(255, 0, 0)', { r: 1, g: 0, b: 0, a: 1 }],
  ['rgba(0, 0, 255, 0.5)', { r: 0, g: 0, b: 1, a: 0.5 }],
  ['rgb(0 255 0 / 25%)', { r: 0, g: 1, b: 0, a: 0.25 }],
  ['color(srgb 1 0.5 0 / 0.4)', { r: 1, g: 0.5, b: 0, a: 0.4 }],
  ['#f00', { r: 1, g: 0, b: 0, a: 1 }],
  ['#00ff0080', { r: 0, g: 1, b: 0, a: 128 / 255 }],
])
for (const [text, colour] of SYNTAX_ROWS) {
  test(`HLP-WCAG-EP-01 parseColour(${JSON.stringify(text)})`, () => assert.deepEqual(parseColour(text), colour))
}
test('HLP-WCAG-EP-02 any other colour syntax is refused, not guessed', () => {
  for (const text of ['red', 'hsl(0 100% 50%)', 'transparent', '']) assert.throws(() => parseColour(text), /not a colour/)
})

test('HLP-WCAG-EP-03 compositing: half black over white is mid grey; a stack paints from its innermost opaque layer; no opaque layer throws', () => {
  const half = over(parseColour('rgba(0, 0, 0, 0.5)'), parseColour(C.white))
  assert.deepEqual(half, { r: 0.5, g: 0.5, b: 0.5, a: 1 })
  assert.deepEqual(over(parseColour(C.black), parseColour(C.white), 0), parseColour(C.white), 'opacity 0 leaves the bottom')
  assert.deepEqual(backdrop(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)']), half)
  assert.throws(() => backdrop(['rgba(0, 0, 0, 0)']), /no opaque background/)
  assert.equal(luminance(parseColour(C.white)), 1)
  assert.equal(luminance(parseColour(C.black)), 0)
})

// ------------------------------------------------------------------------------- DSH's styles (no browser)

test(`HLP-BRW-EP-01 [DSH ${DSH_VERSION}] DSH's page styles, theme sheets and Tag class are read from the installed DSH; documentOf orders them before a page's own`, () => {
  const { sheets, tagClass } = frontendStyles()
  assert.ok(sheets.length > 0)
  assert.ok(themeSheets().length > 0)
  assert.equal(dshSheetCount(), sheets.length + themeSheets().length)
  assert.equal(typeof tagClass, 'string')
  const html = documentOf({ sheets: ['.fbtest-own{}'], dark: true, tree: [{ tag: 'span', props: { [STAND_IN.primitive]: DSH_STYLES.tagPrimitive, className: 'mine' }, children: ['t'] }] })
  assert.ok(html.indexOf('.fbtest-own{}') > html.indexOf(themeSheets().at(-1)), "a page's own sheet comes after DSH's")
  assert.ok(html.includes('<body ' + DSH_STYLES.darkAttribute + '>'))
  assert.ok(html.includes(`class="${tagClass} mine"`), "a Tag stand-in gets the real Tag's class first")
})

test('HLP-BRW-EP-02 htmlOf writes props as attributes (class, for, style, booleans), escapes text and leaves out handlers', () => {
  const node = { tag: 'label', props: { className: 'a', htmlFor: 'x', style: { fontSize: '2px' }, hidden: true, off: false, onClick() {}, title: '"<q>"' }, children: ['a < b', { tag: 'input', props: { value: 'v' }, children: [] }] }
  assert.equal(htmlOf(node, null), '<label class="a" for="x" style="font-size:2px" hidden title="&quot;&lt;q&gt;&quot;">a &lt; b<input value="v"></label>')
  assert.deepEqual(keyFor('KeyK', ['meta']), { key: 'k', keyCode: 75, code: 'KeyK', modifiers: ['meta'] })
  assert.throws(() => keyFor('Nope'), /no key description/)
})

// ------------------------------------------------------------------------------- one real Chromium

const chrome = chromeBinary()
after(stopBrowser)

test(`HLP-BRW-UC-01 [DSH ${DSH_VERSION}] Chromium with DSH's styles measures #767676 text on a white fill: 4.54:1, meets AA text`, { skip: chrome ? false : BROWSER.skipNoChrome }, async () => {
  const html = documentOf({ body: '<div id="card" style="background:#ffffff"><p id="t" style="color:#767676">fbtest</p></div>' })
  const probe = await measure(html, PROBE, { target: '#t', root: '#card', ownSheetsFrom: dshSheetCount(), colours: ['#777777'] })
  assert.equal(probe.missing, undefined)
  assert.equal(probe.shownText, 'fbtest')
  const ratio = contrast(parseColour(probe.text), backdrop(probe.layers))
  assert.equal(shown(ratio), '4.54')
  assert.ok(meets(ratio, WCAG.text))
  assert.ok(!meets(contrast(parseColour(probe.colours['#777777']), backdrop(probe.layers)), WCAG.text), 'the control colour, resolved by Chromium, fails')
  assert.deepEqual(probe.declarations, [], 'no own sheets after DSH\'s: nothing read')
})

test('HLP-BRW-UC-02 loopback origins serve their routes; a tab opens, evaluates, and a missing route is a 404', { skip: chrome ? false : BROWSER.skipNoChrome }, async () => {
  const env = await startEnvironment({ origins: { a: { '/': () => '<!doctype html><title>a</title><script src="/s.js"></script>', '/s.js': () => 'window.ran = 1' }, b: (url) => (url.pathname === '/b' ? { type: 'text/plain', body: 'bee' } : undefined) } })
  try {
    assert.notEqual(env.origin('a'), env.origin('b'), 'distinct origins')
    const tab = await env.open('a', '/')
    assert.equal(await tab.evaluate('window.ran'), 1)
    assert.equal(await tab.evaluate(`fetch(${JSON.stringify(env.origin('b') + '/b')}).then((r) => r.status).catch(() => 'cors')`), 'cors', 'another origin is another origin')
    assert.equal(await tab.evaluate('fetch("/missing").then((r) => r.status)'), 404)
    await tab.close()
  } finally {
    await env.stop()
  }
})
