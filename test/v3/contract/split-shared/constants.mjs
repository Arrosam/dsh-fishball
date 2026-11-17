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

/**
 * Requirement 3: the modules SPLIT-SHARED moved out of the old library (at BASE), by module file.
 * remove-v2-followups D14 deleted `admin-protocol` (ADMIN_PROTOCOL below). R-ARCH-08 strict (Fishball's
 * decision at C-WIRE-2, 2026-11-17: every library module needs two importers on its side) then moved
 * the ones with one DSH-side user out of dsh-connector-shared into that user (DSH_MOVED_TO).
 */
export const DSH_MODULES = Object.freeze(['provider-sync', 'provider-sync-codec', 'provider-sync-host', 'redact', 'files'])
/**
 * C-WIRE-2 (R-ARCH-08 strict): where each DSH-side module lives now when dsh-connector-shared no longer
 * holds it: `files` and `provider-sync*` in the instance (its only user), `oauth-client` in the adapter.
 */
export const DSH_MOVED_TO = Object.freeze({
  'provider-sync': Object.freeze([V3.instance, 'src', 'lib']),
  'provider-sync-codec': Object.freeze([V3.instance, 'src', 'lib']),
  'provider-sync-host': Object.freeze([V3.instance, 'src', 'lib']),
  files: Object.freeze([V3.instance, 'src', 'lib']),
  'oauth-client': Object.freeze([V3.adapter, 'src']),
})
/**
 * Moved into dsh-connector-shared by SPLIT-SHARED, then deleted from it by remove-v2-followups D14
 * (R-ARCH-08 strict: a library module needs a user on its side) once I-READY deleted dsh-instance's
 * admin relay, its one user. Its rows are withdrawn; fishball-shared must still not hold it either.
 */
export const ADMIN_PROTOCOL = 'admin-protocol'
/**
 * Requirements 1.40 / design §6.3a "One copy per side": modules dsh-connector-shared gained after the
 * move, with no counterpart at BASE (so no differential or drift row). `oauth-client` is the S7c K2
 * token manager the adapter drives (C-MCP-ADAPTER); fishball-shared's own copy is written and tested
 * on its own side, so the two need not be byte-equal.
 */
// I-HOST added `request-host` (requestHostname(request)): the instance's settings routes and
// dsh-connector-ui's admit route both read the request's own Host (more than one DSH-side user, R-ARCH-08).
export const ADDED_MODULES = Object.freeze(['oauth-client', 'request-host'])
/**
 * Every export subpath module dsh-connector-shared holds since C-WIRE-2 (R-ARCH-08 strict): `redact`
 * (the connector and the instance) and `request-host` (dsh-connector-ui and the instance).
 */
export const DSH_EXPORTS = Object.freeze([...DSH_MODULES, ...ADDED_MODULES].filter((m) => DSH_MOVED_TO[m] === undefined))
/**
 * Requirement 5 (interim, until I-HOST): fishball-shared keeps its own copies of these for core's
 * child halves; `redact` stays only as provider-sync-host's internal helper (no export needed).
 * The interim copies of modules dsh-connector-shared still holds; ADMIN_PROTOCOL had one too
 * (FORMER_INTERIM_COPIES), but D14 deleted its dsh-connector-shared side.
 */
export const INTERIM_COPIES = Object.freeze(['provider-sync', 'provider-sync-codec', 'provider-sync-host', 'redact'])
/** Every module fishball-shared held an interim copy of, ADMIN_PROTOCOL included (all dropped by I-HOST). */
export const FORMER_INTERIM_COPIES = Object.freeze([...INTERIM_COPIES, ADMIN_PROTOCOL])
/**
 * Requirement 4 (as first written): `files` is duplicated, one copy per library. REMOVE-V2b
 * (R-ARCH-08 strict, Fishball 2026-11-16) moved fishball-shared's copy into its one user, core, so
 * only dsh-connector-shared still ships it (until C-WIRE-2 moves it into the instance).
 */
export const FILES_MODULE = 'files'
/** REMOVE-V2b: fishball-shared's whole export map, exactly (ui-seam is used by core and fishball-ui). */
export const SHARED_EXPORTS = Object.freeze({ './ui-seam': './ui-seam.js', './package.json': './package.json' })
/** Requirement 5: core's child halves, the only reason for the interim copies. */
export const CORE_CHILD_HALVES = Object.freeze([path.join('src', 'slim', 'child', 'admin.js'), path.join('src', 'slim', 'child', 'provider-sync-target.js')])
/** Requirement 5: no Fishball-side package imports fishball-shared's redact. */
export const REDACT = 'redact'

export const subpath = (module) => './' + module
export const moduleFile = (module) => module + '.js'
/** A library's export map entry for its own manifest (every package exposes it). */
export const MANIFEST_EXPORT = './package.json'

/**
 * Requirement 6: dsh-connector-shared's peers. The host packages the old library peered on
 * (@deepseek-ai/cosmokit, dsh-app-boot, dsh-llm-pi-ai) served the provider-sync modules, which left
 * with C-WIRE-2 (R-ARCH-08 strict), so the library peers on nothing now (relayed 2026-11-17).
 */
export const HOST_PEERS = Object.freeze([])
/** DSH's own packages, resolved from the SDK under test when a library module is loaded. */
export const SDK_SCOPE = '@deepseek-ai/'
export const sdkModules = (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules')

/**
 * Requirement 1: which library each existing package of a side is expected to import and bundle
 * (the packages that use the moved modules today). The connector uses `redact`, the instance
 * provider-sync and files (its admin protocol went with the admin relay, D14), the adapter `./oauth-client` (design §6.3a, its library is
 * its own side's), and core and fishball-ui (a Fishball-side package since F-UI) the ui-seam (since
 * REMOVE-V2b fishball-shared's only module).
 */
// C-WIRE-2 (R-ARCH-08 strict): the adapter owns its oauth-client and takes no library (NO_LIBRARY).
export const EXPECTED_LIBRARY = Object.freeze({
  [V3.instance.name]: V3.dshShared.name,
  [V3.connector.name]: V3.dshShared.name,
  [V3.core.name]: V3.shared.name,
  [V3.ui.name]: V3.shared.name,
})

/** Packages of a side that import no library since C-WIRE-2 (R-ARCH-08 strict). */
export const NO_LIBRARY = Object.freeze([V3.adapter.name])

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

/** Owners of the rows SPLIT-SHARED cannot check. */
export const LATER = Object.freeze({
  iHost: 'I-HOST (moves core\'s child halves into the instance; fishball-shared\'s interim copies are deleted then)',
  relPack: 'REL-PACK (a packed instance tarball, with bundled/ sources, places core\'s fishball-shared from the packed core)',
})
