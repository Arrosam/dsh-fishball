/**
 * DSH capability packages Fishball can mount in its private tree (DESIGN §4 "Plugin states").
 * Each entry is one catalog plugin; its rows are copied from DSH's standard Web preset
 * (dsh-web-app/presets/standard.patch.yml) so they behave as in an ordinary session.
 *
 * The catalog gives every row (and group child) a private-tree id prefix per plugin, so rows
 * never collide and attribution can tell which plugin registered a tool (src/row-ids.js).
 *
 * On at first start (DESIGN §4): compaction, web search and page opening, time awareness and
 * reminders. Ask-user, skills and the read-only shell are in the catalog but start off.
 *
 * The Messenger look (DESIGN §10c) is Fishball's own built-in, not a DSH package: it has no rows,
 * so turning it on or off mounts nothing; Fishball's browser half follows its on/off choice
 * (the `look` snapshot field, MESSENGER.pluginKey). On at first start, like the defaults above.
 *
 * Fishball's own plugins (DESIGN §10d "Fishball's own plugins", revision 10c): its own features,
 * so every tool it registers belongs to a plugin. They have no rows either; each part of Fishball
 * follows its plugin's applied state (index.js). `own` puts them in the Fishball group;
 * `asksToEnable` makes Fishball ask you before turning one on, so your off holds (owner's choice).
 * The Messenger look is own too, but Fishball switches it freely: it only changes the chat's look.
 *
 * Not offered: DSH's MCP client. Each MCP server is one row with its own server config, which
 * an on/off catalog cannot supply; MCP servers configured in the profile are host rows, so
 * their tools reach Fishball as profile tools (checked or allowed like any other).
 */
import { CONTEXT } from './constants.js'

const IS_WINDOWS = process.platform === 'win32'

/** Key prefix that marks a catalog key as a built-in. */
export const BUILTIN_PREFIX = 'builtin:'

const builtin = (key, title, defaultOn, rows, extra = {}) => Object.freeze({
  key: BUILTIN_PREFIX + key,
  title,
  defaultOn,
  rows: Object.freeze(rows),
  ...extra,
})

/** Ids of Fishball's own feature plugins (revision 10c). */
const FEATURE_ID = Object.freeze({ messages: 'session-messages', watching: 'session-watching', plugins: 'plugin-management', approvals: 'permission-requests' })

/** Catalog keys of Fishball's own feature plugins, by feature (snapshot `features`). */
export const FEATURE_KEY = Object.freeze(Object.fromEntries(Object.entries(FEATURE_ID).map(([feature, id]) => [feature, BUILTIN_PREFIX + id])))

/** A feature plugin: on by default, no rows, asks you before Fishball turns it on. */
const feature = (id, title) => builtin(id, title, true, [], { own: true, asksToEnable: true })

export const BUILTIN_PLUGINS = Object.freeze([
  feature(FEATURE_ID.messages, 'Session messages'),
  feature(FEATURE_ID.watching, 'Session watching'),
  feature(FEATURE_ID.plugins, 'Plugin management'),
  feature(FEATURE_ID.approvals, 'Permission requests'),
  builtin('compaction', 'Compaction', true, [{
    id: 'group',
    name: 'cordis:group',
    group: true,
    isolate: { compaction: true, toolResultPruner: true },
    config: [
      // DSH's engine with Fishball's summary (src/compaction.js); its config is the derived
      // context-window policy (src/context-window.js), {} meaning DSH's defaults.
      { id: CONTEXT.compactionRow, name: CONTEXT.compactionModule, config: {} },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner', config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 } },
    ],
  }]),
  builtin('web', 'Web search and page opening', true, [
    { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } },
  ]),
  builtin('time', 'Time awareness', true, [{ id: 'time-context', name: '@deepseek-ai/dsh-time-context' }]),
  builtin('reminders', 'Reminders', true, [{ id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' }]),
  builtin('ask-user', 'Ask you a question', false, [{ id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' }]),
  builtin('skills', 'Skills', false, [
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
  ]),
  builtin('shell', 'Read-only shell', false, [
    { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: IS_WINDOWS },
    { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: !IS_WINDOWS },
  ]),
  builtin('messenger', 'Messenger look', true, [], { own: true }),
])