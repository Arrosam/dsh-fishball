/**
 * K1 rows for the K1 amendment after W2 that moved limits into the module (mcp-schema README
 * "Lifetimes and limits"; index.d.ts runtime exports): APPROVAL_LISTENER.decisionBodyBytes,
 * TOKEN_ENDPOINT_LIMITS.formBodyBytes, APPROVAL_LISTENER.pendingRequestsMax,
 * CIMD_LIMITS.cacheEntriesMax, RATE_LIMITS.tokenRequestsPerAddressPerWindow, and the listen-stream
 * 429 reusing REQUEST_GATE.inFlightRetryAfterMs. Named K1-AMEND-8, Equivalence Partitioning (one
 * test per constant and per artefact: the value, its declaration, its README row, no local copy).
 *
 * Level: unit over the loaded module, its declaration file and README (as cases.mjs), and a static
 * scan of packages/connector/src/ source text, read as data, for the old local definitions. The
 * behaviour at each boundary is in c-oauth and c-oauth-web amend-cases.mjs.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from '../../support/constants.mjs'
import { blankComments } from '../k3/declarations.mjs'
import { caseTest, declarationText } from './cases.mjs'
import { MOVED_LIMITS, SCHEMA_MODULE } from './constants.mjs'
import { folderTexts } from './schema-module.mjs'

const ID = 'K1-AMEND-8'
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
/** The README's "Lifetimes and limits" section. */
function limitsSection() {
  const text = fs.readFileSync(path.join(REPO, SCHEMA_MODULE.folder, MOVED_LIMITS.readme), 'utf8')
  const start = text.indexOf(MOVED_LIMITS.section)
  assert.ok(start >= 0, `README has no "${MOVED_LIMITS.section}"`)
  const rest = text.slice(start + MOVED_LIMITS.section.length)
  const end = rest.search(MOVED_LIMITS.nextSection)
  return { all: text, section: end < 0 ? rest : rest.slice(0, end) }
}
/** The module's code files (sources, not declarations), comments blanked. */
const moduleCode = () => [...folderTexts(MOVED_LIMITS.sourceFile).values()].map(blankComments).join('\n')
/** Every source file under packages/connector/src/, comments blanked: `[relative path, code]`. */
function sourceCode() {
  const dir = path.join(REPO, MOVED_LIMITS.source)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => MOVED_LIMITS.sourceFile.test(f))
    .map((f) => [path.join(MOVED_LIMITS.source, f), blankComments(fs.readFileSync(path.join(dir, f), 'utf8'))])
}

export function registerK1AmendCases(sdk) {
  for (const [owner, key, value] of MOVED_LIMITS.values) {
    const name = `${owner}.${key}`
    caseTest(sdk, ID, `${name} (value)`, `${name} is exported as the number ${value}`, (mod) => {
      assert.equal(typeof mod[owner]?.[key], 'number', `${name} is not a number`)
      assert.equal(mod[owner][key], value)
    })
    caseTest(sdk, ID, `${name} (declared)`, `index.d.ts declares ${name}: number`, () => {
      const [, text] = declarationText()
      const decl = new RegExp(String.raw`export declare const ${owner}\s*:[^\n]*\breadonly ${key}\s*:\s*number\b`)
      assert.match(blankComments(text), decl, `${name} is not declared as a number`)
    })
    caseTest(sdk, ID, `${name} (README)`, `README "Lifetimes and limits" lists ${name}`, () => {
      assert.ok(limitsSection().section.includes('`' + name + '`'), `${name} is not in the limits table`)
    })
    caseTest(sdk, ID, `${name} (one definition)`, `the module's code defines ${key} once`, () => {
      const found = moduleCode().match(new RegExp(String.raw`(?<![\w$.])${escape(key)}\s*:`, 'g')) ?? []
      assert.equal(found.length, 1, `${key} is defined ${found.length} times in the module`)
    })
  }
  caseTest(sdk, ID, 'listen-stream Retry-After', `K1 documents that the listen-stream cap's 429 reuses ${MOVED_LIMITS.listenRetry.retry}`, () => {
    const { all } = limitsSection()
    const paragraphs = all.split(/\n\s*\n/)
    assert.ok(paragraphs.some((p) => p.includes(MOVED_LIMITS.listenRetry.cap) && p.includes(MOVED_LIMITS.listenRetry.retry)), 'no paragraph names both the listen-stream cap and the in-flight Retry-After')
  })
  caseTest(sdk, ID, 'listen-stream Retry-After (value)', 'REQUEST_GATE.inFlightRetryAfterMs is a positive number', (mod) => {
    assert.equal(typeof mod.REQUEST_GATE?.inFlightRetryAfterMs, 'number')
    assert.ok(mod.REQUEST_GATE.inFlightRetryAfterMs > 0)
  })
  caseTest(sdk, ID, 'no local copy', `no file under ${MOVED_LIMITS.source} defines ${[...MOVED_LIMITS.oldNames, `${MOVED_LIMITS.oldMember.owner}.${MOVED_LIMITS.oldMember.key}`].join(', ')}`, () => {
    const binding = new RegExp(String.raw`\b(?:const|let|var|class|function)\s+(?:${MOVED_LIMITS.oldNames.join('|')})\b|\bexport\s*\{[^}]*\b(?:${MOVED_LIMITS.oldNames.join('|')})\b`)
    const member = new RegExp(String.raw`\b${MOVED_LIMITS.oldMember.owner}\b\s*=[\s\S]{0,400}?\b${MOVED_LIMITS.oldMember.key}\s*:`)
    const offenders = sourceCode().filter(([, code]) => binding.test(code) || member.test(code)).map(([file]) => file)
    assert.deepEqual(offenders, [], 'a module still defines its own copy of a K1 limit')
  })
}
