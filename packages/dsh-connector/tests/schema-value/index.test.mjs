/**
 * Black-box cases for schema-value `validateValue(schema, value)`, run once per installed DSH SDK.
 *
 * Expectations come from the requirements only: equivalence partitions (valid / invalid per keyword),
 * boundary values (integer vs number: 1, 1.5, -0, NaN, Infinity) and a decision table for the
 * walk order that picks the FIRST violation (required, then declared properties in schema order,
 * then undeclared properties). The exact `reason` text is DSH's own: the oracle is DSH's
 * `validateJsonSchemaValue` from the same SDK, called with `$` as the root label, so the reason
 * must equal its first violation.
 */
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const SDK_VERSIONS = ['0.2.1-rc.5', '0.2.2-rc.1']
const SDK_ROOT = 'file:///Users/samuel/Library/Application%20Support/DSH/data/versions/'
const SDK_TAG = 'sdk'
const SDK_TAG_PATTERN = /[?&]sdk=([^&]+)/
const REPO_ROOT = new URL('../../../../', import.meta.url).href
const HOST_SPECIFIER = /^(@deepseek-ai\/|zod(\/|$))/
const MODULE_URL = new URL('../../src/schema-value/index.js', import.meta.url)
const ORACLE_SPECIFIER = '@deepseek-ai/dsh-tools'
const ROOT = '$'

function tagOf(text) {
  return text?.match(SDK_TAG_PATTERN)?.[1]
}

function withoutTag(specifier) {
  return specifier.replace(SDK_TAG_PATTERN, '')
}

function tagged(url, version) {
  const target = new URL(url)
  target.searchParams.set(SDK_TAG, version)
  return target.href
}

