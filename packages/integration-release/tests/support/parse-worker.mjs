/**
 * Worker: the module specifiers and the tokens of JS files, parsed with the acorn copy built into Node
 * itself (the repository installs no parser). Started with `--expose-internals` (SCAN.execArgv in
 * ./scan.mjs). A file is parsed as a module first, then as a script.
 *
 * Input (workerData): { files: string[] (absolute) }.
 * Output (one message): { results: { [file]: { error?, refs: {kind, specifier|null}[], names: string[], strings: string[] } } }
 * (`specifier` null: a non-literal argument; names are identifiers, strings the string and template parts).
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { parentPort, workerData } from 'node:worker_threads'

const internal = createRequire(import.meta.url)
const acorn = internal('internal/deps/acorn/acorn/dist/acorn')
const walk = internal('internal/deps/acorn/acorn-walk/dist/walk')
const PARSE = Object.freeze({ ecmaVersion: 'latest', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true })
const SOURCE_TYPES = Object.freeze(['module', 'script'])
const KIND = Object.freeze({ static: 'static', dynamic: 'dynamic-import', require: 'require', requireResolve: 'require.resolve', metaResolve: 'import.meta.resolve' })
const LABEL = Object.freeze({ name: 'name', privateId: 'privateId', string: 'string', template: 'template' })

function withSourceType(fn) {
  let last
  for (const sourceType of SOURCE_TYPES) { try { return fn({ ...PARSE, sourceType }) } catch (error) { last = error } }
  throw last
}
function literal(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
  return null
}
function refsOf(source) {
  const refs = []
  const add = (kind, node) => refs.push({ kind, specifier: literal(node) })
  walk.full(withSourceType((o) => acorn.parse(source, o)), (node) => {
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
function tokensOf(source) {
  const names = new Set()
  const strings = new Set()
  for (const token of withSourceType((o) => [...acorn.tokenizer(source, o)])) {
    const label = token.type.label
    if (label === LABEL.name || label === LABEL.privateId) names.add(token.value)
    else if ((label === LABEL.string || label === LABEL.template) && typeof token.value === 'string') strings.add(token.value)
  }
  return { names: [...names], strings: [...strings] }
}
const results = {}
for (const file of workerData.files) {
  try {
    const source = fs.readFileSync(file, 'utf8')
    results[file] = { refs: refsOf(source), ...tokensOf(source) }
  } catch (error) {
    results[file] = { error: error.message, refs: [], names: [], strings: [] }
  }
}
parentPort.postMessage({ results })
