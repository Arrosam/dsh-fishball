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
  slot: Object.freeze({ launcher: 'settings.launcher', overlay: 'shell.overlay', chatNode: 'conversation.chat.node' }),
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
  /** MULTI-3: the viewport stand-in (`matchMedia` answers min/max-width queries for it). */
  wideWidth: 1280,
  /** 390px (PLAN-MULTI §6.3) is inside the narrow query (max-width: 480px). */
  narrowWidth: 390,
  /** fishball-page's hide hook (its own [data-fishball-hidden] rule). */
  hiddenHook: 'data-fishball-hidden',
  /** Requirement F: no longer remapped; the other session / workspace shortcuts stay remapped (LITE NATIVE). */
  sidebarToggle: 'sidebar.left.toggle',
  workspacesSlot: 'sidebar.workspaces',
  emptyShadowPriority: -1,
  stillRemapped: Object.freeze(['session.new', 'session.search', 'workspace.add', 'session.rename', 'session.fork', 'session.archive']),
  mediaWidth: /\((max|min)-width:\s*(\d+)px\)/,
  maxWidth: 'max',
  styleTag: 'STYLE',
})

/**
 * MULTI-3 requirement F (PLAN-MULTI §6.4): the frame-layout rows (frame-layout.mjs). DSH's own
 * names (dsh-client-ui-layout AppFrame, dsh-client-ui-sidebar SidebarRoot, the slot keys, both SDKs);
 * the bar's numbers are the requirement's (44px high, max-width 480px; rc.1 drawer below 768px).
 * `data-fbtest-*` are this harness's own handles on the written frame.
 */
export const FRAME_LAYOUT = Object.freeze({
  layoutPkg: 'dsh-client-ui-layout', frameModule: 'AppFrame',
  sidebarPkg: 'dsh-client-ui-sidebar', sidebarModule: 'SidebarRoot',
  slot: Object.freeze({
    sidebar: 'sidebar', panellist: 'sidebar.panellist', workspaces: 'sidebar.workspaces', settings: 'sidebar.settings',
    footer: 'sidebar.footer.action', brandMark: 'sidebar.brand.mark', main: 'main', conversation: 'main.conversation',
  }),
  panelHook: 'data-fbtest-panel', iconHook: 'data-fbtest-icon', settingsHook: 'data-fbtest-settings', workspacesHook: 'data-fbtest-workspaces',
  conversationHook: 'data-fbtest-conversation', newSessionHook: 'data-fbtest-new-session',
  /** DSH's column widths for the frame's grid (AppFrame: rail 56px; the default wide 280px). */
  railWidth: 56, wideWidth: 280,
  barHeight: 44, barInset: 8,
  /** rc.5 retains the same wide identity until its collapse timer settles. */
  collapseSettleMs: 150,
  /** BVA around the narrow query (max-width: 480px), 390px (PLAN-MULTI §6.3), a mid width and a desktop. */
  widths: Object.freeze({ minimum: 320, narrow: 390, edge: 480, above: 481, mid: 600, desktop: 1280 }),
  focusScrollBudgetMs: 1500,
  height: 844,
  /** rc.1's layout is a drawer below this width (dsh-client-ui-layout AppFrame, rc.1 only). */
  drawerBelow: 768,
  drawerSdk: '0.2.2-rc.1',
  /** Both SDKs collapse the sidebar below this width (AppFrame SIDEBAR_AUTO_COLLAPSE). */
  autoCollapseBelow: 1024,
  /** Panels: DSH's own two and a third-party entry; many: enough long entries to overflow 390px. */
  panels: Object.freeze([Object.freeze({ id: 'plugins', label: 'Plugins' }), Object.freeze({ id: 'schedules', label: 'Schedules' }), Object.freeze({ id: 'fbtest-third-party', label: 'Fbtest Third Party' })]),
  manyPanels: 24,
  /** Review amendment (g), user decision 8A: the expanded narrow sheet leaves a 48px gutter. */
  sheetGutter: 48,
  sheetBehaviourTodo: 'E2E-UI (a real DSH page: the sheet\'s close on a gutter pointerdown / Escape and its focus move run against DSH\'s live layout DOM; the frame-layout rows cover the geometry only)',
  /** Geometry tolerance in CSS px (sub-pixel rounding). */
  epsilon: 1,
})
