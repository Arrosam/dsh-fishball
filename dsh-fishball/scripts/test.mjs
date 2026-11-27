#!/usr/bin/env node
import path from 'node:path'
import { main } from '../../scripts/test.mjs'
import { ROOT } from '../../scripts/test-workspaces.mjs'

const args = process.argv.slice(2)
if (args[0]?.includes('/') && !args[0].startsWith('-')) {
  const target = path.resolve(import.meta.dirname, '..', args[0])
  if (target.startsWith(ROOT + path.sep)) args[0] = target
}
process.exitCode = await main(args, ROOT).catch((error) => { console.error(error.message); return 1 })
