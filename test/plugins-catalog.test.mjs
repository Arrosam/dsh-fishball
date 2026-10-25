/**
 * P3 R1-R4, R13, R14: Fishball's plugin catalog, its default tools, unchecked tools and the guard.
 *
 * | id     | technique              | requirement                                                | expected |
 * |--------|------------------------|------------------------------------------------------------|----------|
 * | CAT-01 | EP (Fishball / ordinary session) | the four plugin tools (with remove_plugin, plugin statuses) exist only for Fishball | in every Fishball request; absent from an ordinary session's request and from the global tool list |
 * | CAT-02 | EP                     | list_plugins answers the documented JSON shape             | exact keys (with waiting, post-review; with status, actions, removing, plugin statuses); enums for kind, status, changedBy, lastError; status/actions follow the table; types of every field |
 * | CAT-03 | DT (one row per built-in) | built-in keys and default state                         | 7 keys present, kind builtin, on as documented, changedBy null |
 * | CAT-04 | EP (bundle enabled in the profile, new install) | fbtest-tools (plugin statuses: DSH plugins start off) | kind profile, on false, dsh-disabled, changedBy null, lastError null |
 * | CAT-05 | EP (installed, not enabled) | fbtest-only, fbtest-only-b, fbtest-edits               | kind fishball-only, on false |
 * | CAT-06 | EP (DSH-optional bundle) | listBundles optional and not enabled                     | listed as fishball-only, off |
 * | CAT-07 | EP                     | dsh-fishball never listed; no other kinds of entries        | no entry dsh-fishball; every bundle entry is a profile dependency or DSH-optional (A21) |
 * | CAT-08 | EP (first start)       | default tools                                              | setup request and a later request list web, schedule, own and working_directory tools; not ask_user_question, skill, bash or a hidden name |
 * | CAT-09 | EP (attributable unchecked) | fixture tools not on the checked list (fbtest-tools turned on by the user first) | absent from Fishball's request; status unchecked under fbtest-tools; present for an ordinary session |
 * | CAT-10 | EP (hidden under a plugin) | fixture tools with hidden names                         | status hidden under fbtest-tools |
 * | CAT-11 | EP (unattributable)    | a tool registered by no plugin                             | in otherTools with status unchecked; not in Fishball's request; ordinary session has it |
 * | CAT-12 | EP                     | tools of built-ins that are on                             | status visible under their built-in |
 * | CAT-13 | EP (guard)             | direct call of an unchecked / unattributable tool          | tool error; the body never runs |
 * | CAT-14 | DT (built-in with no unchecked tools: ask-user, skills, shell) | on without a prompt | {ok:true}; no approval; tool appears after the turn ends; off again removes it |
 * | CAT-15 | ST (everything on)     | hidden list unchanged and enforced whatever is on (R13)     | state.hiddenTools is the 18 names plus message_fishball (P5); no hidden name in Fishball's request; hidden names keep status hidden; direct call refused |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  API, BUILTINS, CATALOG_KEYS, CHANGED_BY, CHECKED_HOST_TOOLS, FISHBALL_TOOLS, FIXTURE_BUNDLE, FIXTURE_HIDDEN, FIXTURE_UNCHECKED,
  HIDDEN_TOOLS, KIND, LAST_ERRORS, ONLY_BUNDLES, OUTCOME, PACKAGE_NAME, PLUGIN_KEYS, PLUGIN_STATUS, PRESET, STATE_HIDDEN_TOOLS, TOOL_STATUS,
} from './support/constants.mjs'
import { HOOK, T, allowFixtures, assertEntryContract, callTool, listPlugins, nextTools, pluginIn, setPlugin, settle, toolIn, toolNames, turn } from './support/expect.mjs'
import { bootLive, newHome } from './support/host.mjs'

const ROOT_TOOL = 'orphan_echo'

describe('P3 catalog and default tools', () => {
  let host
  let fb
  let bare
  /** The catalog at the defaults of a new install (CAT-03..07). */
  let defaults
  /** The catalog after the user turned fbtest-tools on for Fishball (CAT-09/10): plugin statuses make it start off. */
  let catalog
  let bareTools

  const ordinaryTools = async () => toolNames((await turn(host, bare, [[{ text: 'hi' }]])).requests.at(-1))

  before(async () => {
    const booted = await bootLive(newHome('plugins-catalog'))
    host = booted.host
    fb = booted.state?.sessionId
    // An unattributable tool: registered from the root context, by no plugin (R4 "else in otherTools").
    await host.call('registerGlobal', { names: [ROOT_TOOL] })
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null)
    bare = created.sessionId
    await settle(host)
    defaults = await listPlugins(host, fb)
    const on = await host.post(API.plugins, { plugin: FIXTURE_BUNDLE.name, on: true })
    assert.equal(on.status, 200, 'precondition: fbtest-tools turned on: ' + on.text)
    await settle(host)
    catalog = await listPlugins(host, fb)
    bareTools = await ordinaryTools()
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('CAT-01 list_plugins, set_plugin_enabled, add_plugin and remove_plugin exist only for Fishball', T, async () => {
    const requests = await host.call('requests', { sessionId: fb })
    assert.ok(requests.length >= 2)
    for (const r of requests) for (const n of FISHBALL_TOOLS) assert.ok(toolNames(r).includes(n), 'Fishball request lacks ' + n)
    for (const n of FISHBALL_TOOLS) assert.equal(bareTools.includes(n), false, 'ordinary session has ' + n)
    const global = await host.call('globalToolNames')
    for (const n of FISHBALL_TOOLS) assert.equal(global.includes(n), false, 'global tool list has ' + n)
  })

  it('CAT-02 list_plugins answers {plugins, allowedTools, otherTools} with the documented fields', T, () => {
    assert.deepEqual(Object.keys(catalog).sort(), CATALOG_KEYS)
    assert.ok(Array.isArray(catalog.plugins) && catalog.plugins.length > 0)
    assert.ok(Array.isArray(catalog.allowedTools))
    assert.ok(Array.isArray(catalog.otherTools))
    const statuses = Object.values(TOOL_STATUS)
    for (const p of [...defaults.plugins, ...catalog.plugins]) {
      assert.deepEqual(Object.keys(p).sort(), PLUGIN_KEYS, 'keys of ' + p.plugin)
      assertEntryContract(assert, p)
      assert.equal(typeof p.plugin, 'string')
      assert.equal(typeof p.title, 'string')
      assert.ok(Object.values(KIND).includes(p.kind), p.plugin + ' kind ' + p.kind)
      assert.equal(typeof p.on, 'boolean')
      assert.equal(typeof p.applied, 'boolean')
      assert.ok(p.changedBy === null || Object.values(CHANGED_BY).includes(p.changedBy), p.plugin + ' changedBy')
      assert.ok(p.lastError === null || LAST_ERRORS.includes(p.lastError), p.plugin + ' lastError ' + p.lastError)
      assert.equal(typeof p.waiting, 'boolean', p.plugin + ' waiting')
      assert.ok(Array.isArray(p.tools))
      for (const t of p.tools) {
        assert.deepEqual(Object.keys(t).sort(), ['name', 'status'])
        assert.ok(statuses.includes(t.status), p.plugin + '/' + t.name + ' status ' + t.status)
      }
    }
    assert.equal(new Set(catalog.plugins.map((p) => p.plugin)).size, catalog.plugins.length, 'plugin keys are unique')
    for (const t of catalog.otherTools) {
      assert.deepEqual(Object.keys(t).sort(), ['name', 'status'])
      assert.ok(statuses.includes(t.status))
    }
    for (const a of catalog.allowedTools) assert.deepEqual(Object.keys(a).sort(), ['key', 'module', 'toolName'])
  })

  for (const [key, spec] of Object.entries(BUILTINS)) {
    it('CAT-03 built-in ' + key + ' is listed, kind builtin, default ' + (spec.on ? 'on' : 'off'), T, () => {
      const p = pluginIn(defaults, key)
      assert.ok(p, key + ' listed')
      assert.equal(p.kind, KIND.builtin)
      assert.equal(p.on, spec.on)
      assert.equal(p.changedBy, null)
      assert.equal(p.lastError, null)
    })
  }

  it('CAT-04 the profile bundle fbtest-tools is kind profile and off by default on a new install', T, () => {
    const p = pluginIn(defaults, FIXTURE_BUNDLE.name)
    assert.ok(p, 'listed')
    assert.equal(p.kind, KIND.profile)
    assert.equal(p.on, false)
    assert.equal(p.status, PLUGIN_STATUS.dshDisabled)
    assert.equal(p.changedBy, null)
    assert.equal(p.lastError, null)
  })

  for (const b of Object.values(ONLY_BUNDLES)) {
    it('CAT-05 installed-but-not-enabled bundle ' + b.name + ' is fishball-only and off by default', T, () => {
      const p = pluginIn(defaults, b.name)
      assert.ok(p, 'listed')
      assert.equal(p.kind, KIND.only)
      assert.equal(p.on, false)
    })
  }

  it('CAT-06 every DSH-optional bundle that is not enabled is listed as fishball-only and off', T, async (t) => {
    const optional = (await host.call('allBundles')).filter((b) => b.optional && !b.enabled && b.name !== PACKAGE_NAME)
    if (optional.length === 0) t.diagnostic('this installation lists no DSH-optional bundle; the partition is empty')
    for (const b of optional) {
      const p = pluginIn(defaults, b.name)
      assert.ok(p, 'optional bundle ' + b.name + ' listed')
      assert.equal(p.kind, KIND.only, b.name)
      assert.equal(p.on, false, b.name)
    }
  })

  it('CAT-07 dsh-fishball never appears; every bundle entry is a profile dependency or DSH-optional', T, async () => {
    assert.equal(pluginIn(catalog, PACKAGE_NAME), undefined)
    const bundles = await host.call('allBundles')
    const allowed = new Set(bundles.filter((b) => (b.installed || b.optional) && b.name !== PACKAGE_NAME).map((b) => b.name))
    // Plugin statuses: Fishball-installed entries (fishball:<name>) are not DSH bundles; plugins-status.test.mjs covers them.
    for (const p of catalog.plugins.filter((x) => x.kind !== KIND.builtin && x.kind !== KIND.installed)) assert.ok(allowed.has(p.plugin), 'unexpected catalog entry ' + p.plugin)
    for (const b of bundles.filter((x) => x.installed && x.name !== PACKAGE_NAME)) {
      assert.ok(pluginIn(catalog, b.name), 'profile dependency ' + b.name + ' listed')
      assert.equal(pluginIn(catalog, b.name).kind, b.enabled ? KIND.profile : KIND.only, b.name)
    }
  })

  const DEFAULT_VISIBLE = [...BUILTINS['builtin:web'].tools, ...BUILTINS['builtin:reminders'].tools, ...FISHBALL_TOOLS, ...CHECKED_HOST_TOOLS]
  const DEFAULT_ABSENT = ['ask_user_question', 'skill', 'bash', ...HIDDEN_TOOLS]

  it('CAT-08 at first start Fishball\'s request has the default tools and nothing off or hidden', T, async () => {
    const requests = await host.call('requests', { sessionId: fb })
    for (const [label, r] of [['setup request', requests[0]], ['latest request', requests.at(-1)]]) {
      const names = toolNames(r)
      for (const n of DEFAULT_VISIBLE) assert.ok(names.includes(n), label + ' lacks ' + n + ': ' + JSON.stringify(names))
      for (const n of DEFAULT_ABSENT) assert.equal(names.includes(n), false, label + ' lists ' + n)
    }
  })

  it('CAT-09 unchecked fixture tools are hidden from Fishball, listed as unchecked and kept by ordinary sessions', T, async () => {
    const names = toolNames((await host.call('requests', { sessionId: fb })).at(-1))
    for (const n of FIXTURE_UNCHECKED) {
      assert.equal(names.includes(n), false, 'Fishball request lists unchecked ' + n)
      assert.equal(toolIn(catalog, FIXTURE_BUNDLE.name, n)?.status, TOOL_STATUS.unchecked, n + ' under fbtest-tools')
      assert.ok(bareTools.includes(n), 'ordinary session lacks ' + n)
    }
  })

  it('CAT-10 hidden-name fixture tools are listed with status hidden', T, () => {
    for (const n of FIXTURE_HIDDEN) assert.equal(toolIn(catalog, FIXTURE_BUNDLE.name, n)?.status, TOOL_STATUS.hidden, n)
  })

  it('CAT-11 a tool registered by no plugin is in otherTools as unchecked and hidden from Fishball only', T, async () => {
    const other = catalog.otherTools.find((t) => t.name === ROOT_TOOL)
    assert.ok(other, 'otherTools lists ' + ROOT_TOOL + ': ' + JSON.stringify(catalog.otherTools))
    assert.equal(other.status, TOOL_STATUS.unchecked)
    for (const p of catalog.plugins) assert.equal(p.tools.some((t) => t.name === ROOT_TOOL), false, 'also under ' + p.plugin)
    assert.equal(toolNames((await host.call('requests', { sessionId: fb })).at(-1)).includes(ROOT_TOOL), false)
    assert.ok(bareTools.includes(ROOT_TOOL))
  })

  it('CAT-12 tools of the built-ins that are on are visible under their built-in', T, () => {
    for (const key of ['builtin:web', 'builtin:reminders']) {
      for (const n of BUILTINS[key].tools) assert.equal(toolIn(catalog, key, n)?.status, TOOL_STATUS.visible, key + '/' + n)
    }
  })

  for (const name of ['demo_echo', ROOT_TOOL]) {
    it('CAT-13 a direct call of the masked tool ' + name + ' is a tool error and never runs', T, async () => {
      const before = (await host.call('fixtureCalls', { name, sessionId: fb })).length
      const { result } = await callTool(host, fb, name, { text: 'x' })
      assert.equal(result.isError, true, result.text)
      assert.equal((await host.call('fixtureCalls', { name, sessionId: fb })).length, before)
    })
  }

  for (const key of ['builtin:ask-user', 'builtin:skills', 'builtin:shell']) {
    it('CAT-14 turning ' + key + ' on asks nobody, applies after the turn, and off removes it again', T, async () => {
      const tool = BUILTINS[key].tools[0]
      const on = await setPlugin(host, fb, key, true, OUTCOME.reject)
      assert.equal(on.json?.ok, true, on.result.text)
      assert.equal(on.json?.on, true)
      assert.equal(on.approvals.length, 0, 'no approval for a plugin without unchecked tools')
      assert.equal(on.asked, 0)
      assert.equal(toolNames(on.requests.at(-1)).includes(tool), false, 'not applied before the turn ends')
      assert.ok((await nextTools(host, fb)).includes(tool), tool + ' in the next request')
      const listed = await listPlugins(host, fb)
      assert.equal(pluginIn(listed, key).on, true)
      assert.equal(pluginIn(listed, key).changedBy, CHANGED_BY.fishball)
      const off = await setPlugin(host, fb, key, false)
      assert.equal(off.json?.ok, true, off.result.text)
      assert.equal(off.json?.on, false)
      assert.equal((await nextTools(host, fb)).includes(tool), false, tool + ' gone after off')
    })
  }

  it('CAT-15 with every plugin on, the hidden list is unchanged and still enforced', T, async () => {
    await allowFixtures(host, fb)
    for (const key of ['builtin:ask-user', 'builtin:skills', 'builtin:shell']) assert.equal((await setPlugin(host, fb, key, true)).json?.ok, true, key)
    const only = await setPlugin(host, fb, ONLY_BUNDLES.a.name, true, OUTCOME.allow)
    assert.equal(only.json?.ok, true, only.result.text)
    const names = await nextTools(host, fb)
    for (const n of HIDDEN_TOOLS) assert.equal(names.includes(n), false, 'Fishball request lists hidden ' + n)
    assert.ok(names.includes('demo_echo'), 'precondition: allowed fixture tools are visible')
    const state = await host.state()
    // P5: the state also lists message_fishball, Fishball's own inbound tool.
    assert.deepEqual(state.hiddenTools, [...STATE_HIDDEN_TOOLS].sort())
    for (const n of FIXTURE_HIDDEN) assert.equal(toolIn(state.catalog, FIXTURE_BUNDLE.name, n)?.status, TOOL_STATUS.hidden, n)
    const before = (await host.call('fixtureCalls', { name: 'subagent', sessionId: fb })).length
    const { result } = await callTool(host, fb, 'subagent', { text: 'x' })
    assert.equal(result.isError, true)
    assert.equal((await host.call('fixtureCalls', { name: 'subagent', sessionId: fb })).length, before)
  })
})
