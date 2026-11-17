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

/** UI-POLISH-F (.runtime/reports/ui-polish-f/SPEC.md §4): the model dialog's hooks and each choice's aria-label. */
export const POLISH_MODEL = Object.freeze({
  dialog: 'data-fishball-model-dialog',
  choice: 'data-fishball-model-choice',
  groupRole: 'group',
  /** `<group> / <model>` and `<group> / <model> · <effort>`. */
  label: (group, model, effort) => `${group} / ${model}` + (effort === undefined ? '' : ` · ${effort}`),
})


/**
 * UI-POLISH-F §2: the drawn status card's page (strip.mjs). The strip is a `conversation.input.dock`
 * entry of fishball-ui (`fishball-strip`) that follows `/api/fishball/strip?lang=` (U.route.strip);
 * the hooks are SPEC §2's (unchanged, plus `data-fishball-strip-state` and `-badge`).
 */
export const STRIP_PAGE = Object.freeze({
  slot: 'conversation.input.dock', entryId: 'fishball-strip', route: '/api/fishball/strip', messageEvent: 'message',
  mountKey: 'fbtest-strip', managerSession: 'fbtest-fishball', on: 'on', langs: Object.freeze(['en', 'zh']),
  hook: Object.freeze({
    root: 'data-fishball-strip', state: 'data-fishball-strip-state', badge: 'data-fishball-strip-badge', line: 'data-fishball-strip-line',
    control: 'data-fishball-strip-control', approval: 'data-fishball-strip-approval',
  }),
  role: 'status',
  /** A Connect answer with an approval URL (fixture). */
  approvalUrl: 'https://dsh.test/api/agent/oauth/authorize?state=fbtest-strip',
  approvalOutcome: 'approval-url',
})

/** UI-POLISH-F §4 fixtures: two provider groups, plain models and a model with two efforts (test data). */
export const POLISH_CATALOG = Object.freeze({
  default: Object.freeze({ provider: 'fbtest-p1', model: 'fbtest-alpha' }), routableProviders: Object.freeze(['fbtest-p1', 'fbtest-p2']), failures: Object.freeze([]),
  groups: Object.freeze([
    Object.freeze({ id: 'fbtest-p1', name: 'Fbtest Provider One', models: Object.freeze([Object.freeze({ id: 'fbtest-alpha', name: 'Fbtest Alpha' }), Object.freeze({ id: 'fbtest-beta', name: 'Fbtest Beta' })]) }),
    Object.freeze({ id: 'fbtest-p2', name: 'Fbtest Provider Two', models: Object.freeze([Object.freeze({ id: 'fbtest-think', name: 'Fbtest Thinker', reasoning: Object.freeze({ efforts: Object.freeze([Object.freeze({ id: 'quick', name: 'Fbtest Quick' }), Object.freeze({ id: 'deep', name: 'Fbtest Deep' })]) }) })]) }),
  ]),
})
