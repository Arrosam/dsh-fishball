/**
 * REL-PACK black-box cases: the release folder `node scripts/pack-v3.mjs` writes (tarballs,
 * SHA256SUMS, INSTALL.md, PUBLISH.md, the warmed pnpm store and cache), what each tarball holds
 * (requirements 1–7), the pack script's offline checker, and an offline install of the tarballs
 * with the real DSH CLI of each SDK (v3-tasks.md REL-PACK: "each tarball installs offline into a
 * fresh DSH_HOME on both SDKs"). Values: constants.mjs (each with its requirement source).
 *
 * Techniques (each test name carries its case id and row):
 * - EP: one partition per package for every per-tarball rule (REL-EP-01, 04, 05, 07, 08, 09;
 *   REL-SYS-03 installs each tarball alone);
 * - BVA: SHA256SUMS line shape (hex length 63/64/65, one/two/three spaces), engines.dsh just below
 *   and at its bound, the tampered byte at the first, middle and last offset;
 * - Decision Table: plugin vs library × engines.dsh (REL-DT-01), dsh-connector-ui's peer × semver
 *   includePrerelease (REL-DT-02), lists-the-library-in-dependencies × bundled copy (REL-DT-03),
 *   store and cache (warmed vs empty) × closure (bundled vs from the registry) (REL-DT-04);
 * - State Transition: a copied release valid → tampered → restored → … under `--check` (REL-ST-01).
 *
 * Levels: unit (the release output read entry by entry; no product module is loaded), integration
 * (`npm pack --dry-run` of each repo folder; the pack script's `--check`) and system (DSH's own
 * `dsh plugin add`, which forwards to pnpm; DSH itself is never started, no hosted child launched).
 * Nothing uses the network: every child runs with a dead proxy, no user npm config, a temp HOME and
 * temp caches. A missing release output fails with "run `node scripts/pack-v3.mjs` first".
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { NODE, REPO } from '../../../support/constants.mjs'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import {
  ALL, ALL_NAMES, BUDGET, CASE, CORE_CLOSURE, DRY_RUN, DSH, INSTANCE_BUNDLED, ISOLATION, JUNK, LIBRARIES, MANIFEST, NAMED_IMPORTERS,
  NPM_TOOL, PACK_SCRIPT, RELEASE, SETS, TARBALL, UI_PEERS, VERSION, isLibrary,
} from './constants.mjs'
import {
  assertFromOwnBundle, assertLibraryCopies, describeEntry, dshAddChecked, flipByte, installAndCheck, installedDir, isJunk, isLink, isolatedEnv,
  isRegular, releaseDir, resolveIn, runTool, sdkSemver, sha256, show, tail, tarball, tarballPath, tarListing, withScratch,
} from './release.mjs'

/**
 * One case per test, named as the other V3 suites name theirs; `timeout` only for the slow levels.
 * (Here, not in release.mjs: package-boundaries imports release.mjs, so release.mjs must not import it back.)
 */
export function relCase(sdk, id, row, title, fn, timeout) {
  test(caseName(sdk, id, row, title), timeout === undefined ? {} : { timeout }, fn)
}
const json = (entry) => JSON.parse(entry.data.toString('utf8'))

// ------------------------------------------------------------------ rules (problem lists)

