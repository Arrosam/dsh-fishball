/**
 * R-FILEWRITE: the guard on Fishball's own tool calls, and its absence elsewhere.
 *
 * | id     | technique                | requirement                                             | expected |
 * |--------|--------------------------|---------------------------------------------------------|----------|
 * | FW-01  | EP (hidden global)       | write/edit/str_replace_editor/plugin_manager, global     | tool error; fixture body never runs |
 * | FW-02  | EP (made visible in Fishball's own scope) | same four names, visible to Fishball   | tool error; fixture body never runs |
 * | FW-03  | Decision table           | shell tool x sandbox mode x sandbox_permissions          | rows below |
 * |        |   read-only, absent      |                                                         | reaches the fixture; no error |
 * |        |   read-only, present     |                                                         | refused; no approval/asked; body not run |
 * |        |   workspace-write, absent / present |                                              | refused; body not run |
 * |        |   danger-full-access, absent / present |                                           | refused; body not run |
 * | FW-04  | BVA (sandbox_permissions value) | "read-only" (no widening) and "" still count as included | refused; no approval/asked |
 * | FW-05  | State (read-only -> workspace-write -> read-only) | switching back restores the shell     | refused while workspace-write, reaches the fixture after returning to read-only |
 * | FW-06  | EP (run_code)            | run_code with sandbox_permissions                        | tool error; no approval/asked (weak, see CASES.md) |
 * | FW-07  | EP (ordinary session)    | other sessions are not affected                          | write/edit/str_replace_editor/plugin_manager and bash (with and without sandbox_permissions) run normally |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { FILE_TOOLS, FIXTURE_SHELL_TOOLS, PRESET, SANDBOX_MODES } from './support/constants.mjs'
import { HOOK, T, callTool, toolNames } from './support/expect.mjs'
import { bootLive, newHome } from './support/host.mjs'

const shellArgs = (extra = {}) => ({ command: 'echo fbtest', description: 'fbtest', ...extra })

describe('R-FILEWRITE', () => {
  let host
  let fb
  let other

  before(async () => {
    const booted = await bootLive(newHome('filewrite'))
    host = booted.host
    fb = booted.state?.sessionId
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'other' })
    assert.equal(created.error, null)
    other = created.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  /** Call one tool from a session and report the result, approval prompts, fixture body runs and request tools. */
  async function attempt(sessionId, tool, args) {
    const before = (await host.call('fixtureCalls', { name: tool, sessionId })).length
    const { result, asked, requests } = await callTool(host, sessionId, tool, args)
    const ran = (await host.call('fixtureCalls', { name: tool, sessionId })).length - before
    return { result, asked, ran, offered: toolNames(requests[0]).includes(tool) }
  }
  const expectRefused = (r, label) => {
    assert.equal(r.result.isError, true, label + ': ' + r.result.text)
    assert.equal(r.ran, 0, label + ': tool body ran')
  }
  const expectRan = (r, label) => {
    assert.equal(r.result.isError, false, label + ': ' + r.result.text)
    assert.equal(r.ran, 1, label + ': tool body runs once')
  }

  it('precondition: Fishball is read-only', T, async () => {
    assert.equal((await host.call('inspect', { sessionId: fb })).sandboxMode, 'read-only')
  })

  for (const tool of FILE_TOOLS) {
    it('FW-01 Fishball calling the global ' + tool + ' gets a tool error and the body never runs', T, async () => {
      expectRefused(await attempt(fb, tool, { path: '/tmp/fbtest.txt', content: 'x' }), tool)
    })
  }

  for (const tool of FILE_TOOLS) {
    it('FW-02 ' + tool + ' made visible in Fishball\'s own scope is still refused', T, async (t) => {
      const reg = await host.call('registerScoped', { sessionId: fb, name: tool })
      assert.equal(reg.ok, true, 'precondition: scoped registration: ' + JSON.stringify(reg.error))
      try {
        const r = await attempt(fb, tool, { path: '/tmp/fbtest.txt', content: 'x' })
        expectRefused(r, tool)
        // Only a tool the model was offered exercises the guard rather than the mask.
        if (!r.offered) t.diagnostic(tool + ' was not offered to Fishball; this case only re-checks the mask')
      } finally {
        await host.call('unregisterScoped', { sessionId: fb, name: tool })
      }
    })
  }

  for (const mode of SANDBOX_MODES) {
    describe('Fishball sandbox mode ' + mode, () => {
      before(async () => { assert.equal(await host.call('setSandboxMode', { sessionId: fb, mode }), mode) }, HOOK)
      after(async () => { await host.call('setSandboxMode', { sessionId: fb, mode: 'read-only' }) }, HOOK)

      for (const tool of FIXTURE_SHELL_TOOLS) {
        it('FW-03 ' + mode + ' / ' + tool + ' without sandbox_permissions ' + (mode === 'read-only' ? 'reaches the tool' : 'is refused'), T, async () => {
          const r = await attempt(fb, tool, shellArgs())
          if (mode === 'read-only') expectRan(r, tool)
          else expectRefused(r, tool)
        })
        it('FW-03 ' + mode + ' / ' + tool + ' with sandbox_permissions is refused and asks nobody', T, async () => {
          const r = await attempt(fb, tool, shellArgs({ sandbox_permissions: 'workspace-write', justification: 'fbtest' }))
          expectRefused(r, tool)
          assert.equal(r.asked, 0, 'approval/asked events')
        })
      }
    })
  }

  for (const value of ['read-only', 'danger-full-access', '']) {
    it('FW-04 bash with sandbox_permissions ' + JSON.stringify(value) + ' is refused while read-only', T, async () => {
      const r = await attempt(fb, 'bash', shellArgs({ sandbox_permissions: value }))
      expectRefused(r, 'bash')
      assert.equal(r.asked, 0)
    })
  }

  it('FW-05 returning to read-only restores the shell tool', T, async () => {
    await host.call('setSandboxMode', { sessionId: fb, mode: 'workspace-write' })
    expectRefused(await attempt(fb, 'bash', shellArgs()), 'bash under workspace-write')
    await host.call('setSandboxMode', { sessionId: fb, mode: 'read-only' })
    expectRan(await attempt(fb, 'bash', shellArgs()), 'bash back under read-only')
  })

  it('FW-06 run_code with sandbox_permissions is refused and asks nobody', T, async () => {
    const { result, asked } = await callTool(host, fb, 'run_code', { code: 'return 1', description: 'fbtest', sandbox_permissions: 'workspace-write', justification: 'fbtest' })
    assert.equal(result.isError, true, result.text)
    assert.equal(asked, 0)
  })

  describe('an ordinary session is not affected', () => {
    for (const tool of FILE_TOOLS) {
      it('FW-07 ordinary session runs ' + tool + ' normally', T, async () => {
        expectRan(await attempt(other, tool, { path: '/tmp/fbtest.txt', content: 'x' }), tool)
      })
    }
    it('FW-07 ordinary session runs bash without and with sandbox_permissions', T, async () => {
      expectRan(await attempt(other, 'bash', shellArgs()), 'bash')
      expectRan(await attempt(other, 'bash', shellArgs({ sandbox_permissions: 'workspace-write', justification: 'fbtest' })), 'bash with sandbox_permissions')
    })
  })
})
