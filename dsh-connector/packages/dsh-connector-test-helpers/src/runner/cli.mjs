#!/usr/bin/env node
/**
 * `npm test` of a package: `node <helpers>/src/runner/cli.mjs [package dir] [node --test args]`.
 * Without a folder it runs the package in the current directory (npm sets it to the package).
 */
import fs from 'node:fs'
import path from 'node:path'
import { linkWorkspaces } from './links.mjs'
import { runPackage } from './run.mjs'
import { checkAmenity } from '../../../../../scripts/amenity-boundaries.mjs'

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../../..')

const args = process.argv.slice(2)
const named = args[0] !== undefined && !args[0].startsWith('-') && fs.existsSync(path.join(path.resolve(args[0]), 'package.json'))
const dir = path.resolve(named ? args.shift() : process.cwd())
const problems = checkAmenity(WORKSPACE_ROOT, dir)
if (problems.length) {
  for (const {file, line, text, why} of problems) console.error(file + ':' + line + ': ' + text + ' (' + why + ')')
  process.exitCode = 1
} else {
  linkWorkspaces()
  process.exitCode = await runPackage(dir, args)
}
