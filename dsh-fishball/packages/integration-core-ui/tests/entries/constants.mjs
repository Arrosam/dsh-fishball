/**
 * Values of the header-entry rows: F-SETTINGS requirements 7, 8, 10 and the F-UI interface (items 8–9: the
 * header-action ids and orders, the locale namespace), UI-POLISH-F §5 (labels, side, glyphs), DSH's page
 * contracts (the launcher fishball-page portals, the session mark). Copied from the old core settings suite.
 */
export const ENTRIES = Object.freeze({
  clientExport: './client', lang: 'en', langs: Object.freeze(['en', 'zh']),
  pageMark: 'data-fishball-page', sessionMark: 'data-fishball-session', again: 'again',
  hook: 'data-fishball-settings-entry', which: Object.freeze({ fishball: 'fishball', dsh: 'dsh' }),
  action: Object.freeze({ fishball: Object.freeze({ id: 'fishball-core-settings', order: 90 }), dsh: Object.freeze({ id: 'fishball-dsh-settings', order: 91 }) }),
  locale: 'fishball-ui-entries',
  launcherTag: 'button', launcherClass: 'fishball-settings-launcher', click: 'click',
  continuation: '#view=settings', otherPanel: 'fbtest-other-panel',
  fragments: Object.freeze([['empty', ''], ['plugins', '#view=plugins'], ['case', '#view=Settings'], ['suffix', '#view=settings2'], ['lang only', '#lang=zh'], ['bare', '#settings']]),
  queryBase: 'http://scripted.test/?view=settings',
  configForms: 'configForms',
  button: 'button', svg: 'svg',
  labels: Object.freeze({ en: Object.freeze({ fishball: 'Fishball settings', dsh: 'DSH settings' }), zh: Object.freeze({ fishball: 'Fishball 设置', dsh: 'DSH 设置' }) }),
  side: 'bottom', haspopup: 'dialog',
  glyph: Object.freeze({ fishball: /^IconSliders/, dsh: /^IconSettings/ }),
})