/** Requirement 1 on a top-level manifest (package/package.json); nested ones only carry the version. */
export function manifestProblems(pkg, m) {
  const p = []
  const expect = (ok, what) => { if (!ok) p.push(what) }
  expect(m.name === pkg.name, `name ${show(m.name)} is not ${show(pkg.name)}`)
  expect(m.version === VERSION, `version ${show(m.version)} is not ${VERSION}`)
  expect(m.engines?.node === MANIFEST.enginesNode, `engines.node ${show(m.engines?.node)} is not ${show(MANIFEST.enginesNode)}`)
  expect(m.license === MANIFEST.license, `license ${show(m.license)}`)
  expect(typeof m.description === 'string' && m.description.trim() !== '', `description ${show(m.description)} is empty`)
  expect(typeof m.repository?.url === 'string' && m.repository.url.includes(MANIFEST.repositoryUrlPart), `repository.url ${show(m.repository?.url)}`)
  expect(m.repository?.directory === pkg.folder, `repository.directory ${show(m.repository?.directory)} is not ${show(pkg.folder)}`)
  expect(m.publishConfig?.tag === MANIFEST.publishTag, `publishConfig.tag ${show(m.publishConfig?.tag)}`)
  expect(m.private !== true, 'private: true')
  for (const f of MANIFEST.zodForbiddenFields) expect(!Object.hasOwn(m[f] ?? {}, MANIFEST.zod), `${MANIFEST.zod} in ${f}`)
  const peers = m[MANIFEST.peerField] ?? {}
  if (Object.hasOwn(peers, MANIFEST.zod)) expect(peers[MANIFEST.zod] === MANIFEST.zodRange, `${MANIFEST.zod} peer range ${show(peers[MANIFEST.zod])}`)
  for (const [name, range] of Object.entries(peers)) if (name.startsWith(MANIFEST.hostScope)) expect(range === MANIFEST.hostPeerRange, `peer ${name} range ${show(range)}`)
  return p
}
/** Manifests inside a tarball other than the top one and those of bundled node_modules (fishball-ui's sub-packages). */
export function nestedManifests(files) {
  return [...files.entries()].filter(([rel]) => path.posix.basename(rel) === TARBALL.manifest && rel !== TARBALL.manifest
    && !rel.split('/').includes(TARBALL.nodeModules)).map(([rel, entry]) => ({ rel, manifest: json(entry) }))
}

/** Requirement 2: every entry on another of the 9 names exactly VERSION (dependencies, optionalDependencies). */
export function internalVersionProblems(pkg, m) {
  const p = []
  for (const f of MANIFEST.exactInternalFields) {
    for (const [name, range] of Object.entries(m[f] ?? {})) if (ALL_NAMES.includes(name) && name !== pkg.name && range !== VERSION) p.push(`${f}.${name} = ${show(range)}`)
  }
  return p
}

/** Requirement 4: walk the non-peer dependencies of core and of every package it bundles, resolving inside the tarball. */
export function closureProblems(files) {
  const has = (rel) => files.has(rel)
  const problems = []
  const seen = new Set()
  const queue = ['']
  while (queue.length) {
    const dir = queue.shift()
    const manifest = json(files.get(path.posix.join(dir, TARBALL.manifest)))
    for (const f of CORE_CLOSURE.walkFields) {
      for (const name of Object.keys(manifest[f] ?? {})) {
        const found = resolveIn(has, dir, name)
        if (found === null) { problems.push(`${dir || TARBALL.prefix}: ${f}.${name} is not bundled`); continue }
        const next = path.posix.dirname(found)
        if (!seen.has(next)) { seen.add(next); queue.push(next) }
      }
    }
  }
  return problems
}

/** Requirement 7: one repo folder's isolated `npm pack --dry-run --json` listing (writes nothing; no scripts). */
async function dryRunFiles(pkg) {
  return withScratch(async (scratch) => {
    const r = await runTool(NPM_TOOL, [...DRY_RUN.args], { env: isolatedEnv(scratch), cwd: path.join(REPO, pkg.folder), timeoutMs: BUDGET.dryRunMs })
    assert.equal(r.code, 0, tail(r.output))
    const [report] = JSON.parse(r.stdout.slice(r.stdout.search(DRY_RUN.jsonStart)))
    return report.files.map((f) => f.path)
  })
}
const staged = (pkg, rel) => DRY_RUN.staged.some((s) => (s.owner === null || s.owner === pkg) && s.path.test(rel))

// ------------------------------------------------------------------ the pack script's checker

