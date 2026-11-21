import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest } from '../package-boundaries/cases.mjs'
import { REPO } from '../../../support/constants.mjs'
import { assertNoGeneratedSchema } from './absence.mjs'
import { OWN } from './constants.mjs'

const files = (root) => fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && OWN.source.test(e.name) && !path.relative(root, e.parentPath).split(path.sep).some((part) => ['node_modules', 'test', 'vendor'].includes(part)))
  .map((e) => path.join(e.parentPath, e.name))

/**
 * F-OWN-SCHEMA's fishball-core half: core carries no generated connector schema, and no
 * Fishball-side package imports the DSH side. The real-connector comparisons moved to
 * dsh-connector with the connector (split 6b7c53bf); its K1/K2/K3 suites own them.
 */
export function registerOwnSchemaCases(sdk) {
  caseTest(sdk, 'OWN-ARCH', 'absence', 'F-OWN-SCHEMA removes generated schema, generator, export and packed vendor entry', assertNoGeneratedSchema)
  caseTest(sdk, 'OWN-ARCH', 'imports', 'Fishball-side sources have no DSH-side or cross-package relative imports except V2 contract', () => {
    const bad = []
    for (const pkg of OWN.packages) {
      const root = path.join(REPO, 'packages', pkg.dir)
      if (pkg.manifest) {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
        for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
          for (const name of Object.keys(manifest[section] ?? {})) {
            if (OWN.dsh.test(name) && !(pkg.dir === 'core' && section === 'peerDependencies' && name === 'dsh-agent-connector')) bad.push(`${pkg.dir} ${section}: ${name}`)
          }
        }
      }
      for (const file of files(root)) {
        const relative = path.relative(root, file).split(path.sep).join('/')
        if (pkg.dir === 'core' && relative.startsWith('scripts/')) {
          assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /dsh-agent-connector|dsh-connector|packages[/'"\s,+]*connector/, 'a core generator still reads the connector')
        }
        for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(OWN.imports)) {
          const v2 = pkg.dir === 'core' && OWN.v2.test(relative)
          if (OWN.dsh.test(spec) && !(v2 && spec === OWN.contract)) bad.push(`${pkg.dir}/${relative}: ${spec}`)
          if (spec.startsWith('.') && !path.resolve(path.dirname(file), spec).startsWith(root + path.sep)) bad.push(`${pkg.dir}/${relative}: ${spec}`)
        }
      }
    }
    assert.deepEqual(bad, [])
  })
  caseTest(sdk, 'OWN-ARCH', 'peer', 'REMOVE-V2 removes retained dsh-connector peer and V2 contract imports', null, 'REMOVE-V2 (user decision 2026-11-16: retain peer and V2 contract imports until removal)')
  caseTest(sdk, 'OWN-LINK', 'connector drift', 'the real-connector comparisons (link, ids, tools, events, HTTP, approval, metadata) live in dsh-connector', null, 'moved with the connector to the dsh-connector repository (split 6b7c53bf): its K1/K2/K3 contract suites own them')
}
