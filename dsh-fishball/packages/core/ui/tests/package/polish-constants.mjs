/**
 * UI-POLISH-F §1 and MULTI-3 requirement F vocabulary (.runtime/reports/ui-polish-f/SPEC.md, the
 * user's feedback of 2026-11-17: "侧边栏的按钮被收到了这里，这是可以的，但是我更乐意看到是按钮的图标…";
 * PLAN-MULTI §6.4). Every expected value is the requirement's; none is read from the implementation.
 * The fake page's own values are ../support/nav-page.mjs NAV_PAGE.
 */

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
  /** SidebarRoot retains the same wide identity until its collapse timer settles. */
  collapseSettleMs: 150,
  /** BVA around the narrow query (max-width: 480px), 390px (PLAN-MULTI §6.3), a mid width and a desktop. */
  widths: Object.freeze({ minimum: 320, narrow: 390, edge: 480, above: 481, mid: 600, desktop: 1280 }),
  focusScrollBudgetMs: 1500,
  height: 844,
  /** A drawer layout (0.2.2-rc.1 and later; frame-layout.mjs DRAWER_LAYOUT) is a drawer below this width (dsh-client-ui-layout AppFrame). */
  drawerBelow: 768,
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
