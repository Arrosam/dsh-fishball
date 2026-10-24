/**
 * R-COMPOSITION and R-ISOLATION, checked on the requests that reach the fake model.
 *
 * | id     | technique              | requirement                                              | expected |
 * |--------|------------------------|----------------------------------------------------------|----------|
 * | CMP-01 | EP                     | Fishball persona and role (setup and driven requests)    | system has "You are Fishball", "does/do no work", "never create, change, move or delete a file"; no "coding agent" |
 * | CMP-02 | EP (one per name)      | each hidden name registered globally at boot             | absent from every Fishball request (setup turn included); present in an ordinary session's request |
 * | CMP-03a | EP (P3, before allowance) | unchecked fixture names                               | absent from Fishball's request |
 * | CMP-03 | EP (ordinary names)    | other global names visible once allowed (P3)             | demo_echo, bsk_inspect and the shell fixtures in Fishball's request |
 * | CMP-04 | EP                     | bsk_inspect copy without save options                    | no "output"; videoAction enum = original minus "save"; other properties kept |
 * | CMP-05 | Decision (no save option) | ordinary bsk_inspect call passes through              | original invoked once with the same args; non-error result carrying the original's output |
 * | CMP-06 | Decision (save option) | output present / videoAction save / both                  | tool error; original not invoked |
 * | CMP-07 | BVA (neighbour of save) | videoAction "stop" passes through                        | original invoked; non-error |
 * | CMP-08 | State (tools added later) | hidden names registered after start                    | absent from Fishball; present in ordinary; a late ordinary name is unchecked, then visible after allowance (P3) |
 * | CMP-09 | State (tools removed later) | names removed after start                            | Fishball turns keep working; removed ordinary name gone from Fishball's request |
 * | ISO-01 | EP (standard preset)   | ordinary session keeps persona, tools, full bsk_inspect  | "coding agent"; every fixture name; bsk_inspect schema equal to the original |
 * | ISO-02 | EP (bare preset)       | same for a preset without own tools                      | as ISO-01 |
 * | PTC-01 | EP (process in PTC mode) | Fishball's tools are presented natively              | Fishball request lists demo_echo and bsk_inspect natively and no hidden name; ordinary request lists run_code |
 * | PTC-02 | EP (process in PTC mode) | a native call works for Fishball                     | Fishball's direct demo_echo call is not an error and the fixture runs once |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { BOOT_TOOLS, BSK_PARAMETERS, FIXTURE_SHELL_TOOLS, FIXTURE_UNCHECKED, HIDDEN_TOOLS, LATE_TOOLS, LATE_VISIBLE_TOOL, PRESET, STATUS, TOOL_STATUS } from './support/constants.mjs'
import { HOOK, T, allowFixtures, callTool, listPlugins, settle, statusIn, toolNames, toolSchema, turn } from './support/expect.mjs'
import { bootHost, bootLive, newHome } from './support/host.mjs'

const BOOT_HIDDEN = HIDDEN_TOOLS.filter((n) => !LATE_TOOLS.includes(n))
const BOOT_REGISTERED = BOOT_TOOLS.filter((n) => !LATE_TOOLS.includes(n))

describe('R-COMPOSITION and R-ISOLATION', () => {
  let host
  let fb
  let fbRequest
  let fbBeforeAllow
  let bare
  let bareRequest

  /** The last model request of one plain turn. */
  const requestOf = async (sessionId) => (await turn(host, sessionId, [[{ text: 'hi' }]])).requests.at(-1)

  before(async () => {
    const booted = await bootLive(newHome('composition'))
    host = booted.host
    fb = booted.state?.sessionId
    // P3: fixture tools are unchecked for Fishball. Record the request before allowance, then allow them the
    // supported way (set_plugin_enabled answered Allow once) so the P2 visibility cases apply to allowed tools.
    fbBeforeAllow = await requestOf(fb)
    await allowFixtures(host, fb)
    fbRequest = await requestOf(fb)
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null, 'precondition: ordinary bare session resolves')
    bare = created.sessionId
    bareRequest = await requestOf(bare)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('precondition: every boot fixture tool was registered globally', T, async () => {
    assert.deepEqual(await host.call('fixtureErrors'), [])
    const global = await host.call('globalToolNames')
    for (const n of BOOT_REGISTERED) assert.ok(global.includes(n), n)
  })

  it('CMP-01 Fishball\'s system prompt is its persona and role, not the coding agent', T, async () => {
    assert.ok(fbRequest, 'a request reached the model for Fishball')
    // Every Fishball request so far: the first-creation setup turn and the driven turn.
    const all = await host.call('requests', { sessionId: fb })
    assert.ok(all.length >= 2)
    for (const { system: sys } of all) {
      assert.ok(sys.includes('You are Fishball'), 'persona')
      // The brief quotes the role in the third person ("does no work"); the approved role text is
      // second person ("You do no work yourself", DESIGN.md §7). Either form satisfies it (CASES.md, Ambiguities A1).
      assert.match(sys, /\b(does|do) no work\b/i)
      assert.match(sys, /never create, change, move or delete a file/i)
      assert.equal(sys.includes('coding agent'), false)
    }
  })

  for (const name of BOOT_HIDDEN) {
    it('CMP-02 hidden tool ' + name + ' is absent for Fishball and present for an ordinary session', T, async () => {
      for (const request of await host.call('requests', { sessionId: fb })) assert.equal(toolNames(request).includes(name), false, 'a Fishball request lists ' + name)
      assert.ok(toolNames(bareRequest).includes(name), 'ordinary request lacks ' + name)
    })
  }

  it('CMP-03a (P3) before allowance the ordinary fixture tools are hidden from Fishball', T, () => {
    for (const name of FIXTURE_UNCHECKED) assert.equal(toolNames(fbBeforeAllow).includes(name), false, name)
  })

  it('CMP-03 ordinary global tools are visible to Fishball once allowed', T, () => {
    for (const name of ['demo_echo', 'bsk_inspect', ...FIXTURE_SHELL_TOOLS]) assert.ok(toolNames(fbRequest).includes(name), name)
  })

  it('CMP-04 Fishball\'s bsk_inspect has no output option and no save video action', T, () => {
    const schema = toolSchema(fbRequest, 'bsk_inspect')
    assert.ok(schema, 'bsk_inspect present')
    assert.equal(Object.hasOwn(schema.properties ?? {}, 'output'), false)
    assert.deepEqual(Object.keys(schema.properties).sort(), Object.keys(BSK_PARAMETERS.properties).filter((k) => k !== 'output').sort())
    assert.deepEqual(schema.properties.videoAction.enum, BSK_PARAMETERS.properties.videoAction.enum.filter((v) => v !== 'save'))
  })

  /** Call bsk_inspect from Fishball; returns the result and how often the original ran. */
  async function fishballBsk(args) {
    const before = (await host.call('fixtureCalls', { name: 'bsk_inspect' })).length
    const { result } = await callTool(host, fb, 'bsk_inspect', args)
    const calls = (await host.call('fixtureCalls', { name: 'bsk_inspect' })).slice(before)
    return { result, calls }
  }

  it('CMP-05 an ordinary bsk_inspect call is passed to the original tool', T, async () => {
    const args = { action: 'observe', maxRows: 3 }
    const { result, calls } = await fishballBsk(args)
    assert.equal(result.isError, false, result.text)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].args, args)
    assert.ok(result.text.includes('fixture:bsk_inspect'), 'the original result reaches Fishball: ' + result.text)
  })

  const saveCalls = [
    ['output', { action: 'snapshot', output: '/tmp/fbtest-should-not-exist.json' }],
    ['videoAction save', { action: 'video', videoAction: 'save' }],
    ['output and videoAction save', { action: 'video', videoAction: 'save', output: '/tmp/fbtest.mp4' }],
  ]
  for (const [label, args] of saveCalls) {
    it('CMP-06 a bsk_inspect call with ' + label + ' is refused and the original is not invoked', T, async () => {
      const { result, calls } = await fishballBsk(args)
      assert.equal(result.isError, true, result.text)
      assert.equal(calls.length, 0)
    })
  }

  it('CMP-07 videoAction stop (neighbour of save) passes through', T, async () => {
    const { result, calls } = await fishballBsk({ action: 'video', videoAction: 'stop' })
    assert.equal(result.isError, false, result.text)
    assert.equal(calls.length, 1)
  })

  describe('tools changed after Fishball started', () => {
    // Registered as the fbtest-tools plugin, so the late tools are attributable to it.
    before(async () => { await host.call('registerGlobal', { names: [...LATE_TOOLS, LATE_VISIBLE_TOOL], asFixture: true }) }, HOOK)

    it('CMP-08 hidden names registered later stay hidden; a later ordinary name is unchecked until allowed (P3)', T, async () => {
      await settle(host)
      const fbLate = await requestOf(fb)
      const ordLate = await requestOf(bare)
      for (const name of LATE_TOOLS) {
        assert.equal(toolNames(fbLate).includes(name), false, 'Fishball request lists late ' + name)
        assert.ok(toolNames(ordLate).includes(name), 'ordinary request lacks late ' + name)
      }
      assert.equal(toolNames(fbLate).includes(LATE_VISIBLE_TOOL), false, 'a late tool nobody checked is hidden')
      assert.equal(statusIn(await listPlugins(host, fb), LATE_VISIBLE_TOOL), TOOL_STATUS.unchecked)
      await allowFixtures(host, fb)
      const fbAllowed = await requestOf(fb)
      assert.ok(toolNames(fbAllowed).includes(LATE_VISIBLE_TOOL), 'late ordinary tool visible to Fishball after allowance')
      for (const name of HIDDEN_TOOLS) assert.equal(toolNames(fbAllowed).includes(name), false, name)
    })

    it('CMP-09 removing tools later keeps Fishball working and drops the removed name', T, async () => {
      await host.call('unregisterGlobal', { names: [...LATE_TOOLS, LATE_VISIBLE_TOOL] })
      await settle(host)
      const fbAfter = await requestOf(fb)
      assert.ok(fbAfter, 'Fishball still reaches the model')
      assert.equal(toolNames(fbAfter).includes(LATE_VISIBLE_TOOL), false)
      for (const name of HIDDEN_TOOLS) assert.equal(toolNames(fbAfter).includes(name), false, name)
      assert.ok(toolNames(fbAfter).includes('demo_echo'))
      assert.equal((await host.state()).status, 'live')
      await host.call('registerGlobal', { names: [LATE_TOOLS[0]], asFixture: true })
      await settle(host)
      const fbBack = await requestOf(fb)
      assert.equal(toolNames(fbBack).includes(LATE_TOOLS[0]), false, 'a hidden name registered again stays hidden')
    })
  })

  /** ISO checks shared by both presets. */
  function expectOrdinary(request) {
    assert.ok(request.system.includes('coding agent'), 'ordinary persona')
    assert.equal(request.system.includes('You are Fishball'), false)
    for (const name of BOOT_REGISTERED) assert.ok(toolNames(request).includes(name), 'ordinary request lacks ' + name)
    assert.deepEqual(toolSchema(request, 'bsk_inspect'), BSK_PARAMETERS)
  }

  it('ISO-01 a standard-preset session keeps its persona, its tools and the full bsk_inspect', T, async () => {
    const created = await host.call('ordinary', { preset: PRESET.standard, folder: 'standard' })
    assert.equal(created.error, null)
    expectOrdinary(await requestOf(created.sessionId))
  })

  it('ISO-02 a session of a preset without own tools keeps the persona, all global tools and the full bsk_inspect', T, () => {
    expectOrdinary(bareRequest)
  })
})

