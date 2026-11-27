/**
 * The amenities split (the user's decision, 2026-11-21; constants.mjs quotes it), from the umbrella's
 * side: black-box rows read from manifests, bundle patches (as the current DSH's own overlay loader
 * reads them), DSH's own bundle inspection, the npm pack listing and import specifiers. The members
 * and their library are this package's dependencies, reached by name (../support/packages.mjs). No
 * implementation file is opened; the static rows read only the specifiers.
 *
 * Techniques: Equivalence Partitioning per package (AM-EP; the partitions are the three members and the
 * umbrella), a Decision Table for dsh.client (AM-DT-01: browser code yes/no x dsh.client present) and for
 * the umbrella's rows against each member's own (AM-DT-02), Boundary Values on the pinned version
 * (AM-BVA-01: exactly 1.0.0-alpha.1, not a range) and static rows (AM-SC: no import leaves a member's
 * root, no member imports another, each member takes the follower from fishball-shared).
 *
 * Not here: AM-EP-07 (the repository root's workspaces) is the repository's concern, an integration row.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after } from 'node:test'
import { caseTest } from 'fishball-test-helpers/cases'
import { CONSULTANT, LIBRARY, MEMBERS, PACKAGES, UMBRELLA, VERSION, dirOf, fileOf, manifestOf } from '../support/packages.mjs'
import { packedFiles } from '../support/pack.mjs'
import { removeTemps } from '../support/temp.mjs'
import { LIBRARY_EXPORTS, MANIFEST, OLD_FOLDER, PATH_ROW, SOURCE } from './constants.mjs'
import { bareName, bundledOf, dependencyOf, describeRef, dshInspect, inside, json, memberRefs, patchRows } from './observe.mjs'

const ID = Object.freeze({
  ep01: 'AM-EP-01', ep02: 'AM-EP-02', ep03: 'AM-EP-03', ep04: 'AM-EP-04', ep05: 'AM-EP-05', ep06: 'AM-EP-06', ep08: 'AM-EP-08',
  collection: 'AM-COLLECTION',
  dt01: 'AM-DT-01', dt02: 'AM-DT-02', bva01: 'AM-BVA-01', sc01: 'AM-SC-01', sc02: 'AM-SC-02', sc03: 'AM-SC-03',
})
const idName = (row) => ({ id: row?.id, name: row?.name })
const byId = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
/** Every folder name a member had or has: its own name and its old folder inside the umbrella. */
const MEMBER_FOLDERS = Object.freeze(MEMBERS.flatMap((m) => [m.name, OLD_FOLDER(m.name)]))
const topFolder = (file) => String(file).replace(/^\.\//, '').split('/')[0]
const role = (pkg) => (pkg === UMBRELLA ? 'the umbrella ' : 'member ') + pkg.name

export function registerAmenityPackageCases() {
  after(removeTemps)
  for (const pkg of PACKAGES) {
    // ---- AM-EP-01 / AM-BVA-01: its own package, name and version, a DSH bundle ----
    caseTest(ID.ep01, pkg.name, `${role(pkg)} has its own package.json named ${pkg.name}`, () => {
      assert.equal(manifestOf(pkg).name, pkg.name)
    })
    caseTest(ID.bva01, pkg.name, `${role(pkg)}'s version is exactly ${VERSION}`, () => {
      assert.equal(manifestOf(pkg).version, VERSION)
    })
    caseTest(ID.ep01, pkg.name + ' bundle', `${role(pkg)} declares dsh.bundle.patch naming an existing patch file`, async () => {
      assert.ok((await patchRows(pkg)).length > 0, pkg.name + "'s patch inserts no row")
    })
    caseTest(ID.ep01, pkg.name + ' inspect', `DSH's own bundle inspection accepts ${role(pkg)} on its own as bundle ${pkg.name}@${VERSION}`, async () => {
      const answer = await dshInspect(dirOf(pkg))
      assert.notEqual(answer.status, 'refused', json(answer))
      assert.equal(answer.bundle, true, json(answer))
      assert.equal(answer.name, pkg.name, json(answer))
      assert.equal(answer.version, VERSION, json(answer))
    })

    // ---- AM-DT-01: dsh.client exactly on the packages with browser code ----
    if (pkg.browser) {
      caseTest(ID.dt01, pkg.name, `${role(pkg)} has browser code: dsh.client (platform ${MANIFEST.clientPlatform}), exports ${MANIFEST.clientExport} and ships ${MANIFEST.clientFile}`, async () => {
        const manifest = manifestOf(pkg)
        assert.equal(manifest[MANIFEST.dsh]?.[MANIFEST.client]?.platform, MANIFEST.clientPlatform, 'dsh.client: ' + json(manifest[MANIFEST.dsh]?.[MANIFEST.client]))
        const target = manifest[MANIFEST.exports]?.[MANIFEST.clientExport]
        assert.equal(typeof target, 'string', 'exports: ' + json(manifest[MANIFEST.exports]))
        assert.equal(path.posix.normalize(target), MANIFEST.clientFile)
        assert.ok(fs.existsSync(fileOf(pkg, MANIFEST.clientFile)), MANIFEST.clientFile + ' is missing')
        const packed = await packedFiles(dirOf(pkg))
        assert.ok(packed.includes(MANIFEST.clientFile), pkg.name + "'s packed files lack " + MANIFEST.clientFile + ': ' + json(packed))
      })
    } else {
      caseTest(ID.dt01, pkg.name, `${role(pkg)} has no browser code: no dsh.client`, () => {
        const dsh = manifestOf(pkg)[MANIFEST.dsh] ?? {}
        assert.equal(Object.hasOwn(dsh, MANIFEST.client), false, 'dsh.client: ' + json(dsh[MANIFEST.client]))
      })
    }
  }

  // ---- AM-EP-02: a member installed alone uses its own patch, which inserts only its own row ----
  for (const m of MEMBERS) {
    caseTest(ID.ep02, m.name, `${m.name}'s own patch inserts exactly one row, id ${m.name}, named by the package ${m.name} (no path row)`, async () => {
      assert.deepEqual((await patchRows(m)).map(idName), [{ id: m.name, name: m.name }])
    })
  }

  // ---- AM-EP-03: the umbrella's patch inserts its own row and every member's row, by package name ----
  const collectionRows = [UMBRELLA, ...MEMBERS, CONSULTANT].map(({ name }) => ({ id: name, name }))
  caseTest(ID.ep03, 'rows', `the umbrella's patch inserts exactly the rows ${collectionRows.map((r) => r.name).join(', ')}, each id equal to its package name`, async () => {
    const rows = (await patchRows(UMBRELLA)).map(idName)
    assert.deepEqual(byId(rows), byId(collectionRows))
  })
  caseTest(ID.ep03, 'no path row', "the umbrella's patch names no row by a ./, ../, / or file: path", async () => {
    const rows = await patchRows(UMBRELLA)
    assert.deepEqual(rows.filter((r) => typeof r?.name !== 'string' || PATH_ROW.test(r.name)).map((r) => r?.id + ': ' + json(r?.name)), [])
  })
  caseTest(ID.ep03, 'unique ids', "no row id appears twice in the umbrella's patch", async () => {
    const ids = (await patchRows(UMBRELLA)).map((r) => r?.id)
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [])
  })

  // ---- AM-DT-02: through the umbrella, each member gets the same row its own patch would insert ----
  for (const m of MEMBERS) {
    caseTest(ID.dt02, m.name, `the umbrella's ${m.name} row equals the row ${m.name}'s own patch inserts`, async () => {
      const own = await patchRows(m)
      const carried = (await patchRows(UMBRELLA)).filter((r) => r?.id === m.name)
      assert.deepEqual(carried, own)
    })
  }

  // ---- AM-EP-04: the umbrella pulls every member in (and their library), pinned and bundled ----
  for (const p of [...MEMBERS, LIBRARY]) {
    caseTest(ID.ep04, p.name, `the umbrella lists ${p.name} in dependencies at exactly ${VERSION} and in bundleDependencies`, () => {
      const manifest = manifestOf(UMBRELLA)
      assert.equal(dependencyOf(manifest, p.name), VERSION, 'dependencies: ' + json(manifest[MANIFEST.dependencies]))
      assert.ok(bundledOf(manifest).includes(p.name), MANIFEST.bundled.join('/') + ': ' + json(bundledOf(manifest)))
    })
  }

  // ---- AM-EP-05: each member carries fishball-shared itself ----
  for (const m of MEMBERS) {
    caseTest(ID.ep05, m.name, `${m.name} lists ${LIBRARY.name} in dependencies at exactly ${VERSION} and in bundleDependencies`, () => {
      const manifest = manifestOf(m)
      assert.equal(dependencyOf(manifest, LIBRARY.name), VERSION, 'dependencies: ' + json(manifest[MANIFEST.dependencies]))
      assert.ok(bundledOf(manifest).includes(LIBRARY.name), MANIFEST.bundled.join('/') + ': ' + json(bundledOf(manifest)))
    })
  }

  caseTest(ID.collection, 'version', 'collection pins and bundles the consultant at the batch version', () => {
    const collection = manifestOf(UMBRELLA)
    assert.equal(collection.dependencies?.[CONSULTANT.name], VERSION)
    assert.equal(collection.bundleDependencies?.filter((name) => name === CONSULTANT.name).length, 1)
    assert.equal(collection.version, VERSION)
    const own = manifestOf(CONSULTANT)
    assert.equal(own.name, CONSULTANT.name)
    assert.equal(own.version, VERSION)
    assert.equal(own.dependencies?.[LIBRARY.name], VERSION)
    assert.ok(own.bundleDependencies?.includes(LIBRARY.name))
  })
  caseTest(ID.collection, 'row', 'the standalone and collection patches insert the same single consultant row', async () => {
    const expected = { id: CONSULTANT.name, name: CONSULTANT.name, config: {} }
    const carried = (await patchRows(UMBRELLA))
      .filter((row) => row.id === CONSULTANT.name || row.name === CONSULTANT.name)
    assert.deepEqual(carried, [expected])
    assert.deepEqual(await patchRows(CONSULTANT), carried)
  })

  // ---- AM-EP-06: the umbrella ships no member folder of its own ----
  caseTest(ID.ep06, 'files', `the umbrella's files list no member folder (${MEMBER_FOLDERS.join(', ')})`, () => {
    const files = manifestOf(UMBRELLA)[MANIFEST.files] ?? []
    assert.deepEqual(files.filter((f) => MEMBER_FOLDERS.includes(topFolder(f))), [])
  })
  caseTest(ID.ep06, 'packed', "the umbrella's own packed files hold no member module (only a bundled node_modules copy may)", async () => {
    const own = (await packedFiles(dirOf(UMBRELLA))).filter((f) => !f.split('/').some((part) => SOURCE.skip.includes(part)))
    assert.ok(own.length > 0, UMBRELLA.name + ' is not packed')
    assert.deepEqual(own.filter((f) => MEMBER_FOLDERS.includes(topFolder(f))), [])
  })

  // ---- AM-EP-08: fishball-shared carries the members' follower beside the ui seam ----
  caseTest(ID.ep08, 'exports', `${LIBRARY.name} exports ${LIBRARY_EXPORTS.follower.exportKey} (an existing file) and still ${LIBRARY_EXPORTS.seam.exportKey}`, () => {
    const exports = manifestOf(LIBRARY)[MANIFEST.exports] ?? {}
    for (const { exportKey, exportFile } of [LIBRARY_EXPORTS.follower, LIBRARY_EXPORTS.seam]) {
      assert.equal(exports[exportKey], exportFile, 'exports: ' + json(exports))
      assert.ok(fs.existsSync(fileOf(LIBRARY, exportFile)), exportFile + ' is missing')
    }
  })

  // ---- AM-SC: static rows over every member source file on disk ----
  for (const m of MEMBERS) {
    caseTest(ID.sc01, m.name, `no file of ${m.name} imports a path outside its own package root`, async () => {
      const refs = (await memberRefs()).filter((r) => r.member === m && r.at !== undefined && !inside(dirOf(m), r.at))
      assert.deepEqual(refs.map(describeRef), [])
    })
    caseTest(ID.sc02, m.name, `${m.name} imports no other member (by name or path) and its manifest names none`, async () => {
      const others = MEMBERS.filter((o) => o !== m)
      const code = (await memberRefs()).filter((r) => r.member === m && (r.at !== undefined ? others.some((o) => inside(dirOf(o), r.at)) : others.some((o) => o.name === bareName(r.specifier))))
      const manifest = manifestOf(m)
      const named = [...MANIFEST.depFields, ...MANIFEST.bundled].flatMap((f) => {
        const v = manifest[f]
        return (Array.isArray(v) ? v : Object.keys(v ?? {})).filter((n) => others.some((o) => o.name === n)).map((n) => 'package.json ' + f + ': ' + n)
      })
      assert.deepEqual([...code.map(describeRef), ...named], [])
    })
    caseTest(ID.sc03, m.name, `${m.name} takes the fishballInstance follower from ${LIBRARY_EXPORTS.follower.specifier}`, async () => {
      const refs = (await memberRefs()).filter((r) => r.member === m)
      assert.ok(refs.some((r) => r.specifier === LIBRARY_EXPORTS.follower.specifier), m.name + ' never imports ' + LIBRARY_EXPORTS.follower.specifier + ': ' + json(refs.map(describeRef)))
    })
  }
}
