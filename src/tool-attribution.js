/**
 * Which plugin row registered each tool (DESIGN §4 "Which plugin a tool came from").
 *
 * DSH keeps no owner per tool. This module wraps `ToolRuntime.prototype.register` when it is
 * EVALUATED and records the loader entry of the registering context. Every tool registered
 * after that is attributed: all of the private tree, tools registered lazily (browser-skill
 * reveals its tools on first use), and plugins whose modules load after this one.
 *
 * Load order: DSH's loader imports plugin modules in parallel and applies each one as soon as
 * its import resolves. Imported through the main row, this module evaluates only after
 * Fishball's whole module graph has loaded, which small plugins beat (P3 smoke: ~70 ms).
 * So the package also mounts it as its own tiny row (`dsh-fishball/attribution`, importing
 * only dsh-tools), the condition spike S2b verified with a row listed last. A tool that still
 * registers first has no recorded owner; the catalog then treats it as unchecked unless a
 * module that claims it provably runs (src/plugin-catalog.js #claimedOwner). Gaps fail closed.
 *
 * The owner map is shared through a global symbol so every copy of this module (a hot reload,
 * the two rows) records into one map; the prototype is wrapped once per ToolRuntime class,
 * so a reloaded dsh-tools is wrapped again rather than silently left unattributed.
 */
import { ToolRuntime } from '@deepseek-ai/dsh-tools'

const OWNERS = Symbol.for('dsh-fishball.tool-attribution')
const WRAPPED = Symbol.for('dsh-fishball.tool-attribution.wrapped')

/** Plugin identity of the attribution row (cordis.patch.yml); it does nothing when applied. */
export const name = 'dsh-fishball-attribution'
export function apply() {}

/** The nearest loader entry owning a context's fiber. */
function entryOf(ctx) {
  let fiber = ctx?.fiber
  while (fiber !== undefined) {
    if (fiber.entry !== undefined) return fiber.entry
    const parent = fiber.parent?.fiber
    if (parent === undefined || parent === fiber) return undefined
    fiber = parent
  }
  return undefined
}

/** definition object -> { rowId, module } of the registering row. */
const owners = (globalThis[OWNERS] ??= new WeakMap())

if (ToolRuntime.prototype.register[WRAPPED] !== true) {
  const original = ToolRuntime.prototype.register
  const register = function register(definition) {
    const entry = entryOf(this.ctx)
    if (entry !== undefined && definition !== null && typeof definition === 'object') {
      owners.set(definition, Object.freeze({ rowId: entry.options.id, module: entry.options.name }))
    }
    return original.call(this, definition)
  }
  register[WRAPPED] = true
  ToolRuntime.prototype.register = register
}

/**
 * The row that registered a tool definition.
 * @param definition - a definition as the registry returns it (`tools.get`).
 * @returns { rowId, module }, or undefined when unknown (treat as unchecked).
 */
export function ownerOf(definition) {
  return definition === undefined ? undefined : owners.get(definition)
}
