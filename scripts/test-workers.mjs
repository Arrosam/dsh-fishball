import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SIGNALS = ['SIGINT', 'SIGTERM']
const WORKER = fileURLToPath(new URL('./test-worker.mjs', import.meta.url))

export async function withWorkers(task) {
  const children = new Set()
  let cancelled = false
  const stop = (signal) => { cancelled = true; for (const child of children) child.kill(signal) }
  for (const signal of SIGNALS) process.on(signal, stop)
  try {
    const result = await task((pkg, options, stdio = 'inherit') => new Promise((resolve) => {
      const child = spawn(process.execPath, [WORKER, pkg.name, JSON.stringify(options)], {
        cwd: pkg.root, stdio, detached: true,
      })
      children.add(child)
      child.once('error', (error) => { console.error(pkg.name + ': ' + error.message); resolve(1) })
      child.once('close', (code, signal) => { children.delete(child); resolve(signal ? 130 : code ?? 1) })
    }))
    return { result, cancelled }
  } finally {
    for (const signal of SIGNALS) process.off(signal, stop)
  }
}
