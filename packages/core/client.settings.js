/**
 * fishball-core's own settings page, browser half (task F-SETTINGS; requirements 1.34 item 4:
 * "hosted setting去掉，fishball的setting留在fishball里的fishball core插件的设置页内。可以在fishball对外暴露的UI中打开dsh的自带设置，或者直接跳转到fishball core的设置。";
 * R-FB-03 as amended by 1.33 Q-B2; R-HOST-11 withdrawn). A package-local chunk of core's client
 * (`client.js` loads it and starts `settingsPlugin`), because DSH's client modules serve only
 * `client.<name>.js` files beside `client.js` (CLIENT_CHUNK, both SDKs).
 *
 * One sub-plugin, the page, with only the services it needs: core's configuration on DSH's Plugins
 * page, in the `plugins.bundle.config` slot keyed by core's bundle name, so
 * `pluginNavigation.openBundle` lands on it directly. The same page in standalone and hosted mode
 * (Q-B2: "子实例内的界面和独立版本一样"). It holds the target URL, the write-only token field (always
 * shown, Q-B2), `connect.clientMetadataUrl` (R12 = B), the identity, and the Connect control
 * (design §6.3a step 1), and Fishball's model (F-WIRE; the user: "同步只是同步model list，至于fishball用
 * 什么还要在fishball内设置"; unset = this DSH's default model). Saving is DSH's own settings save of
 * core's row namespace; the token goes to DSH's credential store; Connect goes through core's one
 * route (`src/settings/`); the model is a field of the same namespace (`FISHBALL_MODEL.path`),
 * written at once when picked, from the catalog DSH's own model picker reads
 * (`remote.session.modelCatalog`, both SDKs).
 *
 * The two entries on the Fishball page ("Fishball settings", which opens this page, and "DSH
 * settings") and the `view=settings` continuation are UI changes inside Fishball, so they are
 * fishball-ui's since F-UI (R-FB-14; fishball-ui `client.entries.js`). This page is what DSH requires
 * of core as a plugin, and it stays core's (design §1.0: "its own settings page").
 *
 * The V2 settings panel and its settings-section extension point (`fishballSettingsSections`)
 * are gone with R-HOST-11 (1.34): no section is injected from anywhere.
 */
