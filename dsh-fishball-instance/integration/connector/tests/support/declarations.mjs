/**
 * The connector's K3 host-services declarations as text (dsh-connector checkout,
 * packages/dsh-connector/host-services/*.d.ts). Types only, so they are read, never imported. A
 * small reader: interface members, Promise result variants and string-literal aliases.
 * Comments are blanked first, so JSDoc text never counts as a member.
 */
import fs from 'node:fs'
import path from 'node:path'
import { siblingPackage } from '@dsh-instance/test-helpers/siblings'

export const CONNECTOR = Object.freeze({ folder: 'dsh-connector', hostServices: 'host-services', child: 'child.d.ts' })

/** The connector package folder of the sibling checkout, or undefined. */
export const connectorDir = () => siblingPackage('connector', CONNECTOR.folder)
/** The host-services folder, or undefined when the checkout or the folder is absent. */
export function hostServicesDir() {
  const dir = connectorDir() && path.join(connectorDir(), CONNECTOR.hostServices)
  return dir && fs.existsSync(dir) ? dir : undefined
}
export const declarationText = (file) => fs.readFileSync(path.join(hostServicesDir(), file), 'utf8')

/** The text with every comment replaced by spaces (string literals kept). */
export function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

/** The body of `interface <name> { … }` (balanced braces). */
function interfaceBody(text, name) {
  const code = blankComments(text)
  const start = new RegExp('interface\\s+' + name + '\\b[^{]*\\{').exec(code)
  if (!start) return undefined
  let depth = 1
  let i = start.index + start[0].length
  const from = i
  for (; i < code.length && depth > 0; i++) { if (code[i] === '{') depth++; else if (code[i] === '}') depth--; }
  return code.slice(from, i - 1)
}

/** Split on the given separators outside brackets. */
function splitTopLevel(body, separators) {
  const out = []
  let depth = 0
  let current = ''
  let previous = ''
  for (const ch of body) {
    if ('({[<'.includes(ch)) depth++
    // The '>' of an arrow (`=>`) closes nothing.
    if (')}]'.includes(ch) || (ch === '>' && previous !== '=')) depth--
    previous = ch
    if (depth === 0 && separators.includes(ch)) { if (current.trim()) out.push(current.trim()); current = ''; continue }
    current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/**
 * The members of interface `name`: Map name → {method, params: string[], returns}.
 * A member continues on the next line while brackets are open, so multi-line signatures count once.
 */
export function interfaceMembers(text, name) {
  const body = interfaceBody(text, name)
  if (body === undefined) return undefined
  const members = new Map()
  for (const raw of splitTopLevel(body, ';\n')) {
    const m = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(\??)\s*(\(([\s\S]*?)\)\s*:\s*([\s\S]+)|:\s*([\s\S]+))$/.exec(raw)
    if (!m) continue
    const method = m[4] !== undefined || m[3].startsWith('(')
    const params = method ? (m[4] ?? '').split(',').map((p) => p.trim()).filter(Boolean) : []
    members.set(m[1], { method, params, returns: (method ? m[5] : m[6]).trim() })
  }
  return members
}

/** The resolved union of a Promise, without splitting unions within its variants. */
export function promiseVariants(returns) {
  const m = /^Promise\s*<([\s\S]+)>$/.exec(returns)
  return m && splitTopLevel(m[1], '|')
}

/** A string-literal union, or undefined if any branch is not a literal. */
export function aliasLiterals(text, name) {
  const m = new RegExp('type\\s+' + name + '\\s*=([^\\n]*(?:\\n\\s*\\|[^\\n]*)*)').exec(blankComments(text))
  if (!m) return undefined
  const literals = splitTopLevel(m[1].replace(/;\s*$/, ''), '|').map((branch) => /^(?:'([^']*)'|"([^"]*)")$/.exec(branch))
  return literals.every(Boolean) ? literals.map((literal) => literal[1] ?? literal[2]) : undefined
}
