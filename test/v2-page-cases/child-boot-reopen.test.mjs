/**
 * CHILD-BOOT-REOPEN: every open of the Fishball child page lands on the Fishball manager session
 * (the user's requirement: "每次从主实例打开Fishball时都自动跳转到Fishball会话页"), in the REAL SDK web
 * boot, across the manager's state transitions and the browser's saved-selection state.
 *
 * Black box. Requirements only (no page implementation was used to derive expectations):
 * - `GET api/fishball/session` -> {sessionId: string|null} names the manager read-only; the page
 *   POSTs (ensure, no model call) when it reads null.
 * - The page marks a ready conversation with `data-fishball-session` on <html>.
 * - V2 accepts (user decision 2026-11-11) that native startup may leave ONE blank session beside
 *   the manager, in the manager's workspace, once the manager has had a turn; later opens add none.
 * - The only requirement is that every open lands on the manager (user decision 2026-11-11,
 *   option A): DSH's own first-boot default workspace and its blank session are accepted as they
 *   are; sessions other than the manager must still be blank.
 * - `#view=settings` (the PG-ORIGIN continuation, read from the fragment) opens Fishball's settings
 *   view as well.
 *
 * Harness (child-boot-support.mjs, child-boot-host.mjs): the selected SDK's own `web` profile on a
 * throwaway home, with the instance's child rows from a staged copy of packages/dsh-instance (native-web
 * with the session route, the page, the settings panel, the session-tools/approvals/app manager
 * chain) plus two fixture rows: a detached `nativeRuntime` (no main DSH) and the scripted fake
 * model as the default model (test/support/fixtures/fake-llm.mjs; no real model, no network).
 * workspace-controller's first-use folder is pointed into the throwaway home, so no SDK first-use
 * default workspace can land in the real Documents folder. A headless Chromium opens DSH's own
 * admission URL; a FRESH open uses a new isolated browser context (Target.createBrowserContext: own
 * cookies and localStorage, as a new origin or browser profile has), a SAME-context reopen reloads
 * the first tab. Session lists come from the host's own session list (sessionController.list,
 * with each row's `blank`), workspaces from workspaceRegistry.list.
 *
 * State machine walked once per SDK, in this order (each case waits for the steps it needs):
 *   S0 no manager --first open (fresh)--> S1 blank manager --manager turn--> S2 manager with a turn
 *   S2 --reload same context--> S2 (case 5) --fresh reopen--> S2' (cases 2, 3)
 *   S2' --fresh reopen--> S2' (case 4) --fresh reopen #view=settings--> S2' (case 6)
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | REOPEN-01 | ST S0→S1; EP selection none | lands on the manager (ready mark; main view = GET id; no status); any session other than the manager is blank. Exclusivity (manager alone in its workspace, no other workspace/session) superseded by the user decision of 2026-11-11 (option A) |
 * | REOPEN-02 | ST S2→S2'; DT (manager has turn × selection none) | fresh reopen lands on the manager |
 * | REOPEN-03 | ST S2→S2'; BVA 0..1 accepted extra session | the reopen adds at most one session; each is blank and in the manager's workspace |
 * | REOPEN-04 | ST S2'→S2'; BVA second fresh reopen | no session beyond those after REOPEN-03; lands on the manager |
 * | REOPEN-05 | ST S2→S2; DT (manager has turn × selection saved) | same-context reload lands on the manager and adds no session |
 * | REOPEN-06 | EP continuation view=settings | lands on the manager, the settings view opens, no session added |
 *
 * Observation limit: "no session added" is read once the page settled (ready mark seen, or the
 * settle budget spent). A native creation scheduled after that point is caught by the next open's
 * comparison (REOPEN-04/06), not by the case that caused it.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, test } from 'node:test'
import { FAKE } from '../support/constants.mjs'
import { until } from '../support/util.mjs'
import { FIXTURES, ROW, childBootEnvironment, openDevtoolsTab, pageRow, stageInstance, stageRow, startHost } from './child-boot-support.mjs'
import { sdkRuntime } from './lite-browser.mjs'
import { SDK_VERSIONS } from './support.mjs'

const REOPEN = Object.freeze({
  homeLabel: 'child-boot-reopen',
  /** The manager chain's rows, as the instance's launch overlay names them (row id -> module in the staged instance). */
  managerRows: Object.freeze([
    Object.freeze({ id: 'fishball-native-web', module: Object.freeze(['native-web.js']), required: true }),
    Object.freeze({ id: 'fishball-native-session-tools', module: Object.freeze(['src', 'slim', 'child', 'session-tools.js']) }),
    Object.freeze({ id: 'fishball-native-approvals', module: Object.freeze(['src', 'slim', 'child', 'approvals.js']) }),
    Object.freeze({ id: 'fishball-native-app', module: Object.freeze(['src', 'slim', 'child', 'app.js']), required: true }),
  ]),
  /**
   * fishball-native-web reads `limits.requestTimeoutMs` only for its parent readiness probe, which
   * no main DSH runs here; the value is a harness bound, not a product setting under test.
   */
  nativeWebConfig: Object.freeze({ limits: Object.freeze({ requestTimeoutMs: 10000 }) }),
  /** The detached nativeRuntime fixture (its comment says what it leaves unobserved). */
  runtimeRow: Object.freeze({ id: 'fbtest-child-manager-runtime', name: path.join(FIXTURES, 'child-manager-runtime-row.mjs') }),
  modelRow: Object.freeze({ id: 'fbtest-llm', name: path.join(FIXTURES, 'fake-llm.mjs') }),
  /** Native row ids (dsh-base / dsh-web-app, both SDKs) configured before the insert. */
  defaultModelRow: 'agent-default-model',
  workspaceControllerRow: 'workspace-controller',
  /** The SDK's first-use workspace folder, kept inside the throwaway home. */
  documentsDir: 'documents',
  turnText: 'fbtest reopen: one manager turn',
  settingsFragment: '#view=settings',
})

