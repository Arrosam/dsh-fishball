// A probe browser half for fishball-test-helpers' scripted-page cases: a classic script as DSH serves
// one. It registers a settings page over DSH's form model, an entry while either of its namespaces
// is served, and an entry from its package-local chunk.
window.__ModuleLoader__.load({ id: 'fbtest-probe', factory: (load) => {
  const React = load('react')
  const P = load('@deepseek-ai/dsh-client-ui-primitives')
  const h = React.createElement
  const PROBE = {
    ns: 'fbtest-probe', other: 'fbtest-probe-other', bundle: 'fbtest-probe', locale: 'fbtest-probe', field: 'greeting',
    configSlot: 'plugins.bundle.config', mainSlot: 'main', part: './client.part.js',
    labels: { save: 'Save', saving: 'Saving', saveFailed: 'Save failed', unavailable: 'Unavailable', readOnly: 'Read only' },
  }
  function apply(ctx) {
    const scope = ctx.configForms.get(PROBE.ns)
    function Config({ t, view }) {
      const form = React.useMemo(() => new P.SettingsFormModel(scope, [P.settingsTextField(PROBE.field)]), [])
      const shell = React.useMemo(() => form.bind(() => form.shell()), [form])
      const field = React.useMemo(() => form.bind(() => form.field(PROBE.field)), [form])
      const state = React.useSyncExternalStore(shell.subscribe, shell.getSnapshot)
      const value = React.useSyncExternalStore(field.subscribe, field.getSnapshot)
      const actions = form.actions()
      return h('section', { 'data-probe-page': view },
        h('h2', { 'data-probe-hello': true }, t('hello', { name: 'Ada' })),
        h('p', { 'data-probe-only': true }, t('only')),
        h('p', { 'data-probe-missing': true }, t('missing.key')),
        h(P.SettingsForm, { state, labels: PROBE.labels, onSave: actions.save, onDiscard: actions.discard },
          h('div', { 'data-probe-field': PROBE.field },
            h(P.SettingsValueField, { id: PROBE.field, label: PROBE.field, text: value.text, overridden: value.overridden, invalid: value.invalid, onEdit: (v) => actions.edit(PROBE.field, v) }))))
    }
    ctx.effect(() => ctx.locale.register(PROBE.locale, { en: { hello: 'Hello {name}', only: 'English only' }, zh: { hello: '你好 {name}' } }))
    ctx.effect(() => ctx.slots.register({ name: PROBE.configSlot, key: PROBE.bundle, locale: PROBE.locale }, Config))
    ctx.effect(() => ctx.configForms.whileServed([PROBE.ns, PROBE.other], (served) => ctx.slots.register({ name: PROBE.mainSlot, key: 'served', served: [...served] }, () => null)))
    ctx.effect(() => {
      let off = null
      let live = true
      load.async(PROBE.part).then((part) => { if (live) off = ctx.slots.register({ name: PROBE.mainSlot, key: 'part', word: part.word }, () => null) })
      return () => { live = false; off?.() }
    })
  }
  return { name: 'fbtest-probe', inject: ['slots', 'configForms', 'locale'], apply }
} })