describe('R-COMPOSITION with the process in PTC tool mode', () => {
  let host
  let fb

  before(async () => {
    // The Web profile's tools row reads DSH_TOOLS_MODE (dsh-web-app cordis.patch.yml); 'ptc' puts every session in PTC mode.
    host = await bootHost(newHome('composition-ptc'), { env: { DSH_TOOLS_MODE: 'ptc' } })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    // P3: the fixture tools are unchecked until allowed (see the first describe).
    if (fb) await allowFixtures(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('PTC-01 Fishball\'s request lists its tools natively while an ordinary session gets run_code', T, async () => {
    assert.equal(typeof fb, 'string', 'Fishball is live')
    const fbRequest = (await turn(host, fb, [[{ text: 'hi' }]])).requests.at(-1)
    for (const name of ['demo_echo', 'bsk_inspect']) assert.ok(toolNames(fbRequest).includes(name), 'Fishball request lacks native ' + name + ': ' + JSON.stringify(toolNames(fbRequest)))
    for (const name of HIDDEN_TOOLS) assert.equal(toolNames(fbRequest).includes(name), false, name)
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'ptc' })
    assert.equal(created.error, null)
    const ordRequest = (await turn(host, created.sessionId, [[{ text: 'hi' }]])).requests.at(-1)
    assert.ok(toolNames(ordRequest).includes('run_code'), 'ordinary request lacks run_code: ' + JSON.stringify(toolNames(ordRequest)))
  })

  it('PTC-02 a direct native call from Fishball reaches the tool', T, async () => {
    const before = (await host.call('fixtureCalls', { name: 'demo_echo', sessionId: fb })).length
    const { result } = await callTool(host, fb, 'demo_echo', { text: 'native' })
    assert.equal(result.isError, false, result.text)
    assert.equal((await host.call('fixtureCalls', { name: 'demo_echo', sessionId: fb })).length - before, 1)
  })
})
