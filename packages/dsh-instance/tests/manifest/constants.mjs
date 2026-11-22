/**
 * Vocabulary of the manifest cases: the instance's own manifest, files and exports, and its
 * boundary (README intro: "It imports no Fishball-side code and has no dsh-connector peer";
 * R-ARCH-10; requirements 1.40; design §1.0b). Values come from those requirements and the moves
 * I-HOST and I-READY recorded, never from the code.
 */
import path from 'node:path'

export const MANIFEST = 'package.json'
/** The Fishball-side packages no instance file may import or depend on (R-ARCH-10). */
export const FISHBALL_SIDE = Object.freeze(['fishball-core', 'fishball-ui', 'fishball-board', 'fishball-shared'])
/** The connector's packages: no peer, no import (I-READY, design §1.0b; G5). */
export const CONNECTOR_SIDE = Object.freeze(['dsh-agent-connector', 'dsh-connector', 'dsh-connector-ui', 'dsh-connector-shared'])
/** Every dependency field a manifest can name a package in. */
export const DEPENDENCY_FIELDS = Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies', 'bundleDependencies', 'bundledDependencies'])

/** The modules I-HOST moved into the instance (MOVED present). */
export const PRESENT = Object.freeze([
  path.join('src', 'child', 'provider-sync-target.js'),
  'child-row.js',
  'client.js',
  'client.status.js',
  'client.models.js',
])
/** What left the instance (MOVED absent): the V2 session route (fishball-core serves it) and the V2 child settings. */
export const ABSENT = Object.freeze([path.join('src', 'native-runtime', 'session-route.js'), path.join('src', 'child-settings')])
/** The V2 manager-session route the instance no longer serves (fishball-core publishes it itself). */
export const SESSION_ROUTE = Object.freeze({ path: '/api/fishball/session', words: Object.freeze(['session-route', 'registerSessionRoute', '/api/fishball/session']) })
/** The child halves that left core with I-HOST / I-READY: rows and exports the instance must not bring back. */
export const GONE = Object.freeze({
  rows: Object.freeze(['fishball-native-admin', 'fishball-native-provider-sync']),
  exports: Object.freeze(['./slim/admin', './slim/provider-sync-target']),
})

/** The moved provider-sync target's exports (MOVED sync-target). */
export const SYNC_TARGET = Object.freeze({
  file: path.join('src', 'child', 'provider-sync-target.js'),
  exports: Object.freeze(['createProviderSyncTarget', 'createProviderSyncTargetEndpoint', 'PROVIDER_SYNC_TARGET', 'ProviderSyncTargetError', 'createProviderSyncCodec', 'providerSyncIdentity']),
})
/** The child-side row (K3a HOSTED_IMPORT targetSetting: row dsh-instance-child, field targetUrl). */
export const CHILD_ROW = Object.freeze({ file: 'child-row.js', export: './child-row', name: 'dsh-instance-child', field: 'targetUrl' })
/** R-HOST-05 / R1: no token or credential-reference setting in the instance's config. */
export const SECRET_LIKE = /token|credential|secret|key/i

/** The settings page (QD1 = B) and its chunks, which a packed instance ships. */
export const PAGE = Object.freeze({ entry: 'client.js', chunks: Object.freeze(['client.status.js', 'client.models.js', 'client.fishball.js']) })
/** REL-PACK output, never committed (Q-22): absent in a checkout, so it is not a missing source. */
export const PACK_OUTPUT = 'bundled/'
/** `npm pack --dry-run` lists what a packed instance would hold, without writing a tarball. */
export const NPM_PACK = Object.freeze({ command: 'npm', args: Object.freeze(['pack', '--dry-run', '--json', '--ignore-scripts']), modules: 'node_modules/' })

/** The row the instance's own patch inserts (design §0.2, D22): its package name. */
export const INSTANCE = Object.freeze({ name: 'dsh-instance', patch: 'cordis.patch.yml', locales: Object.freeze(['en', 'zh']), engine: '>=0.2.1-rc.5' })

/** Source files scanned for imports: the package's code, not its tests. */
export const SCAN = Object.freeze({ extensions: Object.freeze(['.js', '.mjs', '.cjs']), skip: Object.freeze(['tests', 'node_modules']) })
/** Module specifiers in code: static import/export … from, bare import, dynamic import(), require(). */
export const SPECIFIERS = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\s]+)\1/g
/** npm's package-name shape, so a quoted word in a comment is not read as a package. */
export const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(?:\/.*)?$/
