/**
 * P3 evidence: the tools the owner's profile plugins register, with the registering row
 * and a digest of the parameters, for the "checked" constants (DESIGN §7). The plugin
 * packages are LINKED read-only from ~/.dsh/profiles/web/node_modules into a throwaway
 * home; nothing in ~/.dsh is written. Also mounts the DSH built-ins Fishball offers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, runSpike, until } from './harness.mjs'
import { parametersDigest } from '../src/digest.js'

const SOURCE = '/Users/samuel/.dsh/profiles/web/node_modules'
const PLUGINS = ['dsh-plugin-subscriptions', 'dsh-workspace-mover', '@michengai/dsh-code-review', '@wxg-prc-cpg/browser-skill-dsh-plugin', 'dsh-diff-approval', '@linxin666/dsh-client-ui-git-graph', 'dshmarket', '@openviking/dsh-memory-plugin', 'dsh-shell-command']
const OPTIONAL = ['@deepseek-ai/dsh-experimental-session-search', '@deepseek-ai/dsh-experimental-plugin-market-bundle', '@deepseek-ai/dsh-experimental-tool-worktree', '@deepseek-ai/dsh-experimental-ralph-bundle', '@deepseek-ai/dsh-experimental-terminal-bundle']
// browser-skill keeps a start journal under $BSK_HOME (default ~/.bsk); keep it in the throwaway home.
process.env.BSK_HOME ??= path.join(import.meta.dirname, '..', '.runtime', 'bsk-home')
const { ToolRuntime } = await hostPkg('dsh-tools')
const owners = new Map()
const entryOf = (ctx) => { let f = ctx.fiber; while (f) { if (f.entry) return f.entry; const p = f.parent?.fiber; if (!p || p === f) break; f = p } }
const original = ToolRuntime.prototype.register
ToolRuntime.prototype.register = function (definition) {
  const e = entryOf(this.ctx)
  owners.set(definition.name, { row: e?.options.id, module: e?.options.name, digest: parametersDigest(definition.parameters), firstLine: String(definition.description ?? '').split('\n')[0].slice(0, 120) })
  return original.call(this, definition)
}
await runSpike('P3-tool-digests', async () => {
  // browser-skill reveals bsk_* only after its skill is invoked (lazyTools); register at load here.
  const { ctx } = await bootDsh('p3digests', [{ id: 'browserskill', config: { lazyTools: false } }], { setupProfile: (dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    for (const name of PLUGINS) {
      const target = fs.realpathSync(path.join(SOURCE, name))
      pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
      pkg.dsh.profile.bundles.push(name)
      fs.mkdirSync(path.dirname(path.join(dir, 'node_modules', name)), { recursive: true })
      fs.symlinkSync(target, path.join(dir, 'node_modules', name))
    }
    pkg.dsh.profile.bundles.push(...OPTIONAL)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  } })
  await until(() => false, 4000)
  const { createScope } = await hostPkg('dsh-scope')
  const global = ctx.tools.schemas().map((t) => t.name).sort()
  return { pass: global.length > 1, global: global.map((n) => [n, owners.get(n) ?? null]), registeredAnywhere: [...owners.entries()].filter(([n]) => !global.includes(n)).map(([n, o]) => [n, o.module, o.digest]) }
})