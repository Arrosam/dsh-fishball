/**
 * The amenities split (the user's decision, 2026-11-21; constants.mjs quotes it): black-box cases read
 * from manifests, bundle patches (as each SDK's own DSH reads them), DSH's own bundle inspection and
 * import specifiers. No implementation file is opened; the static rows read only the specifiers.
 *
 * Techniques: Equivalence Partitioning per package (AM-EP; the partitions are the three members and the
 * umbrella), a Decision Table for dsh.client (AM-DT-01: browser code yes/no x dsh.client present) and for
 * the umbrella's rows against each member's own (AM-DT-02), Boundary Values on the pinned version
 * (AM-BVA-01: exactly 1.0.0-alpha.1, not a range) and static rows (AM-SC: no import leaves a member's
 * root, no member imports another, each member takes the follower from fishball-shared).
 *
 * Level: unit (static) plus DSH's own patch reader and bundle inspection of the SDK under test.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { REPO } from '../../../support/constants.mjs'
import { caseTest, dshInspect } from '../../contract/package-boundaries/cases.mjs'
import { BUNDLED_FIELDS, DEP_FIELDS, SDK, WORKER } from '../../contract/package-boundaries/constants.mjs'
import { observe, readManifest } from '../../contract/package-boundaries/packages.mjs'
import { CORE, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { insertedRows } from '../../fishball-core/package/static.mjs'
import { LIBRARY, MANIFEST, MEMBERS, PACKAGES, PATH_ROW, SOURCE, UMBRELLA, VERSION } from './constants.mjs'

const ID = Object.freeze({
  ep01: 'AM-EP-01', ep02: 'AM-EP-02', ep03: 'AM-EP-03', ep04: 'AM-EP-04', ep05: 'AM-EP-05', ep06: 'AM-EP-06', ep07: 'AM-EP-07', ep08: 'AM-EP-08',
  dt01: 'AM-DT-01', dt02: 'AM-DT-02', bva01: 'AM-BVA-01', sc01: 'AM-SC-01', sc02: 'AM-SC-02', sc03: 'AM-SC-03',
})
const MEMBER_NAMES = Object.freeze(MEMBERS.map((m) => m.name))
const json = (value) => JSON.stringify(value)
const inside = (dir, file) => { const rel = path.relative(dir, file); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)) }
const isPath = (specifier) => specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')
const bareName = (specifier) => { const parts = specifier.split('/'); return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] }

/** The package's manifest; its absence fails the case that needs it, naming the folder. */
function manifestOf(pkg) {
  const manifest = readManifest(pkg.dir)
  assert.ok(manifest, path.relative(REPO, path.join(pkg.dir, MANIFEST.file)) + ' is missing (' + pkg.name + ')')
  return manifest
}
const bundledOf = (manifest) => BUNDLED_FIELDS.flatMap((f) => manifest[f] ?? [])
const dependencyOf = (manifest, name) => manifest[MANIFEST.dependencies]?.[name]

/** The bundle patch the manifest names (dsh.bundle.patch), as `sdk`'s DSH parses it: its inserted rows. */
async function patchRows(sdk, pkg) {
  const relative = manifestOf(pkg)[MANIFEST.dsh]?.[MANIFEST.bundle]?.[MANIFEST.patchField]
  assert.equal(typeof relative, 'string', pkg.name + ' names no dsh.bundle.patch')
  const file = path.join(pkg.dir, relative)
  assert.ok(fs.existsSync(file), pkg.name + ': ' + relative + ' does not exist')
  const { loadOverlayPatches } = await import(pathToFileURL(path.join(runtimeOf(sdk), CORE.patchLoader)).href)
  return insertedRows(loadOverlayPatches(CORE.patchLabel, file))
}
const idName = (row) => ({ id: row?.id, name: row?.name })
const byId = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))

/** Every JS file under a package folder on disk (a bundled node_modules copy is another package's). */
function sourcesOf(dir) {
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && SOURCE.js.test(e.name) && !path.relative(dir, e.parentPath).split(path.sep).some((part) => SOURCE.skip.includes(part)))
    .map((e) => path.join(e.parentPath, e.name))
}