const checkArgs = (dir) => [PACK_SCRIPT.file, PACK_SCRIPT.check, PACK_SCRIPT.out, dir]
async function runCheck(scratch, dir) {
  // A missing script would also exit non-zero: never let that pass a negative case.
  assert.ok(fs.existsSync(PACK_SCRIPT.file), PACK_SCRIPT.file + ' is missing')
  return runTool(NODE, dir === undefined ? [PACK_SCRIPT.file, PACK_SCRIPT.check] : checkArgs(dir), { env: isolatedEnv(scratch), cwd: REPO, timeoutMs: BUDGET.checkMs })
}
/** A copy of the release in a throwaway folder; `expectCheck(state, ok)` runs `--check --out <copy>` and asserts its exit. */
function onCopy(fn) {
  return withScratch(async (scratch) => {
    const copy = path.join(scratch, ISOLATION.copyDir)
    fs.cpSync(releaseDir(), copy, { recursive: true, verbatimSymlinks: true })
    const target = tarballPath(PACK_SCRIPT.tamperTarget, copy)
    const pristine = fs.readFileSync(target)
    const expectCheck = async (state, ok) => {
      const r = await runCheck(scratch, copy)
      if (ok) assert.equal(r.code, PACK_SCRIPT.okExit, `${state}: ${tail(r.output)}`)
      else assert.notEqual(r.code, PACK_SCRIPT.okExit, `${state}: ${PACK_SCRIPT.check} passed`)
    }
    await expectCheck('copied', true)
    await fn({ copy, target, pristine, expectCheck })
  })
}

// ------------------------------------------------------------------ registration

export function registerPackCases(sdk) {
  registerOracle(sdk)
  registerLayout(sdk)
  registerManifests(sdk)
  registerContents(sdk)
  registerDryRun(sdk)
  // The checker runs before the installs: pnpm may add the local tarballs to the release's warmed store.
  registerCheck(sdk)
  registerInstalls(sdk)
}

/** REL-ORACLE: this suite's own oracles (no release needed), and the tarball parser against `tar -tzf`. */
function registerOracle(sdk) {
  relCase(sdk, CASE.oracle, 'junk', 'the junk rule flags each banned segment and name and none of its look-alikes (BVA)', () => {
    assert.deepEqual(JUNK.samples.junk.filter((s) => !isJunk(s)), [])
    assert.deepEqual(JUNK.samples.clean.filter(isJunk), [])
  })
  relCase(sdk, CASE.oracle, 'sums', 'the SHA256SUMS line shape admits 64 hex + two spaces + a name and nothing at 63/65 hex, one or three spaces (BVA)', () => {
    assert.deepEqual(RELEASE.sumSamples.valid.filter((s) => !RELEASE.sumLine.test(s)), [])
    assert.deepEqual(RELEASE.sumSamples.invalid.filter((s) => RELEASE.sumLine.test(s)), [])
  })
  for (const pkg of ALL) {
    relCase(sdk, CASE.oracle, 'tar ' + pkg.name, `the parsed entries of ${pkg.tarball} are exactly what tar -tzf lists`, async () => {
      const { file, entries } = tarball(pkg)
      const r = await tarListing(file)
      assert.equal(r.code, 0, tail(r.output))
      assert.deepEqual(entries.map((e) => e.path).sort(), r.stdout.split(RELEASE.lineBreak).filter(Boolean).sort())
    })
  }
}

