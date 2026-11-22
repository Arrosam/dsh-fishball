/**
 * F-FIX-3: make the link's own lazy `import('@modelcontextprotocol/client')` fail, in this process.
 *
 * A synchronous module resolve hook (`module.registerHooks`, Node ≥ 22.15) answers that one specifier,
 * when it is imported from inside core's package, by throwing the value the test chose: the
 * `import()` then rejects with exactly that value (a string or `undefined` too), as a broken install
 * would make it reject. Disarmed, the hook only counts and passes the request on, so every other
 * import in the process (fishball-test-helpers/bind's binding, the cases' own) resolves as before. A
 * resolve hook runs on every `import()` call, even for a specifier resolved before, so arming works
 * after the module was loaded once. Node's test runner runs one file's tests one after another, so
 * the armed state belongs to the one test that set it (it is disarmed in that test's `after`).
 * Shared with the link-save area (Connect's and the saved grants' client load, E-FIX-3).
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CLIENT_PIN, CORE_DIR } from './constants.mjs'

// Core's own source (src/), so the tests folder's imports are never counted.
const CORE_SRC_URL = pathToFileURL(path.join(CORE_DIR, 'src') + path.sep).href
const state = { armed: false, make: undefined, resolves: 0 }
let hooked = false

function install() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === CLIENT_PIN.name && context.parentURL?.startsWith(CORE_SRC_URL)) {
        state.resolves += 1
        if (state.armed) throw state.make()
      }
      return nextResolve(specifier, context)
    },
  })
}

/**
 * Arms the fault for test `t`: every import of the MCP client from core throws `make()` until the
 * test ends. Returns `{resolves()}`, how many times core asked for the client since arming.
 * @param {import('node:test').TestContext} t
 */
export function failClientImport(t, make) {
  install()
  Object.assign(state, { armed: true, make, resolves: 0 })
  t.after(() => Object.assign(state, { armed: false, make: undefined }))
  return { resolves: () => state.resolves }
}

/** Counts core's imports of the MCP client for test `t` without failing them. */
export function countClientImport(t) {
  install()
  Object.assign(state, { armed: false, make: undefined, resolves: 0 })
  return { resolves: () => state.resolves }
}