/** Requirement vocabulary: the page's ready mark, its navigation, the settings view, the route. */
const PAGE = Object.freeze({
  ready: 'data-fishball-session',
  nav: 'nav[aria-label="fishball-page"]',
  status: '[role="status"]',
  route: 'api/fishball/session',
  /** The native main conversation and the session id it renders (ui-conversation, both SDKs). */
  mainConversation: '[data-slot="main.conversation"] [data-conversation-session]',
  conversationSession: 'data-conversation-session',
  settingsView: '[data-fishball-settings]',
  /** Harness-only window flag set on a document about to be reloaded, so its state is never read as the new one's. */
  staleFlag: '__fbtestReopenStale',
  /**
   * The native current-session selection (ui-workspace's persisted snapshot store, both SDKs;
   * docs/planning/v2-lite.md "Native startup on a reopened page"). Read only, and only where the
   * main conversation is not rendered: an open panel (the settings view) takes the main area.
   */
  nativeSelection: 'dsh.sessions.current',
})

/** Harness budgets (host-side waiting only; none of them is a product oracle). */
const BUDGET = Object.freeze({
  /** A first page load builds and serves every client bundle; the page then reads its route. */
  settleMs: 45000,
  pollMs: 100,
  caseMs: 300000,
})

/** The page's observable state; `manager` is what GET answers at this moment. */
const VIEW_EXPRESSION = `(async () => {
  const nav = document.querySelector(${JSON.stringify(PAGE.nav)});
  const main = document.querySelector(${JSON.stringify(PAGE.mainConversation)});
  let manager;
  try { manager = (await (await fetch(${JSON.stringify(PAGE.route)}, { cache: 'no-store' })).json()).sessionId; } catch (error) { manager = 'GET failed: ' + error; }
  return {
    stale: window[${JSON.stringify(PAGE.staleFlag)}] === true,
    ready: document.documentElement.hasAttribute(${JSON.stringify(PAGE.ready)}),
    main: main ? main.getAttribute(${JSON.stringify(PAGE.conversationSession)}) : null,
    manager,
    statuses: nav ? [...nav.querySelectorAll(${JSON.stringify(PAGE.status)})].map((node) => node.textContent.trim()) : null,
    settings: document.querySelector(${JSON.stringify(PAGE.settingsView)}) !== null,
    selected: (() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(PAGE.nativeSelection)}) ?? 'null')?.sessionId ?? null; } catch { return null; } })(),
  };
})()`

