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
 * (Q-B2: "子实例内的界面和独立版本一样"). It holds the target list (MULTI-1, below), each target with its
 * own write-only token field (Q-B2) and Connect control (design §6.3a step 1),
 * `connect.clientMetadataUrl` (R12 = B), the identity, and Fishball's model (F-WIRE; the user: "同步只是
 * 同步model list，至于fishball用什么还要在fishball内设置"; unset = this DSH's default model). Saving is DSH's own
 * settings save of core's row namespace; a token goes to DSH's credential store under its target's
 * reference; the targets go through core's target routes (`SEAM_TARGETS.route`); the model is a field
 * of the same namespace (`FISHBALL_MODEL.path`),
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
 *
 * MULTI-1 (PLAN-MULTI §3.1, §6.1, Q01, Q04–Q07, Q12; MULTI-0 `SEAM_TARGETS`): the single `target.url`
 * field, the single token field and the single Connect control are replaced by the target list
 * (`TargetsSection`): add a target by URL, and per target edit its URL, paste its own token, Connect /
 * Cancel / Retry, and remove it. Removing a target, or changing its URL to another endpoint, asks for
 * confirmation first (DSH's `Modal`, as DSH's plugin manager confirms an uninstall). A hosted child's
 * parent is listed first, read-only and not removable. The client metadata URL stays one global field
 * (Q06). Names are server-supplied: drawn as text only, never HTML.
 */
