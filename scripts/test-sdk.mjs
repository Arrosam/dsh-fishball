import { ENV, RELEASE_MATRIX as connectorMatrix } from '../dsh-connector/packages/dsh-connector-test-helpers/src/constants.mjs'
import { currentVersion, runVersions, versionsDir } from '../dsh-connector/packages/dsh-connector-test-helpers/src/config.mjs'
import { SDK } from '../dsh-fishball-instance/packages/test-helpers/src/constants.mjs'

export function family(pkg, release = false) {
  if (pkg.dir.startsWith('dsh-fishball-instance/')) return 'instance'
  if (pkg.dir.startsWith('dsh-connector/') || pkg.name.startsWith('dsh-connector-')) return 'connector'
  if (pkg.dir.startsWith('dsh-fishball/') || pkg.name.startsWith('fishball-') && (release || pkg.name !== 'fishball-consultant')) return 'fishball'
  return 'plain'
}

export async function profiles(pkg, release) {
  switch (family(pkg, release !== undefined)) {
    case 'instance':
      // Instance tests register both supported SDK versions inside the test files.
      return [{ label: SDK.versions.join(','), env: { FBTEST_DSH_VERSIONS: SDK.versionsDir } }]
    case 'connector': {
      // Connector's reporter/inventory expects its matrix rows in a single run.
      const versions = release === false ? [currentVersion()] : release ? (Array.isArray(release) ? release : connectorMatrix) : runVersions()
      return [{ label: versions.join(','), env: { [ENV.versionsDir]: versionsDir, [ENV.matrix]: release || release === undefined && process.env[ENV.matrix] ? versions.join(',') : '', [ENV.current]: versions[0] } }]
    }
    case 'fishball': {
      const { DSH_ENV, DSH_VERSION, RELEASE_MATRIX, VERSIONS_DIR, isInstalled, runtimeOf } = await import('../dsh-fishball/packages/test-helpers/dsh.mjs')
      const versions = Array.isArray(release) ? release : release ? RELEASE_MATRIX : [DSH_VERSION]
      return versions.map((version) => {
        if (!isInstalled(version)) throw new Error('DSH ' + version + ' is not installed under ' + VERSIONS_DIR)
        return { label: version, env: { [DSH_ENV.version]: version, [DSH_ENV.versions]: VERSIONS_DIR, [DSH_ENV.runtime]: runtimeOf(version) } }
      })
    }
    default: return [{ label: '', env: {} }]
  }
}
