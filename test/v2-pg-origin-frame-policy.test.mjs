/**
 * PG-ORIGIN — the connector's Fishball iframe permission policy (Fishball decision 2026-11-10).
 * Requirement: the frame marked `'data-fishball-embed-frame': true` renders with `allow` exactly
 * `clipboard-write *` (write-only clipboard for whatever origin the frame lands on, because the child
 * DSH runs at its own origin) and `referrerPolicy` `no-referrer`. No other feature is granted; in
 * particular no `clipboard-read`.
 *
 * Observation point: the connector UI (packages/embed-ui/src/client/client.connector.js since R-EMBED) is a browser bundle loaded by DSH's client module
 * loader, so it is not importable. As in body-soul-k2-frame.test.mjs, the source text is cut: the
 * `h('iframe', { … })` call carrying the marker prop is located, the constants its `allow` and
 * `referrerPolicy` props reference are read from it, and the frozen constants object they name is
 * evaluated alone in a vm context to obtain the runtime values. Expected values come from the
 * requirement only. A source shape that cannot be found throws a harness error (no silent pass).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | PGO-FRAME-01 | P | exactly one h('iframe', …) carries the marker prop, with one allow and one referrerPolicy prop, no spread that could override them |
 * | PGO-FRAME-02 | P | allow === 'clipboard-write *' |
 * | PGO-FRAME-03 | BVA (feature count = 1) | splitting on ';' gives exactly one directive |
 * | PGO-FRAME-04 | EP (directive shape) | that directive's feature is 'clipboard-write' and its allowlist is exactly ['*'] |
 * | PGO-FRAME-05 | EP (forbidden feature) | no 'clipboard-read' anywhere in the value |
 * | PGO-FRAME-06 | P | referrerPolicy === 'no-referrer' |
 * | PGO-FRAME-07 | P | the iframe's allow / referrerPolicy props reference exactly the constants evaluated above |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, it } from 'node:test'
import { BODY_SOUL } from './support/body-soul-env.mjs'
import { EMBED_UI } from './support/constants.mjs'

/** Expected values, from the requirement (not from the source). */
const EXPECTED = Object.freeze({
  allow: 'clipboard-write *',
  feature: 'clipboard-write',
  allowlist: Object.freeze(['*']),
  forbidden: 'clipboard-read',
  referrerPolicy: 'no-referrer',
  marker: "'data-fishball-embed-frame': true",
  iframeCall: "h('iframe', {",
  directiveSeparator: ';',
})

function harness(message) {
  return new Error('PG-ORIGIN harness: client.js ' + message)
}

const source = fs.readFileSync(EMBED_UI.connectorClient, 'utf8')

/**
 * The text of the object literal starting at `open` (a `{`), up to its matching `}`. Quoted
 * strings and comments (whose prose may hold apostrophes) are skipped; a template literal's
 * `${…}` braces are balanced, so they need no special case.
 */
function objectAt(open) {
  let depth = 0
  let quote = null
  for (let i = open; i < source.length; i++) {
    const c = source[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); if (i < 0) break; continue }
    if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2) + 1; if (i <= 0) break; continue }
    if (c === "'" || c === '"') quote = c
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return source.slice(open, i + 1)
  }
  throw harness('unbalanced object literal at offset ' + open)
}

/** Every h('iframe', { … }) props object text in the bundle. */
function iframeProps() {
  const found = []
  for (let at = source.indexOf(EXPECTED.iframeCall); at >= 0; at = source.indexOf(EXPECTED.iframeCall, at + 1)) {
    found.push(objectAt(at + EXPECTED.iframeCall.length - 1))
  }
  return found
}

const framed = iframeProps().filter((props) => props.includes(EXPECTED.marker))
if (framed.length === 0) throw harness("no h('iframe', { … }) with the marker prop " + EXPECTED.marker)
const props = framed[0]

