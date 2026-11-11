/**
 * Fishball's generic slim settings panel, browser half (SET, docs/planning/v2-set.md; V3
 * R-HOST-11). Part of fishball-core's `fishball-ui` component.
 *
 * Only what DSH's own pages cannot do is here: one Read Only line and links to the native Settings
 * and Plugins pages (models, effort, plugins and plugin settings are edited there).
 *
 * **Settings-section extension point** (R-HOST-11, V3 task R-CORE; frozen by K3). The panel
 * draws its title and then every section registered with the `fishballSettingsSections` service,
 * ordered by `order` (ties by `id`); its own sections are registered the same way. A section is
 * `{id, title, order, mount, unmount}`: `title()` is the section's accessible name,
 * `mount(container)` draws into an empty element the panel owns, and `unmount(container)` removes
 * what mount drew. `register(section)` returns the disposer that withdraws it; an id that is
 * already registered is refused. Two helpers come with it: `reactSection(render)` gives the
 * mount/unmount pair for a section drawn with React, and `classes` names the panel's style
 * classes, so a section looks like the panel without copying its style sheet. The point knows nothing about hosting: the
 * panel works unchanged with no section but its own, and a withdrawn section leaves no trace.
 */
window.__ModuleLoader__.load({
  id: 'fishball-settings',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const PANEL = Object.freeze({
      id: 'fishball-settings',
      locale: 'fishball-settings',
      mainSlot: 'main',
      headerSlot: 'conversation.session.header.actions',
      headerOrder: 90,
      // Native Plugins page: DSH's pluginNavigation service, else its main panel id (as the connector does).
      navigation: 'pluginNavigation',
      pluginsPanel: 'plugins',
      /**
       * No public service opens native Settings: the single `settings.launcher` owner gets the only
       * `openSettings` callback, and fishball-page (LITE) portals it as this button. Pressing it is
       * the native open path, so the native modal and its sections stay native.
       */
      settingsLauncher: '.fishball-settings-launcher',
      /**
       * PG-ORIGIN's fragment continuation, as fishball-page reads it (`view=settings`). The page's
       * one-time manager selection closes panels when the conversation first becomes ready
       * (`data-fishball-session` on <html>), so the panel is opened at load and once more then.
       */
      continuation: Object.freeze({ name: 'view', value: 'settings' }),
      sessionReady: 'data-fishball-session',
      css: Object.freeze({ id: 'fishball-settings-style', root: 'fb-settings', section: 'fb-settings-section', row: 'fb-settings-row', hint: 'fb-settings-hint', error: 'fb-settings-error' }),
    })
    /** The extension point (see the header): its service name, region marker and refusals. */
    const SECTIONS = Object.freeze({
      service: 'fishballSettingsSections',
      attribute: 'data-fishball-settings-section',
      invalid: 'fishball settings: a section needs a non-empty string id, a title function, a finite order, and mount and unmount functions',
      duplicate: 'fishball settings: a section with this id is already registered',
    })
    /** The panel's own sections: Read Only, then the native links (the V2 panel's order). */
    const OWN = Object.freeze({
      readOnly: Object.freeze({ id: 'fishball-read-only', order: 100 }),
      native: Object.freeze({ id: 'fishball-native-pages', order: 200 }),
    })

    const en = {
      title: 'Fishball settings',
      entry: 'Fishball settings',
      readOnlyTitle: 'Read Only',
      readOnly: 'Read Only: Fishball\'s tools run read-only in its instance. This is fixed and not a setting.',
      nativeTitle: 'More settings',
      nativeHint: 'Models, reasoning effort, plugins and their settings are in DSH\'s own pages.',
      openSettings: 'Open DSH Settings',
      openPlugins: 'Open Plugins',
      settingsUnavailable: 'DSH Settings cannot be opened from here right now; use the Settings button at the bottom left.',
      loadFailed: 'This part of the page could not be loaded.',
    }
    const zh = {
      title: 'Fishball 设置',
      entry: 'Fishball 设置',
      readOnlyTitle: '只读',
      readOnly: '只读：Fishball 的工具在其实例中以只读方式运行。这是固定的，不是可调设置。',
      nativeTitle: '更多设置',
      nativeHint: '模型、推理强度、插件及其设置在 DSH 自己的页面中。',
      openSettings: '打开 DSH 设置',
      openPlugins: '打开插件',
      settingsUnavailable: '现在无法从这里打开 DSH 设置；请使用左下角的“设置”按钮。',
      loadFailed: '页面的这一部分无法加载。',
    }
    const css = [
      `.${PANEL.css.root}{display:grid;gap:20px;max-width:720px;margin:0 auto;padding:24px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:1.5;overflow-y:auto}`,
      `.${PANEL.css.root} h2{margin:0;font:var(--dsw-font-m-strong-16)}`,
      `.${PANEL.css.section}{display:grid;gap:6px}`,
      `.${PANEL.css.row}{display:flex;align-items:center;flex-wrap:wrap;gap:8px}`,
      `.${PANEL.css.hint}{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}`,
      `.${PANEL.css.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')

    /** The panel's style sheet; the id keeps a reload from stacking two copies. */
    function mountStyle() {
      const style = document.createElement('style')
      style.id = PANEL.css.id
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    /** Re-render on a locale change (the dictionaries are looked up at render time). */
    function useLocale(ctx) {
      React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
    }

    /** The registered sections, kept in drawing order: `order`, then `id`, so equal orders stay stable. */
    function sectionRegistry() {
      let sections = Object.freeze([])
      const listeners = new Set()
      const publish = (next) => { sections = Object.freeze(next); listeners.forEach((listener) => listener()) }
      const byOrder = (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      function register(section) {
        const { id, title, order, mount, unmount } = section ?? {}
        if (typeof id !== 'string' || id === '' || typeof title !== 'function' || !Number.isFinite(order) || typeof mount !== 'function' || typeof unmount !== 'function') throw new TypeError(SECTIONS.invalid)
        if (sections.some((entry) => entry.id === id)) throw new Error(SECTIONS.duplicate)
        const entry = Object.freeze({ id, title, order, mount, unmount })
        publish([...sections, entry].sort(byOrder))
        let registered = true
        return () => {
          if (!registered) return
          registered = false
          publish(sections.filter((other) => other !== entry))
        }
      }
      return { register, get: () => sections, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) } }
    }

    /**
     * mount/unmount for a section drawn with React. The panel draws each mounted section through a
     * portal into its container, inside the panel's own tree, so the section keeps DSH's React
     * context (providers, the slot's error boundary) and re-renders with the panel on a locale
     * change; no second React root ever owns a panel container. Offered on the service, so a
     * section plugin draws the same way.
     */
    function portalStore() {
      let portals = Object.freeze([])
      const listeners = new Set()
      const publish = (next) => { portals = Object.freeze(next); listeners.forEach((listener) => listener()) }
      function reactSection(render) {
        return Object.freeze({
          mount(container) { publish([...portals.filter((entry) => entry.container !== container), { container, render }]) },
          unmount(container) { publish(portals.filter((entry) => entry.container !== container)) },
        })
      }
      return { reactSection, get: () => portals, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) } }
    }

    /** One registered section: a labelled region whose content element the section draws into. */
    function SectionHost({ section, t }) {
      const ref = React.useRef(null)
      const [failed, setFailed] = React.useState(false)
      React.useLayoutEffect(() => {
        const container = ref.current
        setFailed(false)
        // A failing section shows the panel's failure line; the other sections are unaffected.
        try { section.mount(container) } catch { setFailed(true); return undefined }
        return () => section.unmount(container)
      }, [section])
      return h('section', { 'aria-label': section.title(), [SECTIONS.attribute]: section.id },
        failed ? h('p', { className: PANEL.css.error, role: 'alert' }, t('loadFailed')) : null,
        h('div', { ref, className: PANEL.css.section }))
    }

    function makePanel(ctx, t, registry, portals) {
      return function FishballSettingsPanel() {
        const sections = React.useSyncExternalStore(registry.subscribe, registry.get)
        const drawn = React.useSyncExternalStore(portals.subscribe, portals.get)
        useLocale(ctx)
        return h('div', { className: PANEL.css.root, 'data-fishball-settings': true },
          h('h2', null, t('title')),
          sections.map((section) => h(SectionHost, { key: section.id, section, t })),
          drawn.map(({ container, render }) => createPortal(render(), container)))
      }
    }

    /** The links to the child's native pages; both return through the page's own navigation. */
    function NativeLinks({ ctx, t }) {
      const [missing, setMissing] = React.useState(false)
      // Looked up on press: the launcher is a portal fishball-page may mount after this panel.
      const openSettings = () => {
        const launcher = document.querySelector(PANEL.settingsLauncher)
        setMissing(launcher === null)
        launcher?.click()
      }
      const openPlugins = () => {
        const navigation = ctx.get(PANEL.navigation)
        if (navigation) navigation.openList()
        else ctx.layout.selectPanel(PANEL.pluginsPanel)
      }
      return h(React.Fragment, null,
        h('h2', null, t('nativeTitle')),
        h('p', { className: PANEL.css.hint }, t('nativeHint')),
        h('div', { className: PANEL.css.row },
          h(Button, { type: 'button', size: 'sm', variant: 'outline', 'aria-haspopup': 'dialog', 'data-fishball-settings-open': 'settings', onClick: openSettings }, t('openSettings')),
          h(Button, { type: 'button', size: 'sm', variant: 'outline', 'data-fishball-settings-open': 'plugins', onClick: openPlugins }, t('openPlugins'))),
        missing ? h('p', { className: PANEL.css.error, role: 'alert' }, t('settingsUnavailable')) : null)
    }

    /** The panel's own sections, registered through the extension point like any other. */
    function ownSections(ctx, t, reactSection) {
      return [
        { ...OWN.readOnly, title: () => t('readOnlyTitle'), ...reactSection(() => h('p', { className: PANEL.css.hint, 'data-fishball-settings-readonly': true }, t('readOnly'))) },
        { ...OWN.native, title: () => t('nativeTitle'), ...reactSection(() => h(NativeLinks, { ctx, t })) },
      ]
    }

    /** The header action that opens this panel from Fishball's conversation. */
    function makeEntry(ctx, t) {
      return function FishballSettingsEntry() {
        useLocale(ctx)
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', 'data-fishball-settings-entry': true, onClick: () => ctx.layout.selectPanel(PANEL.id) }, t('entry'))
      }
    }

    /**
     * `view=settings` opens this panel once at load, and once more when the Fishball page first
     * marks its conversation ready (its one-time manager selection closes panels). Nothing reopens
     * it after that, so the user's own navigation is never overridden.
     */
    function openFromContinuation(ctx) {
      const wanted = new URLSearchParams(window.location.hash.slice(1)).get(PANEL.continuation.name) === PANEL.continuation.value
      if (!wanted) return () => {}
      const open = () => { try { ctx.layout.selectPanel(PANEL.id) } catch { /* the panel is not registered yet */ } }
      // The second open only restores what the page's selection closed: when the user opened
      // another panel meanwhile, that choice stands.
      const reopen = () => { if ([null, PANEL.id].includes(ctx.layout.panelInfo.getSnapshot().activePanelId)) open() }
      queueMicrotask(open)
      const root = document.documentElement
      if (root.hasAttribute(PANEL.sessionReady)) return () => {}
      const observer = new MutationObserver(() => {
        if (!root.hasAttribute(PANEL.sessionReady)) return
        observer.disconnect()
        queueMicrotask(reopen)
      })
      observer.observe(root, { attributes: true, attributeFilter: [PANEL.sessionReady] })
      return () => observer.disconnect()
    }

    function apply(ctx) {
      const t = ctx.locale.bind(PANEL.locale)
      const registry = sectionRegistry()
      const portals = portalStore()
      ctx.effect(() => ctx.locale.register(PANEL.locale, { en, zh }), 'fishball settings: dictionaries')
      ctx.effect(mountStyle, 'fishball settings: styles')
      // A reflected service, as DSH's own clients publish theirs (pluginNavigation,
      // userQuestionPanels); a section plugin injects it and registers once it exists.
      ctx.effect(() => ctx.reflect.provide(SECTIONS.service, Object.freeze({
        register: registry.register,
        reactSection: portals.reactSection,
        classes: Object.freeze({ section: PANEL.css.section, row: PANEL.css.row, hint: PANEL.css.hint, error: PANEL.css.error }),
      })), 'fishball settings: sections service')
      for (const section of ownSections(ctx, t, portals.reactSection)) ctx.effect(() => registry.register(section), 'fishball settings: ' + section.id)
      ctx.effect(() => ctx.slots.inject(PANEL.mainSlot, () => ctx.slots.register({
        name: PANEL.mainSlot, key: PANEL.id, locale: PANEL.locale,
      }, makePanel(ctx, t, registry, portals))), 'fishball settings: panel')
      ctx.effect(() => ctx.slots.inject(PANEL.headerSlot, () => ctx.slots.register({
        name: PANEL.headerSlot, id: PANEL.id, order: PANEL.headerOrder, locale: PANEL.locale,
      }, makeEntry(ctx, t))), 'fishball settings: header entry')
      ctx.effect(() => openFromContinuation(ctx), 'fishball settings: view continuation')
    }

    return { name: PANEL.id, inject: ['slots', 'layout', 'locale'], apply }
  },
})
