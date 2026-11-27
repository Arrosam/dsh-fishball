/**
 * Owner-only Fetch routes for the hosted Fishball onboarding wizard (`client.onboarding.js`).
 * Follows the same `connection.fetch` + explicit `sameOrigin` fence as `child-plugin-routes.js`
 * and `provider-sync-routes.js`:
 * - GET  /api/dsh-instance/onboarding/state    → `{ok: true, completed, needed, childReady, model, catalog}`
 * - POST /api/dsh-instance/onboarding/model    `{provider, model, reasoningEffort?}` → `{ok: true, model}` | `{ok: false, code}`
 * - POST /api/dsh-instance/onboarding/complete `{outcome?: 'completed' | 'skipped'}` → `{ok: true, completed, outcome}` | `{ok: false, code}`
 */
import { CHILD_MODEL, ONBOARDING, REFUSAL } from '../native-runtime/constants.js'
import { normalizeModelSelection } from '../native-runtime/child-model.js'
import { JSON_ROUTE, registerGetRoute, registerPostRoutes, sameOriginJsonHandler, sameOriginJsonPost } from './fetch-routes.js'
import { sameOrigin } from './provider-sync-routes.js'

/** Exact paths; keep in step with `client.onboarding.js`. */
export const ONBOARDING_ROUTE = Object.freeze({
  state: '/api/dsh-instance/onboarding/state',
  model: '/api/dsh-instance/onboarding/model',
  complete: '/api/dsh-instance/onboarding/complete',
  maxBodyBytes: JSON_ROUTE.maxBodyBytes,
  headers: JSON_ROUTE.headers,
  http: JSON_ROUTE.http,
  label: 'dsh-instance: onboarding routes',
})
const R = ONBOARDING_ROUTE
const FIELD = Object.freeze({
  provider: 'provider',
  model: 'model',
  reasoningEffort: 'reasoningEffort',
  outcome: 'outcome',
})
const MODEL_KEYS = Object.freeze([FIELD.provider, FIELD.model, FIELD.reasoningEffort])

function parseModelBody(body) {
  if (!Object.keys(body).every((key) => MODEL_KEYS.includes(key))) return undefined
  if (Object.hasOwn(body, FIELD.reasoningEffort) && body[FIELD.reasoningEffort] !== undefined) {
    if (typeof body[FIELD.reasoningEffort] !== 'string' || body[FIELD.reasoningEffort].trim() === '') return undefined
  }
  return normalizeModelSelection(body) ?? undefined
}

function parseCompleteBody(body) {
  const keys = Object.keys(body)
  if (keys.length === 0) return ONBOARDING.outcome.completed
  if (keys.length === 1 && keys[0] === FIELD.outcome && ONBOARDING.completeOutcomes.includes(body[FIELD.outcome])) {
    return body[FIELD.outcome]
  }
  return undefined
}

/**
 * Registers the onboarding routes on DSH's owner-only Fetch registry.
 * @param ctx - the `dsh-instance` host row context (`connection`)
 * @param onboarding - `createOnboarding()`'s `{state, selectModel, complete}`
 * @returns disposer removing both GET and POST routes
 */
export function registerOnboardingRoutes(ctx, onboarding) {
  const connection = ctx.connection
  const stopGet = registerGetRoute(ctx, {
    path: R.state,
    fetch: sameOriginJsonHandler(connection, sameOrigin, REFUSAL.failed, () => onboarding.state()),
  })
  const stopPost = registerPostRoutes(ctx, [
    {
      path: R.model,
      fetch: sameOriginJsonPost(connection, sameOrigin, {
        failCode: REFUSAL.failed,
        invalidCode: CHILD_MODEL.code.invalidModel,
        maxBodyBytes: R.maxBodyBytes,
        parse: parseModelBody,
        run: (selection) => onboarding.selectModel(selection),
      }),
    },
    {
      path: R.complete,
      fetch: sameOriginJsonPost(connection, sameOrigin, {
        failCode: REFUSAL.failed,
        invalidCode: REFUSAL.invalid,
        maxBodyBytes: R.maxBodyBytes,
        parse: parseCompleteBody,
        run: (outcome) => onboarding.complete(outcome),
      }),
    },
  ], R.label)
  return () => {
    try { stopGet?.() } catch { /* already gone */ }
    try { stopPost?.() } catch { /* already gone */ }
  }
}
