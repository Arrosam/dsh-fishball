/**
 * fishball-ui's package rows: its manifest and boundary, its nested page and tab packages, the files
 * moved into it, and its browser half (client.js and its five parts). Requirements: 1.38 Q-N2;
 * R-FB-14, R-ARCH-08, R-ARCH-10; Q-G2; design §1.0; the F-UI interface (2026-11-16, items 1–11 with
 * its amendments); 117cb2a2 (fishball-ui is core's ./ui/ component, its rows live in core's patch).
 * README.md beside this file lists every row and where the rows that need fishball-core went.
 *
 * Levels:
 * - static: fishball-ui's manifests and the specifiers its shipped files name (subject.mjs);
 * - component (offline): client.js and its chunks run unread in a node:vm page, applied by the
 *   current DSH's own Cordis (subject.mjs loadClient / startClient).
 * Techniques: UC (UI-UC-04, -05, -06), EP (UI-EP-02 manifest fields × forbidden names; chunk
 * outcomes real / failing / stand-in), BVA (one module registration per script; one style per
 * mountStyle, none after its disposer), ST (UI-ST-03 mountStyle none → mounted → disposed → disposed).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { caseTest } from 'fishball-test-helpers/cases'
import { CLIENT, FIXTURE, FORBIDDEN, MOVED, NESTED_CLIENT, UI_PACKAGE, UI_PACKAGES } from './constants.mjs'
import { CHUNK_FAILS, baseFile, describeRef, loadChunk, loadClient, manifestNames, manifestOf, platform, references, startClient, stylesOf } from './subject.mjs'

const show = (v) => JSON.stringify(v)
const FORBIDDEN_NAMES = Object.freeze([...FORBIDDEN.dshSide, FORBIDDEN.core])
const importOwn = (relative) => import(pathToFileURL(path.join(UI_PACKAGE.dir, relative)).href)

export function registerPackageCases() {
  // ================================================================ UI-UC-06: the package
  caseTest('UI-UC-06', 'main 1', `fishball-ui is its own package at ${UI_PACKAGE.folder} (its own manifest, named ${UI_PACKAGE.name})`, () => {
    assert.equal(manifestOf().name, UI_PACKAGE.name)
  })
  caseTest('UI-UC-06', 'main 2', `it is core's UI component: dsh.client.platform ${UI_PACKAGE.platform}, no dsh.bundle of its own`, () => {
    assert.equal(manifestOf()[UI_PACKAGE.dshField]?.bundle, undefined)
    assert.equal(manifestOf()[UI_PACKAGE.dshField]?.client?.platform, UI_PACKAGE.platform)
  })
  caseTest('UI-EP-02', 'exports', `the export map is exactly ${Object.keys(UI_PACKAGE.exports).join(', ')}, each a shipped file`, () => {
    assert.deepEqual(manifestOf().exports, { ...UI_PACKAGE.exports })
    for (const file of Object.values(UI_PACKAGE.exports)) assert.ok(fs.existsSync(path.join(UI_PACKAGE.dir, file)), file + ' is missing')
  })
  caseTest('UI-UC-06', 'main 3', 'it declares no runtime or bundled dependencies (core carries fishball-shared)', () => {
    const m = manifestOf()
    assert.deepEqual(manifestNames(m, UI_PACKAGE.runtimeFields).map((e) => e.field + ': ' + e.name), [])
  })
  // R-ARCH-10 / R-FB-14 "Fishball side only" (EP over manifest fields × forbidden names).
  caseTest('UI-EP-02', 'manifest', `the manifest names no DSH-side package (${FORBIDDEN.dshSide.join(', ')}) and not fishball-core, in any dependency field`, () => {
    assert.deepEqual(manifestNames(manifestOf()).filter((e) => FORBIDDEN_NAMES.includes(e.name)).map((e) => e.field + ': ' + e.name), [])
  })
  caseTest('UI-EP-02', 'manifest', 'every other name in its dependency fields is fishball-shared or a DSH host package (@deepseek-ai/*)', () => {
    const names = manifestNames(manifestOf(), UI_PACKAGE.nameFields).map((e) => e.name)
    assert.deepEqual(names.filter((n) => n !== UI_PACKAGE.library && !n.startsWith(UI_PACKAGE.hostScope)), [])
  })
  caseTest('UI-EP-02', 'imports', 'no shipped file of fishball-ui imports a DSH-side package or fishball-core (by name or path), and no path leaves the package', () => {
    const refs = references()
    assert.ok(refs.length > 0, 'precondition: the scan read specifiers')
    assert.deepEqual(refs.filter((r) => FORBIDDEN_NAMES.includes(r.target)).map(describeRef), [])
    assert.deepEqual(refs.filter((r) => r.outside).map(describeRef), [], 'a path leaving the package')
  })
  caseTest('UI-EP-02', 'imports', 'fishball-ui imports fishball-shared (its one library)', () => {
    assert.ok(references().some((r) => r.target === UI_PACKAGE.library), 'no file imports ' + UI_PACKAGE.library)
  })
  for (const [folder, name] of Object.entries(UI_PACKAGES)) {
    caseTest('UI-UC-06', 'rows', `${folder}/ is its own package ${name} with its own ./client (so DSH serves its client apart from fishball-ui's)`, () => {
      const own = manifestOf(folder)
      assert.equal(own?.name, name)
      assert.ok(Object.hasOwn(own?.exports ?? {}, NESTED_CLIENT), folder + ' exports no ./client')
      assert.ok(own?.[UI_PACKAGE.dshField]?.client, folder + ' declares no dsh.client')
    })
  }
  caseTest('UI-BVA-01', 'no UI patch', "fishball-ui has no cordis.patch.yml of its own (117cb2a2: its rows live in core's patch)", () => {
    assert.equal(fs.existsSync(path.join(UI_PACKAGE.dir, UI_PACKAGE.patchFile)), false)
  })
  caseTest('EFIX3-UI-GUARD-01', 'gone', 'fishball-ui has no src/guards.js and no peer dependency on @deepseek-ai/dsh-app-boot', () => {
    for (const file of UI_PACKAGE.goneFiles) assert.equal(fs.existsSync(path.join(UI_PACKAGE.dir, file)), false, file)
    assert.equal(Object.hasOwn(manifestOf().peerDependencies ?? {}, UI_PACKAGE.gonePeer), false, show(manifestOf().peerDependencies))
  })

  // ================================================================ moved unchanged (interface item 10)
  // Re-baselined (R-FIX-FUI F1): PAIRING_TEXT gained the card's `title`, `chooseFailed` and `locale`;
  // every key core's copy had still answers as it did.
  caseTest('UI-UC-06', 'moved', `src/pairing/text.js: PAIRING_TEXT answers as ui/pairing/text.js did at ${MOVED.ref} for every key it had (every formatter, en and zh), and adds title, chooseFailed and locale`, async (t) => {
    const now = (await importOwn(MOVED.pairing.after))[MOVED.pairing.export]
    const before = (await import(pathToFileURL(baseFile(t, MOVED.ref, MOVED.pairing.before)).href))[MOVED.pairing.export]
    const picture = (o, keysOf) => Object.fromEntries(Object.entries(o).map(([lang, words]) => [lang, Object.fromEntries(keysOf(lang).map((k) => [k, typeof words[k] === 'function' ? words[k](...MOVED.args) : words[k]]))]))
    const oldKeys = (lang) => Object.keys(before[lang])
    assert.deepEqual(picture(now, oldKeys), picture(before, oldKeys))
    for (const lang of Object.keys(before)) assert.deepEqual(Object.keys(now[lang]).filter((k) => !oldKeys(lang).includes(k)).sort(), [...MOVED.pairing.added].sort(), lang)
  })
  caseTest('UI-UC-06', 'moved', `src/status/index.js exports ${MOVED.status.exports.join(', ')}`, async () => {
    const mod = await importOwn(MOVED.status.after)
    for (const name of MOVED.status.exports) assert.notEqual(mod[name], undefined, name)
  })
  caseTest('UI-UC-06', 'moved', 'src/recommended.js exports recommendedList and RECOMMENDED_* (the tab\'s data)', async () => {
    const mod = await importOwn(MOVED.recommended.after)
    for (const name of MOVED.recommended.exports) assert.equal(typeof mod[name], 'function', name)
    assert.ok(Object.keys(mod).some((k) => k.startsWith(MOVED.recommended.prefix)), 'no RECOMMENDED_* export')
  })

  // ================================================================ UI-UC-04 / UI-UC-05: the browser half
  caseTest('UI-UC-04', 'main 1', `client.js registers exactly one module, id ${CLIENT.moduleId}, with no chunk`, () => {
    // Re-baselined (R-FIX-FUI F3): the entry's kit draws the shared stream notice, so its factory requires the page's react and primitives.
    const { registrations } = loadClient()
    assert.deepEqual(registrations.map((r) => [r.id, r.chunk]), [[CLIENT.moduleId, undefined]])
  })
  // The legacy model dialog is no longer a loadable or shipped chunk.
  caseTest('UI-UC-04', 'main 2', `its plugin loads ${CLIENT.partOrder.map((f) => CLIENT.localPrefix + f).join(', ')} in that order and starts each part`, async (t) => {
    const r = await startClient(t)
    assert.deepEqual([...r.loads], CLIENT.partOrder.map((f) => CLIENT.localPrefix + f))
    for (const removed of CLIENT.removedParts) {
      assert.equal(r.loads.includes(CLIENT.localPrefix + removed), false, `client.js must not load removed chunk ${removed}`)
      assert.equal(fs.existsSync(path.join(UI_PACKAGE.dir, removed)), false, `removed chunk ${removed} still exists on disk`)
      assert.equal((manifestOf().files ?? []).includes(removed), false, `removed chunk ${removed} still listed in package.json files`)
    }
    assert.deepEqual([...r.started].sort(), Object.values(CLIENT.parts).map((p) => p.file).sort())
    assert.deepEqual(r.failed, [])
  })
  for (const part of Object.values(CLIENT.parts)) {
    const others = Object.values(CLIENT.parts).filter((p) => p !== part).map((p) => p.file)
    caseTest('UI-UC-04', 'E1', `${part.file} fails to load: only its part is lost; ${others.join(', ')} still start; nothing fails`, async (t) => {
      const r = await startClient(t, { [part.file]: CHUNK_FAILS })
      assert.deepEqual([...r.started].sort(), [...others].sort())
      assert.deepEqual(r.failed, [])
    })
  }
  caseTest('UI-UC-04', 'E2', 'every chunk fails: no part starts and the entry plugin does not fail', async (t) => {
    const r = await startClient(t, Object.fromEntries(Object.values(CLIENT.parts).map((p) => [p.file, CHUNK_FAILS])))
    assert.deepEqual(r.started, [])
    assert.deepEqual(r.failed, [])
  })
  caseTest('UI-ST-03', 'mountStyle', 'kit.mountStyle(id, css): none → one <style id> with that text → its disposer removes it; a second dispose changes nothing', async (t) => {
    const r = await startClient(t)
    const kit = r.kits[0]?.kit
    assert.equal(typeof kit?.[CLIENT.kitStyle], 'function', 'the part got no kit.mountStyle')
    const mine = () => stylesOf(r.page).filter((s) => s.id === FIXTURE.styleId)
    assert.deepEqual(mine(), [], 'precondition: no such style')
    const dispose = kit[CLIENT.kitStyle](FIXTURE.styleId, FIXTURE.css)
    assert.equal(mine().length, 1, 'one style element')
    assert.equal(mine()[0].localName, CLIENT.styleTag)
    assert.equal(mine()[0].textContent, FIXTURE.css)
    assert.equal(typeof dispose, 'function')
    dispose()
    assert.deepEqual(mine(), [])
    dispose()
    assert.deepEqual(mine(), [])
  })
  for (const part of Object.values(CLIENT.parts)) {
    caseTest('UI-UC-05', part.file, `${part.file} registers {id: fishball-ui, chunk: ${part.file}} and exports ${part.export}(kit) → a plugin ${part.plugin === null ? 'with a name' : `named "${part.plugin}"`} {inject, apply}`, () => {
      const { registrations, exports, required } = loadChunk(part.file, platform())
      assert.deepEqual(registrations.map((r) => [r.id, r.chunk]), [[CLIENT.moduleId, part.file]])
      assert.equal(typeof exports?.[part.export], 'function', 'no ' + part.export)
      const plugin = exports[part.export]({ [CLIENT.kitStyle]: () => () => {} })
      if (part.plugin === null) assert.ok(typeof plugin?.name === 'string' && plugin.name.length > 0, 'the plugin has no name')
      else assert.equal(plugin?.name, part.plugin)
      assert.ok(Array.isArray(plugin?.inject), 'no inject list')
      assert.equal(typeof plugin?.apply, 'function')
      assert.deepEqual(required.filter((n) => !CLIENT.platform.includes(n)), [], 'requires outside the page set')
    })
  }
}
