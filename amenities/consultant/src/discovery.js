import { SEAM_TARGETS, UI_SEAM } from 'fishball-shared/ui-seam'
import { C, ID, refuse } from './constants.js'
import { clip, id, matches, route } from './shapes.js'

// Never acquire a handle to session creation, message, status or stop. These two public calls
// are read-only catalog metadata, not a source of proof or an advisory transport.
const TOOLS = Object.freeze({ workspaces: 'workspaces_list', models: 'models_list' })
const TOOLS_ALLOWED = Object.values(TOOLS)
const SELECTOR_KEYS = ['targetId', 'endpointEpoch']
const MAX_LABEL = 256
const empty = () => ({ workspaces: [], models: [], complete: false })
const labelOf = (value, fallback) => typeof value === 'string' && value.trim() ? clip(value, MAX_LABEL) : fallback

export function createDiscovery(getInstance) {
  function targets(instance) {
    return (instance?.[UI_SEAM.member]?.[SEAM_TARGETS.member]?.list().targets ?? []).map(({ targetId, endpointEpoch, name, state }) => ({ targetId, endpointEpoch, name: labelOf(name, targetId), state }))
  }
  return async function discover(selector) {
    const instance = getInstance(), all = targets(instance)
    const base = { targets: all, ...empty() }
    const blocked = (reason) => ({ ...base, status: refuse(C.unavailable, { reason }) })
    if (!instance) return blocked('missing-core')
    if (!SELECTOR_KEYS.every((key) => id(selector[key]))) return base
    const { targetId, endpointEpoch } = selector
    Object.assign(base, { targetId, endpointEpoch })
    const isCurrent = () => getInstance() === instance && targets(instance).some((target) => target.state === 'connected' && matches(target, selector, SELECTOR_KEYS))
    if (!isCurrent()) return blocked('target-unavailable')
    try {
      const bridge = instance.bridge(ID, TOOLS_ALLOWED, { targetId, endpointEpoch })
      if (!TOOLS_ALLOWED.every((name) => bridge.supports(name))) return blocked('target-unavailable')
      const [catalog, placement] = await Promise.all([bridge.call(TOOLS.models), bridge.call(TOOLS.workspaces)])
      if (!isCurrent() || catalog?.ok !== true || placement?.ok !== true
        || !Array.isArray(catalog.models) || !Array.isArray(catalog.unavailableProviders) || !Array.isArray(placement.workspaces)) return blocked('target-unavailable')
      const models = catalog.models.filter((item) => route(item?.model) && id(item.provider) && Array.isArray(item.reasoningEfforts)).map((item) => ({
        id: item.model, label: labelOf(item.name, item.model), reasoningEfforts: [...new Set(item.reasoningEfforts.filter(id))], available: true,
      }))
      const workspaces = placement.workspaces.filter((item) => id(item?.workspaceId) && item.available === true).map((item) => ({ id: item.workspaceId, name: labelOf(item.title, item.workspaceId) }))
      const unavailableProviders = catalog.unavailableProviders.filter((item) => id(item?.provider)).map((item) => ({ id: item.provider }))
      return { ...base, models, workspaces, unavailableProviders, complete: models.length === catalog.models.length && unavailableProviders.length === catalog.unavailableProviders.length }
    } catch { return blocked('target-unavailable') }
  }
}
