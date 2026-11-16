import path from 'node:path'
export const U = Object.freeze({
  id: 'fishball-ui', core: 'fishball-core', row: 'ui-model-selection', missingRow: 'fishball-ui-core-missing',
  client: path.resolve(import.meta.dirname, '../../../../packages/fishball-ui/client.js'),
  base: 'http://127.0.0.1:19191/', lang: ['en', 'zh'], revision: 'wire-test',
  catalog: { default: { provider: 'fishball-test', model: 'test-model' }, routableProviders: ['fishball-test'], groups: [{ id: 'fishball-test', name: 'Test Provider', models: [{ id: 'test-model', name: 'Wire Model Alpha' }, { id: 'test-model-b', name: 'Wire Model Beta' }] }], failures: [] },
  route: { strip: '/api/fishball/strip?lang=' },
  actions: ['connect', 'cancel'],
  success: 200, bad: [400, 409], unavailable: 503, sse: 'text/event-stream',
  dialogs: ['dialog', 'alertdialog'], button: 'button', chooser: 'select', option: 'option',
  dismiss: /dismiss|later|cancel|close|稍后|取消|关闭/i, settings: /settings|设置/i,
  empty: /no .*models?|models?.*(?:configured|available)|没有.*模型|未配置.*模型/i,
  modelNames: ['Wire Model Alpha', 'Wire Model Beta'],
  // The dialog is a list-slot entry of DSH's `shell.overlay` ({name: 'shell.overlay', id:
  // 'fishball-ui.model-dialog'}), registered while core's namespace is served (F-WIRE lead, 2026-11-17).
  slots: ['main', 'conversation.session.header.actions', 'shell.overlay'],
  // fishball-page's public root mark: `<html data-fishball-page>` while the Fishball page is open
  // (fishball-ui/fishball-page; CHILD-BOOT-03). The dialog shows only while it is present.
  pageMark: 'data-fishball-page', pageMarkValue: '',
  /** DSH's `Modal` primitive (@deepseek-ai/dsh-client-ui-primitives): its name and the props the dialog uses. */
  modal: { primitive: 'Modal', role: 'dialog', heading: 'h2', text: 'p', div: 'div' },
  timeout: 10000, first: 0, one: 1, encoding: 'utf8', emptyText: '',
  todo: 'E2E-CORE: actual browser page reload, focus/accessibility and settings launcher navigation',
})
