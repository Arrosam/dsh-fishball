/**
 * Q-C memory probe: RSS of a child-like profile with and without dsh-web-app.
 * Usage: node measure-web.mjs <dsh-version> <home> <variant base|web|web-lite>
 *   base:     dsh-base only (today's child)
 *   web:      dsh-base + dsh-web-app, every row on
 *   web-lite: dsh-base + dsh-web-app, the rows a single-session page does not need disabled
 * Throwaway only: HOME, DSH_HOME and caches live in <home>. Prints one JSON line.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [version, home, variant] = process.argv.slice(2)
const NM = path.join(process.env.SPX_VERSIONS, version, 'node_modules')
process.env.SPX_NM = NM
for (const [key, value] of Object.entries({ HOME: home, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', npm_config_cache: path.join(home, 'npm-cache'), npm_config_userconfig: path.join(home, 'empty.npmrc'), XDG_CONFIG_HOME: path.join(home, 'xdg') })) process.env[key] = value
fs.mkdirSync(home, { recursive: true })
fs.writeFileSync(process.env.npm_config_userconfig, '')
process.chdir(home)

const imp = (spec) => import(pathToFileURL(path.join(NM, spec)).href)
const boot = await imp('@deepseek-ai/dsh-app-boot/lib/index.js')
const { runProfile } = await imp('@deepseek-ai/dsh/lib/profile-boot.js')
const { FAKE } = await import('./fake-llm.mjs')

const BUNDLES = { base: ['@deepseek-ai/dsh-base'], web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], 'web-lite': ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] }
/** Rows a single Fishball session page does not need (sidebars, settings pages, terminal, browser, office). */
const LITE_OFF = ['client-hmr', 'ui-sidebar-right', 'office-to-pdf', 'ui-sidebar-documentpreview', 'ui-sidebar-browser', 'ui-sidebar-terminal', 'ui-sidebar-files', 'terminal-controller', 'ui-settings-general', 'ui-settings-models', 'ui-settings-plugin-inventory', 'ui-settings-session-log', 'ui-settings-plugins', 'ui-settings-shell', 'ui-settings-agent-loop', 'ui-settings-subagent', 'ui-settings-web-search', 'ui-settings-account', 'ui-permission', 'ui-agent-preset', 'ui-workflow-run', 'ui-trajectory', 'desktop-product-telemetry', 'product-analytics', 'open-in-app', 'ui-open-in-app']
const profileDir = path.join(home, 'profiles', 'spx')
boot.initProfile(profileDir, BUNDLES[variant])
const overlay = path.join(home, 'spx.patch.yml')
fs.writeFileSync(overlay, JSON.stringify([
  { id: 'agent-default-model', config: { provider: FAKE.provider, model: FAKE.model } },
  { insert: [{ id: 'spx-fake-llm', name: path.join(import.meta.dirname, 'fake-llm.mjs') }] },
  ...(variant === 'web-lite' ? LITE_OFF.map((id) => ({ id, disabled: true })) : []),
], null, 2))
const started = Date.now()
const { ctx } = await runProfile({ environment: boot.loadLayeredEnv('dsh'), profile: 'spx', patchFiles: [overlay], args: ['--host', '127.0.0.1', '--port', '0', '--no-open'] })
const readyMs = Date.now() - started
await new Promise((resolve) => setTimeout(resolve, 4000))
const rows = [...(ctx.get('loader')?.entries?.values?.() ?? [])].filter((e) => !e.disabled).length
console.log(JSON.stringify({ version, variant, readyMs, rssMB: Math.round(process.memoryUsage().rss / 1048576), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576), rows, webServer: ctx.get('webServer') !== undefined }))
process.exit(0)