window.__ModuleLoader__.load({
  // A chunk of core's client (client.js `CORE.settings`): the owner id and this file's name.
  id: 'fishball-core',
  chunk: 'client.settings.js',
  factory(require) {
    const React = require('react')
    const { Button, Input, Modal, SettingsForm, SettingsFormModel, SettingsSecretField, SettingsValueField, StateDot, IconRightUpOutlineRegular, settingsTextField } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /**
     * Names this page shares with the Node side. A browser chunk cannot import core's Node modules,
     * so each is restated here from its one owner (keep them in step):
     * - `bundle`: core's bundle name (`contracts/constants.js` `GUARDS.bundleName`): the page's slot
     *   key and what `pluginNavigation.openBundle` opens;
     * - `settings`: `src/settings/constants.js` `SETTINGS`: the namespace of core's row and the
     *   page's fields, a dotted name being a nested path (`connect.clientMetadataUrl` is K3a's
     *   `CONNECT.setting`). The namespace is spelled as the bundle, but they are two facts;
     * - `tokenRef`: a target's token entry (MULTI-0 `TARGETS.credentials` and `HOSTED_IMPORT.credentialRef`):
     *   the parent's is the hosted import's reference (Q-B2, design §5.4: "feed the same
     *   credential-reference path"); an added target's is `prefix + id + separator + epoch`, every `-`
     *   written `_`. Each field writes its own target's reference only;
     * - `targets`: `fishball-shared/ui-seam` `SEAM_TARGETS` (routes, fields, refusals, kinds, states),
     *   document-relative paths;
     * - `connectState` / `configuration`: `CONNECT.state` / `CONNECT.configuration` (K3a, PROPOSED codes);
     * - `linkCode`: K3a `LINK.code`'s URL refusals, which `add` / `setUrl` answer;
     * - `model`: `FISHBALL_MODEL.path[0]`, the namespace field of Fishball's model.
     */
    const SHARED = Object.freeze({
      bundle: 'fishball-core',
      settings: Object.freeze({
        namespace: 'fishball-core',
        fields: Object.freeze(['connect.clientMetadataUrl', 'identity.id', 'identity.name']),
      }),
      tokenRef: Object.freeze({ parentId: 'parent', parent: 'DSH_AGENT_TOKEN', prefix: 'FISHBALL_TARGET_TOKEN_', separator: '__', replaced: '-', replacement: '_' }),
      targets: Object.freeze({
        list: 'api/fishball/targets', connect: 'api/fishball/targets/connect', cancel: 'api/fishball/targets/cancel', retry: 'api/fishball/targets/retry',
        add: 'api/fishball/targets/add', remove: 'api/fishball/targets/remove', url: 'api/fishball/targets/url',
        targetIdField: 'targetId', fields: Object.freeze({ url: 'url', confirmed: 'confirmed' }),
        kind: Object.freeze({ parent: 'parent', remote: 'remote' }),
        state: Object.freeze({ connected: 'connected', connecting: 'connecting', failed: 'failed', notSet: 'not-set' }),
        refusal: Object.freeze({ unknownTarget: 'unknown-target', targetDuplicate: 'target-duplicate', targetReserved: 'target-reserved', confirmationRequired: 'confirmation-required' }),
        snapshotVersion: 1,
      }),
      linkCode: Object.freeze({ insecure: 'target-insecure', invalid: 'target-invalid' }),
      // `SEAM_STATUS.control`: a target's one Connect control.
      control: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
      connectState: Object.freeze({ needsConfiguration: 'needs-configuration', needsAuthorization: 'needs-authorization', authorizing: 'authorizing', authorized: 'authorized', failed: 'failed' }),
      configuration: Object.freeze(['metadata-url-missing', 'metadata-url-not-https', 'metadata-url-root-path', 'not-a-connector', 'web-callback-insecure']),
      model: 'model',
    })
    /** The Connect control's own word for "no answer from the route" (not a `CONNECT.state`). */
    const CONNECT_UNAVAILABLE = 'unavailable'
    const PAGE = Object.freeze({
      locale: 'fishball-core-settings',
      slot: 'plugins.bundle.config',
      /**
       * `plugins.bundle.config` renders only `view: 'page'` today (slot-contract.d.ts); the summary
       * view is kept because the page's props contract (`PluginConfigViewProps`) names both views.
       */
      summary: 'summary',
      separator: '.',
      connect: Object.freeze({
        read: Object.freeze({ method: 'GET', credentials: 'same-origin', cache: 'no-store' }),
        post: Object.freeze({ method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: Object.freeze({ 'content-type': 'application/json' }) }),
        outcome: Object.freeze({ authorized: 'authorized', approvalUrl: 'approval-url', needsConfiguration: 'needs-configuration' }),
        /**
         * The approval page opens in a new tab with no link back to this page (no `window.opener`).
         * The open runs after the POST's await, where a browser may block it unnoticed (`noopener`
         * makes `window.open` answer null either way), so the URL is also shown as a link.
         */
        open: Object.freeze({ target: '_blank', features: 'noopener', rel: 'noopener noreferrer' }),
        reread: 'focus',
        unavailable: CONNECT_UNAVAILABLE,
      }),
      /** The most references one `remote.credentials.describe` takes (dsh-api-settings-controller `MAX_DESCRIBE_REFS`, both SDKs). */
      describeBatch: 64,
      /** DSH's remote event for a committed credential-reference change (dsh-credentials, both SDKs). */
      credentialChanged: 'credentials/reference-updated',
      css: Object.freeze({
        id: 'fishball-core-settings-style', root: 'fb-core-settings', row: 'fb-core-settings-row', hint: 'fb-core-settings-hint', error: 'fb-core-settings-error',
        card: 'fb-core-settings-card', head: 'fb-core-settings-head', title: 'fb-core-settings-title', status: 'fb-core-settings-status',
        select: 'fb-core-settings-select', link: 'fb-core-settings-link',
        list: 'fb-core-settings-targets', name: 'fb-core-settings-name', url: 'fb-core-settings-url', actions: 'fb-core-settings-actions',
      }),
      /** A target's public state (SEAM_TARGETS.state) as DSH's StateDot, as the sidebar shows it. */
      targetDot: Object.freeze({ connected: 'done', connecting: 'ongoing', failed: 'error', 'not-set': 'idle' }),
      /** Connect is the section's call to action only while it can start a grant; otherwise it stays quiet. */
      connectPrimary: Object.freeze([SHARED.connectState.needsAuthorization, SHARED.connectState.failed]),
      button: Object.freeze({ primary: 'primary', outline: 'outline' }),
      icon: 14,
      /**
       * The model control: one native select whose option values are the catalog's (provider, model,
       * effort) triples as JSON, plus the empty "DSH's default" option that clears the field.
       */
      model: Object.freeze({ unset: '', effortless: null, catalog: Object.freeze({ loading: 'loading', ready: 'ready', failed: 'failed' }) }),
      /**
       * DSH's remote session face (`remote.session`, dsh-api-session-controller, both SDKs), looked
       * up with `ctx.get`, never as `ctx.remote.session`: the page does not inject it, and Cordis
       * throws on a property read of a service the plugin did not inject (E-FIX-3 B5).
       */
      remoteSession: 'remote.session',
    })
    const en = {
      summary: 'Fishball\'s targets, connections and identity.',
      'field.connect.clientMetadataUrl': 'Client metadata URL',
      'hint.connect.clientMetadataUrl': 'The https URL of the OAuth client metadata document you host for Connect. Connect needs it.',
      'field.identity.id': 'Fishball id',
      'hint.identity.id': 'Letters, digits, _ and -, at most 64. Sent to the target as this Fishball\'s id.',
      'field.identity.name': 'Name',
      'hint.identity.name': 'The name the target shows for this Fishball.',
      'field.token': 'Token for connecting this DSH',
      'hint.token': 'Paste a token freshly generated in this DSH\'s connector settings. It is saved for the next connection and never shown again.',
      'token.waiting': 'A token is waiting to be used',
      'token.none': 'No token waiting',
      targetsTitle: 'DSH targets',
      targetsHint: 'The DSHs Fishball works with: one MCP URL of a DSH connector each.',
      targetsEmpty: 'No target yet. Add the MCP URL of a DSH connector.',
      targetsUnavailable: 'The targets are not available right now.',
      'name.unavailable': 'Name unavailable',
      'state.connected': 'Connected', 'state.connecting': 'Connecting', 'state.failed': 'Failed', 'state.not-set': 'Not set',
      parent: 'The DSH this Fishball runs in. Its URL comes from the instance.',
      addLabel: 'New target URL',
      add: 'Add',
      urlLabel: 'URL',
      saveUrl: 'Save URL',
      remove: 'Remove',
      retry: 'Retry',
      cancel: 'Cancel',
      'refusal.target-duplicate': 'That URL is already in the list.',
      'refusal.target-invalid': 'Not a valid MCP URL.',
      'refusal.target-insecure': 'Only a loopback URL may use http; use https.',
      'refusal.target-reserved': 'This target cannot be changed here.',
      'refusal.unknown-target': 'That target is no longer in the list.',
      'refusal.unknown': 'The change was not made ({code}).',
      removeTitle: 'Remove {name}?',
      removeText: 'Its waiting cards are voided and its saved token is deleted. Its history stays, read-only. Nothing is sent to the DSH.',
      urlTitle: 'Change the URL of {name}?',
      urlText: 'This is another endpoint: Fishball connects anew. Its waiting cards are voided and its saved token is deleted. Its history stays, read-only.',
      confirmRemove: 'Remove',
      confirmUrl: 'Change URL',
      close: 'Close',
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
      'field.connect.clientMetadataUrl': '客户端元数据地址',
      'hint.connect.clientMetadataUrl': '你为 Connect 托管的 OAuth 客户端元数据文档的 https 地址。Connect 需要它。',
      'field.identity.id': 'Fishball id',
      'hint.identity.id': '字母、数字、_ 和 -，最多 64 个字符。作为这个 Fishball 的 id 发送给目标。',
      'field.identity.name': '名字',
      'hint.identity.name': '目标显示的这个 Fishball 的名字。',
      'field.token': '连接这个 DSH 的 token',
      'hint.token': '粘贴在这个 DSH 的 connector 设置中新生成的 token。它会保存供下一次连接使用，之后不再显示。',
      'token.waiting': '有一个 token 等待使用',
      'token.none': '没有等待使用的 token',
      targetsTitle: 'DSH 目标',
      targetsHint: 'Fishball 所连接的 DSH：每个是一个 DSH connector 的 MCP 地址。',
      targetsEmpty: '还没有目标。请添加一个 DSH connector 的 MCP 地址。',
      targetsUnavailable: '目标现在不可用。',
      'name.unavailable': '名称不可用',
      'state.connected': '已连接', 'state.connecting': '连接中', 'state.failed': '失败', 'state.not-set': '未设置',
      parent: '这个 Fishball 所在的 DSH。它的地址由 instance 提供。',
      addLabel: '新目标地址',
      add: '添加',
      urlLabel: '地址',
      saveUrl: '保存地址',
      remove: '移除',
      retry: '重试',
      cancel: '取消',
      'refusal.target-duplicate': '这个地址已经在列表中。',
      'refusal.target-invalid': '不是有效的 MCP 地址。',
      'refusal.target-insecure': '只有本机地址可以使用 http；请使用 https。',
      'refusal.target-reserved': '这个目标不能在这里更改。',
      'refusal.unknown-target': '这个目标已经不在列表中。',
      'refusal.unknown': '没有完成更改（{code}）。',
      removeTitle: '移除 {name}？',
      removeText: '它等待中的卡片会作废，保存的 token 会删除。它的历史会保留，只读。不会向这个 DSH 发送任何内容。',
      urlTitle: '更改 {name} 的地址？',
      urlText: '这是另一个端点：Fishball 会重新连接。它等待中的卡片会作废，保存的 token 会删除。它的历史会保留，只读。',
      confirmRemove: '移除',
      confirmUrl: '更改地址',
      close: '关闭',
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
    // UI-POLISH-F: the form stays DSH's own; the model and Connect sit below it as cards in DSH's
    // settings card material (the Models settings page's cards), and the select takes the look of
    // DSH's settings inputs (SettingsValueField, both SDKs). Tokens only.
    const css = [
      `.${PAGE.css.root}{display:grid;gap:16px}`,
      `.${PAGE.css.row}{display:flex;align-items:center;flex-wrap:wrap;gap:8px}`,
      `.${PAGE.css.hint}{margin:0;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12)}`,
      `.${PAGE.css.error}{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary)}`,
      `.${PAGE.css.card}{display:grid;gap:10px;padding:14px 16px;border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill);box-shadow:inset 0 0 0 .5px var(--dsw-alias-settings-card-stroke)}`,
      `.${PAGE.css.head}{display:flex;align-items:center;gap:8px;min-height:28px}`,
      `.${PAGE.css.title}{margin:0;font:var(--dsw-font-xs-strong-13);color:var(--dsw-alias-label-primary)}`,
      `.${PAGE.css.status}{display:inline-flex;align-items:center;gap:6px;min-width:0;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13)}`,
      `.${PAGE.css.head} > button,.${PAGE.css.head} > [role=status]{margin-left:auto}`,
      `.${PAGE.css.select}{box-sizing:border-box;width:100%;height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-primary)}`,
      `.${PAGE.css.select}:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:-1px}`,
      `.${PAGE.css.select}:disabled{color:var(--dsw-alias-label-tertiary)}`,
      `.${PAGE.css.list}{display:grid;gap:12px}`,
      // A server name can be any length or script: one line, cut visually, the full text in its title.
      `.${PAGE.css.name}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
      `.${PAGE.css.url}{margin:0;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);overflow-wrap:anywhere}`,
      `.${PAGE.css.actions}{display:flex;flex-wrap:wrap;gap:8px}`,
      `.${PAGE.css.row} > span:first-child{flex:1 1 240px;min-width:0}`,
      `.${PAGE.css.link}{display:inline-flex;align-items:center;gap:4px;justify-self:start;color:var(--dsw-alias-link);font:var(--dsw-font-xs-13);text-decoration:none}`,
      `.${PAGE.css.link}:hover{text-decoration:underline}`,
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
     * per field (`path: [field]`), while core's settings nest (`connect.clientMetadataUrl`,
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

    /** A target's token entry reference (`SHARED.tokenRef`): the parent's import, or the target epoch's own. */
    const tokenRefOf = (target) => (target.targetId === SHARED.tokenRef.parentId ? SHARED.tokenRef.parent
      : (SHARED.tokenRef.prefix + target.targetId + SHARED.tokenRef.separator + target.endpointEpoch).split(SHARED.tokenRef.replaced).join(SHARED.tokenRef.replacement))

    /**
     * The token entries' store: for each reference, whether a token waits there (DSH's `describe`,
     * never the value), and its write. A value lives only in its own field's state until saved,
     * then goes to DSH's credential store under that target's reference and nowhere else: this page
     * keeps, logs or sends it in no other way (no URL, no request of its own).
     */
    function tokenStore(credentials) {
      // Writable until DSH says otherwise, as DSH's own credential pages assume: an unanswered
      // describe must not lock the field with no reason shown; a refused write shows save-failed.
      let state = Object.freeze({})
      let refs = Object.freeze([])
      let sequence = 0
      const listeners = new Set()
      const read = async () => {
        // Only the latest read publishes: an older answer arriving late would show a stale badge.
        const mine = ++sequence
        // DSH's describe takes a bounded batch, and the list has no cap (Q12): one call per batch.
        const batches = []
        for (let at = 0; at < refs.length; at += PAGE.describeBatch) batches.push(refs.slice(at, at + PAGE.describeBatch))
        const answers = await Promise.all(batches.map((batch) => remoteResult(() => credentials.describe(batch))))
        if (mine !== sequence) return
        const views = Object.assign({}, ...answers.map((answer) => answer?.value ?? {}))
        state = Object.freeze(Object.fromEntries(refs.map((ref) => {
          const view = views[ref]
          return [ref, Object.freeze({ configured: view?.configured === true, writable: view?.writable !== false })]
        })))
        listeners.forEach((listener) => listener())
      }
      return {
        get: () => state,
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        /** Follows the references of the targets listed now. */
        track(next) {
          if (next.length === refs.length && next.every((ref, i) => ref === refs[i])) return
          refs = Object.freeze([...next])
          void read()
        },
        knows: (ref) => refs.includes(ref),
        read,
        async write(ref, value) {
          const written = (await remoteResult(() => credentials.set(ref, value))) !== undefined
          await read()
          return written
        },
      }
    }

    /** The staged form: the global text fields over `dottedForm` (the tokens are per target, below). */
    function pageForm(form) {
      const model = new SettingsFormModel(dottedForm(form), SHARED.settings.fields.map((field) => settingsTextField(field)), [])
      const store = model.bind(() => ({ ...model.shell(), fields: Object.fromEntries(SHARED.settings.fields.map((field) => [field, model.field(field)])) }))
      return { store, actions: model.actions(), dispose: () => model.dispose() }
    }

    /** One call of a target route (`SHARED.targets`); `undefined` for no answer or a body that is no JSON object. */
    async function targetRequest(path, body) {
      try {
        const init = body === undefined ? PAGE.connect.read : { ...PAGE.connect.post, body: JSON.stringify(body) }
        const response = await fetch(new URL(path, document.baseURI), init)
        const answer = await response.json()
        return answer !== null && typeof answer === 'object' ? answer : undefined
      } catch { return undefined }
    }

    /**
     * The target list (`GET SHARED.targets.list`), read on mount, on window focus and after each
     * action. `undefined` while unanswered or unavailable; only the latest read publishes.
     */
    function useTargets() {
      const [snapshot, setSnapshot] = React.useState(undefined)
      const sequence = React.useRef(0)
      const mounted = React.useRef(true)
      const read = React.useCallback(async () => {
        const mine = ++sequence.current
        const answer = await targetRequest(SHARED.targets.list)
        // R-FIX-FUI's ownership rule: after unmount nothing settles, and only the latest read publishes.
        if (!mounted.current || mine !== sequence.current) return
        setSnapshot(answer?.version === SHARED.targets.snapshotVersion && Array.isArray(answer.targets) ? answer : null)
      }, [])
      /** An action began: every read started before it is stale, so its answer never publishes over the action's own follow-up read. */
      const invalidate = React.useCallback(() => { ++sequence.current }, [])
      React.useEffect(() => {
        mounted.current = true
        void read()
        window.addEventListener(PAGE.connect.reread, read)
        return () => {
          mounted.current = false
          window.removeEventListener(PAGE.connect.reread, read)
        }
      }, [read])
      return [snapshot, read, invalidate]
    }

    /** What a target's Connect status says, as one comparable value: a press's notice lasts while it stays the same. */
    const statusKey = (connect) => JSON.stringify([connect?.state ?? CONNECT_UNAVAILABLE, connect?.code ?? null])

    /**
     * One Connect press's answer (`ConnectBegin`) as `{notice, approvalUrl}`: `notice` is the
     * `needs-configuration` code, `unavailable` for any answer it cannot act on, or `undefined`;
     * `approvalUrl` is the approval page to open, also shown as a link. Pure: the caller opens it,
     * and only while its page is still mounted.
     */
    function pressResult(answer) {
      const { outcome } = PAGE.connect
      if (answer?.outcome === outcome.authorized) return {}
      if (answer?.outcome === outcome.approvalUrl && typeof answer.url === 'string') return { approvalUrl: answer.url }
      return { notice: answer?.outcome === outcome.needsConfiguration && typeof answer.code === 'string' ? answer.code : PAGE.connect.unavailable }
    }

    /** The message of a refused target action (`{ok: false, code}`), or `null` for success. */
    function refusalText(t, result) {
      if (result?.ok === true) return null
      const code = typeof result?.code === 'string' ? result.code : PAGE.connect.unavailable
      if (code === PAGE.connect.unavailable) return t('targetsUnavailable')
      return [...Object.values(SHARED.targets.refusal), ...Object.values(SHARED.linkCode)].includes(code) ? t('refusal.' + code) : t('refusal.unknown', { code })
    }

    /** The Connect line of one target (design §6.3a step 1): its state, the approval link, its alert. */
    function connectAlert(t, connect, notice) {
      const state = connect?.state ?? PAGE.connect.unavailable
      // A press's own refusal first; else the status's code while it still needs configuration.
      const code = notice ?? (state === SHARED.connectState.needsConfiguration ? connect.code : null)
      if (typeof code !== 'string') return null
      if (code === PAGE.connect.unavailable) return t('connect.unavailable')
      return SHARED.configuration.includes(code) ? t('config.' + code) : t('config.unknown', { code })
    }

    /**
     * One confirmation (Q07) in DSH's own `Modal`, as DSH's plugin manager confirms an uninstall:
     * the action runs only after its confirm button; Cancel or closing runs nothing.
     */
    function ConfirmDialog({ t, title, text, confirmLabel, onConfirm, onCancel }) {
      return h(Modal, {
        open: true, onClose: onCancel, title, closeLabel: t('close'), description: text,
        footer: h(React.Fragment, null,
          h(Button, { variant: PAGE.button.outline, onClick: onCancel }, t('cancel')),
          h(Button, { variant: PAGE.button.primary, onClick: onConfirm, 'data-fishball-confirm': true }, confirmLabel)),
      })
    }

    /**
     * One target's card: its name (server-supplied, drawn as text) or the Q01 placeholder, its state,
     * its URL (an input for an added target, plain text for the parent), its own token field, Connect /
     * Cancel / Retry and Remove. A URL change to another endpoint and a removal ask first (Q07).
     * Async ownership (R-FIX-FUI's rule, review finding 5): after unmount nothing settles into the
     * card and no approval page opens; of several Connect presses only the latest opens its page
     * and shows its notice.
     */
    function TargetCard({ t, target, token, refresh, invalidate, disabled }) {
      const mounted = React.useRef(true)
      const pressed = React.useRef(0)
      React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
      const show = (update) => { if (mounted.current) setView(update) }
      const [draft, setDraft] = React.useState(target.url)
      const [secret, setSecret] = React.useState('')
      const [view, setView] = React.useState({})
      const [confirm, setConfirm] = React.useState(null)
      const titleId = React.useId()
      const ref = tokenRefOf(target)
      const credential = token.get()[ref] ?? Object.freeze({ configured: false, writable: true })
      const name = target.name ?? t('name.unavailable')
      const act = async (path, body) => {
        invalidate()
        const result = await targetRequest(path, { [SHARED.targets.targetIdField]: target.targetId, ...body })
        show((current) => ({ ...current, alert: refusalText(t, result) }))
        await refresh()
        return result
      }
      const asking = async (path, body) => {
        const result = await act(path, body)
        // The one refusal that is a question, not an answer: ask, then send again confirmed.
        if (result?.code === SHARED.targets.refusal.confirmationRequired && mounted.current) {
          setView((current) => ({ ...current, alert: null }))
          setConfirm({ path, body })
        }
      }
      const begin = async () => {
        invalidate()
        const mine = ++pressed.current
        const press = pressResult(await targetRequest(SHARED.targets.connect, { [SHARED.targets.targetIdField]: target.targetId }))
        if (!mounted.current || mine !== pressed.current) return
        if (press.approvalUrl !== undefined) window.open(press.approvalUrl, PAGE.connect.open.target, PAGE.connect.open.features)
        // The notice's basis is the status the follow-up read finds (`basis` unset until then).
        setView((current) => ({ ...current, notice: undefined, approvalUrl: undefined, basis: undefined, ...press }))
        await refresh()
      }
      // R-FIX-FUI review finding 6, per card: the first status after a press's notice is its basis;
      // a later status that says something else (fixed, or authorized elsewhere) supersedes the
      // refusal, so the notice goes; the same status keeps it.
      const key = statusKey(target.connect)
      React.useEffect(() => {
        if (view.notice === undefined) return
        if (view.basis === undefined) setView((current) => ({ ...current, basis: key }))
        else if (view.basis !== key) setView((current) => ({ ...current, notice: undefined, basis: undefined }))
      }, [key, view.notice, view.basis])
      const saveToken = async () => {
        const value = secret.trim()
        if (value === '') return
        const written = await token.write(ref, value)
        if (!mounted.current) return
        if (written) setSecret('')
        setView((current) => ({ ...current, tokenFailed: !written }))
      }
      const connectState = target.connect?.state
      const alert = view.alert ?? connectAlert(t, target.connect, view.notice)
      const parent = target.kind === SHARED.targets.kind.parent
      return h('section', { className: PAGE.css.card, 'data-fishball-target': target.targetId, 'data-fishball-target-state': target.state, 'aria-labelledby': titleId },
        h('div', { className: PAGE.css.head },
          h('h3', { id: titleId, className: PAGE.css.title + ' ' + PAGE.css.name, title: name }, name),
          h('span', { className: PAGE.css.status, role: 'status' }, h(StateDot, { state: PAGE.targetDot[target.state] ?? PAGE.targetDot[SHARED.targets.state.failed] }), t('state.' + target.state))),
        parent ? h('p', { className: PAGE.css.hint }, t('parent')) : null,
        parent ? h('p', { className: PAGE.css.url }, target.url)
          : h('div', { className: PAGE.css.row },
            h(Input, { 'aria-label': t('urlLabel'), value: draft, disabled, onChange: (event) => setDraft(event.target.value), 'data-fishball-target-url': true }),
            h(Button, { type: 'button', size: 'sm', variant: PAGE.button.outline, disabled: disabled || draft === target.url, onClick: () => void asking(SHARED.targets.url, { [SHARED.targets.fields.url]: draft }) }, t('saveUrl'))),
        h(SettingsSecretField, {
          id: `${titleId}-token`, label: t('field.token'), hint: t('hint.token'), text: secret,
          configured: credential.configured, stateLabel: t(credential.configured ? 'token.waiting' : 'token.none'),
          disabled: disabled || !credential.writable, onEdit: setSecret,
        }),
        view.tokenFailed ? h('p', { className: PAGE.css.error, role: 'alert' }, t('saveFailed')) : null,
        h('div', { className: PAGE.css.actions },
          secret.trim() === '' ? null : h(Button, { type: 'button', size: 'sm', variant: PAGE.button.primary, disabled, onClick: () => void saveToken(), 'data-fishball-target-token-save': true }, t('save')),
          target.control === SHARED.control.cancel
            ? h(Button, { type: 'button', size: 'sm', variant: PAGE.button.outline, onClick: () => void act(SHARED.targets.cancel), 'data-fishball-target-cancel': true }, t('cancel'))
            : h(Button, { type: 'button', size: 'sm', variant: PAGE.connectPrimary.includes(connectState) ? PAGE.button.primary : PAGE.button.outline, onClick: () => void begin(), 'data-fishball-connect-begin': true }, t('connect')),
          h(Button, { type: 'button', size: 'sm', variant: PAGE.button.outline, onClick: () => void act(SHARED.targets.retry), 'data-fishball-target-retry': true }, t('retry')),
          parent ? null : h(Button, { type: 'button', size: 'sm', variant: PAGE.button.outline, disabled, onClick: () => void asking(SHARED.targets.remove), 'data-fishball-target-remove': true }, t('remove'))),
        view.approvalUrl === undefined || connectState !== SHARED.connectState.authorizing ? null
          : h('a', { className: PAGE.css.link, href: view.approvalUrl, target: PAGE.connect.open.target, rel: PAGE.connect.open.rel, 'data-fishball-connect-approval': true },
            t('connect.openApproval'), h(IconRightUpOutlineRegular, { size: PAGE.icon })),
        alert === null ? null : h('p', { className: PAGE.css.error, role: 'alert' }, alert),
        confirm === null ? null : h(ConfirmDialog, {
          t,
          title: t(confirm.path === SHARED.targets.remove ? 'removeTitle' : 'urlTitle', { name }),
          text: t(confirm.path === SHARED.targets.remove ? 'removeText' : 'urlText'),
          confirmLabel: t(confirm.path === SHARED.targets.remove ? 'confirmRemove' : 'confirmUrl'),
          onCancel: () => setConfirm(null),
          onConfirm: () => { const { path, body } = confirm; setConfirm(null); void act(path, { ...body, [SHARED.targets.fields.confirmed]: true }) },
        }))
    }

    /** The target list (PLAN-MULTI §3.1): every target's card, in order, and Add. No count cap (Q12). */
    function TargetsSection({ t, token, disabled }) {
      const [snapshot, refresh, invalidate] = useTargets()
      const [draft, setDraft] = React.useState('')
      const [alert, setAlert] = React.useState(null)
      const titleId = React.useId()
      const targets = snapshot?.targets ?? []
      React.useEffect(() => { token.track(targets.map(tokenRefOf)) }, [snapshot])
      React.useSyncExternalStore(token.subscribe, token.get)
      const add = async () => {
        invalidate()
        const result = await targetRequest(SHARED.targets.add, { [SHARED.targets.fields.url]: draft })
        setAlert(refusalText(t, result))
        if (result?.ok === true) setDraft('')
        await refresh()
      }
      return h('section', { className: PAGE.css.list, 'data-fishball-targets': true, 'aria-labelledby': titleId },
        h('div', { className: PAGE.css.head }, h('h3', { id: titleId, className: PAGE.css.title }, t('targetsTitle'))),
        h('p', { className: PAGE.css.hint }, snapshot === null ? t('targetsUnavailable') : targets.length === 0 && snapshot !== undefined ? t('targetsEmpty') : t('targetsHint')),
        targets.map((target) => h(TargetCard, { key: target.targetId + target.endpointEpoch, t, target, token, refresh, invalidate, disabled })),
        h('div', { className: PAGE.css.row },
          h(Input, { 'aria-label': t('addLabel'), value: draft, disabled, onChange: (event) => setDraft(event.target.value), 'data-fishball-target-add-url': true }),
          h(Button, { type: 'button', size: 'sm', variant: PAGE.button.primary, disabled: disabled || draft.trim() === '', onClick: () => void add(), 'data-fishball-target-add': true }, t('add'))),
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
        // with the model control's failed note, not no page at all. Hence the lookup by name, read
        // once per mount: a namespace not mounted yet reads as failed until the page opens again.
        Promise.resolve().then(() => ctx.get(PAGE.remoteSession).modelCatalog()).then((answer) => {
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
      return h('section', { className: PAGE.css.card, 'data-fishball-model': true, 'aria-label': t('modelTitle') },
        h('div', { className: PAGE.css.head }, h('label', { className: PAGE.css.title, htmlFor: id }, t('modelTitle'))),
        h('div', { className: PAGE.css.row },
          h('select', { id, className: PAGE.css.select, value: current, disabled: !snapshot.writable, onChange: (event) => void pick(event.target.value), 'data-fishball-model-select': true },
            h('option', { value: PAGE.model.unset }, t('modelDefault')),
            // A saved choice the catalog no longer lists stays shown, so the select never pretends it is unset.
            current !== PAGE.model.unset && !choices.some((entry) => entry.value === current) ? h('option', { value: current }, current) : null,
            choices.map((entry) => h('option', { key: entry.value, value: entry.value }, entry.label)))),
        h('p', { className: PAGE.css.hint }, note ?? t('modelHint')),
        saveFailed ? h('p', { className: PAGE.css.error, role: 'alert' }, t('modelSaveFailed')) : null)
    }

    function makePage(ctx, t, section, token) {
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballCoreSettings(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        const baseId = React.useId()
        useLocale(ctx)
        if (props.view === PAGE.summary) return t('summary')
        const disabled = !state.writable || state.saving
        const fieldOf = (field) => {
          const value = state.fields[field]
          return h('div', { key: field, 'data-fishball-setting': field },
            h(SettingsValueField, {
              id: `${baseId}-${field}`, label: t('field.' + field), hint: t('hint.' + field), text: value.text,
              overridden: value.overridden, invalid: value.invalid, overriddenLabel: t('overridden'), resetLabel: t('reset'),
              invalidLabel: t('invalid'), disabled, onEdit: (text) => section.actions.edit(field, text), onReset: () => section.actions.resetField(field),
            }))
        }
        return h('div', { className: PAGE.css.root, 'data-fishball-core-settings': true },
          h(TargetsSection, { t, token, disabled: !state.writable }),
          h(SettingsForm, {
            labels: { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') },
            state, onSave: section.actions.save, onDiscard: section.actions.discard,
          }, ...SHARED.settings.fields.map(fieldOf)),
          h(ModelControl, { ctx, form: ctx.configForms.get(SHARED.settings.namespace), t }))
      }
    }

    /** Registered while the Host serves core's namespace: a DSH without core's row shows no page. */
    const pagePlugin = (t) => Object.freeze({
      name: 'fishball-core-settings-page',
      inject: ['slots', 'locale', 'configForms', 'remote', 'remote.credentials'],
      apply(ctx) {
        ctx.effect(() => {
          const token = tokenStore(ctx.remote.credentials)
          const section = pageForm(ctx.configForms.get(SHARED.settings.namespace))
          const Page = makePage(ctx, t, section, token)
          // DSH announces a change of a reference's stored value (core's unset after it saved its
          // copy, the instance's import or Reconnect), as DSH's own credential pages listen to it.
          const stopListening = ctx.remote.$on(PAGE.credentialChanged, (ref) => { if (token.knows(ref)) void token.read() })
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