/** REL-EP-01..03: the release folder layout. */
function registerLayout(sdk) {
  for (const pkg of ALL) {
    relCase(sdk, CASE.layout, pkg.name, `the release holds ${pkg.tarball}`, () => {
      assert.ok(fs.statSync(tarballPath(pkg)).isFile(), pkg.tarball + ' is not a file')
    })
  }
  relCase(sdk, CASE.layout, 'docs', `the release holds ${RELEASE.docs.join(' and ')}, both non-empty`, () => {
    const dir = releaseDir()
    for (const d of RELEASE.docs) assert.ok(fs.existsSync(path.join(dir, d)) && fs.statSync(path.join(dir, d)).size > 0, d + ' is missing or empty')
  })
  relCase(sdk, CASE.layout, 'store', `the release holds the warmed ${RELEASE.store}/ and ${RELEASE.cache}/ folders, both non-empty`, () => {
    const dir = releaseDir()
    for (const d of [RELEASE.store, RELEASE.cache]) {
      const at = path.join(dir, d)
      assert.ok(fs.existsSync(at) && fs.statSync(at).isDirectory() && fs.readdirSync(at).length > 0, d + '/ is missing or empty')
    }
  })
  relCase(sdk, CASE.extras, 'tgz', 'the release holds no .tgz other than the nine package tarballs', () => {
    const tgz = fs.readdirSync(releaseDir()).filter((f) => f.endsWith(RELEASE.tarballSuffix)).sort()
    assert.deepEqual(tgz, ALL.map((p) => p.tarball).sort())
  })
  relCase(sdk, CASE.sums, 'shape', `every ${RELEASE.sums} line is "<64 lowercase hex>  <file name>"`, () => {
    const file = path.join(releaseDir(), RELEASE.sums)
    assert.ok(fs.existsSync(file), RELEASE.sums + ' is missing: ' + RELEASE.missingHint)
    const lines = fs.readFileSync(file, 'utf8').split(RELEASE.lineBreak).filter((l) => l !== '')
    assert.deepEqual(lines.filter((l) => !RELEASE.sumLine.test(l)), [])
  })
  relCase(sdk, CASE.sums, 'one per tarball', `${RELEASE.sums} has exactly one line per tarball, each matching the file's sha256`, () => {
    const dir = releaseDir()
    const lines = fs.readFileSync(path.join(dir, RELEASE.sums), 'utf8').split(RELEASE.lineBreak).filter((l) => l !== '')
    const named = lines.map((l) => RELEASE.sumLine.exec(l)).filter(Boolean).map(([, digest, name]) => ({ digest, name }))
    assert.deepEqual(named.map((n) => n.name).sort(), ALL.map((p) => p.tarball).sort())
    const wrong = named.filter((n) => sha256(fs.readFileSync(tarballPath({ tarball: n.name }, dir))) !== n.digest).map((n) => n.name)
    assert.deepEqual(wrong, [])
  })
}

/** REL-EP-04, REL-DT-01, REL-DT-02: the manifests inside the tarballs. */
function registerManifests(sdk) {
  for (const pkg of ALL) {
    relCase(sdk, CASE.manifest, pkg.name, `${pkg.tarball} package.json: name, version, engines.node, license, description, repository, publishConfig, not private, zod and host peers`, () => {
      const { manifest } = tarball(pkg)
      assert.ok(manifest, pkg.tarball + ' has no package/package.json')
      assert.deepEqual(manifestProblems(pkg, manifest), [])
    })
    relCase(sdk, CASE.manifest, 'nested ' + pkg.name, `every other own package.json in ${pkg.tarball} (outside node_modules) has version ${VERSION}`, () => {
      const wrong = nestedManifests(tarball(pkg).files).filter((n) => n.manifest.version !== VERSION).map((n) => `${n.rel}: ${show(n.manifest.version)}`)
      assert.deepEqual(wrong, [])
    })
    relCase(sdk, CASE.peers, 'exact ' + pkg.name, `every dependency of ${pkg.name} on another of the nine names exactly ${VERSION}`, () => {
      assert.deepEqual(internalVersionProblems(pkg, tarball(pkg).manifest), [])
    })
    if (isLibrary(pkg)) {
      // The lead, 2026-11-17: the libraries are not plugins and DSH checks engines.dsh only for plugins.
      relCase(sdk, CASE.engines, 'library ' + pkg.name, `${pkg.name} (a library) has no engines.dsh`, () => {
        const engines = tarball(pkg).manifest?.engines ?? {}
        assert.equal(Object.hasOwn(engines, MANIFEST.dshEngine), false, `engines.dsh ${show(engines[MANIFEST.dshEngine])}`)
      })
      continue
    }
    relCase(sdk, CASE.engines, 'plugin ' + pkg.name, `${pkg.name} engines.dsh is ${MANIFEST.enginesDsh}; DSH ${DSH.versions.join(' and ')} satisfy it, ${MANIFEST.dshBelowBound} does not (BVA)`, () => {
      const range = tarball(pkg).manifest?.engines?.[MANIFEST.dshEngine]
      assert.equal(range, MANIFEST.enginesDsh)
      const semver = sdkSemver(sdk)
      for (const v of DSH.versions) assert.ok(semver.satisfies(v, range, MANIFEST.dshSemverOptions), `${v} does not satisfy ${range}`)
      assert.equal(semver.satisfies(MANIFEST.dshBelowBound, range, MANIFEST.dshSemverOptions), false, `${MANIFEST.dshBelowBound} satisfies ${range}`)
    })
  }
  for (const peer of UI_PEERS.peers) {
    for (const includePrerelease of UI_PEERS.includePrerelease) {
      relCase(sdk, CASE.peers, `${peer.name} includePrerelease=${includePrerelease}`, `${UI_PEERS.from.name}'s peer on ${peer.name} admits ${VERSION} (semver includePrerelease ${includePrerelease})`, () => {
        const range = tarball(UI_PEERS.from).manifest?.[MANIFEST.peerField]?.[peer.name]
        assert.equal(typeof range, 'string', `${UI_PEERS.from.name} declares no peer on ${peer.name}`)
        assert.ok(sdkSemver(sdk).satisfies(VERSION, range, { includePrerelease }), `${VERSION} is outside ${show(range)}`)
      })
    }
  }
}