/** The specifiers every given file names (package-boundaries' acorn worker, Node's own parser). */
function specifiersOf(files) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER.file, { workerData: { files, resolveNames: [] }, execArgv: [...WORKER.execArgv] })
    worker.once('message', (m) => { resolve(m.results); worker.terminate() })
    worker.once('error', reject)
  })
}

/** Each member's references: { member, file (repo-relative), specifier, at? (absolute target of a path) }. */
let scanned
function memberRefs() {
  scanned ??= (async () => {
    const out = []
    for (const m of MEMBERS) {
      assert.ok(fs.existsSync(m.dir), path.relative(REPO, m.dir) + ' is missing (' + m.name + ')')
      const results = await specifiersOf(sourcesOf(m.dir))
      for (const [file, { error, refs }] of Object.entries(results)) {
        assert.equal(error, undefined, path.relative(REPO, file) + ' does not parse: ' + error)
        for (const r of refs) {
          if (r.specifier === null) continue
          out.push({ member: m, file: path.relative(REPO, file), specifier: r.specifier, ...(isPath(r.specifier) ? { at: path.resolve(path.dirname(file), r.specifier) } : {}) })
        }
      }
    }
    return out
  })()
  return scanned
}
const describe = (r) => r.file + ': ' + json(r.specifier)

