/**
 * Plugins for the embedded Fishball, managed from the main DSH (design §28, 2026-11-20). A chunk of
 * the instance's client.js. Only the main DSH runs pnpm on the child profile, through the
 * instance's routes (src/host/child-plugin-routes.js). It contributes to DSH's own Plugins page:
 * - a **Fishball** tab (`plugins.tab`): the child's plugins, each with Uninstall (confirmed first),
 *   an "Install for Fishball" button at the top, and the Recommended list (moved here from
 *   fishball-ui's Recommended tab, DESIGN §10f; data in RECOMMENDED below);
 * - an "Install for Fishball" item in DSH's Add plugin menu (`plugins.add.actions`);
 * - on each main-DSH bundle page (`plugins.detail.actions`): Uninstall from Fishball, Use in
 *   Fishball (an official bundle the installation ships) or Install to Fishball (its source spec);
 * - the install dialog (`shell.overlay`), following DSH's screens with DSH's components, since DSH
 *   does not export its own: package field, check, confirmation, progress with Cancel, result or Retry.
 * Progress comes from DSH's own forwarded `plugin-manager/install-state` and `install-log` events,
 * filtered by the request id the dialog chose.
 */
window.__ModuleLoader__.load({
  id: 'dsh-instance',
  chunk: 'client.fishball.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const { Button, Input, MenuItemButton, Modal, StateDot, Tag, IconDownloadOutlineRegular, IconPlusOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /** The chunk's identity: its locale namespace and its slot registrations. */
    const FEATURE = Object.freeze({
      name: 'dsh-instance-fishball-plugins',
      ns: 'dshInstanceFishball',
      slot: Object.freeze({ tab: 'plugins.tab', addActions: 'plugins.add.actions', detailActions: 'plugins.detail.actions', overlay: 'shell.overlay' }),
      id: Object.freeze({ tab: 'dsh-instance-fishball', addAction: 'dsh-instance-fishball-install', detailAction: 'dsh-instance-fishball-detail', dialog: 'dsh-instance-fishball-install' }),
      bundleSubject: 'bundle',
    })
    /** The instance's routes (src/host/child-plugin-routes.js CHILD_PLUGIN_ROUTE), page-relative. */
    const FISHBALL_API = Object.freeze({
      list: 'api/dsh-instance/plugins',
      inspect: 'api/dsh-instance/plugins/inspect',
      install: 'api/dsh-instance/plugins/install',
      cancel: 'api/dsh-instance/plugins/cancel',
      uninstall: 'api/dsh-instance/plugins/uninstall',
      use: 'api/dsh-instance/plugins/use',
      read: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      post: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }) }),
      unreadable: 'request-failed',
    })
    /** DSH's Host events: install progress (forwarded by dsh-api-remotes) and inventory changes. */
    const HOST_EVENT = Object.freeze({ state: 'plugin-manager/install-state', log: 'plugin-manager/install-log', changed: 'plugin-manager/changed', reset: 'connection/reset' })
    /** BundleInfo facts the per-plugin button reads (dsh-plugin-manager types). */
    const BUNDLE = Object.freeze({ shipped: 'installation', missing: 'missing' })
    /** The install dialog's screens, and DSH's vocabulary it reads. */
    const STEP = Object.freeze({ edit: 'edit', checking: 'checking', confirm: 'confirm', installing: 'installing', done: 'done', failed: 'failed' })
    const INSPECT = Object.freeze({ accepted: 'accepted', registry: 'registry' })
    /** DSH's install-state phases this dialog names; `cancelling` is also shown from the Cancel click. */
    const PHASE = Object.freeze({ waiting: 'waiting', installing: 'installing', cancelling: 'cancelling' })
    const CANCEL_TOO_LATE = 'too-late'
    /** The Host's `applied` answer for a change made while the instance is off (child-plugins.js CHILD_PLUGINS.applied). */
    const APPLIED_NEXT_START = 'next-start'
    const BUILD_BLOCKED = 'build-blocked'
    /** The progress screen keeps the newest lines of pnpm's output (revision 10a's bound). */
    const LOG = Object.freeze({ lines: 200, separator: '\n' })
    /** Codes with their own words; any other shows "Refused: <code>". */
    const KNOWN_CODES = Object.freeze(['busy', 'not-ready', 'protected', 'unknown-bundle', 'not-official', 'already-in-fishball', 'operation-error', 'remove-failed',
      'invalid-spec', 'already-installed', 'not-bundle', 'ambiguous-install', 'incompatible-version', 'cancelled', 'build-blocked', 'request-failed'])
    const KNOWN_PROBLEMS = Object.freeze(['invalid-spec', 'already-installed', 'not-found', 'not-a-package', 'not-a-bundle', 'network', 'unknown'])
    const STATE_DOT = Object.freeze({ ongoing: 'ongoing', done: 'done', error: 'error' })
    const TONE = Object.freeze({ on: 'info', off: 'neutral', highlight: 'info' })
    const ICON_PX = 14
    const LINK = Object.freeze({ target: '_blank', rel: 'noopener noreferrer' })

    /**
     * Fishball's recommended plugins (DESIGN §10f, revision 12): a copy of fishball-core's
     * `ui/src/recommended.js` (dsh-fishball repo, packages/core/ui/src/recommended.js), which a
     * standalone Fishball still shows; change both together. Each entry was installed and ran for
     * Fishball alone on 2026-11-02; the left-out plugins and why are in §10f. Pet lists none.
     */
    const NPM_PAGE = 'https://www.npmjs.com/package/'
    const CATEGORY = Object.freeze({ context: 'context', memory: 'memory', channel: 'channel', pet: 'pet' })
    const HIGHLIGHTED = Object.freeze([CATEGORY.context, CATEGORY.memory])
    const npm = (category, packageName, noteKey) => Object.freeze({ category, packageName, spec: packageName, source: NPM_PAGE + packageName, ...(noteKey === undefined ? {} : { noteKey }) })
    const RECOMMENDED = Object.freeze([
      npm(CATEGORY.context, 'dsh-idle-compact'),
      npm(CATEGORY.context, 'dsh-plugin-save-token'),
      npm(CATEGORY.context, 'smart-compaction'),
      npm(CATEGORY.memory, 'meow-memory', 'note.meowMemory'),
      npm(CATEGORY.memory, '@a9i5k4/dsh-auto-memory'),
      npm(CATEGORY.memory, '@zilliz/memsearch-dsh'),
      npm(CATEGORY.channel, '@michengai/dsh-im-connect'),
      npm(CATEGORY.channel, 'dsh-telegram-notify'),
      npm(CATEGORY.channel, 'dsh-plugin-discord'),
      npm(CATEGORY.channel, 'dsh-dingtalk-channel'),
    ])

    const en = {
      tab: 'Fishball',
      intro: 'Plugins for the embedded Fishball. They are installed by this DSH into Fishball\'s own profile; Fishball restarts after each change.',
      installForFishball: 'Install for Fishball',
      installForFishballDescription: 'Install a plugin into the embedded Fishball only',
      installed: 'Installed in Fishball',
      none: 'No plugins are installed for Fishball yet.',
      loading: 'Loading…',
      on: 'On', off: 'Off',
      uninstall: 'Uninstall',
      uninstalling: 'Uninstalling…',
      uninstallFromFishball: 'Uninstall from Fishball',
      useInFishball: 'Use in Fishball',
      installToFishball: 'Install to Fishball',
      working: 'Working…',
      confirmUninstallTitle: 'Uninstall {name} from Fishball?',
      confirmUninstallDescription: 'It is removed from Fishball only, and Fishball restarts. This DSH keeps its own copy.',
      cancel: 'Cancel',
      close: 'Close',
      back: 'Back',
      changed: '{name}: done. Fishball restarts to apply it.',
      changedNextStart: '{name}: done. It takes effect the next time Fishball starts.',
      nextStart: 'It takes effect the next time Fishball starts.',
      refused: 'Refused: {code}',
      'code.busy': 'Another Fishball plugin change is still running. Wait for it, then try again.',
      'code.not-ready': 'Fishball has not started yet, so its plugins cannot be changed.',
      'code.protected': 'This plugin is part of Fishball itself.',
      'code.unknown-bundle': 'Fishball does not have this plugin.',
      'code.not-official': 'This plugin is not shipped with DSH, so it must be installed.',
      'code.already-in-fishball': 'Fishball already uses this plugin.',
      'code.operation-error': 'The operation failed. See DSH\'s log.',
      'code.remove-failed': 'pnpm could not remove the package; Fishball\'s plugin list is unchanged.',
      'code.invalid-spec': 'This is not a package spec pnpm accepts.',
      'code.already-installed': 'Fishball already has this package.',
      'code.not-bundle': 'The package is not a DSH plugin.',
      'code.ambiguous-install': 'The install changed more than one package, so it was undone.',
      'code.incompatible-version': 'The package does not support this DSH version.',
      'code.cancelled': 'The install was cancelled.',
      'code.build-blocked': 'pnpm blocked build scripts of its dependencies.',
      'code.request-failed': 'DSH did not answer.',
      'problem.invalid-spec': 'This is not a package spec pnpm accepts.',
      'problem.already-installed': 'Fishball already has this package, or DSH ships it (use "Use in Fishball" on its page).',
      'problem.not-found': 'No registry has this package.',
      'problem.not-a-package': 'There is no package there.',
      'problem.not-a-bundle': 'The package is not a DSH plugin.',
      'problem.network': 'No registry could be reached.',
      'problem.unknown': 'The package could not be read.',
      'dialog.title': 'Install for Fishball',
      'dialog.hint': 'Installs a plugin into the embedded Fishball only. This DSH is not changed.',
      'dialog.label': 'Package',
      'dialog.placeholder': 'Package name, Git address, or absolute path',
      'dialog.trust': 'Only install plugins you trust: a plugin runs with Fishball\'s access.',
      'dialog.check': 'Install',
      'dialog.checking': 'Checking the package…',
      'dialog.source': 'From {source}',
      'dialog.defaultRegistry': 'pnpm\'s registry',
      'dialog.confirm': 'Install',
      'dialog.phase.waiting': 'Preparing…',
      'dialog.phase.installing': 'Installing…',
      'dialog.phase.cancelling': 'Cancelling…',
      'dialog.phase.applying': 'Finishing…',
      'dialog.attempt': '(registry {index} of {total})',
      'dialog.output': 'pnpm output',
      'dialog.cancelInstall': 'Cancel install',
      'dialog.cancelTooLate': 'It is too late to cancel: the plugin is being added.',
      'dialog.done': 'Installed {name} {version}. Fishball restarts to load it.',
      'dialog.doneNextStart': 'Installed {name} {version}.',
      'dialog.failed': 'The install failed.',
      'dialog.pendingScripts': 'Scripts waiting for permission:',
      'dialog.allowScripts': 'Allow these scripts and retry',
      'dialog.retry': 'Retry',
      recommended: 'Recommended',
      'category.context': 'Context management', 'category.memory': 'Memory', 'category.channel': 'Channel', 'category.pet': 'Pet',
      highlight: 'Recommended first',
      highlightNote: 'These significantly improve how Fishball works.',
      empty: 'Pets draw only in DSH\'s own interface, and a plugin that runs only for Fishball has no browser part, so none can be listed here.',
      'note.meowMemory': 'Fishball has no built-in memory. An external memory plugin is optional, but recommended.',
      install: 'Install',
      source: 'Source',
    }
    const zh = {
      tab: 'Fishball',
      intro: '内嵌 Fishball 的插件。由本 DSH 安装到 Fishball 自己的 profile；每次更改后 Fishball 会重启。',
      installForFishball: '为 Fishball 安装',
      installForFishballDescription: '只把插件安装到内嵌的 Fishball',
      installed: 'Fishball 中已安装',
      none: '还没有为 Fishball 安装插件。',
      loading: '正在加载…',
      on: '开', off: '关',
      uninstall: '卸载',
      uninstalling: '正在卸载…',
      uninstallFromFishball: '从 Fishball 卸载',
      useInFishball: '在 Fishball 中使用',
      installToFishball: '安装到 Fishball',
      working: '处理中…',
      confirmUninstallTitle: '从 Fishball 卸载 {name}？',
      confirmUninstallDescription: '只从 Fishball 中移除，Fishball 会重启。本 DSH 保留自己的副本。',
      cancel: '取消',
      close: '关闭',
      back: '返回',
      changed: '{name}：已完成。Fishball 会重启以应用更改。',
      changedNextStart: '{name}：已完成。下次 Fishball 启动时生效。',
      nextStart: '下次 Fishball 启动时生效。',
      refused: '已拒绝：{code}',
      'code.busy': '另一个 Fishball 插件更改仍在进行。请等它结束后再试。',
      'code.not-ready': 'Fishball 尚未启动，暂时不能更改它的插件。',
      'code.protected': '这个插件是 Fishball 自身的一部分。',
      'code.unknown-bundle': 'Fishball 中没有这个插件。',
      'code.not-official': '这个插件不随 DSH 提供，需要安装。',
      'code.already-in-fishball': 'Fishball 已在使用这个插件。',
      'code.operation-error': '操作失败。请查看 DSH 的日志。',
      'code.remove-failed': 'pnpm 无法移除这个包；Fishball 的插件列表保持不变。',
      'code.invalid-spec': '这不是 pnpm 接受的包规格。',
      'code.already-installed': 'Fishball 中已有这个包。',
      'code.not-bundle': '这个包不是 DSH 插件。',
      'code.ambiguous-install': '这次安装改变了不止一个包，已撤销。',
      'code.incompatible-version': '这个包不支持当前 DSH 版本。',
      'code.cancelled': '安装已取消。',
      'code.build-blocked': 'pnpm 阻止了其依赖的构建脚本。',
      'code.request-failed': 'DSH 没有响应。',
      'problem.invalid-spec': '这不是 pnpm 接受的包规格。',
      'problem.already-installed': 'Fishball 中已有这个包，或 DSH 自带它（请在它的页面上使用“在 Fishball 中使用”）。',
      'problem.not-found': '没有任何源提供这个包。',
      'problem.not-a-package': '该位置没有包。',
      'problem.not-a-bundle': '这个包不是 DSH 插件。',
      'problem.network': '无法连接任何源。',
      'problem.unknown': '无法读取这个包。',
      'dialog.title': '为 Fishball 安装',
      'dialog.hint': '只把插件安装到内嵌的 Fishball。本 DSH 不会改变。',
      'dialog.label': '包',
      'dialog.placeholder': '包名、Git 地址或绝对路径',
      'dialog.trust': '只安装你信任的插件：插件以 Fishball 的权限运行。',
      'dialog.check': '安装',
      'dialog.checking': '正在检查这个包…',
      'dialog.source': '来自 {source}',
      'dialog.defaultRegistry': 'pnpm 的源',
      'dialog.confirm': '安装',
      'dialog.phase.waiting': '正在准备…',
      'dialog.phase.installing': '正在安装…',
      'dialog.phase.cancelling': '正在取消…',
      'dialog.phase.applying': '正在完成…',
      'dialog.attempt': '（第 {index} 个源，共 {total} 个）',
      'dialog.output': 'pnpm 输出',
      'dialog.cancelInstall': '取消安装',
      'dialog.cancelTooLate': '已来不及取消：插件正在加入。',
      'dialog.done': '已安装 {name} {version}。Fishball 会重启以加载它。',
      'dialog.doneNextStart': '已安装 {name} {version}。',
      'dialog.failed': '安装失败。',
      'dialog.pendingScripts': '等待许可的脚本：',
      'dialog.allowScripts': '允许这些脚本并重试',
      'dialog.retry': '重试',
      recommended: '推荐',
      'category.context': '上下文管理', 'category.memory': '记忆', 'category.channel': '消息渠道', 'category.pet': '宠物',
      highlight: '优先推荐',
      highlightNote: '这些插件能显著改善 Fishball 的使用体验。',
      empty: '宠物只在 DSH 自己的界面中绘制，而只为 Fishball 运行的插件没有浏览器部分，所以这里无法列出。',
      'note.meowMemory': 'Fishball 没有内置记忆。外部记忆插件是可选的，但推荐安装。',
      install: '安装',
      source: '来源',
    }

    /** The chunk's own classes; the card, hint and row rules are the status line's (client.status.js layout). */
    const OWN_CLS = Object.freeze({ tab: 'fb-instance-fb-tab', head: 'fb-instance-fb-head', list: 'fb-instance-fb-list', row: 'fb-instance-fb-row', main: 'fb-instance-fb-main', name: 'fb-instance-fb-name', actions: 'fb-instance-fb-actions', log: 'fb-instance-fb-log', dialog: 'fb-instance-fb-dialog', error: 'fb-instance-fb-error', link: 'fb-instance-fb-link' })
    const ownCss = (STYLE) => [
      `.${OWN_CLS.tab}{display:grid;gap:${STYLE.sectionGap};min-width:0;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${OWN_CLS.head}{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:${STYLE.blockGap}}`,
      `.${OWN_CLS.list}{display:grid;gap:${STYLE.blockGap};margin:0}`,
      `.${OWN_CLS.list} h3{margin:0;display:flex;align-items:center;gap:${STYLE.stackGap};font:var(--dsw-font-s-strong-14)}`,
      `.${OWN_CLS.row}{display:flex;align-items:center;gap:${STYLE.blockGap}}`,
      `.${OWN_CLS.main}{flex:1;min-width:0;display:grid;gap:2px}`,
      `.${OWN_CLS.name}{font-family:var(--dsw-font-markdown-code-font-family);overflow-wrap:anywhere}`,
      `.${OWN_CLS.actions}{display:flex;align-items:center;gap:${STYLE.stackGap};flex-shrink:0}`,
      `.${OWN_CLS.log}{margin:0;max-height:240px;overflow:auto;padding:8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-family:var(--dsw-font-markdown-code-font-family);font-size:${STYLE.hintSize};white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${OWN_CLS.dialog}{display:grid;gap:${STYLE.blockGap};font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${OWN_CLS.error}{margin:0;color:var(--dsw-alias-state-error-primary);font-size:${STYLE.hintSize}}`,
      `.${OWN_CLS.link}{color:var(--dsw-alias-link);font-size:${STYLE.hintSize};text-decoration:none;justify-self:start}`,
    ].join('')

    /** A plain external store read through React.useSyncExternalStore. */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        get: () => value,
        set(next) { value = next; for (const listener of [...listeners]) listener() },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
      }
    }
    const useStore = (store) => React.useSyncExternalStore(store.subscribe, store.get)

    /** One route call: the Host's `{ok, …}`, or `{ok: false, code: request-failed}` when it cannot be read. */
    async function call(path, payload) {
      try {
        const init = payload === undefined ? FISHBALL_API.read : { ...FISHBALL_API.post, body: JSON.stringify(payload) }
        const answer = await (await fetch(new URL(path, document.baseURI).toString(), init)).json()
        if (typeof answer?.ok === 'boolean') return answer
      } catch { /* unreachable or unreadable: the refusal below */ }
      return { ok: false, code: FISHBALL_API.unreadable }
    }

    /** A refusal's words: its own when known, else the code itself. */
    const codeText = (t, code) => (KNOWN_CODES.includes(code) ? t('code.' + code) : t('refused', { code }))

    /**
     * The child's plugins (GET plugins) and the main DSH's bundles (DSH's own listBundles), read
     * again after a change. One owner for both, shared by the tab, the menu item and the page buttons.
     */
    function createInventory(remote) {
      // `protected`: the bundles the instance owns (the Host's CHILD_OWN_BUNDLES), which get no button.
      const child = createStore({ status: STATE_DOT.ongoing, bundles: [], protected: [], code: null })
      const main = createStore([])
      const readChild = async () => {
        const answer = await call(FISHBALL_API.list)
        child.set(answer.ok ? { status: STATE_DOT.done, bundles: answer.bundles, protected: answer.protected ?? [], code: null } : { ...child.get(), status: STATE_DOT.error, code: answer.code })
      }
      const readMain = async () => {
        try {
          const answer = await remote.pluginManager.listBundles()
          if (answer?.ok) main.set(answer.value)
        } catch { /* the page buttons then offer only what the child list tells */ }
      }
      const refresh = () => Promise.all([readChild(), readMain()])
      return { child, main, refresh }
    }

    /** The install dialog's request: null, or `{id, spec?}` (a spec runs the check at once, as §10f's Install does). */
    const dialogRequest = createStore(null)
    let dialogs = 0
    const openDialog = (spec) => dialogRequest.set({ id: ++dialogs, ...(spec === undefined ? {} : { spec }) })
    const closeDialog = () => dialogRequest.set(null)

    function makeComponents({ t, CLS, inventory, listen }) {
      const useChild = () => useStore(inventory.child)
      const useMain = () => useStore(inventory.main)
      /** The child's bundle named `name`, or undefined. */
      const childBundle = (child, name) => child.bundles.find((bundle) => bundle.name === name)

      /** One Uninstall/Use action with its busy state and outcome line, refreshing the lists after it. */
      function useAction() {
        const [view, setView] = React.useState({ busy: false })
        const run = async (path, name) => {
          setView({ busy: true })
          const answer = await call(path, { name })
          const done = answer.applied === APPLIED_NEXT_START ? 'changedNextStart' : 'changed'
          setView({ busy: false, message: answer.ok ? t(done, { name }) : codeText(t, answer.code), error: !answer.ok })
          void inventory.refresh()
        }
        const message = view.message ? h('span', { className: view.error ? CLS.error : CLS.hint, role: view.error ? 'alert' : 'status' }, view.message) : null
        return { busy: view.busy, run, message }
      }

      /** Uninstall from Fishball, confirmed first in DSH's dialog, as DSH's own Uninstall is. */
      function UninstallButton({ name, label }) {
        const [confirming, setConfirming] = React.useState(false)
        const action = useAction()
        return h(React.Fragment, null,
          action.message,
          h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: action.busy, 'aria-busy': action.busy, 'data-fishball-uninstall': name, onClick: () => setConfirming(true) },
            action.busy ? t('uninstalling') : label),
          h(Modal, {
            open: confirming, onClose: () => setConfirming(false), title: t('confirmUninstallTitle', { name }), closeLabel: t('close'),
            description: t('confirmUninstallDescription'),
            footer: h(React.Fragment, null,
              h(Button, { type: 'button', variant: 'outline', onClick: () => setConfirming(false) }, t('cancel')),
              h(Button, { type: 'button', variant: 'primary', onClick: () => { setConfirming(false); void action.run(FISHBALL_API.uninstall, name) } }, t('uninstall'))),
          }))
      }

      function InstallButton() {
        return h(Button, { type: 'button', size: 'sm', variant: 'primary', icon: h(IconPlusOutlineRegular, { size: ICON_PX }), 'data-fishball-install-open': true, onClick: () => openDialog() }, t('installForFishball'))
      }

      function ChildList({ child }) {
        if (child.status === STATE_DOT.ongoing) return h('p', { className: CLS.hint, role: 'status' }, t('loading'))
        if (child.status === STATE_DOT.error && child.bundles.length === 0) return h('p', { className: CLS.error, role: 'alert' }, codeText(t, child.code))
        if (child.bundles.length === 0) return h('p', { className: CLS.hint }, t('none'))
        return h('div', { className: CLS.card }, child.bundles.map((bundle) => h('div', { key: bundle.name, className: OWN_CLS.row, 'data-fishball-plugin': bundle.name },
          h('div', { className: OWN_CLS.main },
            h('span', { className: CLS.statusRow },
              h('strong', { className: OWN_CLS.name }, bundle.name),
              bundle.version ? h('span', { className: CLS.hint }, bundle.version) : null,
              h(Tag, { tone: bundle.enabled ? TONE.on : TONE.off }, t(bundle.enabled ? 'on' : 'off'))),
            bundle.description ? h('span', { className: CLS.hint }, bundle.description) : null),
          h('div', { className: OWN_CLS.actions }, h(UninstallButton, { name: bundle.name, label: t('uninstall') })))))
      }

      function RecommendedRow({ item, child }) {
        const present = childBundle(child, item.packageName) !== undefined
        return h('div', { className: OWN_CLS.row, 'data-recommended-package': item.packageName },
          h('div', { className: OWN_CLS.main },
            h('span', { className: OWN_CLS.name }, item.packageName),
            h('a', { href: item.source, target: LINK.target, rel: LINK.rel, className: OWN_CLS.link }, t('source')),
            item.noteKey ? h('span', { className: CLS.hint }, t(item.noteKey)) : null),
          h('div', { className: OWN_CLS.actions },
            child.status !== STATE_DOT.done ? null
              : present ? h('span', { className: CLS.statusRow }, h(StateDot, { state: STATE_DOT.done }), t('installed'))
                : h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => openDialog(item.spec) }, t('install'))))
      }

      function Recommended({ child }) {
        return h('section', { className: OWN_CLS.list },
          h('h3', null, t('recommended')),
          Object.values(CATEGORY).map((category) => {
            const items = RECOMMENDED.filter((item) => item.category === category)
            const highlighted = HIGHLIGHTED.includes(category)
            return h('section', { key: category, className: OWN_CLS.list, 'data-recommended-category': category },
              h('h3', null, t('category.' + category), highlighted ? h(Tag, { tone: TONE.highlight }, t('highlight')) : null),
              highlighted ? h('p', { className: CLS.hint }, t('highlightNote')) : null,
              items.length === 0 ? h('p', { className: CLS.hint }, t('empty'))
                : h('div', { className: CLS.card }, items.map((item) => h(RecommendedRow, { key: item.packageName, item, child }))))
          }))
      }

      /** The Fishball tab (`plugins.tab`). DSH hides its own Add button on a contributed tab, so the tab draws its own at its top. */
      function FishballTab() {
        const child = useChild()
        React.useEffect(() => { void inventory.refresh() }, [])
        return h('div', { className: OWN_CLS.tab, 'data-fishball-tab': true },
          h('div', { className: OWN_CLS.head }, h('p', { className: CLS.hint }, t('intro')), h(InstallButton)),
          h('section', { className: OWN_CLS.list }, h('h3', null, t('installed')), h(ChildList, { child })),
          h(Recommended, { child }))
      }

      /** "Install for Fishball" in DSH's Add plugin menu, laid out like DSH's own items. */
      function AddMenuItem({ onDismiss }) {
        return h(MenuItemButton, { icon: h(IconDownloadOutlineRegular, { size: ICON_PX }), onSelect: () => { onDismiss?.(); openDialog() } },
          h('span', { className: OWN_CLS.main }, h('span', null, t('installForFishball')), h('span', { className: CLS.hint }, t('installForFishballDescription'))))
      }

      /** The button on a main-DSH bundle page (`plugins.detail.actions`), or nothing. */
      function DetailAction({ subject }) {
        const child = useChild()
        const main = useMain()
        const action = useAction()
        React.useEffect(() => { void inventory.refresh() }, [])
        const name = subject?.kind === FEATURE.bundleSubject ? subject.pkg?.name : undefined
        if (name === undefined || child.protected.includes(name) || child.status !== STATE_DOT.done) return null
        if (childBundle(child, name) !== undefined) return h(UninstallButton, { name, label: t('uninstallFromFishball') })
        const bundle = main.find((entry) => entry.name === name)
        if (bundle === undefined) return null
        if ((bundle.official || bundle.optional) && bundle.availability === BUNDLE.shipped) {
          return h(React.Fragment, null, action.message,
            h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: action.busy, 'aria-busy': action.busy, 'data-fishball-use': name, onClick: () => void action.run(FISHBALL_API.use, name) },
              action.busy ? t('working') : t('useInFishball')))
        }
        // BundleInfo.source is always absolute for a local copy: DSH's dependencySpec resolves a
        // recorded `file:`/`link:` path against the main profile (`~` expanded), so it installs from anywhere.
        if (typeof bundle.source === 'string') return h(Button, { type: 'button', size: 'sm', variant: 'outline', 'data-fishball-install-to': name, onClick: () => openDialog(bundle.source) }, t('installToFishball'))
        return null
      }

      /** Where a checked package comes from, in words (DSH's inspection: registry, folder, Git or tarball host). */
      const sourceOf = (inspection, spec) => (inspection.kind === INSPECT.registry ? inspection.registry ?? t('dialog.defaultRegistry') : inspection.host ?? spec)

      /** One install, following DSH's dialog screens; DSH's process behind it, for the child profile. */
      function InstallFlow({ initialSpec }) {
        const id = React.useId()
        const [step, setStep] = React.useState(STEP.edit)
        const [spec, setSpec] = React.useState(initialSpec ?? '')
        const [problem, setProblem] = React.useState(null)
        const [inspection, setInspection] = React.useState(null)
        const [progress, setProgress] = React.useState({ phase: null, attempt: null, output: '' })
        const [outcome, setOutcome] = React.useState(null)
        const [note, setNote] = React.useState(null)
        /**
         * A cancel asked and not yet answered. DSH's cancelInstall answers only once the run has
         * stopped and the files are back; a registry that never responds can hold that for its
         * lookup bound (about 100 s measured), so the screen says "Cancelling…" from the click and
         * the button cannot ask twice. DSH's own install event may not arrive before then.
         */
        const [cancelling, setCancelling] = React.useState(false)
        const requestId = React.useRef(null)
        const installing = step === STEP.installing
        React.useEffect(() => {
          if (!installing) return undefined
          const own = (event) => event?.requestId === requestId.current
          const offState = listen(HOST_EVENT.state, (event) => { if (own(event)) setProgress((previous) => ({ ...previous, phase: event.phase, attempt: event.attempt ?? previous.attempt })) })
          const offLog = listen(HOST_EVENT.log, (event) => {
            if (own(event) && event.text) setProgress((previous) => ({ ...previous, output: (previous.output + event.text).split(LOG.separator).slice(-LOG.lines).join(LOG.separator) }))
          })
          return () => { offState(); offLog() }
        }, [installing])
        const cancel = async () => {
          if (requestId.current === null || cancelling) return
          setCancelling(true)
          const answer = await call(FISHBALL_API.cancel, { requestId: requestId.current })
          setCancelling(false)
          if (answer.outcome === CANCEL_TOO_LATE) setNote('dialog.cancelTooLate')
        }
        // Closing while it runs asks the install to stop, as DSH's own dialog does.
        const close = () => { if (installing) void cancel(); closeDialog() }
        const refuse = (text) => { setProblem(text); setStep(STEP.edit) }
        const check = async () => {
          const trimmed = spec.trim()
          if (trimmed === '') return
          setProblem(null)
          setStep(STEP.checking)
          const answer = await call(FISHBALL_API.inspect, { spec: trimmed })
          if (!answer.ok) return refuse(codeText(t, answer.code))
          const read = answer.inspection
          if (read.status !== INSPECT.accepted) return refuse([t('problem.' + (KNOWN_PROBLEMS.includes(read.problem) ? read.problem : 'unknown')), read.reason].filter(Boolean).join(' '))
          if (read.bundle === false) return refuse(t('problem.not-a-bundle'))
          setInspection(read)
          setStep(STEP.confirm)
        }
        React.useEffect(() => { if (initialSpec) void check() }, [])
        const install = async (approvedBuilds) => {
          requestId.current = crypto.randomUUID()
          setProgress({ phase: null, attempt: null, output: '' })
          setNote(null)
          setStep(STEP.installing)
          const answer = await call(FISHBALL_API.install, { spec: spec.trim(), requestId: requestId.current, ...(approvedBuilds === undefined ? {} : { approvedBuilds }) })
          setOutcome(answer)
          setStep(answer.ok ? STEP.done : STEP.failed)
          void inventory.refresh()
        }
        const button = (variant, key, onClick, label, disabled) => h(Button, { key, type: 'button', variant, disabled, onClick }, label)
        const log = progress.output !== '' ? h('pre', { key: 'log', className: OWN_CLS.log, 'aria-label': t('dialog.output') }, progress.output) : null
        const screens = {
          [STEP.edit]: () => ({
            body: [
              h('p', { key: 'hint', className: CLS.hint }, t('dialog.hint')),
              h('label', { key: 'label', htmlFor: id }, t('dialog.label')),
              h(Input, {
                key: 'field', id, value: spec, placeholder: t('dialog.placeholder'), 'data-modal-autofocus': true, 'aria-invalid': problem !== null || undefined,
                onChange: (event) => { setSpec(event.target.value); setProblem(null) },
                // Enter checks, except while an input method is composing (as DSH's field does).
                onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void check() },
              }),
              problem ? h('p', { key: 'problem', role: 'alert', className: OWN_CLS.error }, problem) : null,
              h('p', { key: 'trust', className: CLS.hint }, t('dialog.trust')),
            ],
            footer: [button('outline', 'cancel', close, t('cancel')), button('primary', 'check', () => void check(), t('dialog.check'), spec.trim() === '')],
          }),
          [STEP.checking]: () => ({
            body: [h('p', { key: 'checking', role: 'status', className: CLS.statusRow }, h(StateDot, { state: STATE_DOT.ongoing }), t('dialog.checking'))],
            footer: [button('outline', 'cancel', close, t('cancel'))],
          }),
          [STEP.confirm]: () => ({
            body: [
              h('p', { key: 'name', className: CLS.statusRow }, h('strong', { className: OWN_CLS.name }, inspection.name ?? spec.trim()), inspection.version ? h(Tag, { tone: TONE.off }, inspection.version) : null),
              inspection.description ? h('p', { key: 'description' }, inspection.description) : null,
              h('p', { key: 'source', className: CLS.hint }, t('dialog.source', { source: sourceOf(inspection, spec.trim()) })),
              h('p', { key: 'trust', className: CLS.hint }, t('dialog.trust')),
            ],
            footer: [button('outline', 'back', () => setStep(STEP.edit), t('back')), button('primary', 'install', () => void install(), t('dialog.confirm'))],
          }),
          [STEP.installing]: () => ({
            body: [
              h('p', { key: 'phase', role: 'status', className: CLS.statusRow }, h(StateDot, { state: STATE_DOT.ongoing }),
                t('dialog.phase.' + (cancelling ? PHASE.cancelling : progress.phase ?? PHASE.waiting)),
                progress.phase === PHASE.installing && progress.attempt?.total > 1 ? ' ' + t('dialog.attempt', { index: progress.attempt.index, total: progress.attempt.total }) : ''),
              log,
              note ? h('p', { key: 'note', role: 'status', className: CLS.hint }, t(note)) : null,
            ],
            footer: [button('outline', 'cancel', () => void cancel(), t('dialog.cancelInstall'), cancelling)],
          }),
          [STEP.done]: () => ({
            body: outcome.applied === APPLIED_NEXT_START
              ? [
                h('p', { key: 'done', role: 'status', className: CLS.statusRow }, h(StateDot, { state: STATE_DOT.done }), t('dialog.doneNextStart', { name: outcome.name, version: outcome.version ?? '' })),
                h('p', { key: 'next', className: CLS.hint }, t('nextStart')),
              ]
              : [h('p', { key: 'done', role: 'status', className: CLS.statusRow }, h(StateDot, { state: STATE_DOT.done }), t('dialog.done', { name: outcome.name, version: outcome.version ?? '' }))],
            footer: [button('primary', 'close', close, t('close'))],
          }),
          [STEP.failed]: () => ({
            body: [
              h('p', { key: 'failed', role: 'alert', className: CLS.statusRow }, h(StateDot, { state: STATE_DOT.error }), t('dialog.failed'), ' ', codeText(t, outcome.code)),
              outcome.code === BUILD_BLOCKED ? h('p', { key: 'scripts', className: CLS.hint }, t('dialog.pendingScripts'), ' ', (outcome.pendingBuilds ?? []).join(', ')) : null,
              log,
            ],
            footer: [
              button('outline', 'back', () => setStep(STEP.edit), t('back')),
              outcome.code === BUILD_BLOCKED
                ? button('primary', 'scripts', () => void install(outcome.pendingBuilds), t('dialog.allowScripts'))
                : button('primary', 'retry', () => void install(), t('dialog.retry')),
            ],
          }),
        }
        const screen = screens[step]()
        return h(Modal, { open: true, onClose: close, closeLabel: t('close'), title: t('dialog.title'), footer: h(React.Fragment, null, ...screen.footer) },
          h('div', { className: OWN_CLS.dialog, 'data-fishball-install': step }, ...screen.body))
      }

      /** The dialog while one is open; a new request starts a fresh flow. */
      function InstallDialog() {
        const request = useStore(dialogRequest)
        return request === null ? null : h(InstallFlow, { key: request.id, initialSpec: request.spec })
      }

      return { FishballTab, AddMenuItem, DetailAction, InstallDialog }
    }

    /**
     * The feature as a client plugin of the instance's row (client.js starts it).
     * @param layout - client.status.js's `layout`: the line's classes and tokens, reused here.
     * @param shared - client.status.js's `shared`: its style-sheet mount.
     */
    module.exports.fishballPlugin = (shared, layout) => ({
      name: FEATURE.name,
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        const t = ctx.locale.bind(FEATURE.ns)
        ctx.effect(() => ctx.locale.register(FEATURE.ns, { en, zh }), FEATURE.name + ': dictionaries')
        ctx.effect(() => shared.mountStyle(FEATURE.name, ownCss(layout.style)), FEATURE.name + ': styles')
        const CLS = layout.classes
        const listen = (name, listener) => ctx.remote.$on(name, listener)
        const inventory = createInventory(ctx.remote)
        // DSH's Plugins page reads its list again on these; so do the Fishball lists.
        ctx.effect(() => {
          const offs = [listen(HOST_EVENT.changed, () => void inventory.refresh()), ctx.on(HOST_EVENT.reset, () => void inventory.refresh())]
          return () => { for (const off of offs) off() }
        }, FEATURE.name + ': refresh')
        const parts = makeComponents({ t, CLS, inventory, listen })
        const S = FEATURE.slot
        ctx.effect(() => ctx.slots.inject(S.tab, () => ctx.slots.register({ name: S.tab, id: FEATURE.id.tab, label: () => t('tab'), locale: FEATURE.ns }, parts.FishballTab)), FEATURE.name + ': tab')
        ctx.effect(() => ctx.slots.inject(S.addActions, () => ctx.slots.register({ name: S.addActions, id: FEATURE.id.addAction, locale: FEATURE.ns }, parts.AddMenuItem)), FEATURE.name + ': add menu item')
        ctx.effect(() => ctx.slots.inject(S.detailActions, () => ctx.slots.register({ name: S.detailActions, id: FEATURE.id.detailAction, locale: FEATURE.ns }, parts.DetailAction)), FEATURE.name + ': page action')
        // The dialog lives in the shell overlay, so it outlives the menu and the page that opened it.
        ctx.effect(() => ctx.slots.inject(S.overlay, () => ctx.slots.register({ name: S.overlay, id: FEATURE.id.dialog, locale: FEATURE.ns }, parts.InstallDialog)), FEATURE.name + ': install dialog')
      },
    })
    return module.exports
  },
})
