#!/usr/bin/env node
/**
 * Regenerates core's vendored copy of K1's `fishball-connector/mcp-schema` (design §9.1: "vendored
 * as a copy so a standalone install needs nothing from the connector package at runtime").
 *
 * Usage: node scripts/vendor-mcp-schema.mjs <coreDir> [connectorDir]
 * - coreDir (required): the core package to write into. REL-PACK passes its staged copy. There is
 *   no default, because the run rewrites `src/link/schema.js`, and the repository's copy must keep
 *   importing the connector's own module.
 * - connectorDir: the connector package to copy from, default the sibling workspace folder.
 *
 * What it does, and why:
 * 1. Copies every JavaScript file reachable from the connector's `./mcp-schema` entry through
 *    relative imports (K1 imports K2's `../tools` and V2's `../contract`, so the closure is copied,
 *    not the folder), byte for byte, keeping each file's path relative to the connector, so every
 *    relative import inside the copy still resolves. The old copy is removed first, so nothing
 *    stale survives a K1 change.
 * 2. Rewrites the one specifier in `src/link/schema.js`, the link's only K1 import, to the copy;
 *    a second run on the same staged copy is a no-op there.
 * K1 is data and pure functions with no bare imports except `node:` builtins (its README), so the
 * copy needs no dependency. A bare import found in the closure is refused, never silently copied.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VENDOR = Object.freeze({
  // K1's export, as core imports it in the repository (src/link/schema.js).
  packageSpecifier: 'fishball-connector/mcp-schema',
  // The connector's export map is the authority for the entry file.
  exportKey: './mcp-schema',
  manifest: 'package.json',
  // Where the copy lives inside core; listed in core's package.json `files`.
  directory: 'vendor',
  seam: path.join('src', 'link', 'schema.js'),
  script: '.js',
  builtinScheme: 'node:',
  relative: Object.freeze(['./', '../']),
  // Static `import … from '…'` / `export … from '…'` (the clause may span lines but holds no quote
  // or `;`, so a string constant after `export const` is never read as a specifier), and bare
  // `import '…'`.
  specifiers: /^\s*(?:(?:import|export)\s[^'";]*?\sfrom\s*|import\s*)['"]([^'"]+)['"]/gm,
})

const here = path.dirname(fileURLToPath(import.meta.url))
const connectorDir = path.resolve(process.argv[3] ?? path.join(here, '..', '..', 'connector'))

function fail(message) {
  console.error('vendor-mcp-schema: ' + message)
  process.exit(1)
}

/** Every file reachable from `entry` through relative imports, as paths relative to `root`. */
function closure(root, entry) {
  const found = new Set()
  const visit = (file) => {
    const relative = path.relative(root, file)
    if (found.has(relative)) return
    if (relative.startsWith('..') || !relative.endsWith(VENDOR.script)) fail('import leaves the connector or is not JavaScript: ' + relative)
    found.add(relative)
    for (const [, specifier] of fs.readFileSync(file, 'utf8').matchAll(VENDOR.specifiers)) {
      if (specifier.startsWith(VENDOR.builtinScheme)) continue
      if (!VENDOR.relative.some((prefix) => specifier.startsWith(prefix))) fail(`bare import ${specifier} in ${relative}`)
      visit(path.resolve(path.dirname(file), specifier))
    }
  }
  visit(entry)
  return [...found].sort()
}

if (process.argv[2] === undefined) fail('usage: vendor-mcp-schema.mjs <coreDir> [connectorDir]')
const coreDir = path.resolve(process.argv[2])
const manifest = JSON.parse(fs.readFileSync(path.join(connectorDir, VENDOR.manifest), 'utf8'))
const entryTarget = manifest.exports?.[VENDOR.exportKey]
if (typeof entryTarget !== 'string') fail(`no ${VENDOR.exportKey} export in ${connectorDir}`)
const files = closure(connectorDir, path.join(connectorDir, entryTarget))

const vendorDir = path.join(coreDir, VENDOR.directory)
fs.rmSync(vendorDir, { recursive: true, force: true })
for (const relative of files) {
  const target = path.join(vendorDir, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(connectorDir, relative), target)
}

const seam = path.join(coreDir, VENDOR.seam)
const source = fs.readFileSync(seam, 'utf8')
const quoted = `'${VENDOR.packageSpecifier}'`
const copyEntry = path.relative(path.dirname(seam), path.join(vendorDir, entryTarget)).split(path.sep).join('/')
const vendored = `'${copyEntry}'`
// A second run on the same staged copy finds the seam already pointing at the copy.
if (source.includes(quoted)) fs.writeFileSync(seam, source.replace(quoted, vendored))
else if (!source.includes(vendored)) fail(`${VENDOR.seam} imports neither ${quoted} nor ${vendored}`)
console.log(`vendor-mcp-schema: ${files.length} files into ${path.relative(coreDir, vendorDir)}; ${VENDOR.seam} -> ${copyEntry}`)
