/**
 * The release folder `node scripts/pack-v3.mjs` writes (REL-PACK; old test/v3/release/pack, whose
 * cases.mjs and entry files were deleted in 6b7c53bf, so none of these rows ran in the 0377153f
 * baseline). Requirements: the REL-PACK task and the user's release brief of 2026-11-17 (requirements
 * 1–7), E-FIX-2 (INSTALL.md run as written), the user's decision of 2026-11-21 (2e1dbfd4: the amenities
 * ship with Fishball, each also alone), the test restructure (no tests/ in a tarball).
 *
 * Rows that read a release folder need one (`.runtime/release/<version>/`, FBTEST_RELEASE_DIR moves it):
 * they skip with that reason when it is missing (FBTEST_RELEASE_REQUIRED=1 makes that a failure, the
 * old release-check gate). The oracle rows and `--check` of an absent folder need none.
 *
 * Techniques: EP per tarball (layout, manifest, links, junk, tests/, dry run, installs alone), BVA
 * (SHA256SUMS line shape; engines.dsh at and below its bound; the tampered byte at the first, middle
 * and last offset), DT (plugin vs library × engines.dsh; lists-the-library × bundled copy; empty store
 * × bundled closure), ST (a copied release valid → tampered → restored, → a tarball removed → restored,
 * → a stray tarball → removed, → a doc removed → restored under --check; a fresh profile → offline block
 * → again → a later --offline add of a tarball from elsewhere).
 * Levels: unit (the folder read entry by entry), integration (npm pack --dry-run, the pack script's
 * --check) and system (DSH's own `dsh plugin add`, offline; DSH is never started).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { caseName, caseTest } from 'fishball-test-helpers/cases'
import { DSH_VERSION } from 'fishball-test-helpers/dsh'
import { WORKSPACE_ROOT, packageByName } from 'fishball-test-helpers/packages'
import { BUDGET, CASE, CONSULTANT_RELEASE, CORE_CLOSURE, DSH, FIELDS, FISHBALL, INSTALL_DOC, ISOLATION, JUNK, LIBRARIES, MANIFEST, PACK, PACK_SCRIPT, RELEASE, RELEASED, SETS, STAGED, TESTS_RULE, VERSION, tarballName } from '../constants.mjs'
import { packedFiles } from '../support/scan.mjs'
import {
  assertFromOwnBundle, copyRelease, describeEntry, docLines, docProfile, dshAdd, dshModule, fencedBlocks, flipByte, installAndCheck, installProblems,
  isAddLine, isDirectory, isJunk, isLink, isRegular, isolatedEnv, json, offlineBlock, onlineLineIndex, releaseDir, releaseTest, resolveIn, runTool,
  sha256, show, tail, tarListing, tarball, tarballPath, withCountingProxy, withScratch,
} from '../support/release.mjs'

const relCase = (id, row, title, fn, timeout) => releaseTest(caseName(id, row, title), timeout === undefined ? {} : { timeout }, fn)
const isLibrary = (name) => LIBRARIES.includes(name)
const lines = (text) => text.split(RELEASE.lineBreak).filter((l) => l !== '')
const readDoc = (doc, dir = releaseDir()) => docLines(doc, dir).join(RELEASE.lineBreak)
/** Published package locations are Git-root-relative, not Fishball-component-relative. */
const repositoryDir = (name) => path.relative(WORKSPACE_ROOT, packageByName(name).abs).split(path.sep).join('/')

