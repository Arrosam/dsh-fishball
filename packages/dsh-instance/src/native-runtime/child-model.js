/**
 * The `child-model` channel of the lifecycle wire: lets the main host's onboarding wizard read
 * the child's available model catalog and `fishball-core`'s current `model` setting, and write a
 * chosen `{provider, model, reasoningEffort?}` selection.
 *
 * No Fishball-side code is imported: the child end talks only to DSH's own `settings` service
 * (namespace `fishball-core`, path `['model']`) and `sessionController.modelCatalog()`.
 */
import { CHILD_MODEL, REFUSAL, NativeRuntimeError } from './constants.js'
import { createChannelClient, createChannelReceiver, isRecord } from './channel-rpc.js'

const { op: OP, code: CODE } = CHILD_MODEL
const unavailable = () => new NativeRuntimeError(CODE.unavailable)
const nonEmpty = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : '')

/**
 * Normalizes a model selection to `{provider, model, reasoningEffort?}`, or `null` when unset or
 * incomplete (missing provider or model). Extra properties are dropped.
 */
export function normalizeModelSelection(value) {
  if (!isRecord(value)) return null
  const provider = nonEmpty(value.provider)
  const model = nonEmpty(value.model)
  if (provider === '' || model === '') return null
  const reasoningEffort = nonEmpty(value.reasoningEffort)
  return reasoningEffort === '' ? { provider, model } : { provider, model, reasoningEffort }
}

/**
 * Sanitizes DSH's live `ModelCatalog` to the minimal plain JSON shape needed by the model picker
 * (`{groups: [{id, name, models: [{id, name, reasoning?: {efforts: [{id, name}]}}]}]}`), or `null`.
 */
export function sanitizeCatalog(catalog) {
  if (!isRecord(catalog) || !Array.isArray(catalog.groups)) return null
  const groups = []
  for (const group of catalog.groups) {
    if (!isRecord(group)) continue
    const id = nonEmpty(group.id)
    if (id === '' || !Array.isArray(group.models)) continue
    const name = nonEmpty(group.name) || id
    const models = []
    for (const entry of group.models) {
      if (!isRecord(entry)) continue
      const modelId = nonEmpty(entry.id)
      if (modelId === '') continue
      const modelName = nonEmpty(entry.name) || modelId
      const rawEfforts = Array.isArray(entry.reasoning?.efforts) ? entry.reasoning.efforts : []
      const efforts = rawEfforts
        .filter((effort) => isRecord(effort) && nonEmpty(effort.id) !== '')
        .map((effort) => ({ id: nonEmpty(effort.id), name: nonEmpty(effort.name) || nonEmpty(effort.id) }))
      models.push(efforts.length === 0 ? { id: modelId, name: modelName } : { id: modelId, name: modelName, reasoning: { efforts } })
    }
    if (models.length > 0) groups.push({ id, name, models })
  }
  return { groups }
}

/** Finds `fishball-core`'s settings descriptor from DSH's `settings.describe(...)` array. */
async function findCoreDescriptor(settings) {
  const descriptors = await Promise.resolve(settings.describe({ redactSecrets: true }))
  if (!Array.isArray(descriptors)) return undefined
  return descriptors.find((entry) => isRecord(entry) && entry.ns === CHILD_MODEL.settingsNamespace)
}

/**
 * The host's end, over the current wire's transport.
 * @param transport - `{send(text), onMessage(fn) → dispose, onClose(fn) → dispose}`
 * @param {{timeoutMs: number}} options
 * @returns {{read(): Promise<{namespacePresent: boolean, model: object|null, catalog: object|null}>, set(selection: object): Promise<{ok: true, model: object}|{ok: false, code: string}>, close(): void}}
 */
export function createChildModelClient(transport, { timeoutMs }) {
  const rpc = createChannelClient(transport, CODE.unavailable)
  return Object.freeze({
    async read() {
      const reply = await rpc.request({ op: OP.read }, timeoutMs)
      if (reply.ok !== true || typeof reply.namespacePresent !== 'boolean') throw unavailable()
      return {
        namespacePresent: reply.namespacePresent,
        model: normalizeModelSelection(reply.model),
        catalog: sanitizeCatalog(reply.catalog),
      }
    },
    async set(selection) {
      const normalized = normalizeModelSelection(selection)
      if (normalized === null) return { ok: false, code: CODE.invalidModel }
      const reply = await rpc.request({ op: OP.set, selection: normalized }, timeoutMs)
      if (reply.ok === true) {
        const saved = normalizeModelSelection(reply.model) ?? normalized
        return { ok: true, model: saved }
      }
      return { ok: false, code: typeof reply.code === 'string' ? reply.code : CODE.writeFailed }
    },
    close: () => rpc.close(),
  })
}

/**
 * The child's end (mounted by `child-row.js`).
 * @param {{settings: object, getCatalog: () => Promise<object|undefined>|object|undefined}} deps
 * @returns {{attach(transport): void, close(): void}}
 */
export function createChildModelReceiver({ settings, getCatalog }) {
  async function answer(request) {
    if (request.op === OP.read) {
      const [descriptor, rawCatalog] = await Promise.all([
        findCoreDescriptor(settings).catch(() => undefined),
        Promise.resolve().then(() => getCatalog?.()).catch(() => null),
      ])
      return {
        ok: true,
        namespacePresent: descriptor !== undefined,
        model: normalizeModelSelection(descriptor?.value?.[CHILD_MODEL.path[0]]),
        catalog: sanitizeCatalog(rawCatalog),
      }
    }
    if (request.op === OP.set) {
      const selection = normalizeModelSelection(request.selection)
      if (selection === null) return { ok: false, code: CODE.invalidModel }
      const descriptor = await findCoreDescriptor(settings)
      if (descriptor === undefined) return { ok: false, code: CODE.namespaceMissing }
      try {
        await settings.mutate(
          CHILD_MODEL.settingsNamespace,
          [{ op: CHILD_MODEL.mutateOp, path: [...CHILD_MODEL.path], value: selection }],
          descriptor.revision,
        )
      } catch {
        return { ok: false, code: CODE.writeFailed }
      }
      return { ok: true, model: selection }
    }
    return { ok: false, code: REFUSAL.invalid }
  }
  return createChannelReceiver(answer, (request) => ({ ok: false, code: request.op === OP.set ? CODE.writeFailed : REFUSAL.invalid }))
}
