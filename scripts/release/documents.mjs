/**
 * The release's two documents (REL-PACK item 7 and the user's 2026-11-17 publish brief), written from
 * the same constants the pack uses, so a renamed package or a new version cannot leave a document
 * naming the old one.
 */
import fs from 'node:fs'
import path from 'node:path'
import { COMMAND, DIST_TAG, INSTALL_SETS, LAYOUT, PACKAGES, PROFILE, REGISTRY, SDKS, VERSION } from './constants.mjs'

const fence = (lines) => ['```bash', ...lines, '```'].join('\n')

/** `dsh plugin --profile web add …` for the given package names. */
const add = (specs, ...flags) => ['dsh plugin --profile', PROFILE, 'add', ...specs, ...flags].join(' ')
const remove = (names) => ['dsh plugin --profile', PROFILE, 'remove', ...names].join(' ')

function installMarkdown(packages) {
  const name = (key) => packages[key].manifest.name
  const names = (set) => INSTALL_SETS[set].map(name)
  const spec = (key) => name(key) + '@' + VERSION
  // Absolute: DSH runs pnpm in the profile folder and anchors only bare `./x` package specs, so a
  // relative store path would point into the profile. The registry is named because pnpm keys its
  // metadata cache by registry, and the cache here was filled from this one.
  const offline = [COMMAND.offline, '--store-dir="$PWD/' + LAYOUT.store + '"', '--cache-dir="$PWD/' + LAYOUT.cache + '"', COMMAND.registry]
  const tarball = (key) => '"$PWD/' + LAYOUT.tarball(name(key), VERSION) + '"'
  return `# Fishball ${VERSION}: install and uninstall

Supported: DeepSeek Harness (DSH) ${SDKS.join(' and ')}. The packages declare \`engines.dsh\` \`>=0.2.1-rc.5\` and
Node \`>=22.14\`; DSH 0.2.2-rc.1 itself declares Node 24.9 or later.

All commands use the profile \`${PROFILE}\`. Put your own profile name after \`--profile\`. **Quit DSH before
you run any \`dsh plugin\` command.**

## Two ways to install

- **From npm** (once the packages are published, see PUBLISH.md): \`dsh plugin --profile ${PROFILE} add <name>@${VERSION}\`.
  DSH's plugin manager fetches each package and its declared dependencies.
- **From this folder, with no network**: run the commands from this folder (they use \`$PWD\`). Each package is a tarball here, and
  \`${LAYOUT.store}/\` and \`${LAYOUT.cache}/\` hold every third-party dependency, so pnpm needs no registry:
  add \`${offline.join(' ')}\` to the command.

Check the tarballs first: \`shasum -a 256 -c ${LAYOUT.sums}\`.

## Hosted: Fishball inside your main DSH

Install the connector, its UI and the built-in instance into your main DSH, in one command:

${fence([add(INSTALL_SETS.hosted.map(spec)), '', '# or, offline from this folder:', add(INSTALL_SETS.hosted.map(tarball), ...offline)])}

The connector needs DSH's web app in the profile (the \`${PROFILE}\` profile has it). Start DSH as usual.
At its first start the instance creates a private Fishball DSH under \`<DSH_HOME>/fishball/runtime\` and
installs the Fishball plugins into it (fishball-ui, then fishball-board, then fishball-core last). It installs
them from npm at exactly version ${VERSION}, and when the registry cannot be reached it installs them from
the copies it carries, with no network. It reinstalls only when that version is missing. You do not
install the fishball-* packages yourself in hosted mode.

The DSH home must be a canonical real path (on macOS, \`/private/tmp\`, not \`/tmp\`); otherwise the
instance reports \`INVALID_MAIN_HOME\` and does not start.

## Standalone: a Fishball DSH of its own

Install the Fishball plugins into the DSH that will be Fishball, in this order (core last):

${fence([add(INSTALL_SETS.standalone.map(spec)), '', '# or, offline from this folder:', add(INSTALL_SETS.standalone.map(tarball), ...offline)])}

Then start that DSH, open **Plugins → ${name('core')} → settings**, set **Target** to the connector URL of the DSH it works for and
**Client metadata URL** to the https URL of the client metadata document you host, then press **Connect**. The DSH you connect to needs \`${name('connector')}\` (and, for its UI,
\`${name('connectorUi')}\`) installed as in the hosted set, without \`${name('instance')}\`:

${fence([add([spec('connector'), spec('connectorUi')])])}

fishball-ui and fishball-board are optional: fishball-core alone is a full Fishball DSH.

## The connector adapter

In a DSH that should use another DSH's connector through DSH's own MCP client:

${fence([add(INSTALL_SETS.adapter.map(spec)), '', '# or, offline from this folder:', add(INSTALL_SETS.adapter.map(tarball), ...offline)])}

Set its \`clientMetadataUrl\` (an https URL of the client metadata document you host) and its servers in
its settings, then ask the agent to sign in with the \`dsh_connector_sign_in\` tool.

## Uninstall

DSH runs no plugin code when a plugin is removed, so data a plugin wrote stays on disk.

### Hosted

1. Quit DSH. That also stops Fishball's child process.
2. Remove the instance's private Fishball DSH with the cleanup command it ships, **before** removing the package:

${fence([`node <DSH_HOME>/profiles/${PROFILE}/node_modules/${name('instance')}/uninstall.js`])}

   It removes \`<DSH_HOME>/fishball/runtime\` (the child's home, profile, plugins, sessions and logs) and nothing
   else. If it refuses, it prints a code and removes nothing (\`CHILD_RUNNING\`: quit DSH, wait a few seconds and run
   it again; \`CHILD_STATE_UNKNOWN\`: it could not check the child, so if \`/bin/ps\` cannot be run there, run it
   where it works). For another home, add \`--home <DSH_HOME>\`.
3. Remove the packages:

${fence([remove(names('hosted'))])}

The connector's own data stays, as for any DSH plugin.

### Standalone

${fence([remove(names('standalone'))])}

The board keeps its data in \`<DSH_HOME>/fishball-board/\`, and DSH's remove gives the board no hook to delete it.
**The user deletes \`<DSH_HOME>/fishball-board/\` themselves (recommended)** after removing the plugin. Delete it
only if you no longer want the board's cards.

### Adapter

${fence([remove(names('adapter'))])}

Its sign-in grants stay in DSH's credential store until you remove them there.
`
}

