/**
 * V3-S6 round 2, boot 4: a NEW process on the decided home resumes the manager session that boot 3
 * created, through DSH's session controller (the page's path). It must come back on `fishball`,
 * read-only, with no session-creating tool, and the discarded leftover must stay out of the list.
 * Env: SDK, S6_HOME, S6_MANAGER (the session id boot 3 printed), S6_LEFTOVER (the discarded id). Writes results/decided-4-<sdk>.json.
 */
import { boot, isolateHome, record, sdkPkg, until } from './harness.mjs'

const SESSION_CREATING = /subagent|workflow|schedule|send_message|list_agents|agent_team|agent_preset/
const ANSWER_MS = 15000
const iso = isolateHome('decided', process.env.S6_HOME)
const sessionId = process.env.S6_MANAGER
globalThis.__s6 = { checks: [] }
const { ctx } = await boot(iso)
await until(() => globalThis.__s6.checks.some((check) => check.trigger === 'app-ready'), ANSWER_MS)

const resolved = await ctx.sessionController.agents.resolveAgent(sessionId)
const outcome = { resolve: resolved.agent === undefined ? (resolved.error?.code ?? 'no-agent') : 'resumed' }
if (resolved.agent !== undefined) {
  const agent = resolved.agent
  const sent = (globalThis.__s6Requests ?? []).length
  agent.steer((await sdkPkg('dsh-llm')).createUserMessage({ content: [{ type: 'text', text: 'again' }], source: { kind: 'user' } }))
  outcome.answered = await until(() => (globalThis.__s6Requests ?? []).slice(sent).some((request) => request.sessionId === sessionId), ANSWER_MS)
  await until(() => agent.status === 'idle', ANSWER_MS)
  const tools = [...new Set(globalThis.__s6Requests.slice(sent).filter((request) => request.sessionId === sessionId).flatMap((request) => request.tools))]
  outcome.tools = tools
  outcome.sessionCreatingTools = tools.filter((name) => SESSION_CREATING.test(name))
  // rc.1 exposes presetForSession; both SDKs record the preset in the durable session meta (dsh-session types).
  outcome.agentPreset = ctx.agentPresets.presetForSession?.(agent.session) ?? agent.session.meta?.agentPreset ?? null
  outcome.sandbox = ctx.sandboxPolicy.resolve({ session: agent.session }).mode
  outcome.permission = ctx.permissionPresets.current(agent.session)
}
const listed = (await ctx.sessionController.list({}, AbortSignal.timeout(ANSWER_MS))).items.map((item) => item.sessionId ?? item.id)
outcome.listedSessions = listed.length
outcome.managerListed = listed.includes(sessionId)
outcome.leftoverListed = process.env.S6_LEFTOVER === undefined ? 'n/a' : listed.includes(process.env.S6_LEFTOVER)
// The session list keeps archived sessions; the discard lives in the workspace archive set (first follow frame).
const abort = new AbortController()
for await (const frame of ctx.workspaceController.follow(abort.signal)) {
  if (frame.type === 'baseline') outcome.leftoverArchivedAfterRestart = frame.value.archivedSessionIds.includes(process.env.S6_LEFTOVER)
  break
}
abort.abort()
record('decided-4', outcome)
process.exit(0)
