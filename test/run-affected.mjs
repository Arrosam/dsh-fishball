/**
 * Runs only the suites a change needs (test/suites.mjs is the one path → suite map):
 *   node test/run-affected.mjs <base-ref> [--sdk=<v>] [--list] [extra node --test args]
 *     the suites whose triggers match `git diff --name-only <base-ref>` plus uncommitted and
 *     untracked files (the working tree against base);
 *   node test/run-affected.mjs --suite=<id>[,<id>…] [--sdk=<v>] [--list] [extra args]
 *     the named suites (ids as in test/suites.mjs, or a prefix such as `dsh-connector`);
 *   node test/run-affected.mjs --all [--sdk=<v>]   every unshelved V3 suite;
 *   --lane=legacy                                select pre-V3 groups instead, for a base ref or --all;
 *   --release-check                              fail selected artifact rows if the release folder is missing.
 *   node test/run-affected.mjs --check             the map's self-check (no test runs).
 *
 * A base ref and --all leave out the shelved suites (test/suites.mjs SHELVED_SUITES); --suite runs
 * whatever it names, a shelved suite included.
 *
 * --sdk chooses matching installed runtimes: `0.2.1-rc.5`, `0.2.2-rc.1` or `both` (default).
 * Normal V3 runs overlap SDK jobs and files. --serial runs one file at a time.
 * --list prints the selection and exits.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO, REQUIRED_RELEASE } from './support/constants.mjs'
import { rootSuiteFiles, runSuiteJobs } from './support/suite-runner.mjs'
import { FULL, IGNORED, SDK_VERSIONS, SHELVED_SUITES, SUITES, V3_SUITES, V2_GROUPS } from './suites.mjs'
import { AFFECTED_CASES } from './v3/contract/suite-map/affected-cases.mjs'

const ARG = Object.freeze({ suite: '--suite=', sdk: '--sdk=', list: '--list', all: '--all', check: '--check', lane: '--lane=', releaseCheck: '--release-check', separator: ',' })
const SDKS = Object.freeze({ both: 'both', values: SDK_VERSIONS })
const LANE = Object.freeze({ default: 'v3', legacy: 'legacy' })
const SDK_FILE = /\/sdk-(\d+\.\d+\.\d+-[a-z]+\.\d+)\.test\.mjs$/
const GIT = Object.freeze({ diff: ['diff', '--name-only'], untracked: ['ls-files', '--others', '--exclude-standard'], tracked: ['ls-files'] })
const V3_DIR = 'test/v3/'
const TEST_FILE = /\.test\.mjs$/

const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)
const matches = (file, globs) => globs.some((glob) => path.matchesGlob(file, glob))
/** A suite owns its own test files' folders too: editing a case reruns the suite that holds it. */
const ownGlobs = (s) => [...new Set(s.files.map((f) => (f.startsWith(V3_DIR) ? path.posix.dirname(f) + '/**' : f)))]

/** The changed paths of the working tree against `base` (committed since base, staged, unstaged, untracked). */
export function changedPaths(base) {
  return [...new Set([...git([...GIT.diff, base]), ...git(GIT.untracked)])].sort()
}

/**
 * The suite ids a set of changed paths selects, with the reason for each. A FULL path selects
 * every suite; an IGNORED path selects none; any other path that no suite claims is returned in
 * `unmapped`, so a caller can run everything rather than miss a test (the safe default).
 */
export function selectSuites(paths) {
  const picked = new Map()
  const unmapped = []
  for (const file of paths) {
    if (matches(file, FULL)) { for (const id of Object.keys(SUITES)) picked.set(id, picked.get(id) ?? file); continue }
    let claimed = false
    for (const [id, s] of Object.entries(SUITES)) if (matches(file, s.triggers) || matches(file, ownGlobs(s))) { claimed = true; if (!picked.has(id)) picked.set(id, file) }
    if (!claimed && !matches(file, IGNORED)) unmapped.push(file)
  }
  return { ids: [...picked.keys()].sort(), reasons: Object.fromEntries(picked), unmapped }
}

/** The files of the given suites for one SDK choice, repo-relative and sorted. */
export function suiteFiles(ids, sdk = SDKS.both) {
  const files = ids.flatMap((id) => SUITES[id].files)
  return [...new Set(files.filter((f) => { const m = f.match(SDK_FILE); return !m || sdk === SDKS.both || m[1] === sdk }))].sort()
}

/**
 * Self-check: every V3 test file is owned by a V3 suite, every root test file (test/run.mjs's rule)
 * by some suite, no file twice, and every listed file exists.
 */
export function checkMap() {
  const owners = new Map()
  for (const [id, s] of Object.entries(SUITES)) for (const f of s.files) owners.set(f, [...(owners.get(f) ?? []), id])
  const v3 = git(GIT.tracked).filter((f) => f.startsWith(V3_DIR) && TEST_FILE.test(f))
  const v3Owned = new Set(Object.values(V3_SUITES).flatMap((s) => s.files))
  return {
    missing: [...owners.keys()].filter((f) => !fs.existsSync(path.join(REPO, f))),
    twice: [...owners].filter(([, ids]) => ids.length > 1).map(([f, ids]) => `${f}: ${ids.join(', ')}`),
    v3Unowned: v3.filter((f) => !v3Owned.has(f)),
    rootUnowned: rootSuiteFiles().filter((f) => !owners.has(f)),
    selection: AFFECTED_CASES.flatMap(({ path: file, includes, excludes }) => {
      const picked = selectSuites([file])
      const actual = new Set(unshelved(picked.unmapped.length ? Object.keys(SUITES) : picked.ids))
      return [
        ...includes.filter((id) => !actual.has(id)).map((id) => `${file}: missing ${id}`),
        ...excludes.filter((id) => !Object.hasOwn(SUITES, id) || actual.has(id)).map((id) => `${file}: invalid exclusion ${id}`),
      ]
    }),
  }
}