window.__ModuleLoader__.load({
  // A chunk of core's client (client.js `CORE.settings`): the owner id and this file's name.
  id: 'fishball-core',
  chunk: 'client.settings.js',
  factory(require) {
    const React = require('react')
    const { Button, SettingsForm, SettingsFormModel, SettingsSecretField, SettingsValueField, settingsTextField } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /**
     * Names this page shares with the Node side. A browser chunk cannot import core's Node modules,
     * so each is restated here from its one owner (keep them in step):
     * - `bundle`: core's bundle name (`contracts/constants.js` `GUARDS.bundleName`): the page's slot
     *   key and what `pluginNavigation.openBundle` opens;
     * - `settings`: `src/settings/constants.js` `SETTINGS`: the namespace of core's row and the
     *   page's fields, a dotted name being a nested path (`connect.clientMetadataUrl` is K3a's
     *   `CONNECT.setting`). The namespace is spelled as the bundle, but they are two facts;
     * - `tokenRef`: `HOSTED_IMPORT.credentialRef`, the reference core reads its import from. The
     *   field writes there, so a pasted token takes exactly the hosted import's path (Q-B2, design
     *   §5.4: "feed the same credential-reference path");
     * - `instanceTarget`: `HOSTED_IMPORT.targetSetting`, the URL the instance supplies in a child.
     *   It wins over `target.url` (Fishball's decision 2026-11-16; `src/settings/target.js`
     *   `effectiveTarget`, whose "has a value" test `instanceUrl` restates);
     * - `connectRoute`: `src/settings/constants.js` `CONNECT_ROUTE.path`, document-relative;
     * - `connectState` / `configuration`: `CONNECT.state` / `CONNECT.configuration` (K3a, PROPOSED codes);
     * - `model`: `FISHBALL_MODEL.path[0]`, the namespace field of Fishball's model.
     */
    const SHARED = Object.freeze({
      bundle: 'fishball-core',
      settings: Object.freeze({
        namespace: 'fishball-core',
        fields: Object.freeze(['target.url', 'connect.clientMetadataUrl', 'identity.id', 'identity.name']),
      }),
      tokenRef: 'DSH_AGENT_TOKEN',
      instanceTarget: Object.freeze({ row: 'dsh-instance-child', field: 'targetUrl' }),
      connectRoute: 'api/fishball/connect',
      connectState: Object.freeze({ needsConfiguration: 'needs-configuration', needsAuthorization: 'needs-authorization', authorizing: 'authorizing', authorized: 'authorized', failed: 'failed' }),
      configuration: Object.freeze(['metadata-url-missing', 'metadata-url-not-https', 'metadata-url-root-path', 'not-a-connector', 'web-callback-insecure']),
      model: 'model',
    })
    const PAGE = Object.freeze({
      locale: 'fishball-core-settings',
      slot: 'plugins.bundle.config',
      /**
       * `plugins.bundle.config` renders only `view: 'page'` today (slot-contract.d.ts); the summary
       * view is kept because the page's props contract (`PluginConfigViewProps`) names both views.
       */
      summary: 'summary',
      /** The write-only token field's name in the form (it is no namespace field). */
      token: 'token',
      separator: '.',
      connect: Object.freeze({
        read: Object.freeze({ method: 'GET', credentials: 'same-origin', cache: 'no-store' }),
        begin: Object.freeze({ method: 'POST', credentials: 'same-origin', cache: 'no-store' }),
        outcome: Object.freeze({ authorized: 'authorized', approvalUrl: 'approval-url', needsConfiguration: 'needs-configuration' }),
        /**
         * The approval page opens in a new tab with no link back to this page (no `window.opener`).
         * The open runs after the POST's await, where a browser may block it unnoticed (`noopener`
         * makes `window.open` answer null either way), so the URL is also shown as a link.
         */
        open: Object.freeze({ target: '_blank', features: 'noopener', rel: 'noopener noreferrer' }),
        reread: 'focus',
        unavailable: 'unavailable',
      }),
      /** DSH's remote event for a committed credential-reference change (dsh-credentials, both SDKs). */
      credentialChanged: 'credentials/reference-updated',
      css: Object.freeze({ id: 'fishball-core-settings-style', root: 'fb-core-settings', row: 'fb-core-settings-row', hint: 'fb-core-settings-hint', error: 'fb-core-settings-error' }),
      /**
       * The model control: one native select whose option values are the catalog's (provider, model,
       * effort) triples as JSON, plus the empty "DSH's default" option that clears the field.
       */
      model: Object.freeze({ unset: '', effortless: null, catalog: Object.freeze({ loading: 'loading', ready: 'ready', failed: 'failed' }) }),
    })
    const en = {
      summary: 'Fishball\'s target, connection and identity.',
      'field.target.url': 'Target',
      'hint.target.url': 'The MCP URL of the DSH connector Fishball works with. Blank: no target.',
      'hint.target.url.supplied': 'Not used while the instance supplies the target above; it applies when the instance supplies none.',
      'field.connect.clientMetadataUrl': 'Client metadata URL',
      'hint.connect.clientMetadataUrl': 'The https URL of the OAuth client metadata document you host for Connect. Connect needs it.',
      'field.identity.id': 'Fishball id',
      'hint.identity.id': 'Letters, digits, _ and -, at most 64. Sent to the target as this Fishball\'s id.',
      'field.identity.name': 'Name',
      'hint.identity.name': 'The name the target shows for this Fishball.',
      'field.token': 'Token for connecting a DSH',
      'hint.token': 'Paste a token freshly generated in the target DSH\'s connector settings. It is saved for the next connection and never shown again.',
      'token.waiting': 'A token is waiting to be used',
      'token.none': 'No token waiting',
      instanceTarget: 'Target supplied by the instance, in use: {url}',
      connectTitle: 'Connect',
      connect: 'Connect',
      'connect.needs-configuration': 'Connect needs configuration.',
      'connect.needs-authorization': 'Not connected yet. Press Connect and finish on the approval page.',
      'connect.authorizing': 'Finish on the approval page.',
      'connect.authorized': 'Connected.',
      'connect.failed': 'The last Connect failed.',
      'connect.unavailable': 'Connect is not available right now.',
      'connect.openApproval': 'Open the approval page',
      'config.metadata-url-missing': 'Set the client metadata URL first.',
      'config.metadata-url-not-https': 'The client metadata URL must use https.',
      'config.metadata-url-root-path': 'The client metadata URL needs a path, not just a host.',
      'config.not-a-connector': 'The target is not a DSH connector.',
      'config.web-callback-insecure': 'Connect from this address needs https.',
      'config.unknown': 'Connect needs configuration ({code}).',
      modelTitle: 'Fishball\'s model',
      modelHint: 'The model Fishball\'s session uses. Until you pick one it uses this DSH\'s default model.',
      modelDefault: 'This DSH\'s default model',
      modelEffort: '{model} · {effort}',
      modelLoading: 'Loading the models…',
      modelNone: 'No model is configured in this DSH yet.',
      modelFailed: 'The models could not be read.',
      modelSaveFailed: 'The model was not saved.',
      unavailable: 'Fishball\'s settings are not available right now.',
      readOnly: 'This deployment stores settings read-only.',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      overridden: 'Set',
      reset: 'Reset',
      invalid: 'Not a valid value.',
    }
    const zh = {
      summary: 'Fishball 的目标、连接与身份。',
      'field.target.url': '目标',
      'hint.target.url': 'Fishball 所连接的 DSH connector 的 MCP 地址。留空表示没有目标。',
      'hint.target.url.supplied': '当 instance 提供上面的目标时不使用；instance 没有提供目标时才生效。',
      'field.connect.clientMetadataUrl': '客户端元数据地址',
      'hint.connect.clientMetadataUrl': '你为 Connect 托管的 OAuth 客户端元数据文档的 https 地址。Connect 需要它。',
      'field.identity.id': 'Fishball id',
      'hint.identity.id': '字母、数字、_ 和 -，最多 64 个字符。作为这个 Fishball 的 id 发送给目标。',
      'field.identity.name': '名字',
      'hint.identity.name': '目标显示的这个 Fishball 的名字。',
      'field.token': '连接 DSH 的 token',
      'hint.token': '粘贴在目标 DSH 的 connector 设置中新生成的 token。它会保存供下一次连接使用，之后不再显示。',
      'token.waiting': '有一个 token 等待使用',
      'token.none': '没有等待使用的 token',
      instanceTarget: '由 instance 提供的目标（正在使用）：{url}',
      connectTitle: '连接',
      connect: 'Connect',
      'connect.needs-configuration': 'Connect 需要先完成配置。',
      'connect.needs-authorization': '尚未连接。请按 Connect，并在授权页面上完成。',
      'connect.authorizing': '请在授权页面上完成。',
      'connect.authorized': '已连接。',
      'connect.failed': '上一次 Connect 失败了。',
      'connect.unavailable': 'Connect 现在不可用。',
      'connect.openApproval': '打开授权页面',
      'config.metadata-url-missing': '请先设置客户端元数据地址。',
      'config.metadata-url-not-https': '客户端元数据地址必须使用 https。',
      'config.metadata-url-root-path': '客户端元数据地址需要路径，不能只有主机。',
      'config.not-a-connector': '目标不是 DSH connector。',
      'config.web-callback-insecure': '从这个地址使用 Connect 需要 https。',
      'config.unknown': 'Connect 需要先完成配置（{code}）。',
      modelTitle: 'Fishball 的模型',
      modelHint: 'Fishball 会话使用的模型。选择之前使用此 DSH 的默认模型。',
      modelDefault: '此 DSH 的默认模型',
      modelEffort: '{model} · {effort}',
      modelLoading: '正在读取模型…',
      modelNone: '此 DSH 还没有配置模型。',
      modelFailed: '无法读取模型。',
      modelSaveFailed: '模型没有保存。',
      unavailable: 'Fishball 的设置现在不可用。',
      readOnly: '此部署以只读方式保存设置。',
      save: '保存',
      saving: '保存中…',
      saveFailed: '部署没有接受这些值；它们已保留，供你修改。',
      overridden: '已设置',
      reset: '重置',
      invalid: '不是有效的值。',
    }
    const css = [
      `.${PAGE.css.root}{display:grid;gap:16px}`,
      `.${PAGE.css.row}{display:flex;align-items:center;flex-wrap:wrap;gap:8px}`,
      `.${PAGE.css.hint}{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}`,
      `.${PAGE.css.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')

    /** The style sheet, removed by its effect's disposer; the id names it for a reader of the DOM. */
    function mountStyle() {
      const style = document.createElement('style')
      style.id = PAGE.css.id
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    /** Re-render on a locale change (the dictionaries are looked up at render time). */
    function useLocale(ctx) {
      React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
    }

    // ---------------------------------------------------------------- the page

    const pathOf = (field) => field.split(PAGE.separator)
    const isObject = (node) => node !== null && typeof node === 'object'
    /** `[present, value]` of one dotted field in a layer: presence, not the value, marks an override. */
    function lookup(section, field) {
      let node = section
      for (const key of pathOf(field)) {
        if (!isObject(node) || !Object.hasOwn(node, key)) return [false, undefined]
        node = node[key]
      }
      return [true, node]
    }
    /** A layer as `{<dotted field>: value}`, holding only the fields the layer has. */
    const flatten = (section) => (section === undefined ? undefined
      : Object.fromEntries(SHARED.settings.fields.map((field) => [field, lookup(section, field)]).filter(([, [present]]) => present).map(([field, [, value]]) => [field, value])))

    /**
     * Core's row form as DSH's `SettingsFormModel` reads it. The model addresses one top-level key
     * per field (`path: [field]`), while core's settings nest (`target.url`, `connect.clientMetadataUrl`,
     * `identity.*`, as the Node side names them). So this view flattens each layer to dotted keys
     * and turns each operation's dotted key back into its nested path; everything else (revision
     * fencing, recovery, writability) is DSH's form unchanged.
     */
    function dottedForm(form) {
      let source
      let view
      return {
        getSnapshot() {
          const snapshot = form.getSnapshot()
          if (snapshot !== source) {
            source = snapshot
            view = { ...snapshot, value: flatten(snapshot.value), base: flatten(snapshot.base), user: flatten(snapshot.user) }
          }
          return view
        },
        subscribe: (listener) => form.subscribe(listener),
        mutate: (ops, revision) => form.mutate(ops.map((op) => ({ ...op, path: op.path.flatMap(pathOf) })), revision),
      }
    }

    /** One credentials answer: `RemoteResult` `{ok, value}`; a rejection or refusal reads as failure. */
    async function remoteResult(call) {
      try {
        const answer = await call()
        return answer?.ok === true ? answer : undefined
      } catch { return undefined }
    }

    /**
     * The write-only token field's store: whether a token waits under the reference (DSH's
     * `describe`, never the value), and its write. The value lives only in DSH's own staged
     * password field until Save, then goes to DSH's credential store and nowhere else: this page
     * keeps, logs or sends it in no other way (no URL, no request of its own).
     */
    function tokenStore(credentials) {
      // Writable until DSH says otherwise, as DSH's own credential pages assume: an unanswered
      // describe must not lock the field with no reason shown; a refused write shows save-failed.
      let state = Object.freeze({ configured: false, writable: true })
      let sequence = 0
      const listeners = new Set()
      const read = async () => {
        // Only the latest read publishes: an older answer arriving late would show a stale badge.
        const mine = ++sequence
        const answer = await remoteResult(() => credentials.describe([SHARED.tokenRef]))
        if (mine !== sequence) return
        const view = answer?.value?.[SHARED.tokenRef]
        state = Object.freeze({ configured: view?.configured === true, writable: view?.writable !== false })
        listeners.forEach((listener) => listener())
      }
      return {
        get: () => state,
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        read,
        /** The secret spec `SettingsFormModel` runs on Save with the trimmed, non-blank text. */
        spec: Object.freeze({
          field: PAGE.token,
          async write(value) {
            const written = (await remoteResult(() => credentials.set(SHARED.tokenRef, value))) !== undefined
            await read()
            return written
          },
        }),
      }
    }

    /** The staged form: the text fields over `dottedForm`, and the token field as a secret write. */
    function pageForm(form, token) {
      const model = new SettingsFormModel(dottedForm(form), SHARED.settings.fields.map((field) => settingsTextField(field)), [token.spec])
      const store = model.bind(() => ({ ...model.shell(), fields: Object.fromEntries([...SHARED.settings.fields, PAGE.token].map((field) => [field, model.field(field)])) }))
      return { store, actions: model.actions(), dispose: () => model.dispose() }
    }

    /** One call of core's Connect route; anything but a 200 JSON object reads as unavailable. */
    async function connectRequest(init) {
      try {
        const response = await fetch(new URL(SHARED.connectRoute, document.baseURI), init)
        if (!response.ok) return undefined
        const body = await response.json()
        return body !== null && typeof body === 'object' ? body : undefined
      } catch { return undefined }
    }

    /**
     * Acts on one Connect press's answer (`ConnectBegin`) and returns `{notice, approvalUrl}`:
     * `notice` is the `needs-configuration` code, `unavailable` for any answer it cannot act on, or
     * `undefined`; `approvalUrl` is the approval page it opened, also shown as a link.
     */
    function pressResult(answer) {
      const { outcome, open } = PAGE.connect
      if (answer?.outcome === outcome.authorized) return {}
      if (answer?.outcome === outcome.approvalUrl && typeof answer.url === 'string') {
        window.open(answer.url, open.target, open.features)
        return { approvalUrl: answer.url }
      }
      return { notice: answer?.outcome === outcome.needsConfiguration && typeof answer.code === 'string' ? answer.code : PAGE.connect.unavailable }
    }

    /**
     * The Connect control (design §6.3a step 1): the state of `fishballInstance.ui.connect`, read
     * on mount, on window focus and after each press, and the Connect button. Its state is one
     * value `{status, notice, approvalUrl}`: `status` is the route's `ConnectStatus` or undefined
     * (unavailable); `notice` and `approvalUrl` are the last press's (`pressResult`). The link
     * shows only while the attempt is `authorizing`: the URL is dead once the attempt ended.
     */
    function ConnectControl({ t }) {
      const [view, setView] = React.useState({ status: undefined })
      const read = React.useCallback(async () => {
        const status = await connectRequest(PAGE.connect.read)
        setView((current) => ({ ...current, status: Object.values(SHARED.connectState).includes(status?.state) ? status : undefined }))
      }, [])
      React.useEffect(() => {
        void read()
        window.addEventListener(PAGE.connect.reread, read)
        return () => window.removeEventListener(PAGE.connect.reread, read)
      }, [read])
      const begin = async () => {
        const press = pressResult(await connectRequest(PAGE.connect.begin))
        setView((current) => ({ status: current.status, ...press }))
        await read()
      }
      const state = view.status?.state ?? PAGE.connect.unavailable
      // A press's own refusal first; else the status's code while it still needs configuration.
      const code = view.notice ?? (state === SHARED.connectState.needsConfiguration ? view.status.code : null)
      const alert = typeof code !== 'string' ? null
        : code === PAGE.connect.unavailable ? t('connect.unavailable')
          : SHARED.configuration.includes(code) ? t('config.' + code) : t('config.unknown', { code })
      return h('section', { 'data-fishball-connect': true, 'data-fishball-connect-state': state, 'aria-label': t('connectTitle') },
        h('div', { className: PAGE.css.row },
          h(Button, { type: 'button', size: 'sm', variant: 'outline', 'data-fishball-connect-begin': true, onClick: () => void begin() }, t('connect')),
          h('span', { role: 'status' }, t('connect.' + state))),
        view.approvalUrl === undefined || state !== SHARED.connectState.authorizing ? null
          : h('a', { href: view.approvalUrl, target: PAGE.connect.open.target, rel: PAGE.connect.open.rel, 'data-fishball-connect-approval': true }, t('connect.openApproval')),
        alert === null ? null : h('p', { className: PAGE.css.error, role: 'alert' }, alert))
    }

    /**
     * The model choices of DSH's catalog (`ModelCatalog`, dsh-api-session-controller, both SDKs):
     * one per model, and one per advertised reasoning effort, each `{value, label, selection}`.
     * fishball-ui's model dialog restates this list (a chunk imports no module, and fishball-ui
     * imports nothing of core, Q-G2); keep the two in step.
     */
    function modelChoices(catalog, t) {
      return (catalog?.groups ?? []).flatMap((group) => group.models.flatMap((model) => {
        const base = { provider: group.id, model: model.id }
        const label = group.name + ' / ' + model.name
        const efforts = model.reasoning?.efforts ?? []
        const of = (selection, text) => ({ value: JSON.stringify([selection.provider, selection.model, selection.reasoningEffort ?? PAGE.model.effortless]), label: text, selection })
        return efforts.length === 0 ? [of(base, label)] : efforts.map((effort) => of({ ...base, reasoningEffort: effort.id }, t('modelEffort', { model: label, effort: effort.name })))
      }))
    }
    const choiceValue = (selection) => (selection?.provider === undefined ? PAGE.model.unset
      : JSON.stringify([selection.provider, selection.model, selection.reasoningEffort ?? PAGE.model.effortless]))

    /**
     * Fishball's model (F-WIRE): a native select over DSH's catalog, written at once to core's
     * `model` field through DSH's own form (`configForms`), or cleared for DSH's default. It reads
     * the namespace's live value, so the model dialog's choice (fishball-ui) shows here too.
     */
    function ModelControl({ ctx, form, t }) {
      const snapshot = React.useSyncExternalStore((listener) => form.subscribe(listener), () => form.getSnapshot())
      const [catalog, setCatalog] = React.useState({ status: PAGE.model.catalog.loading })
      const [saveFailed, setSaveFailed] = React.useState(false)
      React.useEffect(() => {
        let live = true
        // Read on use, never injected: a DSH whose remote session face is missing shows the page
        // with the model control's failed note, not no page at all.
        Promise.resolve().then(() => ctx.remote.session.modelCatalog()).then((answer) => {
          if (live) setCatalog(answer?.ok === true ? { status: PAGE.model.catalog.ready, value: answer.value } : { status: PAGE.model.catalog.failed })
        }, () => { if (live) setCatalog({ status: PAGE.model.catalog.failed }) })
        return () => { live = false }
      }, [])
      const id = React.useId()
      const choices = catalog.status === PAGE.model.catalog.ready ? modelChoices(catalog.value, t) : []
      const current = choiceValue(snapshot.value?.[SHARED.model])
      const pick = async (value) => {
        const choice = choices.find((entry) => entry.value === value)
        let ok = false
        try { ok = await (choice === undefined ? form.unset(SHARED.model) : form.set(SHARED.model, choice.selection)) } catch { ok = false }
        setSaveFailed(!ok)
      }
      const note = catalog.status === PAGE.model.catalog.loading ? t('modelLoading') : catalog.status === PAGE.model.catalog.failed ? t('modelFailed') : choices.length === 0 ? t('modelNone') : null
      return h('section', { 'data-fishball-model': true, 'aria-label': t('modelTitle') },
        h('label', { htmlFor: id }, t('modelTitle')),
        h('div', { className: PAGE.css.row },
          h('select', { id, value: current, disabled: !snapshot.writable, onChange: (event) => void pick(event.target.value), 'data-fishball-model-select': true },
            h('option', { value: PAGE.model.unset }, t('modelDefault')),
            // A saved choice the catalog no longer lists stays shown, so the select never pretends it is unset.
            current !== PAGE.model.unset && !choices.some((entry) => entry.value === current) ? h('option', { value: current }, current) : null,
            choices.map((entry) => h('option', { key: entry.value, value: entry.value }, entry.label)))),
        h('p', { className: PAGE.css.hint }, note ?? t('modelHint')),
        saveFailed ? h('p', { className: PAGE.css.error, role: 'alert' }, t('modelSaveFailed')) : null)
    }

    /** The instance's target URL in a hosted child, or `undefined` (`target.js` `hasInstanceTarget`). */
    function instanceUrl(snapshot) {
      const url = snapshot.value?.[SHARED.instanceTarget.field]
      return typeof url === 'string' && url.trim() !== '' ? url : undefined
    }

    function makePage(ctx, t, section, token) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      const instanceForm = ctx.configForms.get(SHARED.instanceTarget.row)
      return function FishballCoreSettings(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        // Read-only here: the instance owns that setting. While it has a value core uses it, so the
        // user's `target.url` stays editable but is said to apply only without it.
        const supplied = instanceUrl(React.useSyncExternalStore((listener) => instanceForm.subscribe(listener), () => instanceForm.getSnapshot()))
        const credential = React.useSyncExternalStore(token.subscribe, token.get)
        const baseId = React.useId()
        useLocale(ctx)
        if (props.view === PAGE.summary) return t('summary')
        const disabled = !state.writable || state.saving
        const [target, ...rest] = SHARED.settings.fields
        const fieldOf = (field) => {
          const value = state.fields[field]
          return h('div', { key: field, 'data-fishball-setting': field },
            h(SettingsValueField, {
              id: `${baseId}-${field}`, label: t('field.' + field), hint: t(field === target && supplied !== undefined ? 'hint.target.url.supplied' : 'hint.' + field), text: value.text,
              overridden: value.overridden, invalid: value.invalid, overriddenLabel: t('overridden'), resetLabel: t('reset'),
              invalidLabel: t('invalid'), disabled, onEdit: (text) => section.actions.edit(field, text), onReset: () => section.actions.resetField(field),
            }))
        }
        return h('div', { className: PAGE.css.root, 'data-fishball-core-settings': true },
          supplied === undefined ? null : h('p', { className: PAGE.css.hint, 'data-fishball-instance-target': true }, t('instanceTarget', { url: supplied })),
          h(SettingsForm, {
            labels: { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') },
            state, onSave: section.actions.save, onDiscard: section.actions.discard,
          },
          fieldOf(target),
          h('div', { key: PAGE.token, 'data-fishball-setting': PAGE.token },
            h(SettingsSecretField, {
              id: `${baseId}-${PAGE.token}`, label: t('field.token'), hint: t('hint.token'), text: state.fields[PAGE.token].text,
              configured: credential.configured, stateLabel: t(credential.configured ? 'token.waiting' : 'token.none'),
              disabled: disabled || !credential.writable, onEdit: (text) => section.actions.edit(PAGE.token, text),
            })),
          ...rest.map(fieldOf)),
          h(ModelControl, { ctx, form: ctx.configForms.get(SHARED.settings.namespace), t }),
          h(ConnectControl, { t }))
      }
    }

    /** Registered while the Host serves core's namespace: a DSH without core's row shows no page. */
    const pagePlugin = (t) => Object.freeze({
      name: 'fishball-core-settings-page',
      inject: ['slots', 'locale', 'configForms', 'remote', 'remote.credentials'],
      apply(ctx) {
        ctx.effect(() => {
          const token = tokenStore(ctx.remote.credentials)
          const section = pageForm(ctx.configForms.get(SHARED.settings.namespace), token)
          const Page = makePage(ctx, t, section, token)
          void token.read()
          // DSH announces a change of a reference's stored value (core's unset after it saved its
          // copy, the instance's import or Reconnect), as DSH's own credential pages listen to it.
          const stopListening = ctx.remote.$on(PAGE.credentialChanged, (ref) => { if (ref === SHARED.tokenRef) void token.read() })
          const stopServing = ctx.configForms.whileServed([SHARED.settings.namespace], () =>
            ctx.slots.inject(PAGE.slot, () => ctx.slots.register({ name: PAGE.slot, key: SHARED.bundle, locale: PAGE.locale }, Page)))
          return () => { stopServing(); stopListening(); section.dispose() }
        }, 'fishball core settings: page')
      },
    })

    function apply(ctx) {
      const t = ctx.locale.bind(PAGE.locale)
      ctx.effect(() => ctx.locale.register(PAGE.locale, { en, zh }), 'fishball core settings: dictionaries')
      ctx.effect(mountStyle, 'fishball core settings: styles')
      ctx.plugin(pagePlugin(t))
    }

    return { settingsPlugin: Object.freeze({ name: 'fishball-core-settings', inject: ['locale'], apply }) }
  },
})
