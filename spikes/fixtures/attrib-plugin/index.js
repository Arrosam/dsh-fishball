/** S2b fixture: installs the register() attribution wrapper at MODULE EVALUATION, as the fishball package would. */
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
const owners = (globalThis.__spikeToolOwners ??= new Map())
function entryOf(ctx) {
  let fiber = ctx.fiber
  while (fiber) { if (fiber.entry) return fiber.entry; const parent = fiber.parent?.fiber; if (!parent || parent === fiber) break; fiber = parent }
  return undefined
}
const original = ToolRuntime.prototype.register
globalThis.__spikeWrapperAt = Date.now()
ToolRuntime.prototype.register = function (definition) {
  const entry = entryOf(this.ctx)
  owners.set(definition.name, entry ? entry.options.name : null)
  return original.call(this, definition)
}
export const name = 'fishball-spike-attrib'
export function apply() { globalThis.__spikeAttribApplied = Date.now() }
