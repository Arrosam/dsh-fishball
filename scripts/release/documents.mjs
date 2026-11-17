/**
 * The release's two documents (REL-PACK item 7 and the user's 2026-11-17 publish brief), written from
 * the same constants the pack uses, so a renamed package or a new version cannot leave a document
 * naming the old one. The release folder also gets the helper INSTALL.md's offline install runs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMMAND, DIST_TAG, INSTALL_SETS, LAYOUT, OFFLINE, PACKAGES, PROFILE, REGISTRY, SDKS, VERSION } from './constants.mjs'

const fence = (lines) => ['```bash', ...lines, '```'].join('\n')
/** `text` indented under a numbered list item, so its fences stay inside the item (CommonMark). */
const item = (text) => text.split('\n').map((line) => (line ? '   ' + line : line)).join('\n')

/** `dsh plugin --profile web <args>`. */
const dsh = (...args) => ['dsh plugin --profile', PROFILE, ...args].join(' ')
const add = (specs, ...flags) => dsh('add', ...specs, ...flags)
const remove = (names) => dsh('remove', ...names)

/** A path inside the release folder, as the offline commands spell it (run from that folder). */
const here = (name) => '"$PWD/' + name + '"'

/**
 * The offline install of `tarballs`, two lines run from the release folder (e2e B2). The first
 * copies the release's store into the profile's own store and keeps its path; the second installs
 * with that store. Never `--store-dir` the release store itself: pnpm refuses it on a profile whose
 * node_modules came from another store (ERR_PNPM_UNEXPECTED_STORE), and it would bind a fresh
 * profile to this folder. The paths are absolute because DSH runs pnpm in the profile folder and
 * anchors only bare `./x` package specs. The registry is named because pnpm keys its metadata cache
 * by registry, and the cache here was filled from this one; `--offline` sends no request to it.
 */
function offlineAdd(tarballs) {
  const store = OFFLINE.storeVariable + '="$(node ' + here(LAYOUT.offlineStore) + ' ' + here(LAYOUT.store) + ' "$(' + dsh(OFFLINE.modulesQuery) + ')" "$(' + dsh(OFFLINE.storeQuery) + ')")" &&'
  return [store, add(tarballs.map(here), COMMAND.offline, '--store-dir="$' + OFFLINE.storeVariable + '"', '--cache-dir=' + here(LAYOUT.cache), COMMAND.registry)]
}