/*
 * Host packages resolve only from an installed SDK, so the version travels as a `?sdk=` tag: on the
 * test's own imports it rides on the specifier, and every repo file loaded under a tagged parent is
 * re-tagged so each SDK run gets its own module instances.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    const version = tagOf(specifier) ?? tagOf(context.parentURL)
    if (version === undefined) return nextResolve(specifier, context)
    const bare = withoutTag(specifier)
    if (HOST_SPECIFIER.test(bare)) {
      return nextResolve(bare, { ...context, parentURL: `${SDK_ROOT}${version}/package.json` })
    }
    const result = nextResolve(bare, context)
    if (result.url.startsWith(REPO_ROOT)) return { ...result, url: tagged(result.url, version) }
    return result
  },
})

// ---- value factories (fresh per call, so no case mutates another's input) ----

class Point {
  constructor() {
    this.x = 1
  }
}

function cyclicObject() {
  const value = { a: 1 }
  value.self = value
  return value
}

function cyclicArray() {
  const value = []
  value.push(value)
  return value
}

function throwingGetter() {
  return Object.defineProperty({}, 'name', {
    enumerable: true,
    get() {
      throw new Error('getter exploded')
    },
  })
}

function throwingProxy() {
  const fail = () => {
    throw new Error('trap exploded')
  }
  return new Proxy({}, { get: fail, getPrototypeOf: fail, ownKeys: fail, has: fail, getOwnPropertyDescriptor: fail })
}

function revokedProxy() {
  const { proxy, revoke } = Proxy.revocable({}, {})
  revoke()
  return proxy
}

function sparseArray() {
  // eslint-disable-next-line no-sparse-arrays
  return [, 1]
}

// ---- schemas ----

const S = Object.freeze({
  any: {},
  string: { type: 'string' },
  number: { type: 'number' },
  integer: { type: 'integer' },
  boolean: { type: 'boolean' },
  null: { type: 'null' },
  object: { type: 'object' },
  array: { type: 'array' },
  person: {
    type: 'object',
    properties: { name: { type: 'string' }, age: { type: 'integer' } },
    required: ['name'],
  },
  closed: { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false },
  open: { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: true },
  numbers: { type: 'array', items: { type: 'number' } },
  nested: {
    type: 'object',
    properties: {
      a: {
        type: 'object',
        properties: {
          b: { type: 'string' },
          list: { type: 'array', items: { type: 'object', properties: { b: { type: 'integer' } } } },
        },
      },
      list: { type: 'array', items: { type: 'string' } },
    },
  },
  colour: { type: 'string', enum: ['red', 'green'] },
  smallInt: { type: 'integer', enum: [1, 2, 3] },
  fixed: { type: 'string', const: 'v1' },
  flag: { type: 'boolean', const: true },
  nullableString: { oneOf: [{ type: 'null' }, { type: 'string' }] },
  overlapping: { oneOf: [{ type: 'number' }, { type: 'integer' }] },
  nullableField: {
    type: 'object',
    properties: { note: { oneOf: [{ type: 'null' }, { type: 'string' }] } },
  },
  anyField: { type: 'object', properties: { data: {} } },
  twoStrings: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
  closedPerson: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    additionalProperties: false,
  },
  dotKey: { type: 'object', properties: { 'a.b': { type: 'string' } }, required: ['a.b'] },
  quoteKey: { type: 'object', properties: { 'say"hi': { type: 'string' } }, required: ['say"hi'] },
  closedDot: { type: 'object', properties: {}, additionalProperties: false },
})

// ---- case table: `path` absent means the value is valid ----

const VALID = (name, schema, value) => ({ name, schema, value })
const INVALID = (name, schema, value, path) => ({ name, schema, value, path })

const CASES = [
  // valid partitions
  VALID('valid object with every declared property', S.person, () => ({ name: 'Ann', age: 30 })),
  VALID('valid object with only the required property', S.person, () => ({ name: 'Ann' })),
  VALID('valid object accepts an undeclared property without additionalProperties', S.person, () => ({ name: 'Ann', x: 1 })),
  VALID('valid object accepts an undeclared property with additionalProperties: true', S.open, () => ({ a: 'x', b: 1 })),
  VALID('valid closed object with only declared properties', S.closed, () => ({ a: 'x' })),
  VALID('valid empty object under a closed schema', S.closed, () => ({})),
  VALID('valid array of numbers', S.numbers, () => [1, 2.5, -3]),
  VALID('valid empty array', S.numbers, () => []),
  VALID('valid nested object and array', S.nested, () => ({ a: { b: 'x', list: [{ b: 1 }, {}] }, list: ['p', 'q'] })),
  VALID('valid string scalar', S.string, () => 'hello'),
  VALID('valid empty string', S.string, () => ''),
  VALID('valid boolean scalar', S.boolean, () => false),
  VALID('valid null scalar', S.null, () => null),
  VALID('valid number scalar 1.5', S.number, () => 1.5),
  VALID('valid number scalar 0', S.number, () => 0),
  VALID('valid number scalar Number.MAX_VALUE', S.number, () => Number.MAX_VALUE),
  VALID('valid number accepts an integer value', S.number, () => 1),

  // wrong root type
  INVALID('wrong root type: array for an object schema', S.object, () => [], ROOT),
  INVALID('wrong root type: null for an object schema', S.object, () => null, ROOT),
  INVALID('wrong root type: string for an object schema', S.person, () => 'Ann', ROOT),
  INVALID('wrong root type: object for an array schema', S.array, () => ({}), ROOT),
  INVALID('wrong root type: number for a string schema', S.string, () => 1, ROOT),
  INVALID('wrong root type: string for a boolean schema', S.boolean, () => 'true', ROOT),
  INVALID('wrong root type: 0 for a null schema', S.null, () => 0, ROOT),
  INVALID('wrong root type: numeric string for a number schema', S.number, () => '1', ROOT),
  INVALID('wrong root type: class instance for an object schema', S.object, () => new Point(), ROOT),

  // required
  INVALID('missing required property', S.person, () => ({ age: 3 }), '$.name'),
  INVALID('required property set to undefined counts as missing', S.person, () => ({ name: undefined }), '$.name'),
  INVALID('required property present with the wrong type', S.person, () => ({ name: null }), '$.name'),

  // additionalProperties: false
  INVALID('undeclared property with additionalProperties: false', S.closed, () => ({ a: 'x', b: 1 }), '$.b'),

  // nested paths
  INVALID('wrong nested object property', S.nested, () => ({ a: { b: 7 } }), '$.a.b'),
  INVALID('wrong nested array item reports its index', S.nested, () => ({ list: ['p', 'q', 3] }), '$.list[2]'),
  INVALID('wrong root array item reports its index', S.numbers, () => [1, 2, 'x'], '$[2]'),
  INVALID('wrong property inside an array item', S.nested, () => ({ a: { list: [{ b: 1.5 }] } }), '$.a.list[0].b'),

  // enum / const
  VALID('enum hit', S.colour, () => 'green'),
  INVALID('enum miss', S.colour, () => 'blue', ROOT),
  INVALID('enum miss is case-sensitive', S.colour, () => 'Red', ROOT),
  VALID('integer enum hit on the upper boundary', S.smallInt, () => 3),
  INVALID('integer enum miss just past the upper boundary', S.smallInt, () => 4, ROOT),
  INVALID('integer enum miss below the lower boundary', S.smallInt, () => 0, ROOT),
  VALID('const hit', S.fixed, () => 'v1'),
  INVALID('const miss', S.fixed, () => 'v2', ROOT),
  VALID('boolean const hit', S.flag, () => true),
  INVALID('boolean const miss', S.flag, () => false, ROOT),

  // integer vs number boundaries
  VALID('integer 1', S.integer, () => 1),
  VALID('integer 0', S.integer, () => 0),
  VALID('integer -1', S.integer, () => -1),
  VALID('integer 2^53', S.integer, () => 2 ** 53),
  INVALID('integer refuses 1.5', S.integer, () => 1.5, ROOT),
  INVALID('integer refuses 1 + EPSILON', S.integer, () => 1 + Number.EPSILON, ROOT),
  INVALID('integer refuses -0', S.integer, () => -0, ROOT),
  INVALID('integer refuses NaN', S.integer, () => NaN, ROOT),
  INVALID('integer refuses Infinity', S.integer, () => Infinity, ROOT),
  INVALID('integer refuses a numeric string', S.integer, () => '1', ROOT),
  INVALID('number refuses -0', S.number, () => -0, ROOT),
  INVALID('number refuses NaN', S.number, () => NaN, ROOT),
  INVALID('number refuses Infinity', S.number, () => Infinity, ROOT),
  INVALID('number refuses -Infinity', S.number, () => -Infinity, ROOT),

  // oneOf
  VALID('oneOf nullable matches null', S.nullableString, () => null),
  VALID('oneOf nullable matches the value', S.nullableString, () => 'x'),
  INVALID('oneOf nullable matches neither', S.nullableString, () => 5, ROOT),
  INVALID('oneOf matching two branches is refused', S.overlapping, () => 1, ROOT),
  VALID('oneOf matching exactly one of two overlapping branches', S.overlapping, () => 1.5),
  VALID('nested oneOf matches null', S.nullableField, () => ({ note: null })),
  INVALID('nested oneOf matches neither', S.nullableField, () => ({ note: false }), '$.note'),

  // {} = any lossless JSON
  VALID('{} accepts a number', S.any, () => 1),
  VALID('{} accepts a string', S.any, () => 'x'),
  VALID('{} accepts null', S.any, () => null),
  VALID('{} accepts a boolean', S.any, () => true),
  VALID('{} accepts a nested array', S.any, () => [1, { a: [] }, null]),
  VALID('{} accepts a nested object', S.any, () => ({ a: { b: null, c: ['d'] } })),
  INVALID('{} refuses an undefined field', S.any, () => ({ a: undefined }), ROOT),
  INVALID('{} refuses a function', S.any, () => () => 1, ROOT),
  INVALID('{} refuses a function field', S.any, () => ({ f() {} }), ROOT),
  INVALID('{} refuses a cyclic object', S.any, cyclicObject, ROOT),
  INVALID('{} refuses a cyclic array', S.any, cyclicArray, ROOT),
  INVALID('{} refuses NaN', S.any, () => NaN, ROOT),
  INVALID('{} refuses -0', S.any, () => -0, ROOT),
  INVALID('{} refuses a class instance', S.any, () => new Point(), ROOT),
  INVALID('{} refuses a sparse array', S.any, sparseArray, ROOT),
  INVALID('{} refuses undefined', S.any, () => undefined, ROOT),
  VALID('{} property accepts nested JSON', S.anyField, () => ({ data: { k: [1, 'two'] } })),
  INVALID('{} property refuses a nested function', S.anyField, () => ({ data: { f() {} } }), '$.data'),
  INVALID('{} property refuses a nested cycle', S.anyField, () => ({ data: cyclicObject() }), '$.data'),

  // first violation only (decision table over walk order)
  INVALID('first violation: missing required comes before a wrong-typed property', S.person, () => ({ age: 'old' }), '$.name'),
  INVALID('first violation: missing required comes before an undeclared property', S.closedPerson, () => ({ extra: 1 }), '$.name'),
  INVALID('first violation: wrong-typed property comes before an undeclared property', S.closedPerson, () => ({ extra: 1, name: 2 }), '$.name'),
  INVALID('first violation: declared properties are walked in schema order', S.twoStrings, () => ({ b: 1, a: 2 }), '$.a'),
  INVALID('first violation: the lowest wrong array index wins', S.numbers, () => [1, 'x', 'y'], '$[1]'),
]

// Keys with a dot or a quote: the path must still start with `$.` and carry the key.
const ODD_KEY_CASES = [
  { name: 'property key containing a dot, wrong type', schema: S.dotKey, value: () => ({ 'a.b': 1 }), key: 'a.b' },
  { name: 'property key containing a dot, missing', schema: S.dotKey, value: () => ({}), key: 'a.b' },
  { name: 'property key containing a quote, wrong type', schema: S.quoteKey, value: () => ({ 'say"hi': 1 }), key: 'say"hi' },
  { name: 'property key containing a quote, missing', schema: S.quoteKey, value: () => ({}), key: 'say"hi' },
  { name: 'undeclared key containing a dot', schema: S.closedDot, value: () => ({ 'x.y': 1 }), key: 'x.y' },
  { name: 'undeclared key containing a quote', schema: S.closedDot, value: () => ({ 'x"y': 1 }), key: 'x"y' },
]

// Totality: every schema shape against hostile or non-JSON values must return, never throw.
const TOTALITY_SCHEMAS = { '{}': S.any, object: S.person, array: S.numbers, string: S.string, integer: S.integer, oneOf: S.nullableString }
const HOSTILE_VALUES = {
  'cyclic object': cyclicObject,
  'cyclic array': cyclicArray,
  'undefined field': () => ({ name: 'x', a: undefined }),
  function: () => function named() {},
  'class instance': () => new Point(),
  NaN: () => NaN,
  '-0': () => -0,
  'throwing getter': throwingGetter,
  'throwing Proxy': throwingProxy,
  'revoked Proxy': revokedProxy,
  symbol: () => Symbol('s'),
  bigint: () => 10n,
  undefined: () => undefined,
  'object with a symbol key': () => ({ name: 'x', [Symbol('k')]: 1 }),
  'array with a throwing getter item': () => Object.defineProperty([1], 0, { get() { throw new Error('item') } }),
}

// ---- assertions shared by every case ----

function assertFrozenValid(result) {
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(Object.keys(result), ['ok'])
  assert.ok(Object.isFrozen(result), 'result must be frozen')
}

function assertFrozenInvalid(result) {
  assert.equal(result.ok, false)
  assert.deepEqual(Object.keys(result).sort(), ['ok', 'path', 'reason'])
  assert.ok(Object.isFrozen(result), 'result must be frozen')
  assert.equal(typeof result.path, 'string')
  assert.ok(result.path === ROOT || result.path.startsWith(`${ROOT}.`) || result.path.startsWith(`${ROOT}[`),
    `path ${JSON.stringify(result.path)} must start at ${ROOT}`)
  assert.equal(typeof result.reason, 'string')
  assert.ok(result.reason.length > 0, 'reason must be non-empty')
  assert.ok(result.reason.includes(result.path), `reason ${JSON.stringify(result.reason)} must mention ${result.path}`)
}

function assertDshReason(oracle, schema, value, result) {
  const violations = oracle(schema, value, ROOT)
  assert.ok(violations.length > 0, 'DSH oracle must also refuse this value')
  assert.equal(result.reason, violations[0])
}

for (const version of SDK_VERSIONS) {
  const load = async () => {
    const [{ validateValue }, { validateJsonSchemaValue }] = await Promise.all([
      import(tagged(MODULE_URL, version)),
      import(`${ORACLE_SPECIFIER}?${SDK_TAG}=${version}`),
    ])
    return { validateValue, oracle: validateJsonSchemaValue }
  }
  const loaded = load()
  const label = (name) => `[SDK ${version}] ${name}`

  test(label('module exports validateValue as a function'), async () => {
    const { validateValue } = await loaded
    assert.equal(typeof validateValue, 'function')
  })

  for (const { name, schema, value, path } of CASES) {
    test(label(name), async () => {
      const { validateValue, oracle } = await loaded
      const result = validateValue(schema, value())
      if (path === undefined) {
        assertFrozenValid(result)
        return
      }
      assertFrozenInvalid(result)
      assert.equal(result.path, path)
      assertDshReason(oracle, schema, value(), result)
    })
  }

  for (const { name, schema, value, key } of ODD_KEY_CASES) {
    test(label(name), async () => {
      const { validateValue, oracle } = await loaded
      const result = validateValue(schema, value())
      assertFrozenInvalid(result)
      assert.ok(result.path.startsWith(`${ROOT}.`), `path ${JSON.stringify(result.path)} must start with $.`)
      assert.ok(result.path.includes(key), `path ${JSON.stringify(result.path)} must carry the key ${key}`)
      assertDshReason(oracle, schema, value(), result)
    })
  }

  for (const [schemaName, schema] of Object.entries(TOTALITY_SCHEMAS)) {
    for (const [valueName, value] of Object.entries(HOSTILE_VALUES)) {
      test(label(`total: ${schemaName} schema refuses ${valueName} without throwing`), async () => {
        const { validateValue } = await loaded
        let result
        assert.doesNotThrow(() => {
          result = validateValue(schema, value())
        })
        assertFrozenInvalid(result)
      })
    }
  }

  test(label('a valid Proxy-free value is not affected by a previous hostile call'), async () => {
    const { validateValue } = await loaded
    validateValue(S.person, throwingProxy())
    assertFrozenValid(validateValue(S.person, { name: 'Ann' }))
  })
}
