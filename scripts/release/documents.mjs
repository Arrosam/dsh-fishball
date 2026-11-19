import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMMAND, DIST_TAG, INSTALL_SETS, LAYOUT, OFFLINE, PACKAGES, PROFILE, REGISTRY, SDKS, VERSION } from './constants.mjs'

const fence = (lines) => ['```bash', ...lines, '```'].join('\n')
const dsh = (...args) => ['dsh plugin --profile', PROFILE, ...args].join(' ')
const add = (specs, ...flags) => dsh('add', ...specs, ...flags)
const here = (name) => '"$PWD/' + name + '"'

function offlineAdd(tarballs) {
  const store = OFFLINE.storeVariable + '="$(node ' + here(LAYOUT.offlineStore) + ' ' + here(LAYOUT.store) + ' "$(' + dsh(OFFLINE.modulesQuery) + ')" "$(' + dsh(OFFLINE.storeQuery) + ')")" &&'
  return [store, add(tarballs.map(here), COMMAND.offline, '--store-dir="$' + OFFLINE.storeVariable + '"', '--cache-dir=' + here(LAYOUT.cache), COMMAND.registry)]
}

function installBlocks(set, name) {
  const keys = INSTALL_SETS[set]
  return [
    fence([add(keys.map((key) => name(key) + '@' + VERSION))]),
    'Offline, from this folder:',
    fence(offlineAdd(keys.map((key) => LAYOUT.tarball(name(key), VERSION)))),
  ].join('\n\n')
}

function installMarkdown(packages) {
  const name = (key) => packages[key].manifest.name
  return `# DSH Connector ${VERSION}: install and uninstall

Supported: DeepSeek Harness (DSH) ${SDKS.join(' and ')}.

## Managed DSH (connector + connector UI components)

${installBlocks('managed', name)}

## Amenities (includes dsh-connector-adapter)

${installBlocks('amenities', name)}
`
}

function publishMarkdown(packages) {
  const lines = PACKAGES.map((entry) => 'npm publish ' + LAYOUT.tarball(packages[entry.key].manifest.name, VERSION) + ' --tag ' + DIST_TAG + ' --access public --registry ' + REGISTRY)
  return `# DSH Connector ${VERSION}: publish

Run from this release folder:

${fence(lines)}
`
}

export function writeDocuments(out, packages) {
  fs.writeFileSync(path.join(out, LAYOUT.install), installMarkdown(packages))
  fs.writeFileSync(path.join(out, LAYOUT.publish), publishMarkdown(packages))
  fs.copyFileSync(fileURLToPath(new URL('./offline-store.mjs', import.meta.url)), path.join(out, LAYOUT.offlineStore))
}
