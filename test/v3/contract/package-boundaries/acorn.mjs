/**
 * The JavaScript parser the V3 static workers share: the acorn copy built into Node itself.
 *
 * Import this only from a worker started with `--expose-internals` (WORKER.execArgv): the
 * repository has no parser of its own and DSH 0.2.1-rc.5 ships none, so every SDK run uses the same
 * parser and nothing is installed. A file is parsed as a module first, then as a script.
 */
import { createRequire } from 'node:module'

const internal = createRequire(import.meta.url)
export const acorn = internal('internal/deps/acorn/acorn/dist/acorn')
export const walk = internal('internal/deps/acorn/acorn-walk/dist/walk')

const PARSE = Object.freeze({ ecmaVersion: 'latest', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true })
const SOURCE_TYPES = Object.freeze(['module', 'script'])

/** Run `fn(options)` with each source type in turn; the last error is thrown when none parses. */
function withSourceType(fn) {
  let lastError
  for (const sourceType of SOURCE_TYPES) {
    try { return fn({ ...PARSE, sourceType }) } catch (error) { lastError = error }
  }
  throw lastError
}

/** The AST of one source text. */
export const parse = (source) => withSourceType((options) => acorn.parse(source, options))

/** Every token of one source text (comments are not tokens). */
export const tokens = (source) => withSourceType((options) => [...acorn.tokenizer(source, options)])
