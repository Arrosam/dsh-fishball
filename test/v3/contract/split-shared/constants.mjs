/**
 * Vocabulary for the SPLIT-SHARED cases (cases.md). Every value comes from the requirements
 * (v3-requirements.md R-ARCH-01, R-ARCH-08 as amended by 1.40, R-BND-01; design `9a531192` §1.0,
 * §1.0b row 5, §1.0c, the "Shared libraries (requirements 1.40)" row, §6.3a "One copy per side";
 * v3-remaining-plan §5 row SPLIT-SHARED, §6) or the interim rule Fishball decided for this task
 * (relayed 2026-11-16: core's child halves keep fishball-shared copies until I-HOST). None comes
 * from the implementation under test.
 */
import path from 'node:path'
import { SDK, V3 } from '../package-boundaries/constants.mjs'

/**
 * "Moved, behaviour unchanged": the oracle is the library as it was at the task's base commit
 * (`integrate/v3-w2` @ 131ad65f, folder packages/shared), read with `git show`, never the new code.
 */
export const BASE = Object.freeze({ ref: '131ad65f', folder: 'packages/shared' })

/** Requirement 3: what dsh-connector-shared holds, by module file and export subpath. */
export const DSH_MODULES = Object.freeze(['admin-protocol', 'provider-sync', 'provider-sync-codec', 'provider-sync-host', 'redact', 'files'])
/**
 * Requirement 5 (interim, until I-HOST): fishball-shared keeps its own copies of these for core's
 * child halves; `redact` stays only as provider-sync-host's internal helper (no export needed).
 */
export const INTERIM_COPIES = Object.freeze(['admin-protocol', 'provider-sync', 'provider-sync-codec', 'provider-sync-host', 'redact'])
/** Requirement 4: `files` is duplicated, one copy per library. */
export const FILES_MODULE = 'files'
/** Requirement 5: core's child halves, the only reason for the interim copies. */
export const CORE_CHILD_HALVES = Object.freeze([path.join('src', 'slim', 'child', 'admin.js'), path.join('src', 'slim', 'child', 'provider-sync-target.js')])
/** Requirement 5: no Fishball-side package imports fishball-shared's redact. */
export const REDACT = 'redact'

export const subpath = (module) => './' + module
export const moduleFile = (module) => module + '.js'
/** A library's export map entry for its own manifest (every package exposes it). */
export const MANIFEST_EXPORT = './package.json'

