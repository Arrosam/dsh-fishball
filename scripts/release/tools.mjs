/**
 * The npm and pnpm runs of a pack, always isolated from the user's own configuration: a scratch
 * HOME, npm cache and global config, and `npm_config_userconfig=/dev/null`, so no `~/.npmrc` (and no
 * token in it) is ever read (the user's environment rule for REL-PACK).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { COMMAND } from './constants.mjs'

/**
 * An environment for package-manager runs under `scratch`. PATH and the proxy settings are kept,
 * so the one online step (filling the store) works behind the user's network.
 */
export function isolate(scratch) {
  const home = path.join(scratch, 'home')
  const globalconfig = path.join(scratch, 'npmrc-global')
  fs.mkdirSync(home, { recursive: true })
  // An empty file: npm 11 refuses /dev/null as both the user and the global config.
  fs.writeFileSync(globalconfig, '')
  const env = { ...process.env, HOME: home, npm_config_userconfig: COMMAND.userconfig, npm_config_globalconfig: globalconfig, npm_config_cache: path.join(scratch, 'npm-cache') }
  // A token or registry the caller's shell exports would reach npm through the environment instead.
  for (const name of Object.keys(env)) if (/^npm_config_(_|.*_auth|.*token|registry)/i.test(name)) delete env[name]
  return env
}

const run = (command) => (args, { cwd, env }) => execFileSync(command, [...args, COMMAND.ignoreScripts], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 })

/** Run npm with `--ignore-scripts` appended; returns stdout. */
export const npm = run(COMMAND.npm)
/** Run pnpm with `--ignore-scripts` appended; returns stdout. */
export const pnpm = run(COMMAND.pnpm)
