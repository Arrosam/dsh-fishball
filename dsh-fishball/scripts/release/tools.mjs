/**
 * The npm and pnpm runs of a pack, always isolated from the user's own configuration: a scratch
 * HOME, XDG folders, npm cache and global config, and `npm_config_userconfig=/dev/null`, so no
 * `~/.npmrc`, no pnpm rc and no token is ever read (the user's environment rule for REL-PACK).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { COMMAND, ISOLATION } from './constants.mjs'

/**
 * An environment for package-manager runs under `scratch`. PATH and the proxy settings are kept,
 * so the one online step (filling the store) works behind the user's network; every inherited
 * npm setting, in either case, is dropped first, so none of the shell's can override these.
 */
export function isolate(scratch) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !ISOLATION.npmSetting.test(name)))
  const home = path.join(scratch, ISOLATION.home)
  const globalconfig = path.join(scratch, ISOLATION.globalconfig)
  for (const name of ISOLATION.xdg) fs.mkdirSync(path.join(home, name), { recursive: true })
  // An empty file: npm 11 refuses /dev/null as both the user and the global config.
  fs.writeFileSync(globalconfig, '')
  return {
    ...env,
    HOME: home,
    ...Object.fromEntries(ISOLATION.xdg.map((name) => [ISOLATION.xdgVariable(name), path.join(home, name)])),
    npm_config_userconfig: COMMAND.userconfig,
    npm_config_globalconfig: globalconfig,
    npm_config_cache: path.join(scratch, ISOLATION.npmCache),
  }
}

const run = (command) => (args, { cwd, env }) => execFileSync(command, [...args, COMMAND.ignoreScripts], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: ISOLATION.maxOutputBytes })

/** Run npm with `--ignore-scripts` appended; returns stdout. */
export const npm = run(COMMAND.npm)
/** Run pnpm with `--ignore-scripts` appended; returns stdout. */
export const pnpm = run(COMMAND.pnpm)
