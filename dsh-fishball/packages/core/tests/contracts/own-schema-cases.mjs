import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { assertNoGeneratedSchema } from './absence.mjs'
import { OWN } from './own-schema-constants.mjs'

/** Every source file under core's runtime code (OWN.sourceDirs; a listed file is taken as it is). */
const files = () => OWN.sourceDirs.map((rel) => path.join(OWN.core, rel)).filter((p) => fs.existsSync(p)).flatMap((p) => (fs.statSync(p).isFile()
  ? [p]
  : fs.readdirSync(p, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && OWN.source.test(e.name)).map((e) => path.join(e.parentPath, e.name))))

/**
 * F-OWN-SCHEMA's fishball-core half (design §1.0b row 1, R-ARCH-10): core carries no generated
 * connector schema, and core's runtime code imports nothing of the DSH side and reaches no other
 * package's folder. The old row checked every Fishball-side package from one place; each package's
 * own tests (and the integration package-boundaries rows) now hold that rule for their own folder.
 * REMOVE-V2's retained-peer todo is gone: REMOVE-V2 landed (no dsh-connector peer in core's manifest,
 * no V2 contract import), so the rule holds with no exception. The real-connector comparisons moved
 * to dsh-connector with the connector (split 6b7c53bf).
 */
export function registerOwnSchemaCases() {
  caseTest('OWN-ARCH', 'absence', 'F-OWN-SCHEMA removes generated schema, generator, export and packed vendor entry', assertNoGeneratedSchema)
  caseTest('OWN-ARCH', 'imports', 'core\'s manifest and runtime sources have no DSH-side import and no relative import out of core\'s folder', () => {
    const bad = []
    const manifest = JSON.parse(fs.readFileSync(path.join(OWN.core, OWN.manifest), 'utf8'))
    for (const section of OWN.manifestSections) for (const name of Object.keys(manifest[section] ?? {})) if (OWN.dsh.test(name)) bad.push(`${section}: ${name}`)
    const sources = files()
    assert.ok(sources.length > 0, 'no core source read')
    for (const file of sources) {
      const relative = path.relative(OWN.core, file).split(path.sep).join('/')
      for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(OWN.imports)) {
        if (OWN.dsh.test(spec)) bad.push(`${relative}: ${spec}`)
        if (spec.startsWith('.') && !path.resolve(path.dirname(file), spec).startsWith(OWN.core + path.sep)) bad.push(`${relative}: ${spec}`)
      }
    }
    assert.deepEqual(bad, [])
  })
}
