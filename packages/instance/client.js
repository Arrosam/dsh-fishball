/**
 * The `fishball-instance` card in DSH's Plugins page (design §0.7, D23, D26; task I1).
 *
 * The main DSH holds only what the instance needs before its child exists: `enabled`,
 * `nodeExecutable` and `executableSearchPath`, edited in DSH's own form for the instance's row.
 * Every other instance setting lives in the instance's private profile and its own settings page,
 * so this card has no other field. Model sync is the "Model for Fishball" button I6 adds to this
 * same card, an action rather than a field, and there is no `providerSync` switch (D26).
 *
 * The fields are the row's volatile config: DSH's settings form can write volatile fields only,
 * and writes them into the profile's patch for the `fishball-instance` row (§0.7).
 */
window.__ModuleLoader__.load({
  id: 'fishball-instance',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { SettingsForm, SettingsFormModel, SettingsValueField, Switch, settingsTextField } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement

    /**
     * The row's identity. The row id is the settings namespace DSH serves and also the package
     * name, so the slot key the Plugins page dispatches is `<package>#<row id>` (§0.2, D22).
     */
    const PLUGIN = Object.freeze({
      id: 'fishball-instance',
      slot: 'plugins.row.config',
      locale: 'fishball-instance',
    })
    /** The form's two views; `summary` is the row's one-liner, `page` the form and its Save. */
    const VIEW = Object.freeze({ summary: 'summary', page: 'page' })
    /** The whole main-DSH surface of the instance settings (§0.7, inst-OQ-04). */
    const FIELD = Object.freeze({
      enabled: 'enabled',
      nodeExecutable: 'nodeExecutable',
      executableSearchPath: 'executableSearchPath',
    })
    const LAUNCH_FIELDS = Object.freeze([FIELD.enabled, FIELD.nodeExecutable, FIELD.executableSearchPath])
    /**
     * The staged spelling of the boolean field. `SettingsFormModel` stages every field as text and
     * parses it on save; DSH ships field factories for text and numbers only, so `enabled` names
     * its own two spellings and nothing else parses.
     */
    const FLAG = Object.freeze({ on: 'true', off: 'false' })
    const CLS = Object.freeze({ feature: 'fb-instance-feature', toggleRow: 'fb-instance-toggle-row', hint: 'fb-instance-hint' })
    const STYLE = Object.freeze({
      id: 'fishball-instance-style',
      gap: '16px',
      stackGap: '6px',
      hintSize: '12px',
      lineHeight: '1.5',
    })
    const css = [
      `.${CLS.feature}{display:grid;gap:${STYLE.stackGap}}`,
      `.${CLS.toggleRow}{display:flex;align-items:flex-start;justify-content:space-between;gap:${STYLE.gap};color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${CLS.hint}{margin:0;color:var(--dsw-alias-label-tertiary);font-size:${STYLE.hintSize};line-height:${STYLE.lineHeight}}`,
    ].join('')

    // Locale dictionaries are flat key→text maps (the service looks a key up verbatim), so the
    // per-field labels are spelled `field.<name>`.
    const en = {
      summary: 'Fishball\'s private instance: how DSH starts it.',
      'field.enabled': 'Enabled',
      'field.nodeExecutable': 'Node executable',
      'field.executableSearchPath': 'Executable search path',
      enabledHint: 'Start Fishball\'s private instance after DSH is ready. Turn it off to stop it; its private data is kept.',
      nodeExecutableHint: 'Leave blank for DSH\'s own Node or the first `node` on DSH\'s PATH; it is verified as plain Node 22+ before use, never Electron.',
      executableSearchPathHint: 'The PATH of Fishball\'s instance, absolute entries only. Leave blank for the chosen Node\'s folder plus DSH\'s absolute PATH entries.',
      overridden: 'Overridden',
      reset: 'Reset to default',
      invalid: 'Enter true or false.',
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      readOnly: 'This deployment stores settings read-only.',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
    }
    const zh = {
      summary: 'Fishball 的私有实例：DSH 如何启动它。',
      'field.enabled': '启用',
      'field.nodeExecutable': 'Node 可执行文件',
      'field.executableSearchPath': '可执行文件搜索路径',
      enabledHint: 'DSH 就绪后启动 Fishball 的私有实例。关闭后停止它，私有数据保留。',
      nodeExecutableHint: '留空表示使用 DSH 自带的 Node，或 DSH 的 PATH 上的第一个 node；启动前会验证它是 22 以上的普通 Node，而不是 Electron。',
      executableSearchPathHint: 'Fishball 实例的 PATH，只接受绝对路径。留空表示所选 Node 所在的目录加上 DSH 的绝对 PATH 目录。',
      overridden: '已覆盖',
      reset: '恢复默认',
      invalid: '请填 true 或 false。',
      unavailable: '该插件当前未加载，暂时无法配置。',
      readOnly: '本部署的设置为只读。',
      save: '保存',
      saving: '保存中…',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
    }

    /**
     * `enabled` as a staged text field. The effective value of an unset field is the schema
     * default, true, so an unset field formats as "true" rather than as an empty switch.
     */
    const enabledField = Object.freeze({
      field: FIELD.enabled,
      format: (value) => String(value !== false),
      parse: (text) => {
        const spelled = text.trim()
        if (spelled === FLAG.on) return { kind: 'set', value: true }
        if (spelled === FLAG.off) return { kind: 'set', value: false }
        return undefined
      },
    })

    /** The form frame's copy, read from this card's dictionary. */
    function formLabels(t) {
      return {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
      }
    }

    /**
     * The staged form over the row's live config: one Save writes the three fields, and Reset
     * clears a stored value so the schema default applies again.
     * @param scope - the row's configuration form (`configForms.get`).
     * @returns the page's snapshot, its form actions and its disposer.
     */
    function launchSection(scope) {
      const form = new SettingsFormModel(scope, [
        enabledField,
        settingsTextField(FIELD.nodeExecutable),
        settingsTextField(FIELD.executableSearchPath),
      ])
      const store = form.bind(() => ({
        ...form.shell(),
        fields: Object.fromEntries(LAUNCH_FIELDS.map((field) => [field, form.field(field)])),
      }))
      return { store, actions: form.actions(), dispose: () => form.dispose() }
    }

    /**
     * The card: the three launch fields and nothing else. The `enabled` switch stages a boolean;
     * the two paths stage text, where an empty value clears the stored one (the PATH default).
     * @param section - the staged form from {@link launchSection}.
     * @param t - this card's locale reader.
     * @returns the row page component.
     */
    function makeCard(section, t) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballInstanceCard(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        if (props.view !== VIEW.page) return t('summary')
        const disabled = !state.writable || state.saving
        const baseId = React.useId()
        const textField = (field, hintKey) => {
          const value = state.fields[field]
          return h(SettingsValueField, {
            key: field,
            id: `${baseId}-${field}`,
            label: t('field.' + field),
            hint: t(hintKey),
            text: value.text,
            overridden: value.overridden,
            invalid: value.invalid,
            overriddenLabel: t('overridden'),
            resetLabel: t('reset'),
            invalidLabel: t('invalid'),
            disabled,
            onEdit: (text) => section.actions.edit(field, text),
            onReset: () => section.actions.resetField(field),
          })
        }
        return h(SettingsForm, {
          labels: formLabels(t),
          state,
          onSave: section.actions.save,
          onDiscard: section.actions.discard,
        },
          h('div', { key: FIELD.enabled, className: CLS.feature },
            h('label', { className: CLS.toggleRow },
              h('span', null, t('field.enabled')),
              h(Switch, {
                checked: state.fields[FIELD.enabled].text === FLAG.on,
                label: t('field.enabled'),
                disabled,
                onChange: (on) => section.actions.edit(FIELD.enabled, on ? FLAG.on : FLAG.off),
              })),
            h('p', { className: CLS.hint }, t('enabledHint'))),
          textField(FIELD.nodeExecutable, 'nodeExecutableHint'),
          textField(FIELD.executableSearchPath, 'executableSearchPathHint'))
      }
    }

    /** DSH plugin styles are per page; the id keeps a reload from stacking two copies. */
    function mountStyles() {
      const style = document.createElement('style')
      style.id = STYLE.id
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    exports.name = PLUGIN.id
    exports.inject = ['slots', 'locale', 'configForms']
    exports.apply = function apply(ctx) {
      const t = ctx.locale.bind(PLUGIN.locale)
      ctx.effect(() => ctx.locale.register(PLUGIN.locale, { en, zh }), 'fishball instance: dictionaries')
      ctx.effect(mountStyles, 'fishball instance: styles')
      // Registered while the Host serves this row's settings namespace, so a deployment without
      // the instance package shows no trace of the card, and the row's Configure control appears
      // only where a configuration exists (the Plugins page asks slot keys for it).
      ctx.effect(() => {
        const section = launchSection(ctx.configForms.get(PLUGIN.id))
        const Card = makeCard(section, t)
        const stopServing = ctx.configForms.whileServed([PLUGIN.id], () =>
          ctx.slots.inject(PLUGIN.slot, () => ctx.slots.register({
            name: PLUGIN.slot,
            key: `${PLUGIN.id}#${PLUGIN.id}`,
            locale: PLUGIN.locale,
          }, Card)))
        return () => { stopServing(); section.dispose() }
      }, 'fishball instance: Plugins card')
    }
    return module.exports
  },
})
