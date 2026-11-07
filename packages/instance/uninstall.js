#!/usr/bin/env node
/**
 * Removes the Fishball instance's private data before `fishball-instance` is uninstalled (design
 * §0.10, Q3): the child DSH home `<DSH_HOME>/fishball/runtime` (its `dsh-home`, `launches`,
 * workspace, OS home, temp folder, owner marker, secret and logs) and nothing else. The
 * connector's data, the main profile and every other file under `<DSH_HOME>` stay as they are.
 *
 * Why a command: DSH 0.2.1-rc.5 and 0.2.2-rc.1 have no uninstall hook. Removing a plugin on the
 * Plugins page disposes its row exactly as a disable does and then runs `pnpm remove`;
 * `dsh plugin remove` only runs pnpm. The row cannot tell an uninstall from a disable or a quit,
 * so it never deletes anything by itself.
 *
 * Usage, with DSH quit (that also stops the child), before removing the package:
 *   node <profile>/node_modules/fishball-instance/uninstall.js [--home <DSH_HOME>]
 * Without --home, the home is DSH's own default: $DSH_HOME when set, else ~/.dsh.
 *
 * It refuses, and deletes nothing, when the tree cannot be proven this home's (a symbolic link in
 * its path or in its layout, an owner marker for another home, a non-canonical home) or when the
 * recorded child may still run. Exit codes: UNINSTALL.exitCode.
 */
import os from 'node:os'
import path from 'node:path'
import { createNativeRuntime } from './src/native-runtime/index.js'
import { UNINSTALL } from './src/native-runtime/constants.js'

/** DSH's home rule (constants.js UNINSTALL.homeEnv); undefined for an unusable argument list. */
function dshHome(args, env) {
  let configured
  if (args.length === 2 && args[0] === UNINSTALL.homeFlag && args[1].trim().length > 0) configured = args[1]
  else if (args.length !== 0) return undefined
  const fromEnv = env[UNINSTALL.homeEnv]
  const chosen = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : path.join(os.homedir(), UNINSTALL.defaultHomeDirectory))
  const expanded = chosen === UNINSTALL.tilde ? os.homedir()
    : UNINSTALL.tildePrefixes.some((prefix) => chosen.startsWith(prefix)) ? path.join(os.homedir(), chosen.slice(UNINSTALL.tilde.length + 1))
    : chosen
  return path.resolve(expanded)
}

const say = (text, values) => text.replace(/\{(\w+)\}/g, (_, name) => values[name])

async function main() {
  const home = dshHome(process.argv.slice(2), process.env)
  if (home === undefined) {
    process.stderr.write(UNINSTALL.message.usage)
    return UNINSTALL.exitCode.usage
  }
  // The runtime's own constants decide the path (files.js pathsFor), never an argument.
  const runtime = createNativeRuntime({ mainHome: home })
  const root = runtime.paths.root
  try {
    const { removed } = await runtime.uninstall()
    process.stdout.write(say(removed ? UNINSTALL.message.removed : UNINSTALL.message.absent, { path: root }))
    return UNINSTALL.exitCode.done
  } catch (error) {
    // Only the code: a message could carry a path or a value from a private file.
    process.stderr.write(say(UNINSTALL.message.refused, { code: error?.code ?? error?.name ?? typeof error, path: root }))
    return UNINSTALL.exitCode.refused
  }
}

process.exitCode = await main()
