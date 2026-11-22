/**
 * The installed DSH runtime folder a helper imports DSH's own modules from: FBTEST_DSH_RUNTIME when a
 * parent set it (a DSH world child, or a run that names a runtime folder directly), else the current
 * DSH's (`./dsh` DSH_RUNTIME). The runner sets both to the same version, so the two never disagree in
 * a run; a child process started by a helper gets FBTEST_DSH_RUNTIME from its parent.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DSH_ENV, DSH_RUNTIME } from './dsh.mjs'

const LAYOUT = Object.freeze({ scope: '@deepseek-ai', entry: path.join('lib', 'index.js') })

export const RUNTIME = process.env[DSH_ENV.runtime] ?? DSH_RUNTIME

/** The absolute path of one file of an installed DSH package (`lib/index.js` by default). */
export const runtimeFile = (name, file = LAYOUT.entry) => path.join(RUNTIME, LAYOUT.scope, name, file)

/**
 * Import one installed DSH package (`@deepseek-ai/<name>`) from RUNTIME, by its `lib/index.js` or a
 * named file. Every package these helpers load uses `lib/index.js`; `./dsh` importDsh reads the
 * manifest for the few that do not (schemastery).
 */
export const importRuntime = (name, file) => import(pathToFileURL(runtimeFile(name, file)).href)