function publishMarkdown(packages) {
  const ordered = PACKAGES.map((entry) => packages[entry.key])
  const lines = ordered.map((entry) => ['npm publish', './' + LAYOUT.tarball(entry.manifest.name, VERSION), COMMAND.registry, '--tag', DIST_TAG, '--access public'].join(' '))
  return `# Publishing Fishball ${VERSION}

Nothing here has been published. Run these yourself, in your own terminal, from this folder, after
\`npm login --registry=${REGISTRY}\`.

1. Verify the tarballs: \`shasum -a 256 -c ${LAYOUT.sums}\` (and \`node scripts/pack-v3.mjs --check\` from the repository).
2. Publish in this order. Each package comes after the ones it depends on, so no install ever names an unpublished
   version:

${fence(lines)}

Every package's manifest also says \`publishConfig.tag: ${DIST_TAG}\`, so a publish without \`--tag\` still does not
move \`latest\`. A pre-release is installed by its exact version or with \`@${DIST_TAG}\`.

3. Check each one: \`npm view <name>@${VERSION} version dist-tags ${COMMAND.registry}\`.

If a publish fails halfway, run the remaining lines again; a version that is already published is refused by
the registry and can be skipped. A published version cannot be overwritten: fix a mistake with a new version.
`
}

/** Write INSTALL.md and PUBLISH.md into `out`. */
export function writeDocuments(out, packages) {
  fs.writeFileSync(path.join(out, LAYOUT.install), installMarkdown(packages))
  fs.writeFileSync(path.join(out, LAYOUT.publish), publishMarkdown(packages))
}
