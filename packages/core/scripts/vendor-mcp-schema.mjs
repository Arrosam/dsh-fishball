#!/usr/bin/env node
/**
 * Regenerates core's vendored copy of K1's `fishball-connector/mcp-schema` in `vendor/` (design
 * §9.1: "vendored as a copy so a standalone install needs nothing from the connector package at
 * runtime"). The copy is committed (the user's decision, 2026-11-14), and core's link imports it
 * through `src/link/schema.js` only; this script is how it is refreshed after a K1, K2 or V2
 * contract change, and REL-PACK runs it so a tarball always carries the current K1.
 *
 * Usage: node scripts/vendor-mcp-schema.mjs [coreDir] [connectorDir]
 * - coreDir: the core package to write into; default this script's package;
 * - connectorDir: the connector package to copy from; default the sibling workspace folder.
 *
 * It copies every JavaScript file reachable from the connector's `./mcp-schema` export through
 * relative imports (K1 imports K2's `../tools` and V2's `../contract`, so the closure is copied,
 * not the folder), byte for byte, keeping each file's path relative to the connector, so every
 * relative import inside the copy still resolves. The old copy is removed first, so nothing stale
 * survives. K1 is data and pure functions with no bare imports except `node:` builtins (its
 * README), so the copy needs no dependency; a bare import in the closure is refused.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VENDOR = Object.freeze({
  // The connector's export map is the authority for the entry file.
  exportKey: './mcp-schema',
  manifest: 'package.json',
  // Where the copy lives inside core; listed in core's package.json `files`.
  directory: 'vendor',
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

const coreDir = path.resolve(process.argv[2] ?? path.join(here, '..'))
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

console.log(`vendor-mcp-schema: ${files.length} files into ${path.relative(coreDir, vendorDir)}`)
