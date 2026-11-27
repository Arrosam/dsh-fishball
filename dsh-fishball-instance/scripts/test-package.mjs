#!/usr/bin/env node
import { legacyPackage } from '../../scripts/test-legacy.mjs'

try { process.exitCode = await legacyPackage(process.argv.slice(2)) }
catch (error) { console.error(error.message); process.exitCode = 1 }