/** REL-EP-05..08, REL-DT-03: what the tarballs hold. */
function registerContents(sdk) {
  for (const pkg of ALL) {
    relCase(sdk, CASE.links, pkg.name, `${pkg.tarball} holds no symlink or hard-link entry`, () => {
      assert.deepEqual(tarball(pkg).entries.filter(isLink).map(describeEntry), [])
    })
    relCase(sdk, CASE.junk, pkg.name, `${pkg.tarball} holds no test or runtime junk (bundled node_modules included)`, () => {
      assert.deepEqual([...tarball(pkg).files.keys()].filter(isJunk), [])
    })
  }
  for (const lib of LIBRARIES) {
    relCase(sdk, CASE.bundling, lib.name, `every package listing ${lib.name} in dependencies bundles a byte-identical real copy of its shipped files; no other package ships one`, () => {
      assertLibraryCopies(lib.name, NAMED_IMPORTERS[lib.name])
    })
  }
  relCase(sdk, CASE.closure, 'mcp client', `${CORE_CLOSURE.owner.tarball} bundles ${CORE_CLOSURE.mcpClient.name} ${CORE_CLOSURE.mcpClient.version}`, () => {
    const entry = tarball(CORE_CLOSURE.owner).files.get(path.posix.join(TARBALL.nodeModules, CORE_CLOSURE.mcpClient.name, TARBALL.manifest))
    assert.ok(entry, `no package/node_modules/${CORE_CLOSURE.mcpClient.name}/package.json`)
    assert.equal(json(entry).version, CORE_CLOSURE.mcpClient.version)
  })
  relCase(sdk, CASE.closure, 'walk', `every non-peer dependency of fishball-core and of every package it bundles is present in its node_modules`, () => {
    assert.deepEqual(closureProblems(tarball(CORE_CLOSURE.owner).files), [])
  })
  const { owner, dir, packages, statusFile } = INSTANCE_BUNDLED
  relCase(sdk, CASE.instance, 'set', `${owner.tarball} ${dir} holds exactly the hosted child's plugin set as tarballs`, () => {
    const held = [...tarball(owner).files.keys()].filter((rel) => rel.startsWith(dir) && rel.endsWith(RELEASE.tarballSuffix)).sort()
    assert.deepEqual(held, packages.map((p) => dir + p.tarball).sort())
  })
  for (const pkg of packages) {
    relCase(sdk, CASE.instance, pkg.name, `${owner.tarball} ${dir}${pkg.tarball} is a regular file byte-identical to the release's ${pkg.tarball}`, () => {
      const entry = tarball(owner).files.get(dir + pkg.tarball)
      assert.ok(entry && isRegular(entry), `no regular package/${dir}${pkg.tarball}`)
      assert.ok(entry.data.equals(fs.readFileSync(tarballPath(pkg))), `package/${dir}${pkg.tarball} differs from the release's`)
    })
  }
  relCase(sdk, CASE.instance, 'status', `${owner.tarball} holds package/${statusFile} as a regular file`, () => {
    const entry = tarball(owner).files.get(statusFile)
    assert.ok(entry, `no package/${statusFile}`)
    assert.ok(isRegular(entry), describeEntry(entry) + ' is not a regular file')
  })
}