// ---------------------------------------------------------------------------------------------
// Shared environment: one Chromium; one child host and one walk of the state machine per SDK
// ---------------------------------------------------------------------------------------------
const { browser, skipReason, cleanups, ownHome } = childBootEnvironment()
const journeys = new Map()

function childRows(stage) {
  const managerRows = REOPEN.managerRows.map(({ id, module, required }) => ({
    id, name: path.join(stage, ...module), ...(required ? { required } : {}),
    ...(id === REOPEN.managerRows[0].id ? { config: REOPEN.nativeWebConfig } : {}),
  }))
  // The fixtures first: the manager chain injects nativeRuntime and the default model's adapter.
  return [REOPEN.modelRow, REOPEN.runtimeRow, managerRows[0], pageRow(stage), stageRow(stage, ROW.settings), ...managerRows.slice(1)]
}

async function bootChild(sdk) {
  const runtime = sdkRuntime(sdk)
  const home = ownHome(REOPEN.homeLabel)
  const host = await startHost(runtime, home, childRows(stageInstance(home, { runtime })), {
    ipc: true,
    // fake-llm resolves the SDK from FBTEST_DSH_RUNTIME inside the host process.
    env: { FBTEST_DSH_RUNTIME: runtime },
    config: [
      { id: REOPEN.defaultModelRow, config: { provider: FAKE.provider, model: FAKE.model } },
      { id: REOPEN.workspaceControllerRow, config: { documentsDirectory: path.join(home, REOPEN.documentsDir) } },
    ],
  })
  cleanups.push(host.stop)
  return host
}

/** A fresh isolated browser context (no cookie, no saved DSH selection for this origin). */
async function freshContext() {
  const { browserContextId } = await browser().devtools.send('Target.createBrowserContext', {})
  cleanups.push(() => browser().devtools.send('Target.disposeBrowserContext', { browserContextId }))
  return browserContextId
}

/** Wait for the page to settle (ready mark, and the settings view when asked), then read it with the host lists. */
async function settle(host, tab, { settings = false } = {}) {
  const read = () => tab.evaluate(VIEW_EXPRESSION).catch(() => null)
  await until(async () => { const view = await read(); return view && !view.stale && view.ready && (!settings || view.settings) }, BUDGET.settleMs, BUDGET.pollMs)
  return { view: await read(), sessions: await host.call('sessions'), workspaces: await host.call('workspaces') }
}

/**
 * The walk of one SDK. Every step runs once, in the documented order, whichever case asks first;
 * each records the session list before it and the page and host state after it.
 */
function journey(sdk) {
  if (journeys.has(sdk)) return journeys.get(sdk)
  const world = {}
  const hostReady = bootChild(sdk)
  async function open({ hash = '' } = {}) {
    const host = await hostReady
    const sessionsBefore = await host.call('sessions')
    const tab = await openDevtoolsTab(browser().devtools, host.url + hash, { browserContextId: await freshContext() })
    cleanups.push(tab.close)
    return { tab, sessionsBefore, ...(await settle(host, tab, { settings: Boolean(hash) })) }
  }
  const steps = [
    ['first', async () => open()],
    ['turn', async () => {
      const host = await hostReady
      const manager = (await host.call('sessions')).find(({ sessionId }) => sessionId === world.first.view?.manager)
      assert.ok(manager, 'precondition: the first open left a manager the host lists: ' + JSON.stringify(world.first.view))
      const turn = await host.call('turn', { sessionId: manager.sessionId, text: REOPEN.turnText })
      assert.deepEqual(turn, { started: true, idle: true }, 'precondition: one manager turn ran to its end')
      return { sessions: await host.call('sessions') }
    }],
    ['reload', async () => {
      const host = await hostReady
      const sessionsBefore = await host.call('sessions')
      // The ready mark of the previous document must not count as this document's.
      await world.first.tab.evaluate(`window[${JSON.stringify(PAGE.staleFlag)}] = true`)
      await world.first.tab.reload()
      return { sessionsBefore, ...(await settle(host, world.first.tab)) }
    }],
    ['fresh', async () => open()],
    ['freshAgain', async () => open()],
    ['settings', async () => open({ hash: REOPEN.settingsFragment })],
  ]
  let chain = Promise.resolve()
  const reached = new Map()
  for (const [name, run] of steps) {
    chain = chain.then(async () => { world[name] = await run() })
    reached.set(name, chain)
  }
  // A failed step fails every later step's cases with its own error, never silently.
  const result = { reach: async (name) => { await reached.get(name); return world } }
  journeys.set(sdk, result)
  return result
}

