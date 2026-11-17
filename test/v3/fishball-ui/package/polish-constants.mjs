/**
 * UI-POLISH-F vocabulary (.runtime/reports/ui-polish-f/SPEC.md, the user's feedback of 2026-11-17:
 * "侧边栏的按钮被收到了这里，这是可以的，但是我更乐意看到是按钮的图标…所有这个插件的UI都需要设计的美观").
 * Every expected value is SPEC.md's; none is read from the implementation. Harness values (the
 * fake page, the native commands) are the LITE harness's (test/v2-page-cases).
 */
import path from 'node:path'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

/** SPEC §1: the Fishball page navigation. */
export const NAV = Object.freeze({
  tag: 'nav',
  className: 'fishball-page-navigation',
  label: 'fishball-page',
  hook: 'data-fishball-nav',
  statusHook: 'data-fishball-nav-status',
  launcherClass: 'fishball-settings-launcher',
  /** The order of the icon buttons (Retry comes after the status, only with one). */
  order: Object.freeze(['settings', 'fishball', 'plugins']),
  retry: 'retry',
  /** aria-label = Tooltip label, per control and language. */
  labels: Object.freeze({
    en: Object.freeze({ settings: 'Settings', fishball: 'Fishball', plugins: 'Plugins', retry: 'Retry' }),
    zh: Object.freeze({ settings: '设置', fishball: 'Fishball', plugins: '插件', retry: '重试' }),
  }),
  /** The status texts (unchanged) and their data-fishball-nav-status words and StateDots. */
  status: Object.freeze({
    unavailable: Object.freeze({ en: 'Fishball session unavailable', zh: 'Fishball 会话不可用', dot: 'error' }),
    failed: Object.freeze({ en: 'Fishball shortcut protection unavailable', zh: 'Fishball 快捷键保护不可用', dot: 'error' }),
    pending: Object.freeze({ en: 'Preparing Fishball shortcut protection', zh: '正在准备 Fishball 快捷键保护', dot: 'ongoing' }),
  }),
  statusRole: 'status',
  haspopup: 'dialog',
  plugins: 'plugins',
  /** DSH's settings shortcut keys a launcher may be given (SettingsLauncherOwnerProps.settingsShortcut; fixture). */
  shortcut: Object.freeze({ keys: Object.freeze(['⌘', ',']), aria: 'Command Comma' }),
})

/** The fake page of the navigation rows (nav-page.mjs): LITE harness values. */
export const NAV_PAGE = Object.freeze({
  pageClient: path.join(V3.ui.dir, 'fishball-page', 'client.js'),
  pageModule: 'fishball-page',
  shortcutsBundle: path.join('@deepseek-ai', 'dsh-client-shortcuts', 'lib', 'client.js'),
  shortcutsModule: '@deepseek-ai/dsh-client-shortcuts',
  sdk: Object.freeze({ cordis: '@deepseek-ai/cordis', store: '@deepseek-ai/dsh-client-store', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  modules: Object.freeze({ react: 'react', reactDom: 'react-dom', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  modalSelector: '[role="dialog"][aria-modal="true"]',
  modalSelectorKey: 'modalSelector',
  baseURI: 'http://fishball-child.test/',
  sessionRoute: '/api/fishball/session',
  manager: 'session-fishball-case',
  other: 'session-other-case',
  langs: Object.freeze(['en', 'zh']),
  platform: 'MacIntel',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  loading: 'loading',
  writeFailed: 'write-failed',
  regions: Object.freeze(['page', 'editable']),
  slot: Object.freeze({ launcher: 'settings.launcher', overlay: 'shell.overlay' }),
  portalTag: 'fbtest-portal',
  portalContainer: 'data-fbtest-container',
  nav: Object.freeze({ tag: 'nav', className: 'fishball-page-navigation', label: 'fishball-page' }),
  /** The native commands the page protects (lite.test.mjs NATIVE, the ids its gate edits). */
  commands: Object.freeze(Object.fromEntries([
    ['session.new', 'KeyN', ['primary', 'alt']], ['session.search', 'KeyK', ['primary', 'alt']], ['workspace.add', 'KeyO', ['primary', 'alt']],
    ['session.rename', 'KeyG', ['primary', 'alt']], ['session.fork', 'KeyF', ['primary', 'shift']], ['session.archive', 'KeyA', ['primary', 'alt']],
    ['sidebar.left.toggle', 'KeyB', ['primary', 'alt']],
  ].map(([id, code, modifiers]) => [id, { 'web:macos': { code, modifiers }, 'web:windows': { code, modifiers } }]))),
  settleRounds: 80,
})