/** REL-EP-09: a repo folder's own `npm pack --dry-run` lists the tarball's paths, less what the pack script stages. */
function registerDryRun(sdk) {
  for (const pkg of ALL) {
    relCase(sdk, CASE.dryRun, pkg.name, `npm pack --dry-run of ${pkg.folder} lists ${pkg.tarball}'s paths (less staged node_modules/ and the instance's bundled/*.tgz)`, async () => {
      const packed = [...tarball(pkg).files].filter(([rel, e]) => rel !== '' && (isRegular(e) || isLink(e)) && !staged(pkg, rel)).map(([rel]) => rel).sort()
      assert.deepEqual((await dryRunFiles(pkg)).sort(), packed)
    }, BUDGET.dryRunMs * 2)
  }
}

/** REL-ST-01: `--check` on the real release, then on a copy through valid → tampered → restored transitions. */
function registerCheck(sdk) {
  relCase(sdk, CASE.check, 'valid', `node scripts/pack-v3.mjs ${PACK_SCRIPT.check} verifies the release offline (exit ${PACK_SCRIPT.okExit})`, () => withScratch(async (scratch) => {
    const dir = releaseDir()
    // Without --out the script reads its default folder; FBTEST_RELEASE_DIR moves the release, so pass it then.
    const r = await runCheck(scratch, process.env[RELEASE.env] === undefined ? undefined : dir)
    assert.equal(r.code, PACK_SCRIPT.okExit, tail(r.output))
  }), BUDGET.checkCaseMs)
  relCase(sdk, CASE.check, 'absent', `${PACK_SCRIPT.check} ${PACK_SCRIPT.out} <a folder that does not exist> exits non-zero`, () => withScratch(async (scratch) => {
    const r = await runCheck(scratch, path.join(scratch, PACK_SCRIPT.absentDir))
    assert.notEqual(r.code, PACK_SCRIPT.okExit, tail(r.output))
  }), BUDGET.checkCaseMs)
  relCase(sdk, CASE.check, 'tamper', `a copied release: valid (0) → one tarball byte flipped at the first/middle/last offset (non-zero) → restored (0), per offset (BVA)`, () => onCopy(async ({ target, pristine, expectCheck }) => {
    for (const [where, offsetOf] of Object.entries(PACK_SCRIPT.offsets)) {
      flipByte(target, offsetOf(pristine.length))
      await expectCheck(`byte flipped at the ${where} offset`, false)
      fs.writeFileSync(target, pristine)
      await expectCheck(`restored after the ${where} flip`, true)
    }
  }), BUDGET.checkCaseMs)
  // The lead, 2026-11-17: --check verifies the layout too (the 9 tarballs, no stray .tgz, a sum line per tarball, both docs).
  relCase(sdk, CASE.check, 'layout', `a copied release: ${PACK_SCRIPT.tamperTarget.tarball} removed (non-zero) → restored (0) → a stray .tgz added (non-zero) → removed (0)`, () => onCopy(async ({ copy, target, pristine, expectCheck }) => {
    fs.rmSync(target)
    await expectCheck(`${PACK_SCRIPT.tamperTarget.tarball} removed`, false)
    fs.writeFileSync(target, pristine)
    await expectCheck('restored after removal', true)
    const stray = path.join(copy, PACK_SCRIPT.strayTarball)
    fs.writeFileSync(stray, pristine)
    await expectCheck(`stray ${PACK_SCRIPT.strayTarball}`, false)
    fs.rmSync(stray)
    await expectCheck('stray removed', true)
  }), BUDGET.checkCaseMs)
  for (const doc of [...RELEASE.docs, RELEASE.sums]) {
    relCase(sdk, CASE.check, 'missing ' + doc, `a copied release without ${doc} fails ${PACK_SCRIPT.check} (non-zero) → restored (0)`, () => onCopy(async ({ copy, expectCheck }) => {
      const file = path.join(copy, doc)
      const bytes = fs.readFileSync(file)
      fs.rmSync(file)
      await expectCheck(`${doc} removed`, false)
      fs.writeFileSync(file, bytes)
      await expectCheck(`${doc} restored`, true)
    }), BUDGET.checkCaseMs)
  }
}