function parse(argv) {
  const opts = { ids: null, base: null, sdk: SDKS.both, list: false, all: false, check: false, lane: LANE.default, releaseCheck: false, rest: [] }
  for (const a of argv) {
    if (a.startsWith(ARG.suite)) opts.ids = a.slice(ARG.suite.length).split(ARG.separator).filter(Boolean)
    else if (a.startsWith(ARG.sdk)) opts.sdk = a.slice(ARG.sdk.length)
    else if (a === ARG.list) opts.list = true
    else if (a === ARG.all) opts.all = true
    else if (a.startsWith(ARG.lane)) opts.lane = a.slice(ARG.lane.length)
    else if (a === ARG.releaseCheck) opts.releaseCheck = true
    else if (a === ARG.check) opts.check = true
    else if (!a.startsWith('-') && opts.base === null && opts.ids === null) opts.base = a
    else opts.rest.push(a)
  }
  if (opts.sdk !== SDKS.both && !SDKS.values.includes(opts.sdk)) throw new Error(`--sdk must be ${SDKS.both} or one of ${SDKS.values.join(', ')}`)
  if (!Object.values(LANE).includes(opts.lane)) throw new Error(`--lane must be ${Object.values(LANE).join(" or ")}`)
  return opts
}

/** Ids by exact id or by prefix (`dsh-connector` → every `dsh-connector.*`); an unknown name is an error. */
function resolveIds(names) {
  const ids = new Set()
  for (const n of names) {
    const hit = Object.keys(SUITES).filter((id) => id === n || id.startsWith(n + '.'))
    if (hit.length === 0) throw new Error(`unknown suite ${n}; known: ${Object.keys(SUITES).join(' ')}`)
    for (const id of hit) ids.add(id)
  }
  return [...ids].sort()
}

/** `ids` without the shelved suites, sorted: what every default selection runs. */
const unshelved = (ids) => ids.filter((id) => !SHELVED_SUITES.includes(id)).sort()

async function main(argv) {
  const opts = parse(argv)
  if (opts.check) {
    const report = checkMap()
    for (const [k, v] of Object.entries(report)) console.log(`${k}: ${v.length}${v.length ? '\n  ' + v.join('\n  ') : ''}`)
    return Object.values(report).some((v) => v.length) ? 1 : 0
  }
  const laneSuites = opts.lane === LANE.legacy ? V2_GROUPS : V3_SUITES
  const inLane = (ids) => unshelved(ids.filter((id) => Object.hasOwn(laneSuites, id)))
  let ids
  if (opts.all) ids = inLane(Object.keys(laneSuites))
  else if (opts.ids) ids = resolveIds(opts.ids)
  else if (opts.base) {
    const paths = changedPaths(opts.base)
    const picked = selectSuites(paths)
    console.log(`${paths.length} changed path(s) against ${opts.base}`)
    for (const id of inLane(picked.ids)) console.log(`  ${id}  (${picked.reasons[id]})`)
    const dropped = picked.ids.filter((id) => SHELVED_SUITES.includes(id))
    if (dropped.length) console.log(`shelved, not run: ${dropped.join(' ')}`)
    // A path no suite claims could be anything a test reads: run everything rather than guess.
    if (picked.unmapped.length) { console.log(`unmapped, so every suite in the selected lane runs:\n  ${picked.unmapped.join('\n  ')}`); ids = inLane(Object.keys(laneSuites)) } else ids = inLane(picked.ids)
  } else throw new Error('give a base ref, --suite=<id>, --all or --check')
  const files = suiteFiles(ids, opts.sdk)
  console.log(`${ids.length} suite(s), ${files.length} file(s)`)
  if (opts.list) { for (const f of files) console.log('  ' + f); return 0 }
  if (files.length === 0) { console.log('nothing to run'); return 0 }
  if (opts.releaseCheck) process.env[REQUIRED_RELEASE.env] = REQUIRED_RELEASE.on
  const sdks = opts.sdk === SDKS.both ? SDKS.values : [opts.sdk]
  const legacy = new Set(Object.values(V2_GROUPS).flatMap(({ files }) => files))
  const jobs = sdks.map((sdk, i) => ({ sdk, files: files.filter((file) => {
    const version = file.match(SDK_FILE)?.[1]
    // Legacy files without an SDK suffix can gate individual rows on the active SDK.
    return version === undefined ? i === 0 || legacy.has(file) : version === sdk
  }) })).filter((job) => job.files.length)
  // The headless V3 batch passed the three-run gate; release and legacy keep their conservative default.
  const defaultParallel = !opts.releaseCheck && process.env[REQUIRED_RELEASE.env] !== REQUIRED_RELEASE.on && !files.some((file) => legacy.has(file))
  return runSuiteJobs(jobs, opts.rest, { defaultParallel })
}

// Imported (by a check or another script) it only exports; run as a script it runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2))