/** Requirement 6: dsh-connector-shared's peers, the same host packages as today's library. */
export const HOST_PEERS = Object.freeze(['@deepseek-ai/cosmokit', '@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh-llm-pi-ai'])
/** DSH's own packages, resolved from the SDK under test when a library module is loaded. */
export const SDK_SCOPE = '@deepseek-ai/'
export const sdkModules = (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules')

/**
 * Requirement 1: which library each existing package of a side is expected to import and bundle
 * (the packages that use the moved modules today). The connector uses `redact`, the instance the
 * admin protocol, provider-sync and files, core its child halves and the Skills store.
 */
export const EXPECTED_LIBRARY = Object.freeze({
  [V3.instance.name]: V3.dshShared.name,
  [V3.connector.name]: V3.dshShared.name,
  [V3.core.name]: V3.shared.name,
})

/** Requirement 7: the placed copies in the child profile and the contract-only connector. */
export const PLACED = Object.freeze({
  libraries: Object.freeze([V3.dshShared.name, V3.shared.name]),
  contractOnly: V3.connector.name,
  dirs: Object.freeze(['vendor', 'node_modules']),
  manifest: 'package.json',
  tempPrefix: 'fbtest-split-place-',
})

/**
 * `inside(root, file)`: whether `file` is `root` or below it, by path only (the helper's contract).
 * EP/BVA rows [id, title, root, file, expected]; paths are POSIX (the instance requires POSIX).
 */
const ROOT = '/fbtest/root'
export const INSIDE_CASES = Object.freeze([
  ['EP-1', 'the same path', ROOT, ROOT, true],
  ['BVA-1', 'the root with a trailing separator', ROOT, ROOT + '/', true],
  ['EP-2', 'a direct child', ROOT, ROOT + '/a', true],
  ['EP-3', 'a deep descendant', ROOT, ROOT + '/a/b/c.js', true],
  ['BVA-2', "a child whose name starts with '..'", ROOT, ROOT + '/..hidden', true],
  ['BVA-3', "a child named '...'", ROOT, ROOT + '/...', true],
  ['EP-4', 'the parent', ROOT, '/fbtest', false],
  ['EP-5', "a path climbing out with '..'", ROOT, ROOT + '/../other/x', false],
  ['BVA-4', "exactly '..' of the root", ROOT, ROOT + '/..', false],
  ['EP-6', "a path that climbs out and back in with '..'", ROOT, ROOT + '/a/../b', true],
  ['BVA-5', 'a sibling sharing the root as a name prefix', ROOT, ROOT + '2', false],
  ['BVA-6', 'a sibling folder sharing the prefix, with a child', ROOT, ROOT + 'x/a', false],
  ['EP-7', 'an unrelated absolute path', ROOT, '/elsewhere/file', false],
  ['EP-8', 'the filesystem root as root: any absolute path', '/', '/elsewhere/file', true],
])

/**
 * Inputs for the redaction differential (behaviour unchanged against BASE): EP of the masked shapes
 * the module documents (an Authorization bearer, a key/token/secret assignment, a long opaque run)
 * and of text that must stay readable (file paths), BVA at the long run's threshold.
 */
const run = (length) => 'A1b2C3d4'.repeat(8).slice(0, length)
export const REDACT_SAMPLES = Object.freeze([
  'Authorization: Bearer abc.def-ghi',
  'token=abc123&next=1',
  '{"apiKey": "sk-live-value"}',
  'password: hunter2',
  'at /usr/local/lib/node_modules/dsh/lib/index.js:10:5',
  run(31), run(32), run(33),
  'plain diagnostic text',
  '',
])
export const LONG_RUN = Object.freeze({ below: run(31), at: run(32) })

/** Inputs for the pure provider-sync functions (differential against BASE). */
export const PROFILE_SAMPLES = Object.freeze([
  { displayName: 'Fixture', api: 'openai-completions', baseURL: 'https://models.example.invalid/v1', models: [{ id: 'm', name: 'M', contextWindow: 1, maxTokens: 1, input: ['text'] }] },
  { baseURL: 'http://models.example.invalid/v1' },
  { baseURL: 'https://user:pw@models.example.invalid/v1' },
  { headers: { 'x-a': 'b' } },
  { models: [{ id: 'm' }, { id: 'm' }] },
  { models: [{ id: 'm', maxTokens: 0 }] },
  null,
  [],
])
export const CODE_SAMPLES = Object.freeze(['ok', 'a-b-c', 'Upper', 'x'.repeat(64), 'x'.repeat(65), 'x'.repeat(200), '', 'a b', 7, null])
export const FINGERPRINT_SAMPLES = Object.freeze([{ b: 1, a: [2, { d: 3, c: 4 }] }, [], 'text', 0])

/** The leading header comment(s) a copy may change (drift guard: the code after them is the same). */
export const HEADER = /^(?:\s*\/\*[\s\S]*?\*\/)*\s*/

/** Owners of the rows SPLIT-SHARED cannot check. */
export const LATER = Object.freeze({
  iHost: 'I-HOST (moves core\'s child halves into the instance; fishball-shared\'s interim copies are deleted then)',
  removeV2: 'REMOVE-V2 (design §1.0b row 2: core still imports dsh-connector/contract and peers on dsh-connector until the V2 child path goes)',
  relPack: 'REL-PACK (a packed instance tarball, with bundled/ sources, places core\'s fishball-shared from the packed core)',
})
