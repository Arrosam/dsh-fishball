/**
 * What an agent needs to call session_start correctly (DISCOVERY-TOOLS): the registered workspaces
 * (`workspaces_list`) and the models of DSH's live catalog (`models_list`). Both read DSH at call
 * time and keep nothing: the catalog is the one session_start validates against (model-catalog.js),
 * and a workspace's `available` is the same directory check session_start's `placeOf` applies
 * (folder.js), so a listed choice is one session_start accepts.
 *
 * Neither is scoped to managed sessions: both describe this DSH, not a session. Whether to scope or
 * hide workspaces per agent is a product decision not taken (see the package README).
 */
import { REFUSAL } from '../../mcp-schema/index.js'
import { RefusalError } from '../errors.js'
import { modelCatalog, modelRoute, reasoningEffortsOf } from '../model-catalog.js'
import { isDirectory } from './folder.js'

/** `fields` without the keys whose value is undefined (optional output fields stay absent). */
const defined = (fields) => Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))

/** DSH's ModelCatalog → models_list's fields. A provider failure's message is never passed on. */
export function modelsOf(catalog) {
  return {
    models: catalog.groups.flatMap((group) => group.models.map((model) => defined({
      model: modelRoute(group.id, model.id),
      provider: group.id,
      providerName: group.name,
      name: model.name,
      reasoningEfforts: reasoningEffortsOf(model),
      defaultReasoningEffort: model.reasoning?.defaultEffort,
    }))),
    defaultModel: defined({ model: modelRoute(catalog.default.provider, catalog.default.model), reasoningEffort: catalog.default.reasoningEffort }),
    unavailableProviders: catalog.failures.map((failure) => ({ provider: failure.id, providerName: failure.name })),
  }
}

/**
 * @param ctx - the row's context (`sessionController`, `workspaceRegistry`)
 * @returns `{models: {list}, workspaces: {list}}`, the discovery part of C-TOOLS' domain port
 */
export function createDiscovery(ctx) {
  return Object.freeze({
    models: Object.freeze({
      async list() {
        let catalog
        // As session_start's model check: a catalog DSH cannot read now is feature-off.
        try { catalog = await modelCatalog(ctx) } catch { throw new RefusalError(REFUSAL.featureOff) }
        return modelsOf(catalog)
      },
    }),
    workspaces: Object.freeze({
      list: () => Promise.all(ctx.workspaceRegistry.list().map(async (workspace) => ({
        workspaceId: workspace.id, title: workspace.title, path: workspace.path, available: await isDirectory(workspace.path),
      }))),
    }),
  })
}
