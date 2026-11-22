#!/usr/bin/env node
/**
 * `npm test` of a package: `node <helpers>/src/runner/cli.mjs [package dir] [node --test args]`.
 * Without a folder it runs the package in the current directory (npm sets it to the package).
 */
import fs from 'node:fs'
import path from 'node:path'
import { linkWorkspaces } from './links.mjs'
import { runPackage } from './run.mjs'

const args = process.argv.slice(2)
const named = args[0] !== undefined && !args[0].startsWith('-') && fs.existsSync(path.join(path.resolve(args[0]), 'package.json'))
const dir = path.resolve(named ? args.shift() : process.cwd())
linkWorkspaces()
process.exitCode = await runPackage(dir, args)
