/**
 * P8 X1-X3, X9, X10: the ctx.fishball service, registerSource checks and limits, source identity,
 * state.sources and the client strings. One host with the source fixtures (FBTEST_SOURCES=1).
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | SRC-01 | EP (ctx.inject / static inject / plain host row) | X1 | the root realm has 'fishball' with registerSource; each fixture row got the service context; a source has enabled, publish and onEnabled |
 * | SRC-02 ×16 | EP + BVA (source id) | X2 | 'a', 'Z', '0', 'a.b_c-d', 64 characters accepted; '', 65 characters, '.a', '_a', '-a', 'a b', 'a/b', 'é', 1, missing: FISHBALL_INVALID |
 * | SRC-03 ×7 | EP + BVA (title bytes) | X2 | 1 byte, 200 ASCII bytes, 200 bytes of 2-byte characters accepted; '', missing, 201 ASCII bytes, 199 + one 2-byte character: FISHBALL_INVALID |
 * | SRC-04 ×5 | EP + BVA (description bytes) | X2 | absent, 1024 ASCII bytes, 1024 bytes of 2-byte characters accepted; 1025 bytes and 1023 + one 2-byte character: FISHBALL_INVALID |
 * | SRC-05 ×4 | DT (same row / other row of the bundle / other bundle / host row) | X2, X3 | the same id twice from one row: FISHBALL_SOURCE_DUPLICATE; from the bundle's other row, another bundle and a host row: accepted, each with its own identity |
 * | SRC-06 | BVA (default maxSourcesPerPlugin 8) | X2, X10 | the 8th source of one bundle is accepted, the 9th FISHBALL_LIMIT; a rejected registration is not listed |
 * | SRC-07 | BVA (limit = n + 2, two rows of one bundle) | X2 | one more from each row accepted (n + 2), then FISHBALL_LIMIT from either row |
 * | SRC-08 | EP | X3 | identities: profile bundle row 'fbtest-source/fbtest-source/<id>', its second row 'fbtest-source/fbtest-source-b/<id>', static inject 'fbtest-source-static/…', the host row '<module name>/fbtest-source-row/<id>' (A87) |
 * | SRC-09 | EP | X9 | state.sources is {sources:[…]}, each entry exactly identity, plugin, title, enabled; plugin is the catalog key for bundle rows and null for the host row; every catalog key named exists in the catalog |
 * | SRC-10 | ST (SSE) | X9 | a frame shows a newly registered source |
 * | SRC-11 | EP (root context, no loader row) | §8 as built | registerSource throws (code FISHBALL_UNKNOWN_PLUGIN) |
 * | SRC-12 | EP | X9 | the client bundle has 'Plugin sources' and 'Plugin event' |
 * | SRC-13 | EP (detached call) | X10 (guide) | registerSource taken off ctx.fishball and called alone throws FISHBALL_UNKNOWN_PLUGIN |
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { API, LIMITS, SOURCE_BOUNDS, SOURCE_BUNDLES, SOURCE_ERR, SOURCE_IDENTITY, SOURCE_KEYS, SOURCE_ROW, SOURCE_UI, SOURCES_ENV, SOURCES_KEYS, STATUS } from './support/constants.mjs'
import { HOOK, T, fishballClientBundle, register, settle, sourcesNow } from './support/expect.mjs'
import { bootHost, newHome, until } from './support/host.mjs'

const A = SOURCE_BUNDLES.profile
const S = SOURCE_BUNDLES.static
const LA = A.rows.a.label
const LB = A.rows.b.label
const LS = S.rows.a.label
let seq = 0
const ROOMY = 1000
const uid = (p = 's') => p + (++seq) + Math.random().toString(36).slice(2, 6)
const codeOf = (r) => (r.ok ? 'ok' : r.error?.code)
/** The host row's identity: the module name as the overlay gives it, or its file URL (A87). */
const rowIdentities = (id) => [SOURCE_IDENTITY(SOURCE_ROW.module, SOURCE_ROW.id, id), SOURCE_IDENTITY(pathToFileURL(SOURCE_ROW.module).href, SOURCE_ROW.id, id)]