/** One set's install: from npm (the usual way), then offline from this folder. */
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
  const names = (set) => INSTALL_SETS[set].map(name)
  return `# Fishball ${VERSION}: install and uninstall

Supported: DeepSeek Harness (DSH) ${SDKS.join(' and ')}. The packages declare \`engines.dsh\` \`>=0.2.1-rc.5\` and
Node \`>=22.14\`; DSH 0.2.2-rc.1 itself declares Node 24.9 or later.

All commands use the profile \`${PROFILE}\`. Put your own profile name after \`--profile\`. **Quit DSH before
you run any \`dsh plugin\` command.**

## Before you install

- **Remove any earlier Fishball packages** (\`dsh-fishball\`, \`fishball-connector\`, \`fishball-instance\`,
  \`fishball-embed-ui\`, \`dsh-fishball-*\`) with \`${dsh('remove <name>')}\`, and delete \`<DSH_HOME>/fishball/\` if an
  earlier release left it. This release is a fresh install: it reads and migrates nothing.
- pnpm may print a long list of DSH's own packages (\`@deepseek-ai/*\`) as **missing peers**. DSH provides them
  when it runs, so that warning is expected.

## Two ways to install

- **From npm**, the usual way: \`${add(['<name>@' + VERSION])}\`. DSH's plugin manager fetches each package
  and its declared dependencies from your registry. If pnpm stops with \`ERR_PNPM_UNEXPECTED_STORE\` (a profile once
  installed with its own \`--store-dir\`), add \`--store-dir=<the store the message says node_modules is linked from>\`
  to the same command; nothing needs deleting.
- **From this folder, with no network.** Each package is a tarball here, and \`${LAYOUT.store}/\` and \`${LAYOUT.cache}/\` hold every
  third-party dependency. Run the commands from this folder, in bash or zsh (they use \`$PWD\`), both lines as shown. The
  first line runs \`${LAYOUT.offlineStore}\` (in this folder), which copies the packages of \`${LAYOUT.store}/\` into the pnpm
  store your profile already uses, adding files and deleting or replacing none, and prints that store's path. The
  second line installs with that store. It works on a profile that already has plugins, and the profile stays on its
  own store. The profile records each package by its tarball's path in this folder, and later \`dsh plugin\` commands
  read those tarballs again, so **keep this folder where it is** while the packages are installed this way. Once
  the packages are on npm, adding them again from npm (\`${add(['<name>@' + VERSION])}\`) replaces those records,
  and the folder may go. A later \`--offline\` add on that profile also needs this folder's metadata cache: give it
  \`--cache-dir=${here(LAYOUT.cache)} ${COMMAND.registry}\` too (an online add needs neither).

Check the tarballs first: \`shasum -a 256 -c ${LAYOUT.sums}\`.

## Hosted: Fishball inside your main DSH

Install the connector, its UI and the built-in instance into your main DSH, in one command:

${installBlocks('hosted', name)}

The connector needs DSH's web app in the profile (the \`${PROFILE}\` profile has it). Start DSH as usual.
At its first start the instance creates a private Fishball DSH under \`<DSH_HOME>/fishball/runtime\` and
installs the Fishball plugins into it (fishball-ui, then fishball-core last). It installs
them from npm at exactly version ${VERSION}, and when the registry cannot be reached it installs them from
the copies it carries, with no network. It reinstalls only when that version is missing. You do not
install the fishball-* packages yourself in hosted mode. It also gives the child a token from this DSH's
connector and copies your DSH's model list into the child once.

The DSH home must be a canonical real path (on macOS, \`/private/tmp\`, not \`/tmp\`); otherwise the
instance reports \`INVALID_MAIN_HOME\` and does not start.

Open Fishball with the fish in the sidebar, or with **Open Fishball** on the instance's settings page
(**Plugins → ${name('instance')}**). Open DSH at \`127.0.0.1\` or \`localhost\`: the window refuses other host names.
With no model set, Fishball asks you to choose one.

## Standalone: a Fishball DSH of its own

1. In the **managed DSH** (the one Fishball works for), install \`${name('connector')}\` and, for the fish and
   Hand over there, \`${name('connectorUi')}\`, as in the hosted set but without \`${name('instance')}\`:

${item(installBlocks('managed', name))}

2. In the **Fishball DSH**, install the Fishball plugins, in this order (core last):

${item(installBlocks('standalone', name))}

   fishball-ui is optional: fishball-core alone is a full Fishball DSH.

3. Start the Fishball DSH and open **Plugins → ${name('core')} → settings**. Set **Target** to the managed DSH's
   connector endpoint, for example \`http://127.0.0.1:<port>/api/agent/mcp\`. A target on another machine must be
   https. Then link it in one of two ways:
   - **With a token:** on the managed DSH's connector settings page, press **New token** and copy the value (it is
     shown once). Paste it into **Token for connecting a DSH** in ${name('core')}'s settings and press **Save**. The
     token is used at the next connection.
   - **With Connect:** set **Client metadata URL** to the https URL of the client metadata document you host,
     press **Connect**, open the approval page and enter a token made with **New token** there.

## The connector adapter

In a DSH that should use another DSH's connector through DSH's own MCP client:

${installBlocks('adapter', name)}

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
   it again; \`CHILD_STATE_UNKNOWN\`: it could not check the child. If \`/bin/ps\` cannot be run there, run it where
   it works. If the child's launch record is missing, stop DSH, check that no Fishball child process is left
   running, then delete \`<DSH_HOME>/fishball/runtime\` yourself). For another home, add \`--home <DSH_HOME>\`.
3. Remove the packages:

${fence([remove(names('hosted'))])}

The connector's own data stays, as for any DSH plugin.

### Standalone

${fence([remove(names('standalone'))])}

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

/** Write INSTALL.md, PUBLISH.md and INSTALL.md's offline helper (this folder's copy) into `out`. */
export function writeDocuments(out, packages) {
  fs.writeFileSync(path.join(out, LAYOUT.install), installMarkdown(packages))
  fs.writeFileSync(path.join(out, LAYOUT.publish), publishMarkdown(packages))
  fs.copyFileSync(fileURLToPath(new URL(LAYOUT.offlineStore, import.meta.url)), path.join(out, LAYOUT.offlineStore))
}
