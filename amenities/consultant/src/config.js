import Schema from '@deepseek-ai/schemastery'
import { DEFAULTS } from './constants.js'

const string = () => Schema.string().default('').volatile()
const budget = (fallback) => Schema.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(fallback).volatile()
export const Config = Schema.object({
  targetId: string(), endpointEpoch: string(), workspaceId: string(), model: string(), reasoningEffort: string(),
  paused: Schema.boolean().default(DEFAULTS.paused).volatile(),
  asksPerSubject: budget(DEFAULTS.asksPerSubject), asksPerDay: budget(DEFAULTS.asksPerDay),
})

// Volatile DSH settings are live references; reread before reserving and before dispatch.
export const snapshotConfig = (config) => Object.fromEntries(Object.keys(DEFAULTS).map((key) => {
  const value = config?.[key]
  return [key, typeof value?.get === 'function' ? value.get() : value]
}))