/** Requirement 1 on a top-level manifest. */
function manifestProblems(name, m) {
  const p = []
  const expect = (ok, what) => { if (!ok) p.push(what) }
  expect(m.name === name, `name ${show(m.name)} is not ${show(name)}`)
  expect(m.version === VERSION, `version ${show(m.version)} is not ${VERSION}`)
  expect(m.engines?.node === MANIFEST.enginesNode, `engines.node ${show(m.engines?.node)}`)
  expect(m.license === MANIFEST.license, `license ${show(m.license)}`)
  expect(typeof m.description === 'string' && m.description.trim() !== '', 'description is empty')
  expect(typeof m.repository?.url === 'string' && m.repository.url.includes(MANIFEST.repositoryUrlPart), `repository.url ${show(m.repository?.url)}`)
  // The folder every manifest names is the package's repository folder (the catalogue's, by name).
  const dir = repositoryDir(name)
  expect(m.repository?.directory === dir, `repository.directory ${show(m.repository?.directory)} is not ${show(dir)}`)
  expect(m.publishConfig?.tag === MANIFEST.publishTag, `publishConfig.tag ${show(m.publishConfig?.tag)}`)
  expect(m.private !== true, 'private: true')
  for (const f of MANIFEST.zodForbiddenFields) expect(!Object.hasOwn(m[f] ?? {}, MANIFEST.zod), `${MANIFEST.zod} in ${f}`)
  for (const { name: dep, version } of MANIFEST.mcpPins[name] ?? []) expect(m.dependencies?.[dep] === version, `dependencies.${dep} ${show(m.dependencies?.[dep])}; expected ${version}`)
  const peers = m[MANIFEST.peerField] ?? {}
  if (Object.hasOwn(peers, MANIFEST.zod)) expect(peers[MANIFEST.zod] === MANIFEST.zodRange, `zod peer range ${show(peers[MANIFEST.zod])}`)
  for (const [peer, range] of Object.entries(peers)) if (peer.startsWith(MANIFEST.hostScope)) expect(range === MANIFEST.hostPeerRange, `peer ${peer} range ${show(range)}`)
  return p
}
/** Requirement 2: every entry on another released package names exactly VERSION. */
function internalVersionProblems(name, m) {
  return MANIFEST.exactInternalFields.flatMap((f) => Object.entries(m[f] ?? {}).filter(([dep, range]) => RELEASED.includes(dep) && dep !== name && range !== VERSION).map(([dep, range]) => `${f}.${dep} = ${show(range)}`))
}
/** Requirement 3: each importer bundles a byte-identical real copy of the library's shipped files; no other package ships one. */
function libraryCopyProblems(lib) {
  const own = new Map([...tarball(lib).files].filter(([, e]) => isRegular(e)))
  const importers = RELEASED.filter((n) => n !== lib && Object.hasOwn(tarball(n).manifest?.[FIELDS.runtime] ?? {}, lib))
  const problems = []
  const prefix = PACK.nodeModules + '/' + lib + '/'
  for (const name of RELEASED) {
    if (name === lib) continue
    const { files, manifest } = tarball(name)
    const copy = new Map([...files].filter(([rel]) => rel.startsWith(prefix)).map(([rel, e]) => [rel.slice(prefix.length), e]))
    if (!importers.includes(name)) { if (copy.size > 0) problems.push(`${name} does not list ${lib} but ships ${prefix}`); continue }
    if (!FIELDS.bundled.some((f) => (manifest[f] ?? []).includes(lib))) problems.push(`${name}: ${lib} is not bundled`)
    for (const [rel, e] of own) {
      const c = copy.get(rel)
      if (c === undefined) problems.push(`${name} lacks ${prefix}${rel}`)
      else if (!isRegular(c)) problems.push(`${name}: ${describeEntry(c)} is not a regular file`)
      else if (!c.data.equals(e.data)) problems.push(`${name}: ${prefix}${rel} differs from ${tarballName(lib)}`)
    }
    for (const [rel, c] of copy) if (!isDirectory(c) && !own.has(rel)) problems.push(`${name}: ${describeEntry(c)} is not one of ${lib}'s files`)
  }
  return { importers, problems }
}
/** Requirement 4: every non-peer dependency of core and of every package it bundles resolves inside the tarball. */
function closureProblems(files) {
  const problems = []
  const seen = new Set()
  const queue = ['']
  while (queue.length) {
    const dir = queue.shift()
    const manifest = json(files.get(path.posix.join(dir, PACK.manifest)))
    for (const f of CORE_CLOSURE.walkFields) for (const name of Object.keys(manifest[f] ?? {})) {
      const found = resolveIn((rel) => files.has(rel), dir, name)
      if (found === null) { problems.push(`${dir || PACK.prefix}: ${f}.${name} is not bundled`); continue }
      const next = path.posix.dirname(found)
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
  }
  return problems
}

const runCheck = (scratch, dir) => {
  assert.ok(fs.existsSync(PACK_SCRIPT.file), PACK_SCRIPT.file + ' is missing')
  return runTool(process.execPath, [PACK_SCRIPT.file, PACK_SCRIPT.check, ...(dir === undefined ? [] : [PACK_SCRIPT.out, dir])], { env: isolatedEnv(scratch), cwd: path.dirname(path.dirname(PACK_SCRIPT.file)) })
}
/** A copy of the release; `expectCheck(state, ok)` runs --check on it and asserts its exit. */
const onCopy = (fn) => withScratch(async (scratch) => {
  const copy = copyRelease(scratch)
  const expectCheck = async (state, ok) => {
    const r = await runCheck(scratch, copy)
    if (ok) assert.equal(r.code, PACK_SCRIPT.okExit, `${state}: ${tail(r.output)}`)
    else assert.notEqual(r.code, PACK_SCRIPT.okExit, `${state}: --check passed`)
    return r
  }
  await expectCheck('copied', true)
  await fn({ scratch, copy, target: tarballPath(PACK_SCRIPT.tamperTarget, copy), expectCheck })
})

export function registerReleaseCases() {
  caseTest(CASE.consultant, 'catalog', 'release stages the standalone consultant before the collection that bundles it', async () => {
    const { PACKAGES, INSTALL_SETS } = await import(pathToFileURL(PACK_SCRIPT.catalog).href)
    const { member, collection } = CONSULTANT_RELEASE
    const atMember = PACKAGES.findIndex((pkg) => pkg.key === member)
    const atCollection = PACKAGES.findIndex((pkg) => pkg.key === collection)
    assert.ok(atMember !== -1 && atMember < atCollection, 'consultant must precede amenities in publish order')
    assert.equal(PACKAGES[atMember].folder, repositoryDir(FISHBALL.consultant))
    assert.deepEqual(INSTALL_SETS[member], [member])
    assert.deepEqual(INSTALL_SETS[collection], [collection])
  })
  registerOracle()
  registerLayout()
  registerManifests()
  registerContents()
  // The checker runs before the installs: pnpm may record the local tarballs in the release's store.
  registerCheck()
  registerInstalls()
  registerDocs()
}

function registerOracle() {
  caseTest(CASE.oracle, 'junk', 'the junk rule flags each banned segment and name and none of its look-alikes (BVA)', () => {
    assert.deepEqual(JUNK.samples.junk.filter((s) => !isJunk(s)), [])
    assert.deepEqual(JUNK.samples.clean.filter(isJunk), [])
  })
  caseTest(CASE.oracle, 'sums', 'the SHA256SUMS line shape admits 64 hex + two spaces + a name and nothing at 63/65 hex, one or three spaces (BVA)', () => {
    assert.deepEqual(RELEASE.sumSamples.valid.filter((s) => !RELEASE.sumLine.test(s)), [])
    assert.deepEqual(RELEASE.sumSamples.invalid.filter((s) => RELEASE.sumLine.test(s)), [])
  })
  caseTest(CASE.oracle, 'publish line', 'the publish-line rule reads the tarball of each npm publish line and of nothing else', () => {
    const read = (l) => RELEASE.publishLine.exec(l)
    assert.deepEqual(RELEASE.publishSamples.hit.filter((l) => !read(l)), [])
    assert.deepEqual(RELEASE.publishSamples.clean.filter(read), [])
  })
  for (const name of RELEASED) {
    relCase(CASE.oracle, 'tar ' + name, `the parsed entries of ${tarballName(name)} are exactly what tar -tzf lists`, async () => {
      const { file, entries } = tarball(name)
      const r = await tarListing(file)
      assert.equal(r.code, 0, tail(r.output))
      assert.deepEqual(entries.map((e) => e.path).sort(), lines(r.stdout).sort())
    })
  }
}

function registerLayout() {
  for (const name of RELEASED) {
    relCase(CASE.layout, name, `the release holds ${tarballName(name)}`, () => { assert.ok(fs.statSync(tarballPath(name)).isFile()) })
  }
  relCase(CASE.layout, 'docs', `the release holds ${RELEASE.docs.join(', ')} and ${RELEASE.offlineStore}, each non-empty`, () => {
    for (const d of [...RELEASE.docs, RELEASE.offlineStore]) { const at = path.join(releaseDir(), d); assert.ok(fs.existsSync(at) && fs.statSync(at).size > 0, d + ' is missing or empty') }
  })
  relCase(CASE.layout, 'store', `the release holds the warmed ${RELEASE.store}/ and ${RELEASE.cache}/ folders, both non-empty`, () => {
    for (const d of [RELEASE.store, RELEASE.cache]) { const at = path.join(releaseDir(), d); assert.ok(fs.existsSync(at) && fs.statSync(at).isDirectory() && fs.readdirSync(at).length > 0, d + '/ is missing or empty') }
  })
  relCase(CASE.extras, 'tgz', `the release holds exactly the ${RELEASED.length} package tarballs and no other .tgz`, () => {
    assert.deepEqual(fs.readdirSync(releaseDir()).filter((f) => f.endsWith(RELEASE.tarballSuffix)).sort(), RELEASED.map(tarballName).sort())
  })
  relCase(CASE.sums, 'shape', `every ${RELEASE.sums} line is "<64 lowercase hex>  <file name>"`, () => {
    assert.deepEqual(lines(readDoc(RELEASE.sums)).filter((l) => !RELEASE.sumLine.test(l)), [])
  })
  relCase(CASE.sums, 'one per tarball', `${RELEASE.sums} has exactly one line per tarball, each matching the file's sha256`, () => {
    const named = lines(readDoc(RELEASE.sums)).map((l) => RELEASE.sumLine.exec(l)).filter(Boolean).map(([, digest, name]) => ({ digest, name }))
    assert.deepEqual(named.map((n) => n.name).sort(), RELEASED.map(tarballName).sort())
    assert.deepEqual(named.filter((n) => sha256(fs.readFileSync(path.join(releaseDir(), n.name))) !== n.digest).map((n) => n.name), [])
  })
  relCase(CASE.publish, 'lines', `PUBLISH.md has exactly one npm publish line per release tarball, with the alpha tag, each library before its importers`, () => {
    const text = docLines(RELEASE.publish)
    const published = text.map((l) => RELEASE.publishLine.exec(l)?.[1]).filter(Boolean)
    assert.deepEqual([...published].sort(), RELEASED.map(tarballName).sort())
    assert.ok(text.filter((l) => RELEASE.publishLine.test(l)).every((l) => l.includes('--tag ' + MANIFEST.publishTag)), 'a publish line without --tag ' + MANIFEST.publishTag)
    for (const lib of LIBRARIES) for (const name of RELEASED.filter((n) => Object.hasOwn(tarball(n).manifest?.[FIELDS.runtime] ?? {}, lib))) {
      assert.ok(published.indexOf(tarballName(lib)) < published.indexOf(tarballName(name)), `${name} is published before ${lib}`)
    }
  })
}

function registerManifests() {
  for (const name of RELEASED) {
    relCase(CASE.manifest, name, `${tarballName(name)} package.json: name, version, engines.node, license, description, repository, publishConfig, not private, zod and host peers`, () => {
      const { manifest } = tarball(name)
      assert.ok(manifest, 'no package/package.json')
      assert.deepEqual(manifestProblems(name, manifest), [])
    })
    relCase(CASE.peers, 'exact ' + name, `every dependency of ${name} on another released package names exactly ${VERSION}`, () => {
      assert.deepEqual(internalVersionProblems(name, tarball(name).manifest), [])
    })
    if (isLibrary(name)) {
      relCase(CASE.engines, 'library ' + name, `${name} (a library) has no engines.dsh`, () => {
        assert.equal(Object.hasOwn(tarball(name).manifest?.engines ?? {}, MANIFEST.dshEngine), false)
      })
      continue
    }
    relCase(CASE.engines, 'plugin ' + name, `${name} engines.dsh is ${MANIFEST.enginesDsh}: the current DSH satisfies it, ${MANIFEST.dshBelowBound} does not (BVA)`, async () => {
      const range = tarball(name).manifest?.engines?.[MANIFEST.dshEngine]
      assert.equal(range, MANIFEST.enginesDsh)
      const semver = dshModule(MANIFEST.semver)
      assert.ok(semver.satisfies(DSH_VERSION, range, MANIFEST.dshSemverOptions), `${DSH_VERSION} does not satisfy ${range}`)
      assert.equal(semver.satisfies(MANIFEST.dshBelowBound, range, MANIFEST.dshSemverOptions), false)
    })
  }
}

function registerContents() {
  for (const name of RELEASED) {
    relCase(CASE.links, name, `${tarballName(name)} holds no symlink or hard-link entry`, () => {
      assert.deepEqual(tarball(name).entries.filter(isLink).map(describeEntry), [])
    })
    relCase(CASE.junk, name, `${tarballName(name)} holds no test or runtime junk (bundled node_modules included)`, () => {
      assert.deepEqual([...tarball(name).files.keys()].filter(isJunk), [])
    })
    relCase(CASE.tests, 'tarball ' + name, `${tarballName(name)} holds no file under a tests/ folder (fishball-core's carries fishball-ui: ui/tests must not ship)`, () => {
      assert.deepEqual([...tarball(name).files.keys()].filter((f) => TESTS_RULE.folder.test(f)), [])
    })
    relCase(CASE.dryRun, name, `npm pack --dry-run of ${name}'s folder lists ${tarballName(name)}'s paths (less the staged node_modules/)`, async () => {
      const packed = [...tarball(name).files].filter(([rel, e]) => rel !== '' && (isRegular(e) || isLink(e)) && !STAGED.some((re) => re.test(rel))).map(([rel]) => rel).sort()
      assert.deepEqual(await packedFiles(name), packed)
    })
  }
  for (const lib of LIBRARIES) {
    relCase(CASE.bundling, lib, `every package listing ${lib} in dependencies bundles a byte-identical real copy of its shipped files; no other package ships one`, () => {
      const { importers, problems } = libraryCopyProblems(lib)
      assert.ok(importers.length > 0, 'no release tarball lists ' + lib)
      assert.deepEqual(problems, [])
    })
  }
  relCase(CASE.closure, 'mcp client', `${tarballName(CORE_CLOSURE.owner)} bundles ${CORE_CLOSURE.mcpClient.name} ${CORE_CLOSURE.mcpClient.version}`, () => {
    const entry = tarball(CORE_CLOSURE.owner).files.get(path.posix.join(PACK.nodeModules, CORE_CLOSURE.mcpClient.name, PACK.manifest))
    assert.ok(entry, 'not bundled')
    assert.equal(json(entry).version, CORE_CLOSURE.mcpClient.version)
  })
  relCase(CASE.closure, 'walk', 'every non-peer dependency of fishball-core and of every package it bundles is present in its node_modules', () => {
    assert.deepEqual(closureProblems(tarball(CORE_CLOSURE.owner).files), [])
  })
}

function registerCheck() {
  caseTest(CASE.check, 'absent', `${PACK_SCRIPT.check} ${PACK_SCRIPT.out} <a folder that does not exist> exits non-zero`, { timeout: BUDGET.checkCaseMs }, () => withScratch(async (scratch) => {
    const r = await runCheck(scratch, path.join(scratch, PACK_SCRIPT.absentDir))
    assert.notEqual(r.code, PACK_SCRIPT.okExit, tail(r.output))
  }))
  relCase(CASE.check, 'valid', `node scripts/pack-v3.mjs ${PACK_SCRIPT.check} verifies the release offline (exit ${PACK_SCRIPT.okExit})`, () => withScratch(async (scratch) => {
    const r = await runCheck(scratch, releaseDir())
    assert.equal(r.code, PACK_SCRIPT.okExit, tail(r.output))
  }), BUDGET.checkCaseMs)
  relCase(CASE.check, 'tamper', 'a copied release: valid (0) → one tarball byte flipped at the first/middle/last offset (non-zero) → restored (0), per offset (BVA)', () => onCopy(async ({ target, expectCheck }) => {
    const pristine = fs.readFileSync(target)
    for (const [where, offsetOf] of Object.entries(PACK_SCRIPT.offsets)) {
      flipByte(target, offsetOf(pristine.length), PACK_SCRIPT.flipMask)
      await expectCheck(`byte flipped at the ${where} offset`, false)
      fs.writeFileSync(target, pristine)
      await expectCheck(`restored after the ${where} flip`, true)
    }
  }), BUDGET.checkCaseMs)
  relCase(CASE.check, 'layout', `a copied release: ${tarballName(PACK_SCRIPT.tamperTarget)} removed (non-zero) → restored (0) → a stray .tgz added (non-zero, reported unexpected) → removed (0)`, () => onCopy(async ({ copy, target, expectCheck }) => {
    const pristine = fs.readFileSync(target)
    fs.rmSync(target)
    await expectCheck('tarball removed', false)
    fs.writeFileSync(target, pristine)
    await expectCheck('restored after removal', true)
    const stray = path.join(copy, PACK_SCRIPT.strayTarball)
    fs.writeFileSync(stray, pristine)
    const r = await expectCheck('stray tarball', false)
    assert.match(r.output, PACK_SCRIPT.unexpected, tail(r.output))
    assert.ok(r.output.includes(PACK_SCRIPT.strayTarball), 'the report does not name the stray tarball')
    fs.rmSync(stray)
    await expectCheck('stray removed', true)
  }), BUDGET.checkCaseMs)
  for (const doc of [...RELEASE.docs, RELEASE.sums, RELEASE.offlineStore]) {
    relCase(CASE.check, 'missing ' + doc, `a copied release without ${doc} fails ${PACK_SCRIPT.check} (non-zero) → restored (0)`, () => onCopy(async ({ copy, expectCheck }) => {
      const file = path.join(copy, doc)
      const bytes = fs.readFileSync(file)
      fs.rmSync(file)
      await expectCheck(doc + ' removed', false)
      fs.writeFileSync(file, bytes)
      await expectCheck(doc + ' restored', true)
    }), BUDGET.checkCaseMs)
  }
}

function registerInstalls() {
  for (const name of RELEASED) {
    relCase(CASE.alone, name, `${tarballName(name)} alone into a fresh home installs offline at ${VERSION} with the current DSH's CLI`, () => withScratch(async (scratch) => {
      await installAndCheck(scratch, [name], { bundles: false })
    }), BUDGET.installCaseMs)
  }
  for (const set of SETS) {
    relCase(CASE.standalone, set.key, `the ${set.key} set (${set.pkgs.join(', ')}) in one add: installed and a bundle of the profile`, () => withScratch(async (scratch) => {
      const r = await installAndCheck(scratch, set.pkgs, { bundles: !set.pkgs.every(isLibrary) })
      if (set.pkgs.includes(CORE_CLOSURE.owner)) assertFromOwnBundle(r.profileDir, CORE_CLOSURE.owner, CORE_CLOSURE.mcpClient)
    }), BUDGET.installCaseMs)
  }
  relCase(CASE.emptyStore, 'bundled', `${tarballName(CORE_CLOSURE.owner)} with an empty store and cache still installs (its closure is bundled) and resolves its MCP client from the bundle`, () => withScratch(async (scratch) => {
    const where = { store: path.join(scratch, ISOLATION.emptyStoreDir), cache: path.join(scratch, ISOLATION.emptyCacheDir) }
    for (const d of Object.values(where)) fs.mkdirSync(d)
    const r = await installAndCheck(scratch, [CORE_CLOSURE.owner], { bundles: true }, where)
    assertFromOwnBundle(r.profileDir, CORE_CLOSURE.owner, CORE_CLOSURE.mcpClient)
  }), BUDGET.installCaseMs)
}

const assertExit0 = (what, r) => assert.equal(r.code, DSH.okExit, `${what}: ${tail(r.output)}`)
function registerDocs() {
  for (const set of SETS) {
    relCase(CASE.docOrder, set.key, `${RELEASE.install} shows the online add of ${set.pkgs.join(', ')} at ${VERSION} before its one offline block, whose add line is ${INSTALL_DOC.offlineFlag}`, () => {
      const doc = docLines(RELEASE.install)
      const block = offlineBlock(doc, set.pkgs)
      assert.ok(block.lines.filter(isAddLine).every((l) => l.includes(INSTALL_DOC.offlineFlag)), 'the offline add line lacks ' + INSTALL_DOC.offlineFlag)
      const online = onlineLineIndex(doc, set.pkgs)
      assert.ok(online >= 0, 'no online add of ' + set.pkgs.join(', '))
      assert.ok(online < block.open, `the online add (line ${online + 1}) comes after the offline block (line ${block.open + 1})`)
    })
    relCase(CASE.docFresh, set.key, `${set.key} offline block as written on a fresh profile: exit 0 twice on pnpm's own store, no request; with the release folder kept, a later --offline add of ${set.other} from elsewhere exits 0 on the same store`, () => withScratch((scratch) => withCountingProxy(async (proxy, hits) => {
      const copy = copyRelease(scratch)
      const profile = docProfile(scratch, proxy)
      const block = offlineBlock(docLines(RELEASE.install, copy), set.pkgs)
      let store
      for (let run = 1; run <= INSTALL_DOC.runs; run++) {
        const what = `${set.key} offline block, run ${run}`
        assertExit0(what, await profile.runBlock(block, copy))
        assert.deepEqual(installProblems(profile.profileDir, set.pkgs, { bundles: true }), [], what)
        store ??= profile.storeDir()
        assert.ok(typeof store === 'string' && !store.startsWith(copy + path.sep), `${what}: the profile is linked to ${show(store)}`)
        assert.equal(profile.storeDir(), store, what + ': node_modules moved to another store')
        assert.deepEqual(hits, [], what + ': a network request was sent')
      }
      const later = path.join(scratch, INSTALL_DOC.laterDir, tarballName(set.other))
      fs.mkdirSync(path.dirname(later))
      fs.copyFileSync(tarballPath(set.other, copy), later)
      const r = await profile.cli(DSH.laterArgs(DSH.profile, later, path.join(copy, RELEASE.cache)))
      assert.doesNotMatch(r.output, INSTALL_DOC.unexpectedStore)
      assertExit0('later add of ' + set.other, r)
      assert.deepEqual(installProblems(profile.profileDir, [...set.pkgs, set.other], { bundles: false }), [])
      assert.equal(profile.storeDir(), store, 'after the later add')
      assert.deepEqual(hits, [], 'a network request was sent')
    })), BUDGET.docCaseMs)
  }
  relCase(CASE.docOrder, 'fenced', `every fenced add line of ${RELEASE.install} names only released packages`, () => {
    const named = fencedBlocks(docLines(RELEASE.install)).flatMap((b) => b.lines.filter(isAddLine)).flatMap((l) => [...(l.match(INSTALL_DOC.tarballArg) ?? []), ...[...l.matchAll(INSTALL_DOC.onlineSpec)].map((m) => tarballName(m[1]))])
    assert.deepEqual(named.filter((t) => !RELEASED.map(tarballName).includes(t)), [])
  })
}
