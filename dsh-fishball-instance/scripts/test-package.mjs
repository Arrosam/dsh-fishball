#!/usr/bin/env node
/**
 * Day-to-day testing: one package's own tests. `npm test` in a package folder runs it there (npm sets
 * the working directory to the package); `node scripts/test-package.mjs <package dir> [node --test args]`
 * names it. There is no whole-repository run: scripts/test-release.mjs runs everything before a release.
 */
import fs from 'node:fs'
import path from 'node:path'
import { runPackage } from '../packages/test-helpers/src/runner.mjs'

const args = process.argv.slice(2)
const named = args[0] !== undefined && !args[0].startsWith('-') && fs.existsSync(path.join(path.resolve(args[0]), 'package.json'))
const dir = path.resolve(named ? args.shift() : process.cwd())
process.exitCode = await runPackage(dir, args)
