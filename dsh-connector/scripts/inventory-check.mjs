#!/usr/bin/env node
/**
 * Checks one package's new test run against the behaviour inventory of the old suites
 * (docs/testing/baseline-inventory.json, recorded before the restructuring).
 *
 *   node scripts/inventory-check.mjs <inventory package>[,<package>...] <names.jsonl>[,<names.jsonl>...] [--map <map.json>]
 *
 * Several inventory packages, comma-separated, are checked together: the connector's UI component
 * (dsh-connector-ui) now runs with the connector package.
 *
 * <names.jsonl> is what a run writes with DSH_TEST_NAMES=<file>; give several, comma-separated, when
 * some of the package's behaviours moved to an integration package (they count wherever they run). A behaviour is a case name with
 * its "[SDK <version>]" tag removed. A map file ({"old name": "new name" | {"withdrawn": reason}})
 * records renamed or deliberately withdrawn behaviours. The check fails when a baseline behaviour
 * is neither run nor mapped, or a behaviour that passed before fails now.
 */
import fs from 'node:fs'
import path from 'node:path'

const REPO = path.resolve(import.meta.dirname, '..')
const INVENTORY = path.join(REPO, 'docs', 'testing', 'baseline-inventory.json')
/** A behaviour: the case name without its SDK tag and without a DSH version named in its title. */
const VERSION = /\b\d+\.\d+\.\d+-rc\.\d+\b/g
const strip = (name) => name.replace(/ ?\[SDK [^\]]+\]/, '').replace(/ — TODO .*$/, '').replace(VERSION, '<DSH>').replace(/\s+/g, ' ').trim()

const [pkg, namesFile, ...rest] = process.argv.slice(2)
if (!pkg || !namesFile) { console.error('usage: inventory-check.mjs <package> <names.jsonl> [--map file]'); process.exit(2) }
const mapFile = rest[0] === '--map' ? rest[1] : undefined
const STAGING_MAP = path.join(REPO, 'docs', 'testing', 'staging-case-map.json')
const readMap = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const map = { ...readMap(STAGING_MAP), ...(mapFile ? readMap(mapFile) : {}) }

const baseline = new Map()
for (const line of fs.readFileSync(INVENTORY, 'utf8').split('\n').filter(Boolean)) {
  const row = JSON.parse(line.replace(/^\[/, '').replace(/[,\]]$/, ''))
  if (!pkg.split(',').includes(row.package)) continue
  const key = strip(row.behaviour)
  const known = baseline.get(key)
  baseline.set(key, known ? { ...known, statuses: { ...known.statuses, ...row.statuses } } : row)
}
const now = new Map()
for (const line of namesFile.split(',').flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')).filter(Boolean)) {
  const d = JSON.parse(line)
  const key = strip(d.name)
  const e = now.get(key) ?? { statuses: {} }
  e.statuses[d.status] = (e.statuses[d.status] ?? 0) + 1
  if (d.err) e.err = d.err
  now.set(key, e)
}

const missing = []
const regressed = []
const withdrawn = []
for (const [behaviour, old] of baseline) {
  const target = map[behaviour]
  if (target && typeof target === 'object') { withdrawn.push([behaviour, target.withdrawn]); continue }
  const found = now.get(target ?? behaviour)
  if (!found) { missing.push(behaviour); continue }
  if (old.statuses.pass && found.statuses.fail) regressed.push([behaviour, found.err])
}
const added = [...now.keys()].filter((k) => !baseline.has(k) && !Object.values(map).includes(k))
const fails = [...now].filter(([, e]) => e.statuses.fail).map(([k, e]) => [k, e.err])

console.log(`${pkg}: baseline ${baseline.size}, run ${now.size}, missing ${missing.length}, withdrawn ${withdrawn.length}, regressed ${regressed.length}, new ${added.length}, failing now ${fails.length}`)
const show = (title, list) => { if (list.length) console.log('\n' + title + ':\n' + list.map((x) => '  - ' + (Array.isArray(x) ? x.join(' | ') : x)).join('\n')) }
show('MISSING (baseline behaviour not run)', missing)
show('REGRESSED (passed before, fails now)', regressed)
show('FAILING NOW', fails)
show('WITHDRAWN (mapped)', withdrawn)
show('NEW', added)
process.exitCode = missing.length || regressed.length ? 1 : 0