// ---------------------------------------------------------------------------------------------
// Oracles
// ---------------------------------------------------------------------------------------------
const ids = (sessions) => sessions.map(({ sessionId }) => sessionId)
const describeSessions = (sessions) => JSON.stringify(sessions.map(({ sessionId, blank, cwd }) => ({ sessionId, blank, cwd })))
const managerWorkspace = (workspaces, manager) => workspaces.find(({ sessionIds }) => sessionIds.includes(manager))
const added = (step) => step.sessions.filter(({ sessionId }) => !ids(step.sessionsBefore).includes(sessionId))

function report(t, label, step) {
  t.diagnostic(`${label} view: ${JSON.stringify(step.view)}`)
  t.diagnostic(`${label} sessions: ${describeSessions(step.sessions)}`)
  t.diagnostic(`${label} workspaces: ${JSON.stringify(step.workspaces)}`)
}

/**
 * "Lands on the manager": the ready mark, the main view on the id GET names, and no status line.
 * With `panel` (the settings view open in the main area, so no conversation is rendered there) the
 * session the main view returns to is the native current selection instead.
 */
function assertShowsManager(step, { panel = false } = {}) {
  const { view } = step
  assert.ok(view, 'the page answered evaluation')
  assert.equal(typeof view.manager, 'string', 'GET names a manager after the open: ' + JSON.stringify(view.manager))
  if (panel) {
    assert.ok([null, view.manager].includes(view.main), 'no conversation other than the manager is rendered in the main area: ' + JSON.stringify(view.main))
    assert.equal(view.selected, view.manager, 'the main view\'s current session (native selection) is the manager GET names')
  } else assert.equal(view.main, view.manager, 'the main conversation shows the manager GET names')
  assert.equal(view.ready, true, `<html> has ${PAGE.ready}`)
  assert.deepEqual(view.statuses, [], 'the page navigation shows no status (no "unavailable" or pending line)')
}

/** Every session in `sessions` is blank (no turn). */
function assertBlank(sessions) {
  assert.deepEqual(sessions.filter(({ blank }) => blank !== true), [], 'every session other than the manager is blank: ' + describeSessions(sessions))
}

function assertAddsNoSession(step) {
  assert.deepEqual(ids(added(step)), [], 'no session was created by this open: ' + describeSessions(added(step)))
}

function reopenCase(id, sdk, title, technique, body) {
  test(`${id} [${sdk}] ${title} (${technique})`, { timeout: BUDGET.caseMs }, async (t) => {
    const reason = skipReason(sdk)
    if (reason) { t.skip(reason); return }
    await body(t, journey(sdk))
  })
}