describe('P8 ctx.fishball: registerSource', () => {
  let host
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const ofBundle = async (bundle) => ((await sourcesNow(host))?.sources ?? []).filter((s) => s.identity.startsWith(bundle + '/'))

  before(async () => {
    host = await bootHost(newHome('src-register'), { env: SOURCES_ENV })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'precondition: live')
    await settle(host)
    // The equivalence rows register many valid sources; a roomy limit keeps them apart from SRC-06/07, which set their own.
    await setLimit({ maxSourcesPerPlugin: ROOMY })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('SRC-01 the root realm provides fishball; ctx.inject and a static inject both get it; a source has enabled, publish, onEnabled', T, async () => {
    assert.deepEqual(await host.call('fishballService'), { present: true, hasRegister: true })
    for (const label of [LA, LB, LS, SOURCE_ROW.label]) {
      const row = await host.call('sourceRow', { label })
      assert.equal(row.captured, true, label + ' got the fishball context: ' + JSON.stringify(row))
    }
    const r = await register(host, LS, { id: uid('shape'), title: 'Shape' })
    assert.equal(r.ok, true, JSON.stringify(r.error))
    // enabled may be a getter (not an own key); its value must be a boolean.
    for (const k of ['onEnabled', 'publish']) assert.ok(r.keys.includes(k), 'source has ' + k + ': ' + JSON.stringify(r.keys))
    assert.equal(typeof r.enabled, 'boolean')
  })

  const ID_ROWS = [
    ['a', 'ok'], ['Z', 'ok'], ['0', 'ok'], ['a.b_c-d', 'ok'], ['x'.repeat(SOURCE_BOUNDS.idChars), 'ok'],
    ['', SOURCE_ERR.invalid], ['x'.repeat(SOURCE_BOUNDS.idChars + 1), SOURCE_ERR.invalid], ['.a', SOURCE_ERR.invalid], ['_a', SOURCE_ERR.invalid],
    ['-a', SOURCE_ERR.invalid], ['a b', SOURCE_ERR.invalid], ['a/b', SOURCE_ERR.invalid], ['é', SOURCE_ERR.invalid], [1, SOURCE_ERR.invalid], [undefined, SOURCE_ERR.invalid],
  ]
  // Valid ids go to a bundle row that has room (the limit is checked in SRC-06/07); each row gets its own.
  for (const [id, want] of ID_ROWS) {
    it('SRC-02 source id ' + JSON.stringify(id === undefined ? '(missing)' : String(id).length > 12 ? String(id).length + ' characters' : id) + ' -> ' + want, T, async () => {
      const label = want === 'ok' ? SOURCE_ROW.label : LA
      const def = { title: 'Id case', ...(id === undefined ? {} : { id }) }
      assert.equal(codeOf(await register(host, label, def, 'id:' + uid())), want)
    })
  }

  const TITLE_ROWS = [
    ['1 byte', 't', 'ok'], ['200 ASCII bytes', 'b'.repeat(SOURCE_BOUNDS.sourceTitleBytes), 'ok'], ['200 bytes of 2-byte characters', 'é'.repeat(SOURCE_BOUNDS.sourceTitleBytes / 2), 'ok'],
    ['empty', '', SOURCE_ERR.invalid], ['missing', undefined, SOURCE_ERR.invalid], ['201 ASCII bytes', 'b'.repeat(SOURCE_BOUNDS.sourceTitleBytes + 1), SOURCE_ERR.invalid],
    ['199 bytes + one 2-byte character', 'b'.repeat(SOURCE_BOUNDS.sourceTitleBytes - 1) + 'é', SOURCE_ERR.invalid],
  ]
  for (const [name, title, want] of TITLE_ROWS) {
    it('SRC-03 source title ' + name + ' -> ' + want, T, async () => {
      const r = await register(host, want === 'ok' ? SOURCE_ROW.label : LA, { id: uid('t'), ...(title === undefined ? {} : { title }) }, 'title:' + uid())
      assert.equal(codeOf(r), want)
    })
  }

  const DESC_ROWS = [
    ['absent', undefined, 'ok'], ['1024 ASCII bytes', 'd'.repeat(SOURCE_BOUNDS.descriptionBytes), 'ok'], ['1024 bytes of 2-byte characters', 'é'.repeat(SOURCE_BOUNDS.descriptionBytes / 2), 'ok'],
    ['1025 ASCII bytes', 'd'.repeat(SOURCE_BOUNDS.descriptionBytes + 1), SOURCE_ERR.invalid], ['1023 bytes + one 2-byte character', 'd'.repeat(SOURCE_BOUNDS.descriptionBytes - 1) + 'é', SOURCE_ERR.invalid],
  ]
  for (const [name, description, want] of DESC_ROWS) {
    it('SRC-04 description ' + name + ' -> ' + want, T, async () => {
      const r = await register(host, want === 'ok' ? SOURCE_ROW.label : LA, { id: uid('d'), title: 'Desc', ...(description === undefined ? {} : { description }) }, 'desc:' + uid())
      assert.equal(codeOf(r), want)
    })
  }

  describe('SRC-05 the same id from different callers (decision table)', () => {
    const id = uid('dup')
    it('SRC-05a first registration from row fbtest-source -> accepted', T, async () => {
      assert.equal(codeOf(await register(host, LA, { id, title: 'Dup' }, 'dup:a1')), 'ok')
    })
    it('SRC-05b the same id again from the same row -> FISHBALL_SOURCE_DUPLICATE', T, async () => {
      assert.equal(codeOf(await register(host, LA, { id, title: 'Dup again' }, 'dup:a2')), SOURCE_ERR.duplicate)
    })
    it('SRC-05c the same id from the bundle\'s other row -> accepted, another identity', T, async () => {
      assert.equal(codeOf(await register(host, LB, { id, title: 'Dup b' }, 'dup:b')), 'ok')
    })
    it('SRC-05d the same id from another bundle and from a host row -> accepted', T, async () => {
      assert.equal(codeOf(await register(host, LS, { id, title: 'Dup s' }, 'dup:s')), 'ok')
      assert.equal(codeOf(await register(host, SOURCE_ROW.label, { id, title: 'Dup r' }, 'dup:r')), 'ok')
      const ids = (await sourcesNow(host)).sources.map((s) => s.identity)
      for (const want of [SOURCE_IDENTITY(A.name, A.rows.a.id, id), SOURCE_IDENTITY(A.name, A.rows.b.id, id), SOURCE_IDENTITY(S.name, S.rows.a.id, id)]) assert.ok(ids.includes(want), want + ' in ' + JSON.stringify(ids))
      assert.ok(rowIdentities(id).some((x) => ids.includes(x)), 'host row identity in ' + JSON.stringify(ids))
      assert.equal(ids.filter((x) => x === SOURCE_IDENTITY(A.name, A.rows.a.id, id)).length, 1, 'the duplicate is not listed twice')
    })
  })

  it('SRC-06 default maxSourcesPerPlugin: the 8th source of a bundle is accepted, the 9th FISHBALL_LIMIT', T, async () => {
    await setLimit({ maxSourcesPerPlugin: LIMITS.maxSourcesPerPlugin.default })
    try {
    const have = (await ofBundle(S.name)).length
    assert.ok(have < LIMITS.maxSourcesPerPlugin.default, 'precondition: room in ' + S.name + ' (' + have + ')')
    for (let n = have + 1; n <= LIMITS.maxSourcesPerPlugin.default; n++) assert.equal(codeOf(await register(host, LS, { id: uid('lim'), title: 'Limit ' + n }, 'lim:' + n)), 'ok', 'source ' + n)
    const over = uid('over')
    assert.equal(codeOf(await register(host, LS, { id: over, title: 'Over' }, 'lim:over')), SOURCE_ERR.limit)
    const listed = await ofBundle(S.name)
    assert.equal(listed.length, LIMITS.maxSourcesPerPlugin.default)
    assert.equal(listed.some((s) => s.identity.endsWith('/' + over)), false)
    } finally { await setLimit({ maxSourcesPerPlugin: ROOMY }) }
  })

  it('SRC-07 the limit counts both rows of one bundle (limit = n + 2)', T, async () => {
    const n = (await ofBundle(A.name)).length
    await setLimit({ maxSourcesPerPlugin: n + 2 })
    try {
      assert.equal(codeOf(await register(host, LA, { id: uid('l7'), title: 'L7 a' }, 'l7:a')), 'ok', 'n + 1')
      assert.equal(codeOf(await register(host, LB, { id: uid('l7'), title: 'L7 b' }, 'l7:b')), 'ok', 'n + 2 = the limit')
      assert.equal(codeOf(await register(host, LA, { id: uid('l7'), title: 'L7 a over' }, 'l7:ao')), SOURCE_ERR.limit)
      assert.equal(codeOf(await register(host, LB, { id: uid('l7'), title: 'L7 b over' }, 'l7:bo')), SOURCE_ERR.limit)
      assert.equal((await ofBundle(A.name)).length, n + 2)
    } finally { await setLimit({ maxSourcesPerPlugin: ROOMY }) }
  })

  it('SRC-08 identity is <bundle>/<entry id>/<source id>, worked out from the caller', T, async (t) => {
    const id = uid('ident')
    for (const label of [LA, LB, LS, SOURCE_ROW.label]) assert.equal(codeOf(await register(host, label, { id, title: 'Ident ' + label }, 'ident:' + label)), 'ok')
    const ids = (await sourcesNow(host)).sources.map((s) => s.identity).filter((x) => x.endsWith('/' + id))
    assert.ok(ids.includes(SOURCE_IDENTITY(A.name, A.rows.a.id, id)))
    assert.ok(ids.includes(SOURCE_IDENTITY(A.name, A.rows.b.id, id)))
    assert.ok(ids.includes(SOURCE_IDENTITY(S.name, S.rows.a.id, id)))
    const row = ids.find((x) => rowIdentities(id).includes(x))
    t.diagnostic('host row identity: ' + ids.find((x) => x.includes(SOURCE_ROW.id)))
    assert.ok(row, 'host row identity uses its module name (A87): ' + JSON.stringify(ids))
    assert.equal(ids.length, 4)
  })

  it('SRC-09 state.sources has exactly its keys; plugin is the catalog key or null', T, async () => {
    const st = await host.state()
    assert.deepEqual(Object.keys(st.sources).sort(), SOURCES_KEYS)
    assert.ok(Array.isArray(st.sources.sources) && st.sources.sources.length > 0)
    const keys = new Set(st.catalog.plugins.map((p) => p.plugin))
    for (const s of st.sources.sources) {
      assert.deepEqual(Object.keys(s).sort(), SOURCE_KEYS, JSON.stringify(s))
      assert.equal(typeof s.identity, 'string')
      assert.equal(typeof s.title, 'string')
      assert.equal(typeof s.enabled, 'boolean')
      if (s.identity.includes(path.basename(SOURCE_ROW.module))) assert.equal(s.plugin, null, 'host row: ' + JSON.stringify(s))
      else {
        assert.ok(keys.has(s.plugin), 'catalog key ' + s.plugin)
        assert.ok(s.identity.startsWith(s.plugin + '/'), 'bundle part is the plugin: ' + JSON.stringify(s))
      }
    }
    assert.equal(new Set(st.sources.sources.map((s) => s.identity)).size, st.sources.sources.length, 'identities are unique')
  })

  it('SRC-10 an SSE frame shows a newly registered source', T, async () => {
    const stream = await host.sse()
    try {
      await until(() => stream.frames.length > 0, 3000, 50)
      const id = uid('sse')
      assert.equal(codeOf(await register(host, SOURCE_ROW.label, { id, title: 'SSE' }, 'sse')), 'ok')
      const seen = await until(() => stream.frames.some((f) => f.sources?.sources?.some((s) => s.identity.endsWith('/' + id))), 8000, 50)
      assert.ok(seen, 'a frame lists the new source')
    } finally { stream.close() }
  })

  it('SRC-11 registerSource from outside any loader row throws (FISHBALL_UNKNOWN_PLUGIN, §8 as built)', T, async () => {
    const r = await host.call('sourceRegisterRoot', { def: { id: uid('root'), title: 'Root' } })
    assert.equal(r.ok, false)
    assert.equal(r.error?.code, 'FISHBALL_UNKNOWN_PLUGIN')
  })

  it('SRC-13 a detached registerSource call is refused FISHBALL_UNKNOWN_PLUGIN (author guide)', T, async () => {
    const r = await host.call('sourceRegisterDetached', { label: LS, def: { id: uid('detached'), title: 'Detached' } })
    assert.equal(r.ok, false)
    assert.equal(r.error?.code, 'FISHBALL_UNKNOWN_PLUGIN')
  })

  it('SRC-12 the client bundle has a Plugin sources section and the Plugin event queue label', T, async () => {
    const bundle = await fishballClientBundle(host)
    assert.equal(bundle.found, true)
    assert.ok(bundle.text.includes(SOURCE_UI.section), SOURCE_UI.section)
    assert.ok(bundle.text.includes(SOURCE_UI.queueLabel), SOURCE_UI.queueLabel)
  })
})
