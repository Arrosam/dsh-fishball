import path from 'node:path'
import { PAGE_STREAM } from '../stream/event-source.mjs'
export const U = Object.freeze({
  id: 'fishball-ui', core: 'fishball-core', row: 'ui-model-selection', missingRow: 'fishball-ui-core-missing',
  client: path.resolve(import.meta.dirname, '../../../../packages/core/ui/client.js'),
  base: 'http://127.0.0.1:19191/', lang: ['en', 'zh'], revision: 'wire-test',
  catalog: { default: { provider: 'fishball-test', model: 'test-model' }, routableProviders: ['fishball-test'], groups: [{ id: 'fishball-test', name: 'Test Provider', models: [{ id: 'test-model', name: 'Wire Model Alpha' }, { id: 'test-model-b', name: 'Wire Model Beta' }] }], failures: [] },
  route: { strip: '/api/fishball/strip?lang=' },
  actions: ['connect', 'cancel'],
  success: 200, bad: [400, 409], unavailable: 503, sse: 'text/event-stream',
  dialogs: ['dialog', 'alertdialog'], button: 'button', chooser: 'select', option: 'option',
  dismiss: /dismiss|later|cancel|close|稍后|取消|关闭/i, settings: /settings|设置/i,
  empty: /no .*models?|models?.*(?:configured|available)|没有.*模型|未配置.*模型/i,
  modelNames: ['Wire Model Alpha', 'Wire Model Beta'],
  // Removed legacy in-page model dialog identifiers (superseded by dsh-instance onboarding, 2026-11-25).
  removedDialog: Object.freeze({
    chunk: 'client.model.js',
    entryId: 'fishball-ui.model-dialog',
    attr: 'data-fishball-model-dialog',
  }),
  slots: ['main', 'conversation.session.header.actions', 'shell.overlay'],
  // fishball-page's public root mark: `<html data-fishball-page>` while the Fishball page is open
  // (fishball-ui/fishball-page; CHILD-BOOT-03).
  pageMark: 'data-fishball-page', pageMarkValue: '',
  /** DSH's `Modal` primitive (@deepseek-ai/dsh-client-ui-primitives): its name and the props Modal uses. */
  modal: { primitive: 'Modal', role: 'dialog', heading: 'h2', text: 'p', div: 'div' },
  timeout: 10000, first: 0, one: 1, encoding: 'utf8', emptyText: '',
})

/**
 * UI-POLISH-F §2: the drawn status card's page (strip.mjs). The strip is a `conversation.input.dock`
 * entry of fishball-ui (`fishball-strip`) that followed `/api/fishball/strip?lang=` (U.route.strip);
 * since the image-loop fix (2026-11-22) that frame arrives on the page's one connection
 * (`route`, /api/fishball/page/events) under the topic `topic` ('strip').
 * The hooks are SPEC §2's (unchanged, plus `data-fishball-strip-state` and `-badge`).
 */
export const STRIP_PAGE = Object.freeze({
  slot: 'conversation.input.dock', entryId: 'fishball-strip', route: PAGE_STREAM.path, topic: PAGE_STREAM.topic.strip, messageEvent: 'message',
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
