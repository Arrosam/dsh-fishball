/**
 * The model dialog, browser half (F-WIRE; the user, 2026-11-16: "fishball打开的时候可以看到自己选没选模型，
 * 然后会提示用户选择配置的模型。对于embed fishball，由instance同步模型列表过去，然后在打开时会因为fishball
 * 没有设置模型而弹出要求选择模型的页面"). A package-local chunk of fishball-ui's client; client.js
 * starts `modelPart`.
 *
 * When the Fishball page opens (its root mark `data-fishball-page` is on the document) and core's
 * `model` setting is unset, a dialog asks the user to pick
 * one of the models configured in this DSH (DSH's own catalog, `remote.session.modelCatalog`, the one
 * DSH's model picker reads; in a hosted child the instance's model sync fills it). Picking writes
 * `{provider, model, reasoningEffort?}` to core's namespace field through DSH's own form
 * (`configForms`), the same field core's settings page edits. Every mode, the same.
 * - Until a model is chosen Fishball runs on this DSH's default model; nothing waits on the dialog.
 * - Dismissed: it stays closed while the page stays open, and shows again the next time the page
 *   opens (a reload, or the page closing and opening; nothing is stored).
 * - No configured model: the dialog says so and offers DSH's Settings (the Fishball page's Settings
 *   launcher, the one native open path, as the "DSH settings" entry presses it; DSH has no public
 *   "open the Models section" call, so the user picks Models there).
 * - Set already, or set elsewhere while open (core's settings page): not shown, or closed.
 * - Each opening reads DSH's catalog again (R-FIX-FUI), and a failed read offers Try again.
 * - A namespace this client does not see (no core row): nothing is shown.
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  chunk: 'client.model.js',
  factory(require) {
    const React = require('react')
    const { Button, Modal, StateDot, Tag, IconChevronRightOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const DIALOG = Object.freeze({
      name: 'fishball-ui: model dialog',
      locale: 'fishball-ui-model',
      overlay: Object.freeze({ name: 'shell.overlay', id: 'fishball-ui.model-dialog' }),
      /**
       * Core's names, restated (fishball-ui imports nothing of core, Q-G2): its settings namespace
       * and model field (core `contracts/constants.js` FISHBALL_MODEL).
       */
      namespace: 'fishball-core',
      field: 'model',
      /** ConfigFormSnapshot.status of a served namespace (dsh-client-ui-settings, both SDKs). */
      ready: 'ready',
      /** This dialog's own catalog read states. */
      catalog: Object.freeze({ loading: 'loading', ready: 'ready', failed: 'failed' }),
      /** The Fishball page's Settings launcher (fishball-page `PAGE.settingsButton`), DSH's own Settings open. */
      settingsLauncher: '.fishball-settings-launcher',
      /**
       * The Fishball page's own mark on the document element while it is open (fishball-page
       * `PAGE.root`): the dialog shows only then, "when the Fishball page opens".
       */
      pageRoot: 'data-fishball-page',
      effortless: null,
      css: Object.freeze({
        id: 'fishball-ui-model-style', groups: 'fb-model-groups', group: 'fb-model-group', heading: 'fb-model-heading', list: 'fb-model-list',
        choice: 'fb-model-choice', name: 'fb-model-name', chevron: 'fb-model-chevron', note: 'fb-model-note', empty: 'fb-model-empty', error: 'fb-model-error',
      }),
      dot: Object.freeze({ loading: 'ongoing', failed: 'error' }),
      effortTone: 'outline',
      icon: 14,
    })
    const en = {
      title: 'Choose Fishball\'s model',
      intro: 'Fishball has no model of its own yet, so it uses this DSH\'s default model. Pick the model Fishball should use; you can change it later in Fishball settings.',
      effort: '{model} · {effort}',
      loading: 'Loading the models…',
      none: 'No model is configured in this DSH yet. Add one in DSH settings, under Models.',
      failed: 'The models could not be read.',
      retry: 'Try again',
      openSettings: 'Open DSH settings',
      later: 'Not now',
      saveFailed: 'The model was not saved. Try again.',
      close: 'Close',
    }
    const zh = {
      title: '选择 Fishball 的模型',
      intro: 'Fishball 还没有自己的模型，因此正在使用此 DSH 的默认模型。请选择 Fishball 要使用的模型；之后可以在 Fishball 设置中更改。',
      effort: '{model} · {effort}',
      loading: '正在读取模型…',
      none: '此 DSH 还没有配置模型。请在 DSH 设置的“模型”中添加。',
      failed: '无法读取模型。',
      retry: '重试',
      openSettings: '打开 DSH 设置',
      later: '暂不选择',
      saveFailed: '模型没有保存，请重试。',
      close: '关闭',
    }
    // UI-POLISH-F: the models grouped under their provider, each group one card in DSH's settings
    // card material (the Models settings page's own grouping), each model one full-width row.
    const css = [
      // 320px is the list's height before UI-POLISH-F; the vh cap keeps the footer on a short window.
      `.${DIALOG.css.groups}{display:grid;gap:12px;max-height:min(320px,50vh);overflow-y:auto;padding:2px}`,
      `.${DIALOG.css.heading}{margin:0 0 4px;padding:0 4px;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-tertiary)}`,
      `.${DIALOG.css.list}{display:grid;gap:2px;margin:0;padding:4px;list-style:none;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-settings-card-fill);box-shadow:inset 0 0 0 .5px var(--dsw-alias-settings-card-stroke)}`,
      `.${DIALOG.css.choice}{width:100%;justify-content:flex-start;gap:8px;font:var(--dsw-font-xs-13)}`,
      `.${DIALOG.css.name}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:start}`,
      `.${DIALOG.css.chevron}{display:inline-flex;margin-left:auto;color:var(--dsw-alias-label-tertiary)}`,
      `.${DIALOG.css.note}{display:flex;align-items:center;gap:8px;margin:0;color:var(--dsw-alias-label-tertiary)}`,
      `.${DIALOG.css.empty}{margin:0;padding:20px 16px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);text-align:center}`,
      `.${DIALOG.css.error}{display:flex;align-items:center;gap:8px;margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')

    /**
     * One choice per model, and one per advertised reasoning effort (DSH `ModelCatalog`, both SDKs),
     * grouped by the catalog's provider groups (a group without a model is left out). `label` is the
     * choice's full name (`<group> / <model>`, with ` · <effort>`), its accessible name; `name` and
     * `effort` are what the row shows under its group's heading. This first-run dialog uses a
     * list of buttons; core's settings page has separate model and effort selects.
     */
    function groupsOf(catalog, t) {
      return (catalog?.groups ?? []).map((group) => ({ id: group.id, name: group.name, choices: group.models.flatMap((model) => {
        const base = { provider: group.id, model: model.id }
        const label = group.name + ' / ' + model.name
        const efforts = model.reasoning?.efforts ?? []
        const of = (selection, text, effort) => ({ key: JSON.stringify([selection.provider, selection.model, selection.reasoningEffort ?? DIALOG.effortless]), label: text, name: model.name, effort, selection })
        return efforts.length === 0 ? [of(base, label, null)] : efforts.map((effort) => of({ ...base, reasoningEffort: effort.id }, t('effort', { model: label, effort: effort.name }), effort.name))
      }) })).filter((group) => group.choices.length > 0)
    }

    /** Whether core's form holds a model now (a complete `{provider, model}`); undefined while unknown. */
    function isSet(snapshot) {
      if (snapshot.status !== DIALOG.ready) return undefined
      const model = snapshot.value?.[DIALOG.field]
      return typeof model?.provider === 'string' && model.provider !== '' && typeof model.model === 'string' && model.model !== ''
    }

    /** Whether the Fishball page is open now, followed live (its root mark comes and goes with it). */
    const pageOpen = () => document.documentElement.hasAttribute(DIALOG.pageRoot)
    function subscribePage(listener) {
      const observer = new MutationObserver(listener)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: [DIALOG.pageRoot] })
      return () => observer.disconnect()
    }

    function makeDialog(ctx, t) {
      const form = ctx.configForms.get(DIALOG.namespace)
      return function FishballModelDialog() {
        React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
        const snapshot = React.useSyncExternalStore((listener) => form.subscribe(listener), () => form.getSnapshot())
        const onPage = React.useSyncExternalStore(subscribePage, pageOpen)
        // Dismissed or chosen while the page is open: closed until the page opens again, so a
        // dismissal is forgotten when the page closes (its root mark goes).
        const [closed, setClosed] = React.useState(false)
        React.useEffect(() => { if (!onPage) setClosed(false) }, [onPage])
        const baseId = React.useId()
        const [catalog, setCatalog] = React.useState({ status: DIALOG.catalog.loading })
        const [failed, setFailed] = React.useState(false)
        const [saving, setSaving] = React.useState(false)
        // One count per read asked for: Try again bumps it, so the read effect runs again.
        const [attempt, setAttempt] = React.useState(0)
        const open = onPage && !closed && isSet(snapshot) === false
        // Every opening reads the catalog again (R-FIX-FUI): DSH's models may have changed while the
        // dialog was closed (set elsewhere, then cleared). A read that settles after the dialog
        // closed, or after a newer read began, is dropped by its effect's cleanup.
        React.useEffect(() => {
          if (!open) return undefined
          let live = true
          Promise.resolve().then(() => ctx.remote.session.modelCatalog()).then((answer) => {
            if (live) setCatalog(answer?.ok === true ? { status: DIALOG.catalog.ready, value: answer.value } : { status: DIALOG.catalog.failed })
          }, () => { if (live) setCatalog({ status: DIALOG.catalog.failed }) })
          // Closing forgets the catalog, so the next opening never paints the old models first.
          return () => { live = false; setCatalog({ status: DIALOG.catalog.loading }) }
        }, [open, attempt])
        if (!open) return null
        const groups = catalog.status === DIALOG.catalog.ready ? groupsOf(catalog.value, t) : []
        const headingId = (group) => `${baseId}-${groups.indexOf(group)}`
        const choose = async (selection) => {
          setSaving(true)
          let ok = false
          try { ok = await form.set(DIALOG.field, selection) } catch { ok = false }
          setSaving(false)
          setFailed(!ok)
          if (ok) setClosed(true)
        }
        const openSettings = () => {
          setClosed(true)
          document.querySelector(DIALOG.settingsLauncher)?.click()
        }
        const none = catalog.status === DIALOG.catalog.ready && groups.length === 0
        const footer = h(React.Fragment, null,
          none ? h(Button, { variant: 'primary', onClick: openSettings, 'data-fishball-model-settings': true }, t('openSettings')) : null,
          h(Button, { variant: 'outline', onClick: () => setClosed(true), 'data-fishball-model-later': true }, t('later')))
        return h(Modal, { open: true, onClose: () => setClosed(true), title: t('title'), closeLabel: t('close'), description: t('intro'), footer },
          h('div', { 'data-fishball-model-dialog': catalog.status },
            catalog.status === DIALOG.catalog.loading ? h('p', { className: DIALOG.css.note }, h(StateDot, { state: DIALOG.dot.loading }), t('loading')) : null,
            catalog.status === DIALOG.catalog.failed ? h('p', { className: DIALOG.css.error, role: 'alert' }, h(StateDot, { state: DIALOG.dot.failed }), t('failed'),
              h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => setAttempt((count) => count + 1), 'data-fishball-model-retry': true }, t('retry'))) : null,
            none ? h('p', { className: DIALOG.css.empty, 'data-fishball-model-none': true }, t('none')) : null,
            groups.length === 0 ? null : h('div', { className: DIALOG.css.groups },
              groups.map((group) => h('div', { key: group.id, className: DIALOG.css.group, role: 'group', 'aria-labelledby': headingId(group) },
                h('p', { id: headingId(group), className: DIALOG.css.heading }, group.name),
                h('ul', { className: DIALOG.css.list },
                  group.choices.map((choice) => h('li', { key: choice.key },
                    h(Button, { className: DIALOG.css.choice, variant: 'ghost', disabled: saving, 'aria-label': choice.label, 'data-fishball-model-choice': choice.key, onClick: () => void choose(choice.selection) },
                      h('span', { className: DIALOG.css.name }, choice.name),
                      choice.effort === null ? null : h(Tag, { tone: DIALOG.effortTone }, choice.effort),
                      h('span', { className: DIALOG.css.chevron, 'aria-hidden': 'true' }, h(IconChevronRightOutlineRegular, { size: DIALOG.icon }))))))))),
            failed ? h('p', { className: DIALOG.css.error, role: 'alert' }, h(StateDot, { state: DIALOG.dot.failed }), t('saveFailed')) : null))
      }
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function modelPart(kit) {
      function apply(ctx) {
        const t = ctx.locale.bind(DIALOG.locale)
        ctx.effect(() => ctx.locale.register(DIALOG.locale, { en, zh }), DIALOG.name + ': dictionaries')
        ctx.effect(() => kit.mountStyle(DIALOG.css.id, css), DIALOG.name + ': styles')
        // Only while the Host serves core's namespace: a DSH without core's row shows nothing.
        ctx.effect(() => ctx.configForms.whileServed([DIALOG.namespace], () => ctx.slots.register(DIALOG.overlay, makeDialog(ctx, t))), DIALOG.name + ': overlay')
      }
      return Object.freeze({ name: DIALOG.name, inject: ['slots', 'locale', 'configForms', 'remote', 'remote.session'], apply })
    }

    return { modelPart }
  },
})
