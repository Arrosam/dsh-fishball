/**
 * Revision 11 rev11f: the detail list on Fishball's own cards is bounded by `argumentExcerptBytes` (DESIGN §7a.11 "Detail list",
 * §9 `own_requests.detail`, §16 Q-r11-own-card-detail: the manager's decision for the user, 2026-11-02): the unchecked-tools
 * card's tool list (each tool with the first line of its description) and the set_plugin_settings card's changed-field list
 * (`path: old → new`, each value still cut to `settingsPromptValueBytes`). The list is measured in bytes as shown, cut at a
 * whole entry where possible, a single over-long entry is cut with "…", and when entries are left out it ends with "and N more".
 * L = the byte size of the whole list, read at the default limit. Every call here is answered by withdrawing its card.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | DET-01 | EP (default limit, tools) | every tool of the plugin, one entry each, with the first description line only; no "and N more" |
 * | DET-02 | BVA (limit L, L+1; tools) | the whole list, no "and N more" |
 * | DET-03 | BVA (limit L−1; tools) | cut: whole entries that are a prefix of the full list, at least one, at most n−1, then "and K more" with K = the entries left out; the shown entries fit the limit |
 * | DET-04 | EP (a limit between; tools) | the same shape: a prefix of whole entries and "and K more" |
 * | DET-05 | BVA (limit L, L−1; settings, 4 changes) | whole at L; at L−1 the same cut shape; each value still cut to settingsPromptValueBytes |
 * | DET-07 | BVA (first entry longer than the limit 20, more entries behind it; tools) | the first entry cut with "…" to fit the limit, then "and n−1 more" |
 * | DET-06 | BVA (one over-long entry: limit E, E−1, 20; settings, one change) | whole at E; at E−1 and 20 cut with "…" (a prefix of the entry; ellipsis included in the limit); no "and N more" (nothing is left out) |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, FIXTURE_BUNDLE, FIXTURE_DESCRIPTION, FIXTURE_UNCHECKED, LIMITS, LIMITS_R11, MANAGER_BUNDLES, MANAGER_ENV, OWN_MORE, SETTINGS_TOOLS } from './support/constants.mjs'
import { HOOK, T, pluginIn, untilCatalog } from './support/expect.mjs'
import { cardArguments, detailBytes, detailEntries, ownHost, ownTools, tokens } from './support/rev11f.mjs'

const SET = MANAGER_BUNDLES.settings
const MAIN = SET.rows.main
const names = tokens('DET')
const bytes = (s) => Buffer.byteLength(s, 'utf8')

describe('rev11f: the detail list of Fishball\'s cards is bounded by argumentExcerptBytes', () => {
  let ctx
  let t
  const setBounds = (patch) => t.setLimit(patch)
  const reset = () => t.setLimit({ argumentExcerptBytes: LIMITS.argumentExcerptBytes.default, settingsPromptValueBytes: LIMITS_R11.settingsPromptValueBytes.default })

  /** Make the call under this limit, return the card's detail entries, and withdraw the card. */
  async function listAt(limit, tool, args, patch = {}) {
    await setBounds({ ...(limit === undefined ? {} : { argumentExcerptBytes: limit }), ...patch })
    try {
      const r = await t.call(tool, args)
      assert.ok(r.card, 'a card for ' + tool + ': ' + r.result.text)
      const entries = detailEntries(r.card)
      assert.ok(entries, 'the card has a detail list: ' + JSON.stringify(r.card))
      await t.withdraw(r.card.requestId)
      return entries
    } finally { await reset() }
  }
  const tools = () => listAt(undefined, 'set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: true })
  /** The shape of a cut list: whole entries that are a prefix of the full one, then "and K more" for the entries left out. */
  function assertCut(cut, full, limit, label) {
    const more = OWN_MORE.exec(cut.at(-1) ?? '')
    assert.ok(more, label + ': ends with "and N more": ' + JSON.stringify(cut.at(-1)))
    const shown = cut.slice(0, -1)
    assert.ok(shown.length >= 1 && shown.length < full.length, label + ': some entries, not all: ' + shown.length + ' of ' + full.length)
    assert.deepEqual(shown, full.slice(0, shown.length), label + ': whole entries, in order')
    assert.equal(Number(more[1]), full.length - shown.length, label + ': N counts the entries left out')
    // "and N more" is not counted in the bound: the entries shown alone total at most the limit, and one more would not fit.
    assert.ok(detailBytes(full.slice(0, shown.length + 1)) > limit, label + ': the next entry would not fit')
    assert.ok(detailBytes(shown) <= limit, label + ': the shown entries fit ' + limit + ' bytes (' + detailBytes(shown) + ')')
  }

  let full
  let L
  before(async () => {
    ctx = await ownHost('rev11f-detail', MANAGER_ENV)
    t = ownTools(ctx, names)
    assert.equal((await ctx.host.post(API.plugins, { plugin: SET.name, on: true })).status, 200)
    assert.ok(await untilCatalog(ctx.host, (c) => pluginIn(c, SET.name)?.applied === true, 10000))
  }, HOOK)
  after(async () => { await ctx?.host?.stop() }, HOOK)

  it('DET-01 the tools: one entry each with the first description line only; no "and N more"', T, async () => {
    full = await tools()
    L = detailBytes(full)
    assert.ok(full.length >= 3, 'the fixture plugin brings several unchecked tools: ' + full.length)
    for (const name of FIXTURE_UNCHECKED) {
      const entry = full.find((e) => e.includes(name))
      assert.ok(entry, name + ' is listed: ' + full.join(' | '))
      assert.ok(entry.includes(FIXTURE_DESCRIPTION.first(name)), 'the first description line')
    }
    assert.equal(full.some((e) => e.includes(FIXTURE_DESCRIPTION.second)), false, 'never the second line')
    assert.equal(OWN_MORE.test(full.at(-1)), false)
  })

  for (const delta of [0, 1]) {
    it('DET-02 limit L' + (delta ? '+1' : '') + ': the whole list', T, async () => {
      assert.deepEqual(await listAt(L + delta, 'set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: true }), full)
    })
  }

  it('DET-03 limit L−1: whole entries that are a prefix, then "and K more"', T, async () => {
    assertCut(await listAt(L - 1, 'set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: true }), full, L - 1, 'L−1')
  })

  it('DET-04 a limit between: the same shape', T, async () => {
    const limit = detailBytes(full.slice(0, 2)) + 40
    assert.ok(limit < L, 'precondition: the list is longer than ' + limit)
    assertCut(await listAt(limit, 'set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: true }), full, limit, 'mid')
  })

  const change = (greeting) => ({ plugin: SET.name, row: MAIN, values: { limit: 8, greeting, nested: { a: 'z' }, mode: 'slow' }, reason: 'fbtest ' + names.tok('s') })
  it('DET-05 the changed fields: whole at L, cut at L−1; each value still cut to settingsPromptValueBytes', T, async () => {
    const args = change('g'.repeat(150))
    const wide = await listAt(undefined, SETTINGS_TOOLS.set, args)
    assert.equal(wide.length, 4, 'four changed fields: ' + wide.join(' | '))
    const size = detailBytes(wide)
    assert.deepEqual(await listAt(size, SETTINGS_TOOLS.set, args), wide, 'whole at L')
    assertCut(await listAt(size - 1, SETTINGS_TOOLS.set, args), wide, size - 1, 'settings L−1')
    const long = change('h'.repeat(400))
    const cutValue = await listAt(undefined, SETTINGS_TOOLS.set, long)
    const line = cutValue.find((e) => e.startsWith('greeting'))
    assert.ok(line && bytes(line) < 400, 'the value is cut to settingsPromptValueBytes (200) as before: ' + bytes(line ?? ''))
  })

  it('DET-06 one over-long entry is cut with "…"; nothing is left out so there is no "and N more"', T, async () => {
    const args = { plugin: SET.name, row: MAIN, values: { greeting: 'q'.repeat(300) }, reason: 'fbtest ' + names.tok('o') }
    const wide = { settingsPromptValueBytes: 1000 }
    const whole = await listAt(undefined, SETTINGS_TOOLS.set, args, wide)
    assert.equal(whole.length, 1, whole.join(' | '))
    const E = bytes(whole[0])
    assert.ok(E > 300, 'precondition: the entry is long: ' + E)
    assert.deepEqual(await listAt(E, SETTINGS_TOOLS.set, args, wide), whole, 'whole at E')
    for (const limit of [E - 1, 20]) {
      const cut = await listAt(limit, SETTINGS_TOOLS.set, args, wide)
      assert.equal(cut.length, 1, 'still one entry at ' + limit + ': ' + cut.join(' | '))
      assert.ok(cut[0].endsWith('…'), 'ends with …: ' + cut[0])
      assert.ok(whole[0].startsWith(cut[0].slice(0, -1)), 'a prefix of the entry')
      assert.ok(cut[0].length < whole[0].length)
      // The ellipsis counts inside the bound or just after it (PIL-05 and A78 differ; either is accepted).
      assert.ok(bytes(cut[0]) <= limit, 'the cut entry, ellipsis included, fits ' + limit + ' bytes (manager decision 2026-11-02): ' + bytes(cut[0]))
      assert.equal(OWN_MORE.test(cut[0]), false)
    }
  })

  it('DET-07 a first entry longer than the bound, with more behind it: cut with "…" to fit, then "and N more" for the rest', T, async () => {
    const limit = 20
    assert.ok(bytes(full[0]) > limit, 'precondition')
    const cut = await listAt(limit, 'set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: true })
    assert.equal(cut.length, 2, cut.join(' | '))
    assert.ok(cut[0].endsWith('…') && full[0].startsWith(cut[0].slice(0, -1)), 'first entry cut: ' + cut[0])
    assert.ok(bytes(cut[0]) <= limit, 'fits the bound: ' + bytes(cut[0]))
    assert.equal(Number(OWN_MORE.exec(cut[1])?.[1]), full.length - 1, 'N counts the remaining entries: ' + cut[1])
  })
})