/** The `Name.member` a prop references, e.g. allow: EMBED_UI.iframeAllow → {object, member}. */
function propReference(name) {
  const matches = [...props.matchAll(new RegExp('(?:^|[{,\\s])' + name + '\\s*:\\s*([A-Za-z_$][\\w$]*)\\.([A-Za-z_$][\\w$]*)\\s*(?=[,}])', 'g'))]
  if (matches.length === 0) throw harness('iframe prop ' + name + ' is not a Constant.member reference: ' + props)
  return { object: matches[0][1], member: matches[0][2], count: matches.length }
}
const allowRef = propReference('allow')
const referrerRef = propReference('referrerPolicy')

/** The frozen constants object `const Name = Object.freeze({ … })`, evaluated alone. */
function evaluateConstants(object) {
  const mark = 'const ' + object + ' = Object.freeze('
  const at = source.indexOf(mark)
  if (at < 0) throw harness(mark + ' not found')
  const open = at + mark.length
  if (source[open] !== '{') throw harness(mark + ' is not followed by an object literal')
  const literal = objectAt(open)
  return vm.runInNewContext('const ' + object + ' = Object.freeze(' + literal + ')\n' + object, { Object })
}
const constants = new Map([allowRef.object, referrerRef.object].map((name) => [name, evaluateConstants(name)]))
const value = (ref) => {
  const object = constants.get(ref.object)
  if (!Object.hasOwn(object, ref.member)) throw harness(ref.object + '.' + ref.member + ' is not defined')
  return object[ref.member]
}
const allow = value(allowRef)
const referrerPolicy = value(referrerRef)

describe('PG-ORIGIN the Fishball iframe permission policy (connector client.js, evaluated from source)', () => {
  it('PGO-FRAME-01 exactly one marked iframe, with a single allow and referrerPolicy and no overriding spread', () => {
    assert.equal(framed.length, 1, 'marked iframe constructions')
    // Count every key spelling, not only Constant.member ones, so a second literal allow is caught too.
    const keyCount = (name) => [...props.matchAll(new RegExp('(?:^|[{,\\s])[\'"]?' + name + '[\'"]?\\s*:', 'g'))].length
    assert.equal(keyCount('allow'), 1, 'allow props in ' + props)
    assert.equal(keyCount('referrerPolicy'), 1, 'referrerPolicy props in ' + props)
    assert.equal(props.includes('...'), false, 'a spread in the props could override allow/referrerPolicy: ' + props)
  })
  it("PGO-FRAME-02 allow is exactly 'clipboard-write *'", () => {
    assert.equal(allow, EXPECTED.allow)
  })
  it('PGO-FRAME-03 allow holds exactly one directive', () => {
    assert.equal(typeof allow, 'string')
    assert.equal(allow.split(EXPECTED.directiveSeparator).length, 1, 'directives in ' + JSON.stringify(allow))
  })
  it("PGO-FRAME-04 that directive grants clipboard-write to the allowlist ['*'] only", () => {
    const [directive] = allow.split(EXPECTED.directiveSeparator)
    const [feature, ...allowlist] = directive.trim().split(/\s+/)
    assert.equal(feature, EXPECTED.feature)
    assert.deepEqual(allowlist, [...EXPECTED.allowlist])
  })
  it('PGO-FRAME-05 no clipboard-read anywhere in allow', () => {
    assert.equal(allow.includes(EXPECTED.forbidden), false, JSON.stringify(allow))
  })
  it("PGO-FRAME-06 referrerPolicy is exactly 'no-referrer'", () => {
    assert.equal(referrerPolicy, EXPECTED.referrerPolicy)
  })
  it('PGO-FRAME-07 the iframe passes the evaluated constants as its allow and referrerPolicy props', () => {
    assert.equal(allowRef.count, 1)
    assert.equal(referrerRef.count, 1)
    assert.match(props, new RegExp('\\ballow\\s*:\\s*' + allowRef.object + '\\.' + allowRef.member + '\\b'))
    assert.match(props, new RegExp('\\breferrerPolicy\\s*:\\s*' + referrerRef.object + '\\.' + referrerRef.member + '\\b'))
    assert.ok(constants.has(allowRef.object) && constants.has(referrerRef.object))
    assert.ok(Object.isFrozen(constants.get(allowRef.object)), allowRef.object + ' is frozen')
    assert.ok(Object.isFrozen(constants.get(referrerRef.object)), referrerRef.object + ' is frozen')
  })
})
