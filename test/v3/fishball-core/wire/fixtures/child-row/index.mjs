/**
 * MULTI-1 stand-in for the instance's child-side row (`dsh-instance-child`, K3a HOSTED_IMPORT
 * `targetSetting`): a row whose only config is the volatile `targetUrl`, so DSH's settings service
 * lists the namespace as a hosted child's does (contract/k3a-core-seams "settings-target": the real
 * row declares the same volatile field). Besides an optional handoff of one token value at its start (below), it does nothing: no admission.
 * The instance itself is MULTI-2's; core's rows need only the published setting.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const { default: Schema } = await import(pathToFileURL(path.join(process.env.FBTEST_DSH_RUNTIME, '@deepseek-ai', 'schemastery', 'lib', 'index.mjs')).href)

export const name = 'dsh-instance-child'
export const Config = Schema.object({ targetUrl: Schema.string().default('').volatile() })
export const inject = ['credentials']
// The instance's handoff (link.d.ts "Instance (writer)"): a token value written to the child's
// credential reference when the row starts. The value comes from the worker's environment
// (wire/constants.mjs C.handoffEnv), so no token sits in a settings document.
const HANDOFF = Object.freeze({ env: 'FBTEST_HANDOFF_TOKEN', ref: 'DSH_AGENT_TOKEN' })
export async function apply(ctx) {
  const value = process.env[HANDOFF.env]
  if (value) await ctx.credentials.set(HANDOFF.ref, value)
}
