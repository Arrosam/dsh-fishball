/**
 * Worker for the static package checks: reads every module specifier a JS file names.
 *
 * Runs with `--expose-internals` so it can use the acorn copy built into Node itself (acorn.mjs).
 * It runs with `--experimental-import-meta-resolve` so a bare
 * specifier can be resolved from the importing file's own location (two-argument
 * `import.meta.resolve`), exactly as Node would resolve it at load time.
 *
 * Input (workerData): { files: string[] (absolute), resolveNames: string[] (bare package names to resolve) }.
 * Output (one message): { results: { [file]: { error?: string, refs: Ref[] } } } where
 * Ref = { kind, specifier, resolved?: string (absolute path), unresolved?: string (error code) }.
 */
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parentPort, workerData } from 'node:worker_threads'
import { parse, walk } from './acorn.mjs'

const KIND = Object.freeze({
  static: 'static', dynamic: 'dynamic-import', require: 'require', requireResolve: 'require.resolve', metaResolve: 'import.meta.resolve',
})

/** A literal string argument (a plain string or a template with no expressions), else null. */
function literal(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
  return null
}

/** Every specifier one file names: import/export-from, import(), require(), require.resolve(), import.meta.resolve(). */
function references(file) {
  const refs = []
  const add = (kind, node) => refs.push({ kind, specifier: literal(node) })
  walk.full(parse(fs.readFileSync(file, 'utf8')), (node) => {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') && node.source) add(KIND.static, node.source)
    else if (node.type === 'ImportExpression') add(KIND.dynamic, node.source)
    else if (node.type === 'CallExpression') {
      const callee = node.callee
      if (callee.type === 'Identifier' && callee.name === 'require') add(KIND.require, node.arguments[0])
      else if (callee.type === 'MemberExpression' && callee.property?.name === 'resolve') {
        if (callee.object.type === 'Identifier' && callee.object.name === 'require') add(KIND.requireResolve, node.arguments[0])
        else if (callee.object.type === 'MetaProperty') add(KIND.metaResolve, node.arguments[0])
      }
    }
  })
  return refs
}

const bareName = (specifier) => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const results = {}
for (const file of workerData.files) {
  try {
    const refs = references(file)
    for (const ref of refs) {
      if (ref.specifier === null || !workerData.resolveNames.includes(bareName(ref.specifier).toLowerCase())) continue
      try {
        const url = import.meta.resolve(ref.specifier, pathToFileURL(file).href)
        if (url.startsWith('file:')) ref.resolved = fs.realpathSync(fileURLToPath(url))
      } catch (error) {
        ref.unresolved = error.code ?? error.message
      }
    }
    results[file] = { refs }
  } catch (error) {
    results[file] = { error: error.message, refs: [] }
  }
}
parentPort.postMessage({ results })