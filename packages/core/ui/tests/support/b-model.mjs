/**
 * F-WIRE / UI-POLISH-F §4 / R-FIX-FUI F4: the model dialog's page (port-ui-b), over ./ui-page.mjs.
 *
 * fishball-ui's real client alone in the scripted DSH page. What core and DSH would provide is
 * scripted: core's settings namespace `fishball-core` (`model` set or unset; the dialog writes it
 * through DSH's configForms, recorded in `world.mutations`), DSH's `remote.session.modelCatalog()`
 * (provided as DSH's gateway provides a Remote namespace, its own `remote.session` service under
 * Cordis's inject rule: scripted-page `remoteSession`), DSH's Modal primitive (the helpers' faithful
 * stand-in: `role="dialog"`, title, description, children, footer and a close button named by
 * `closeLabel`), and DSH's native Settings launcher (`button.fishball-settings-launcher` in the
 * document, whose clicks are counted, as fishball-page portals it).
 *
 * Page open (code review, F-WIRE): the Fishball page is open while `<html data-fishball-page>` is
 * present (fishball-page's public root mark); `openPage()` / `closePage()` set and remove it.
 */
import { DSH_PAGE } from 'fishball-test-helpers/scripted-page'
import { findAll, textOf } from 'fishball-test-helpers/react-shim'
import { uiPage } from './ui-page.mjs'

/** F-WIRE (lead, 2026-11-16/17) and UI-POLISH-F SPEC §4: the dialog's seam, slots and words. */
export const MODEL = Object.freeze({
  /** Core's settings namespace and the path the dialog writes (F-WIRE: "Only core's settings choose the model"). */
  namespace: 'fishball-core',
  path: Object.freeze(['model']),
  /** The members a selection may carry. */
  selectionKeys: Object.freeze(['provider', 'model', 'reasoningEffort']),
  /** A configured selection (fixture). */
  selection: Object.freeze({ provider: 'fishball-test', model: 'test-model-b' }),
  // The dialog is a list-slot entry of DSH's `shell.overlay` (F-WIRE lead, 2026-11-17), registered while
  // core's namespace is served; page-open dialogs may also be portal children of any main entry.
  slots: Object.freeze([DSH_PAGE.slot.main, DSH_PAGE.slot.headerActions, 'shell.overlay']),
  pageMark: 'data-fishball-page',
  dialogRoles: Object.freeze(['dialog', 'alertdialog']),
  dialogTag: 'dialog',
  button: 'button',
  chooser: 'select',
  option: 'option',
  langs: Object.freeze(['en', 'zh']),
  dismiss: /dismiss|later|cancel|close|稍后|取消|关闭/i,
  settings: /settings|设置/i,
  save: /save|choose|confirm|select|保存|选择|确认/i,
  empty: /no .*models?|models?.*(?:configured|available)|没有.*模型|未配置.*模型/i,
  /** DSH's native Settings launcher as fishball-page portals it (F-SETTINGS requirement 7). */
  launcherClass: 'fishball-settings-launcher',
  launcherTag: 'button',
  click: 'click',
  focus: 'focus',
  /** UI-POLISH-F §4 hooks. */
  dialogHook: 'data-fishball-model-dialog',
  choiceHook: 'data-fishball-model-choice',
  groupRole: 'group',
  alertRole: 'alert',
  /** `<group> / <model>` and `<group> / <model> · <effort>`. */
  label: (group, model, effort) => `${group} / ${model}` + (effort === undefined ? '' : ` · ${effort}`),
  /** R-FIX-FUI F4: the retry control and the loading state. */
  retry: Object.freeze({ hook: 'data-fishball-model-retry', label: Object.freeze({ en: 'Try again', zh: '重试' }), loading: 'loading' }),
})

/** Test catalogs in DSH's public `modelCatalog()` shape (both SDKs). */
export const CATALOG = Object.freeze({
  wire: Object.freeze({
    default: Object.freeze({ provider: 'fishball-test', model: 'test-model' }), routableProviders: Object.freeze(['fishball-test']), failures: Object.freeze([]),
    groups: Object.freeze([Object.freeze({ id: 'fishball-test', name: 'Test Provider', models: Object.freeze([Object.freeze({ id: 'test-model', name: 'Wire Model Alpha' }), Object.freeze({ id: 'test-model-b', name: 'Wire Model Beta' })]) })]),
  }),
  wireNames: Object.freeze(['Wire Model Alpha', 'Wire Model Beta']),
  /** UI-POLISH-F §4: two provider groups, plain models and a model with two efforts. */
  polish: Object.freeze({
    default: Object.freeze({ provider: 'fbtest-p1', model: 'fbtest-alpha' }), routableProviders: Object.freeze(['fbtest-p1', 'fbtest-p2']), failures: Object.freeze([]),
    groups: Object.freeze([
      Object.freeze({ id: 'fbtest-p1', name: 'Fbtest Provider One', models: Object.freeze([Object.freeze({ id: 'fbtest-alpha', name: 'Fbtest Alpha' }), Object.freeze({ id: 'fbtest-beta', name: 'Fbtest Beta' })]) }),
      Object.freeze({ id: 'fbtest-p2', name: 'Fbtest Provider Two', models: Object.freeze([Object.freeze({ id: 'fbtest-think', name: 'Fbtest Thinker', reasoning: Object.freeze({ efforts: Object.freeze([Object.freeze({ id: 'quick', name: 'Fbtest Quick' }), Object.freeze({ id: 'deep', name: 'Fbtest Deep' })]) }) })]) }),
    ]),
  }),
  refusal: Object.freeze({ ok: false, error: Object.freeze({ message: 'fbtest refused' }) }),
  rejection: 'fbtest catalog rejects',
})
/** An empty catalog (BVA: zero models). */
export const emptyCatalog = () => ({ ...CATALOG.wire, groups: [], routableProviders: [] })

