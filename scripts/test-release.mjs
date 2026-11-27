#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'

const RELEASE = Object.freeze({
  components: Object.freeze(['dsh-fishball', 'dsh-connector', 'dsh-fishball-instance']),
  entry: 'scripts/test-release.mjs', select: '--component=',
})
const args = process.argv.slice(2)
const selected = args[0]?.startsWith(RELEASE.select) ? args.shift().slice(RELEASE.select.length) : undefined
if ((selected !== undefined && !RELEASE.components.includes(selected)) || (!selected && args.length)) {
  console.error('Usage: npm run test:release -- [--component=<'+ RELEASE.components.join('|') + '> [component flags]]')
  process.exitCode = 1
} else {
  const root = path.resolve(import.meta.dirname, '..')
  for (const component of selected ? [selected] : RELEASE.components) {
    const cwd = path.join(root, component)
    const status = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(cwd, RELEASE.entry), ...args], { cwd, stdio: 'inherit' })
      child.once('error', (error) => { console.error(error); resolve(1) })
      child.once('close', (code) => resolve(code ?? 1))
    })
    if (status !== 0) process.exitCode ||= status
  }
}