// ---------------------------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------------------------
for (const sdk of SDK_VERSIONS) {
  describe(`CHILD-BOOT-REOPEN [${sdk}] every open of the child page lands on the Fishball manager`, () => {
    // Superseded by the user's decision of 2026-11-11 ("所以只要在主实例中打开子实例页面的时候让子实例
    // 跳转到Fishball页面就行了", option A): the only requirement is that the open lands on the manager.
    // The former exclusivity checks (the manager is the only session of its workspace; no other
    // workspace or session on the first open, then a todo for DSH's first-use default workspace) are
    // dropped: DSH's own first-boot default workspace and its blank session are accepted as they are.
    // Any other session must still be blank, so a session holding a turn the user did not make fails.
    reopenCase('REOPEN-01', sdk, 'first open with no manager: lands on the manager; any other session is blank', 'ST S0→S1; EP selection none', async (t, walk) => {
      const { first } = await walk.reach('first')
      report(t, 'after first open', first)
      assertShowsManager(first)
      const others = first.sessions.filter(({ sessionId }) => sessionId !== first.view.manager)
      t.diagnostic(`sessions other than the manager after first open: ${describeSessions(others)}`)
      t.diagnostic(`workspaces without the manager after first open: ${JSON.stringify(first.workspaces.filter(({ sessionIds }) => !sessionIds.includes(first.view.manager)))}`)
      assertBlank(others)
    })

    reopenCase('REOPEN-05', sdk, 'reload in the same browser context after a manager turn: lands on the manager, adds no session', 'ST S2→S2; DT turn × selection saved', async (t, walk) => {
      const { reload, turn } = await walk.reach('reload')
      t.diagnostic(`after manager turn sessions: ${describeSessions(turn.sessions)}`)
      report(t, 'after same-context reload', reload)
      assertShowsManager(reload)
      assertAddsNoSession(reload)
    })

    reopenCase('REOPEN-02', sdk, 'fresh-context reopen after a manager turn: lands on the manager', 'ST S2→S2\'; DT turn × selection none', async (t, walk) => {
      const { fresh } = await walk.reach('fresh')
      report(t, 'after fresh reopen', fresh)
      assertShowsManager(fresh)
    })

    reopenCase('REOPEN-03', sdk, 'fresh-context reopen after a manager turn: at most one added session, blank, in the manager\'s workspace', 'ST S2→S2\'; BVA 0..1 accepted extra', async (t, walk) => {
      const { fresh } = await walk.reach('fresh')
      const extra = added(fresh)
      t.diagnostic(`sessions before the reopen: ${describeSessions(fresh.sessionsBefore)}`)
      t.diagnostic(`sessions the reopen added: ${describeSessions(extra)}`)
      assertShowsManager(fresh)
      const manager = fresh.view.manager
      assert.ok(extra.length <= 1, 'at most one session beside the manager was added: ' + describeSessions(extra))
      const home = managerWorkspace(fresh.workspaces, manager)
      assert.ok(home, 'the manager is in a workspace: ' + JSON.stringify(fresh.workspaces))
      assertBlank(extra)
      for (const session of extra) {
        assert.ok(home.sessionIds.includes(session.sessionId), 'the added session is in the manager\'s workspace: ' + JSON.stringify(home))
      }
      const neighbours = home.sessionIds.filter((sessionId) => sessionId !== manager)
      assert.ok(neighbours.length <= 1, 'the manager\'s workspace holds at most one session beside the manager: ' + JSON.stringify(home))
    })

    reopenCase('REOPEN-04', sdk, 'a second fresh-context reopen adds no session and lands on the manager', 'ST S2\'→S2\'; BVA second reopen', async (t, walk) => {
      const { freshAgain } = await walk.reach('freshAgain')
      report(t, 'after second fresh reopen', freshAgain)
      assertAddsNoSession(freshAgain)
      assertShowsManager(freshAgain)
    })

    reopenCase('REOPEN-06', sdk, 'fresh-context reopen with #view=settings: lands on the manager and opens the settings view', 'EP continuation view=settings', async (t, walk) => {
      const { settings } = await walk.reach('settings')
      report(t, 'after settings reopen', settings)
      assertShowsManager(settings, { panel: true })
      assert.equal(settings.view.settings, true, `the settings view (${PAGE.settingsView}) is open`)
      assertAddsNoSession(settings)
    })
  })
}
