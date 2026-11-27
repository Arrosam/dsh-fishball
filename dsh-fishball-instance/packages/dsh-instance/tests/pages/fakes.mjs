/**
 * A scripted instance behind the page's fetch, answering the documented route contract (README
 * "Settings page", "Plugins for Fishball", "Model sync"; the routes' JSDoc answers):
 * - GET status → `{state, code, detail, notice, busy}`; `world.status = null` holds every read;
 * - POST retry / restart → the status after it (restart may carry `refused`);
 * - POST reconnect → `{ok}`; POST open `{lang}` → `{ok, url}`;
 * - POST models/check → `{ok, result: {checkId, missing, notOffered, present}}`; models/add → `{ok, result: {items}}`;
 * - GET plugins → `{ok, bundles, protected}`; POST plugins/use and plugins/uninstall → `{ok, name}`.
 * Each handler can be replaced per case; anything else is a 404.
 */
import { json } from '@dsh-instance/test-helpers/page'
import { findAll } from '@dsh-instance/test-helpers/react-shim'
import { CHECK, PROTECTED, RESTART, ROUTE, STATE } from './constants.mjs'

/** A status answer. */
export const statusOf = (state, extra = {}) => ({ state, code: state === STATE.failed ? 'NATIVE_CHILD_EXITED' : null, detail: null, notice: null, ...extra })

export function scriptedInstance(overrides = {}) {
  const world = {
    status: statusOf(STATE.ready, { busy: false }),
    plugins: { ok: true, bundles: [], protected: [...PROTECTED] },
    ...overrides,
  }
  const handlers = {
    ['GET ' + ROUTE.status]: () => (world.status === null ? new Promise(() => {}) : world.status),
    ['POST ' + ROUTE.retry]: () => world.status,
    ['POST ' + ROUTE.restart]: () => world.status,
    ['POST ' + ROUTE.reconnect]: () => ({ ok: true }),
    ['POST ' + ROUTE.open]: () => ({ ok: true, url: 'http://127.0.0.1:47001/fbtest-admission' }),
    ['POST ' + ROUTE.check]: () => ({ ok: true, result: structuredClone(CHECK) }),
    ['POST ' + ROUTE.add]: (request) => ({ ok: true, result: { items: JSON.parse(request.body).ids.map((id) => ({ id, outcome: 'added' })) } }),
    ['GET ' + ROUTE.plugins]: () => world.plugins,
    ['POST ' + ROUTE.use]: (request) => ({ ok: true, name: JSON.parse(request.body).name }),
    ['POST ' + ROUTE.uninstall]: (request) => ({ ok: true, name: JSON.parse(request.body).name }),
    ...(world.handlers ?? {}),
  }
  world.respond = async (request) => {
    const handler = handlers[request.method + ' ' + request.path]
    if (!handler) return new Response('', { status: 404 })
    return json(structuredClone(await handler(request)))
  }
  return world
}

/** Requests of one method and path. */
export const requestsTo = (page, method, path) => page.requests.filter((r) => r.method === method && r.path === path)

/** Restart as a user sees it: 'hidden', 'disabled' or 'enabled' (and never more than one). */
export function restartView(nodes) {
  const buttons = findAll(nodes, (n) => n.tag === 'button' && n.props[RESTART.attr] !== undefined)
  if (buttons.length > 1) throw new Error('more than one Restart: ' + buttons.length)
  if (buttons.length === 0) return 'hidden'
  return buttons[0].props.disabled ? 'disabled' : 'enabled'
}
export const restartButton = (nodes) => findAll(nodes, (n) => n.tag === 'button' && n.props[RESTART.attr] !== undefined)[0]
export const confirmButton = (nodes) => findAll(nodes, (n) => n.props[RESTART.confirmAttr] !== undefined)[0]
/** Open dialogs (DSH's Modal renders nothing while closed). */
export const openDialogs = (nodes) => findAll(nodes, (n) => n.props.role === 'dialog')
export const alerts = (nodes) => findAll(nodes, (n) => n.props.role === 'alert')

/** The Restart rule (README "Settings page"). */
export function expectedRestart(status) {
  if (RESTART.moving.includes(status.state)) return 'disabled'
  if (!RESTART.shown.includes(status.state)) return 'hidden'
  return status.busy === true ? 'disabled' : 'enabled'
}
