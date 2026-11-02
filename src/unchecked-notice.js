/**
 * "Plugins already on" notice (DESIGN §7): when a plugin that runs for everyone brings tools
 * nobody has checked (a plugin installed or updated later), they stay hidden from Fishball,
 * and Fishball is told so it can ask you with set_plugin_enabled.
 *
 * The notice goes through the intake ledger. Its dedupe key lists the tool versions (module,
 * name, parameter digest) it announces, and a later notice lists only versions no earlier
 * notice row named: each tool version is announced once, across restarts (until its row is
 * pruned beyond auditEntriesKept), and a new or changed tool makes a new notice.
 */
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import { INTAKE_KIND, SOURCE } from './constants.js'
import { authorOf } from './author.js'
import { compoundKey } from './keys.js'
import { diagnosticOf } from './errors.js'

const SOURCE_IDENTITY = 'fishball/unchecked-tools'

const TEXT = Object.freeze({
  summary: (count) => `${count} unchecked plugin tool${count === 1 ? '' : 's'} hidden`,
  body: (tools) => [
    'Fishball notice: these tools come from plugins that run for every session, and nobody has checked them, so they are hidden from you:',
    ...tools.map((tool) => `- ${JSON.stringify(tool.name)} (plugin ${JSON.stringify(tool.plugin)})`),
    'If one would help the user, call set_plugin_enabled with that plugin and on: true; the user is asked to allow them.',
  ].join('\n'),
})

/** One tool version: its module, name and parameter digest. */
const versionOf = (tool) => compoundKey([tool.module, tool.name, tool.digest])

/** Separates tool versions inside one notice's dedupe key. */
const VERSION_SEPARATOR = '\n'

/**
 * @param deps.ledger - IntakeLedger; deps.catalog - PluginCatalog; deps.decisions - () => Map.
 * @param deps.store - Store (intakeItems, to read earlier notices).
 * @param deps.logger - plugin logger.
 * @returns () => void, run whenever the tool set may have changed. Bursts of tool changes
 *   (a remount, lazy registration) coalesce into one evaluation after the current one.
 */
export function uncheckedToolsNotifier({ ledger, catalog, decisions, store, logger }) {
  let running = Promise.resolve()
  let queued = false
  const run = async () => {
    const announced = new Set()
    for (const [, row] of store.intakeItems.entries()) {
      if (row.sourceIdentity === SOURCE_IDENTITY) for (const version of row.dedupeKey.split(VERSION_SEPARATOR)) announced.add(version)
    }
    const tools = catalog.uncheckedProfileTools(decisions()).filter((tool) => !announced.has(versionOf(tool)))
    if (tools.length === 0) return
    tools.sort((a, b) => versionOf(a).localeCompare(versionOf(b)))
    const dedupeKey = tools.map(versionOf).join(VERSION_SEPARATOR)
    const message = createUserMessage({ content: [{ type: 'text', text: TEXT.body(tools) }], source: { ...SOURCE.notice, summary: boundContextSummary(TEXT.summary(tools.length)), author: authorOf(INTAKE_KIND.system) } })
    await ledger.publish({ kind: INTAKE_KIND.system, sourceIdentity: SOURCE_IDENTITY, dedupeKey, message })
  }
  return () => {
    if (queued) return
    queued = true
    running = running.then(() => { queued = false; return run() }).catch((error) => logger.warn('unchecked-tools notice failed (%s)', diagnosticOf(error)))
  }
}
