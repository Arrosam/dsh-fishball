/**
 * Reads every module specifier a JS file names: import/export-from, import(), require(),
 * require.resolve(), import.meta.resolve(). Runs with `--expose-internals` so it can use the acorn
 * copy built into Node itself (the repository has no parser and nothing may be installed). A file is
 * parsed as a module first, then as a script.
 *
 * Input (workerData): { files: string[] (absolute) }.
 * Output (one message): { results: { [file]: { error?: string, specifiers: (string | null)[] } } }
 * (null: a non-literal argument).
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { parentPort, workerData } from 'node:worker_threads'

const internal = createRequire(import.meta.url)
const acorn = internal('internal/deps/acorn/acorn/dist/acorn')
const walk = internal('internal/deps/acorn/acorn-walk/dist/walk')
const PARSE = Object.freeze({ ecmaVersion: 'latest', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true })
const SOURCE_TYPES = Object.freeze(['module', 'script'])

function parse(source) {
  let last
  for (const sourceType of SOURCE_TYPES) { try { return acorn.parse(source, { ...PARSE, sourceType }) } catch (error) { last = error } }
  throw last
}
function literal(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
  return null
}
function specifiers(file) {
  const out = []
  walk.full(parse(fs.readFileSync(file, 'utf8')), (node) => {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') && node.source) out.push(literal(node.source))
    else if (node.type === 'ImportExpression') out.push(literal(node.source))
    else if (node.type === 'CallExpression') {
      const callee = node.callee
      if (callee.type === 'Identifier' && callee.name === 'require') out.push(literal(node.arguments[0]))
      else if (callee.type === 'MemberExpression' && callee.property?.name === 'resolve' && ((callee.object.type === 'Identifier' && callee.object.name === 'require') || callee.object.type === 'MetaProperty')) out.push(literal(node.arguments[0]))
    }
  })
  return out
}
const results = {}
for (const file of workerData.files) {
  try { results[file] = { specifiers: specifiers(file) } } catch (error) { results[file] = { error: error.message, specifiers: [] } }
}
parentPort.postMessage({ results })