/** REL-SYS-01..03, REL-DT-04: offline installs with DSH's own `dsh plugin add`. */
function registerInstalls(sdk) {
  relCase(sdk, CASE.hosted, 'set', `hosted set (${SETS.hosted.map((p) => p.name).join(', ')}) in one add into profile ${DSH.profile}: installed, bundled, the child's three tarballs in place`, () => withScratch(async (scratch) => {
    const r = await installAndCheck(sdk, scratch, SETS.hosted, { bundles: true })
    const bundledDir = path.join(installedDir(r.profileDir, INSTANCE_BUNDLED.owner), INSTANCE_BUNDLED.dir)
    for (const p of INSTANCE_BUNDLED.packages) {
      const file = path.join(bundledDir, p.tarball)
      assert.ok(fs.existsSync(file), 'missing ' + file)
      assert.ok(fs.readFileSync(file).equals(fs.readFileSync(tarballPath(p))), file + ' differs from the release tarball')
    }
  }), BUDGET.installCaseMs)
  relCase(sdk, CASE.standalone, 'set', `standalone set (${SETS.standalone.map((p) => p.name).join(', ')}) in one add, in that order: installed, bundled, core's MCP client from its bundle`, () => withScratch(async (scratch) => {
    const r = await installAndCheck(sdk, scratch, SETS.standalone, { bundles: true })
    assertFromOwnBundle(r.profileDir, CORE_CLOSURE.owner, CORE_CLOSURE.mcpClient)
  }), BUDGET.installCaseMs)
  for (const pkg of ALL) {
    relCase(sdk, CASE.alone, pkg.name, `${pkg.tarball} alone into a fresh home installs offline at ${VERSION}`, () => withScratch(async (scratch) => {
      await installAndCheck(sdk, scratch, [pkg], { bundles: false })
    }), BUDGET.installCaseMs)
  }
  const empty = (scratch) => {
    const where = { store: path.join(scratch, ISOLATION.emptyStoreDir), cache: path.join(scratch, ISOLATION.emptyCacheDir) }
    for (const d of Object.values(where)) fs.mkdirSync(d)
    return where
  }
  const { bundled, registry } = SETS.emptyStore
  relCase(sdk, CASE.emptyStore, 'bundled', `${bundled.tarball} with an empty store and cache still installs (its closure is bundled) and resolves its MCP client from the bundle`, () => withScratch(async (scratch) => {
    const r = await installAndCheck(sdk, scratch, [bundled], { bundles: true }, empty(scratch))
    assertFromOwnBundle(r.profileDir, CORE_CLOSURE.owner, CORE_CLOSURE.mcpClient)
  }), BUDGET.installCaseMs)
  relCase(sdk, CASE.emptyStore, 'registry', `${registry.tarball} with an empty store and cache exits non-zero (its dependencies come from the registry; the warmed store makes it install)`, () => withScratch(async (scratch) => {
    const r = await dshAddChecked(sdk, scratch, [tarballPath(registry)], empty(scratch))
    assert.notEqual(r.code, DSH.okExit, 'installed with an empty store: ' + tail(r.output))
  }), BUDGET.installCaseMs)
}
