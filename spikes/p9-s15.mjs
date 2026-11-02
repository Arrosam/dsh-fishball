/**
 * P9 S15 re-check (DESIGN §13 S15, R4 "never writes local files"): the REAL dsh-fishball
 * (not a spike stand-in) with its read-only shell built-in turned on, in a throwaway home.
 * Fishball's agent calls bash: a read works, a write is blocked by DSH's macOS sandbox
 * (Seatbelt) and no file appears, an escalation is refused by Fishball's guard before asking,
 * and DSH's file tools (write/edit) are refused. Run from a normal shell (not inside another
 * sandbox) so Seatbelt can apply.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, message, model, runSpike, until, REPO } from './harness.mjs'

const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}

await runSpike('P9-S15', async () => {
  const { ctx, home } = await bootDsh('p9s15', [], { setupProfile: link })
  const sidOf = () => JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8')).global?.sessionId
  let fishball
  await until(() => { try { fishball = ctx.agents.get(sidOf()) } catch { fishball = undefined } return fishball !== undefined && fishball.status === 'idle' && model.requestsFor(fishball.id).length > 0 }, 30000)
  if (fishball === undefined) return { pass: false, error: 'no fishball agent' }
  const out = { platform: process.platform }
  const lastResult = () => fishball.session.snapshotEvents().filter((e) => e.type === 'tool/result').at(-1)?.data?.message?.content?.map((b) => b.text).join('') ?? ''
  const turn = async (steps) => {
    model.queue(fishball.id, ...steps)
    fishball.steer(message('go'))
    await until(() => fishball.status === 'running', 3000, 5)
    await until(() => fishball.status === 'idle', 30000)
    await new Promise((r) => setTimeout(r, 300))
    return lastResult()
  }
  out.mode = ctx.sandboxPolicy.resolve({ session: fishball.session }).mode
  // Turn on the read-only shell built-in (applies in the idle phase after the turn).
  out.enable = (await turn([[{ tool: 'set_plugin_enabled', id: 'shell_on', args: { plugin: 'builtin:shell', on: true } }], [{ text: 'ok' }]])).slice(0, 200)
  await new Promise((r) => setTimeout(r, 1500))
  out.bashVisible = (model.requestsFor(fishball.id).at(-1)?.tools ?? []).some((t) => t.name === 'bash')
  await turn([[{ text: 'ok' }]])
  out.bashVisible = (model.requestsFor(fishball.id).at(-1)?.tools ?? []).some((t) => t.name === 'bash')
  const target = path.join(home, 'fishball', 'assistant', 'should-not-exist.txt')
  const outside = path.join(home, 'outside-should-not-exist.txt')
  out.read = (await turn([[{ tool: 'bash', id: 'b_read', args: { command: 'echo readable && ls /', description: 'read' } }], [{ text: 'ok' }]])).slice(0, 300)
  out.writeInside = (await turn([[{ tool: 'bash', id: 'b_w1', args: { command: 'echo hi > ' + JSON.stringify(target), description: 'write inside' } }], [{ text: 'ok' }]])).slice(0, 300)
  out.writeOutside = (await turn([[{ tool: 'bash', id: 'b_w2', args: { command: 'echo hi > ' + JSON.stringify(outside), description: 'write outside' } }], [{ text: 'ok' }]])).slice(0, 300)
  out.escalation = (await turn([[{ tool: 'bash', id: 'b_esc', args: { command: 'echo hi', description: 'esc', sandbox_permissions: 'workspace-write', justification: 'test' } }], [{ text: 'ok' }]])).slice(0, 300)
  out.escalationAsked = fishball.session.snapshotEvents().some((e) => e.type === 'approval/asked')
  out.writeTool = (await turn([[{ tool: 'write', id: 'w1', args: { file_path: target, content: 'x' } }], [{ text: 'ok' }]])).slice(0, 200)
  out.insideExists = fs.existsSync(target)
  out.outsideExists = fs.existsSync(outside)
  const pass = out.mode === 'read-only' && out.bashVisible && out.read.includes('readable')
    && !out.insideExists && !out.outsideExists && !out.escalationAsked && /never widens/i.test(out.escalation) && out.writeTool.length > 0
  return { pass, ...out }
})
