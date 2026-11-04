import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Copied next to the guard in a disposable directory. Both --import and this
// observation resolve the exact same URL, so counters cover imports before CLI.
const guard = await import(pathToFileURL(join(import.meta.dirname, 'egress.mjs')).href)
let attempts
const FIXTURE = Object.freeze({ service: 'nativeAttachedEgress', report: 'guard-report-', extension: '.json' })
guard.apply({ provide(name, value) {
  if (name !== FIXTURE.service) throw new Error('unexpected guard fixture service')
  attempts = value.attempts
} })
const report = phase => writeFileSync(join(import.meta.dirname, FIXTURE.report + process.pid + FIXTURE.extension), JSON.stringify({
  pid: process.pid, phase, attempts, cwd: process.cwd(), execArgv: process.execArgv,
  roots: Object.fromEntries(['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'TMPDIR', 'TMP', 'TEMP'].map(key => [key, process.env[key]])),
  inherited: ['NODE_OPTIONS', 'NODE_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'DSH_API_TOKEN', 'OPENAI_API_KEY'].filter(key => process.env[key] !== undefined),
}))
report('pre-cli')
process.on('exit', () => report('exit'))