export function registerAmenityPackageCases(sdk) {
  for (const pkg of PACKAGES) {
    const role = pkg === UMBRELLA ? 'the umbrella ' + pkg.name : 'member ' + pkg.name
    // ---- AM-EP-01 / AM-BVA-01: its own package, name and version, a DSH bundle ----
    caseTest(sdk, ID.ep01, pkg.folder, `${role} has its own package.json in packages/${pkg.folder} named ${pkg.name}`, () => {
      assert.equal(manifestOf(pkg).name, pkg.name)
    })
    caseTest(sdk, ID.bva01, pkg.folder, `${role}'s version is exactly ${VERSION}`, () => {
      assert.equal(manifestOf(pkg).version, VERSION)
    })
    caseTest(sdk, ID.ep01, pkg.folder + ' bundle', `${role} declares dsh.bundle.patch naming an existing patch file`, async () => {
      assert.ok((await patchRows(sdk, pkg)).length > 0, pkg.name + "'s patch inserts no row")
    })
    caseTest(sdk, ID.ep01, pkg.folder + ' inspect', `DSH's own bundle inspection accepts ${role} on its own as bundle ${pkg.name}@${VERSION}`, async () => {
      const answer = await dshInspect(sdk, pkg.dir)
      assert.notEqual(answer.status, SDK.inspect.refused, json(answer))
      assert.equal(answer.bundle, true, json(answer))
      assert.equal(answer.name, pkg.name, json(answer))
      assert.equal(answer.version, VERSION, json(answer))
    })
    caseTest(sdk, ID.ep07, pkg.folder, `the root workspaces list packages/${pkg.folder}`, () => {
      const workspaces = readManifest(REPO)?.[MANIFEST.workspaces] ?? []
      assert.ok(workspaces.includes(MANIFEST.packagesDir + '/' + pkg.folder), 'root workspaces: ' + json(workspaces))
    })

    // ---- AM-DT-01: dsh.client exactly on the packages with browser code ----
    if (pkg.browser) {
      caseTest(sdk, ID.dt01, pkg.folder, `${role} has browser code: dsh.client (platform ${MANIFEST.clientPlatform}), exports ${MANIFEST.clientExport} and ships ${MANIFEST.clientFile}`, async () => {
        const manifest = manifestOf(pkg)
        assert.equal(manifest[MANIFEST.dsh]?.[MANIFEST.client]?.platform, MANIFEST.clientPlatform, 'dsh.client: ' + json(manifest[MANIFEST.dsh]?.[MANIFEST.client]))
        const target = manifest[MANIFEST.exports]?.[MANIFEST.clientExport]
        assert.equal(typeof target, 'string', 'exports: ' + json(manifest[MANIFEST.exports]))
        assert.equal(path.posix.normalize(target), MANIFEST.clientFile)
        assert.ok(fs.existsSync(path.join(pkg.dir, MANIFEST.clientFile)), MANIFEST.clientFile + ' is missing')
        const { packed } = await observe()
        assert.ok((packed[pkg.name] ?? []).includes(MANIFEST.clientFile), pkg.name + "'s packed files lack " + MANIFEST.clientFile + ': ' + json(packed[pkg.name]))
      })
    } else {
      caseTest(sdk, ID.dt01, pkg.folder, `${role} has no browser code: no dsh.client`, () => {
        const dsh = manifestOf(pkg)[MANIFEST.dsh] ?? {}
        assert.equal(Object.hasOwn(dsh, MANIFEST.client), false, 'dsh.client: ' + json(dsh[MANIFEST.client]))
      })
    }
  }

  // ---- AM-EP-02: a member installed alone uses its own patch, which inserts only its own row ----
  for (const m of MEMBERS) {
    caseTest(sdk, ID.ep02, m.folder, `${m.name}'s own patch inserts exactly one row, id ${m.name}, named by the package ${m.name} (no path row)`, async () => {
      assert.deepEqual((await patchRows(sdk, m)).map(idName), [{ id: m.name, name: m.name }])
    })
  }

  // ---- AM-EP-03: the umbrella's patch inserts its own row and every member's row, by package name ----
  caseTest(sdk, ID.ep03, 'rows', `the umbrella's patch inserts exactly the rows ${[UMBRELLA, ...MEMBERS].map((p) => p.name).join(', ')}, each id equal to its package name`, async () => {
    const rows = (await patchRows(sdk, UMBRELLA)).map(idName)
    assert.deepEqual(byId(rows), byId([UMBRELLA, ...MEMBERS].map((p) => ({ id: p.name, name: p.name }))))
  })
  caseTest(sdk, ID.ep03, 'no path row', "the umbrella's patch names no row by a ./, ../, / or file: path", async () => {
    const rows = await patchRows(sdk, UMBRELLA)
    assert.deepEqual(rows.filter((r) => typeof r?.name !== 'string' || PATH_ROW.test(r.name)).map((r) => r?.id + ': ' + json(r?.name)), [])
  })
  caseTest(sdk, ID.ep03, 'unique ids', "no row id appears twice in the umbrella's patch", async () => {
    const ids = (await patchRows(sdk, UMBRELLA)).map((r) => r?.id)
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [])
  })

  // ---- AM-DT-02: through the umbrella, each member gets the same row its own patch would insert ----
  for (const m of MEMBERS) {
    caseTest(sdk, ID.dt02, m.folder, `the umbrella's ${m.name} row equals the row ${m.name}'s own patch inserts`, async () => {
      const own = await patchRows(sdk, m)
      const carried = (await patchRows(sdk, UMBRELLA)).filter((r) => r?.id === m.name)
      assert.deepEqual(carried, own)
    })
  }

  // ---- AM-EP-04: the umbrella pulls every member in (and their library), pinned and bundled ----
  for (const name of [...MEMBER_NAMES, LIBRARY.name]) {
    caseTest(sdk, ID.ep04, name, `the umbrella lists ${name} in dependencies at exactly ${VERSION} and in bundleDependencies`, () => {
      const manifest = manifestOf(UMBRELLA)
      assert.equal(dependencyOf(manifest, name), VERSION, 'dependencies: ' + json(manifest[MANIFEST.dependencies]))
      assert.ok(bundledOf(manifest).includes(name), BUNDLED_FIELDS.join('/') + ': ' + json(bundledOf(manifest)))
    })
  }

  // ---- AM-EP-05: each member carries fishball-shared itself ----
  for (const m of MEMBERS) {
    caseTest(sdk, ID.ep05, m.folder, `${m.name} lists ${LIBRARY.name} in dependencies at exactly ${VERSION} and in bundleDependencies`, () => {
      const manifest = manifestOf(m)
      assert.equal(dependencyOf(manifest, LIBRARY.name), VERSION, 'dependencies: ' + json(manifest[MANIFEST.dependencies]))
      assert.ok(bundledOf(manifest).includes(LIBRARY.name), BUNDLED_FIELDS.join('/') + ': ' + json(bundledOf(manifest)))
    })
  }

  // ---- AM-EP-06: the umbrella ships no member folder of its own ----
  caseTest(sdk, ID.ep06, 'files', `the umbrella's files list no member folder (${MEMBERS.map((m) => m.folder).join(', ')} or their old board/, heartbeat/, taskboard/)`, () => {
    const files = manifestOf(UMBRELLA)[MANIFEST.files] ?? []
    const folders = MEMBERS.flatMap((m) => [m.folder, m.folder.replace(/^fishball-/, '')])
    assert.deepEqual(files.filter((f) => folders.includes(String(f).replace(/^\.\//, '').split('/')[0])), [])
  })
  caseTest(sdk, ID.ep06, 'packed', "the umbrella's own packed files hold no member module (only a bundled node_modules copy may)", async () => {
    const { packed } = await observe()
    const own = (packed[UMBRELLA.name] ?? []).filter((f) => !f.split('/').some((part) => SOURCE.skip.includes(part)))
    assert.ok(own.length > 0, UMBRELLA.name + ' is not packed')
    const folders = MEMBERS.flatMap((m) => [m.folder, m.folder.replace(/^fishball-/, '')])
    assert.deepEqual(own.filter((f) => folders.includes(f.split('/')[0])), [])
  })

  // ---- AM-EP-07: the library is a workspace too, so every member resolves it ----
  caseTest(sdk, ID.ep07, 'library', `the root workspaces list ${LIBRARY.name}'s folder, and every listed workspace folder has a package.json`, () => {
    const workspaces = readManifest(REPO)?.[MANIFEST.workspaces] ?? []
    assert.ok(workspaces.includes(path.relative(REPO, LIBRARY.dir).split(path.sep).join('/')), 'root workspaces: ' + json(workspaces))
    assert.deepEqual(workspaces.filter((w) => !fs.existsSync(path.join(REPO, w, MANIFEST.file))), [])
  })

  // ---- AM-EP-08: fishball-shared carries the members' follower beside the ui seam ----
  caseTest(sdk, ID.ep08, 'exports', `${LIBRARY.name} exports ${LIBRARY.follower.exportKey} (an existing file) and still ${LIBRARY.seam.exportKey}`, () => {
    const exports = readManifest(LIBRARY.dir)?.[MANIFEST.exports] ?? {}
    for (const { exportKey, exportFile } of [LIBRARY.follower, LIBRARY.seam]) {
      assert.equal(exports[exportKey], exportFile, 'exports: ' + json(exports))
      assert.ok(fs.existsSync(path.join(LIBRARY.dir, exportFile)), exportFile + ' is missing')
    }
  })

  // ---- AM-SC: static rows over every member source file on disk ----
  for (const m of MEMBERS) {
    caseTest(sdk, ID.sc01, m.folder, `no file under packages/${m.folder} imports a path outside its own package root`, async () => {
      const refs = (await memberRefs()).filter((r) => r.member === m && r.at !== undefined && !inside(m.dir, r.at))
      assert.deepEqual(refs.map(describe), [])
    })
    caseTest(sdk, ID.sc02, m.folder, `${m.name} imports no other member (by name or path) and its manifest names none`, async () => {
      const others = MEMBERS.filter((o) => o !== m)
      const code = (await memberRefs()).filter((r) => r.member === m && (r.at !== undefined ? others.some((o) => inside(o.dir, r.at)) : others.some((o) => o.name === bareName(r.specifier))))
      const manifest = manifestOf(m)
      const named = [...DEP_FIELDS, ...BUNDLED_FIELDS].flatMap((f) => {
        const v = manifest[f]
        return (Array.isArray(v) ? v : Object.keys(v ?? {})).filter((n) => others.some((o) => o.name === n)).map((n) => 'package.json ' + f + ': ' + n)
      })
      assert.deepEqual([...code.map(describe), ...named], [])
    })
    caseTest(sdk, ID.sc03, m.folder, `${m.name} takes the fishballInstance follower from ${LIBRARY.follower.specifier}`, async () => {
      const refs = (await memberRefs()).filter((r) => r.member === m)
      assert.ok(refs.some((r) => r.specifier === LIBRARY.follower.specifier), m.name + ' never imports ' + LIBRARY.follower.specifier + ': ' + json(refs.map(describe)))
    })
  }
}