const isDialog = (n) => MODEL.dialogRoles.includes(n.props.role) || n.tag === MODEL.dialogTag

/**
 * One loaded page with fishball-ui's slots mounted.
 * @param options.open - whether the Fishball page is open (`<html data-fishball-page>`; default true).
 * @param options.model - core's configured `model`, or undefined for unset.
 * @param options.catalog - what `modelCatalog()` answers (default CATALOG.wire).
 * @param options.modelCatalog - DSH's read itself (a pending or refused read), over `catalog`.
 */
export async function modelPage(t, { model, catalog = CATALOG.wire, lang = MODEL.langs[0], open = true, modelCatalog } = {}) {
  let launcherPresses = 0
  const session = { modelCatalog: modelCatalog ?? (async () => ({ ok: true, value: structuredClone(catalog) })), $on: () => () => {} }
  const p = await uiPage(t, {
    lang, modal: true, remoteSession: session,
    namespaces: { [MODEL.namespace]: model ? { [MODEL.path[0]]: model } : {} },
    prepareWorld(world) {
      world.onDocument = (document, dom) => {
        const launcher = dom.createElement(MODEL.launcherTag)
        launcher.className = MODEL.launcherClass
        launcher.addEventListener(MODEL.click, () => { launcherPresses += 1 })
        dom.body.append(launcher)
      }
      if (open) world.html.setAttribute(MODEL.pageMark, '')
    },
  })
  const w = p.world
  for (const slot of MODEL.slots) await p.mountAll(slot + ':', slot)
  const nodes = () => findAll(p.tree(), () => true)
  const dialogs = () => nodes().filter(isDialog)
  const named = (n) => textOf(n) + ' ' + (n.props['aria-label'] ?? '')
  return {
    world: w, nodes, dialogs,
    get launcherPresses() { return launcherPresses },
    text: () => p.text(),
    async openPage() { w.html.setAttribute(MODEL.pageMark, ''); await p.settle() },
    async closePage() { w.html.removeAttribute(MODEL.pageMark); await p.settle() },
    /** The dialog's own controls (the page's header actions also say "settings"). */
    buttons: () => findAll(dialogs(), () => true).filter((n) => n.tag === MODEL.button),
    /** A dialog control whose text or accessible name matches `pattern`. */
    control(pattern) { return this.buttons().find((n) => pattern.test(named(n))) },
    async press(node) { if (!node) throw new Error('Missing public control'); await p.press(node) },
    /** The user dismisses the dialog, then a window focus passes (a reopen trigger it must ignore). */
    async dismiss() { await this.press(this.control(MODEL.dismiss)); w.dispatchWindow(MODEL.focus); await p.settle() },
    async choose(name) {
      const direct = nodes().find((n) => n.tag === MODEL.button && textOf(n).includes(name))
      if (direct) return p.press(direct)
      const option = nodes().find((n) => n.tag === MODEL.option && textOf(n).includes(name))
      const select = nodes().find((n) => n.tag === MODEL.chooser)
      if (!option || !select) throw new Error('No model selection control for ' + name)
      select.props.onChange({ target: { value: option.props.value }, currentTarget: { value: option.props.value } })
      await p.settle()
      const save = nodes().find((n) => n.tag === MODEL.button && MODEL.save.test(textOf(n)))
      if (save) await p.press(save)
    },
    choiceButtons: () => nodes().filter((n) => n.tag === MODEL.button && n.props[MODEL.choiceHook] !== undefined),
    alerts: () => nodes().filter((n) => n.props.role === MODEL.alertRole && textOf(n).trim() !== ''),
    dialogState: () => nodes().find((n) => n.props[MODEL.dialogHook] !== undefined)?.props[MODEL.dialogHook],
    settle: () => p.settle(),
  }
}
