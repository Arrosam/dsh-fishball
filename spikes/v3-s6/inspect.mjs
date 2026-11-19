/**
 * V3-S6 shared evidence reader: one boot's facts, read only through public host services
 * (loader, plugin inventory, plugin manager, agent presets, permission presets, sandbox policy,
 * client modules, the owner-authenticated web route) plus the core probe's own report.
 */
import { sdkPkg, until } from './harness.mjs'

const SESSION_CREATING = /subagent|workflow|schedule|send_message|list_agents|agent_preset/
const GUARDED_UI = /client-ui-(subagent|schedule|permission-presets|agent-preset|open-in-app|entry-customization|sidebar-terminal)/

/** The owner's session cookie: the launch token is exchanged for it on GET / (dsh-client-connection). */
export async function login(url) {
  const response = await fetch(url, { redirect: 'manual' })
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ')
}

/** One boot's facts, read only through public services, plus the core probe's own report. */
export async function inspect(label, booted, iso) {
  const { ctx } = booted
  await until(() => globalThis.__s6?.checks?.some((check) => check.trigger === 'app-ready'), 15000)
  const probe = globalThis.__s6
  const inventory = (await (await sdkPkg('dsh-host-plugin-inventory')).readPluginInventory(ctx)).entries
  const bundles = (await ctx.pluginManager.listBundles()).filter((bundle) => bundle.name.startsWith('fishball-'))
  const plugins = (await ctx.pluginManager.listPlugins()).filter((row) => row.moduleName.startsWith('fishball-'))
  // A session through DSH's own controller: the preset it runs and the tools its model sees.
  const created = await ctx.sessionController.create({ cwd: iso.cwd })
  const { agent } = await ctx.sessionController.agents.resolveAgent(created.sessionId)
  const sent = (globalThis.__s6Requests ?? []).length
  agent.steer((await sdkPkg('dsh-llm')).createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }))
  await until(() => (globalThis.__s6Requests ?? []).length > sent, 15000)
  await until(() => agent.status === 'idle', 15000)
  const tools = globalThis.__s6Requests.filter((request) => request.sessionId === created.sessionId).flatMap((request) => request.tools)
  const sessionRequests = globalThis.__s6Requests.filter((request) => request.sessionId === created.sessionId).length
  const graph = ctx.clientModules.graph()
  const cookie = await login(booted.url())
  const route = await fetch(new URL('/api/fishball/recommended', new URL(booted.url()).origin), { headers: { cookie } })
  const appReady = probe.checks.find((check) => check.trigger === 'app-ready')
  return {
    label,
    reportAtAppReady: { status: appReady.status, overridden: appReady.overridden },
    policyAtAppReady: probe.last.policy,
    checkTriggers: [...new Set(probe.checks.map((check) => check.trigger))],
    instanceStarted: probe.instanceStarted === true,
    boardStarted: probe.boardStarted === true,
    preflightOrConflictLines: booted.stderr.filter((line) => /disabling profile plugin|skipping profile bundle|patch: entry|conflict|incompatible/i.test(line)).map((line) => line.trim()),
    presetIds: (await ctx.agentPresets.list()).map((preset) => preset.id),
    session: { agentPreset: created.agentPreset, sandbox: ctx.sandboxPolicy.resolve({ session: agent.session }).mode, permission: ctx.permissionPresets.current(agent.session) },
    modelTools: [...new Set(tools)],
    sessionRequests,
    sessionCreatingTools: tools.filter((name) => SESSION_CREATING.test(name)),
    clientGraphFishball: graph.entries.filter((entry) => /fishball/.test(entry.id)).map((entry) => entry.id),
    clientGraphGuardedUi: graph.entries.filter((entry) => GUARDED_UI.test(entry.id)).map((entry) => entry.id),
    inventoryFishball: inventory.filter((entry) => /fishball/.test(entry.moduleName)).map((entry) => ({ entryId: entry.entryId, moduleName: entry.moduleName, enabled: entry.enabled, phase: entry.fiberPhase })),
    pluginManager: {
      bundles: bundles.map((bundle) => ({ name: bundle.name, enabled: bundle.enabled, rows: bundle.rows.map((row) => row.rowId), overrides: bundle.overrides, error: bundle.error })),
      plugins: plugins.map((row) => ({ entryId: row.entryId, moduleName: row.moduleName, patchId: row.patchId, readOnlyReason: row.readOnlyReason })),
    },
    route: { status: route.status, body: route.status === 200 ? await route.json() : (await route.text()).slice(0, 200) },
  }
}

