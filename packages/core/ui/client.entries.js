/**
 * The Fishball page's two settings entries, browser half (requirements 1.34 item 4: "可以在fishball对外
 * 暴露的UI中打开dsh的自带设置，或者直接跳转到fishball core的设置。"; R-FB-02 as amended by 1.34). A
 * package-local chunk of fishball-ui's client (`client.js` loads it and starts `entriesPart`),
 * because DSH's client modules serve only `client.<name>.js` files beside `client.js` (CLIENT_CHUNK,
 * both SDKs).
 *
 * F-SETTINGS built these inside core's settings chunk; F-UI moved them here unchanged, because they
 * are UI changes inside Fishball (R-FB-14), while core keeps its plugin settings page:
 * - "Fishball settings" opens core's settings page (its bundle page on DSH's Plugins page);
 * - "DSH settings" presses the Fishball page's Settings launcher (DSH's built-in Settings);
 * - the `view=settings` fragment continuation opens core's settings page.
 */
window.__ModuleLoader__.load({
  // A chunk of fishball-ui's client (client.js `UI.parts`): the owner id and this file's name.
  id: 'fishball-ui',
  chunk: 'client.entries.js',
  factory(require) {
    const React = require('react')
    const { Button, Tooltip, IconSlidersTwoOutlineRegular, IconSettingsOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const ENTRIES = Object.freeze({
      name: 'fishball-ui: entries',
      locale: 'fishball-ui-entries',
      slot: 'conversation.session.header.actions',
      // The V2 panel's header order, so the actions keep their place beside the native ones.
      order: Object.freeze({ fishball: 90, dsh: 91 }),
      id: Object.freeze({ fishball: 'fishball-core-settings', dsh: 'fishball-dsh-settings' }),
      /** DSH's Plugins panel, where core's settings page (kit `openCoreSettings`) opens. */
      pluginsPanel: 'plugins',
      /**
       * No public service opens DSH's Settings: the single `settings.launcher` owner gets the only
       * `openSettings` callback, and fishball-page draws it as this button in DSH's sidebar settings seat. Pressing it is the
       * native open path, so the native modal and its sections stay native.
       */
      settingsLauncher: '.fishball-settings-launcher',
      /**
       * PG-ORIGIN's fragment continuation, as fishball-page reads it (`view=settings`). The page's
       * one-time manager selection closes panels when the conversation first becomes ready
       * (`data-fishball-session` on <html>), so the page is opened at load and once more then.
       */
      continuation: Object.freeze({ name: 'view', value: 'settings' }),
      sessionReady: 'data-fishball-session',
      css: Object.freeze({ id: 'fishball-ui-entries-style', headerError: 'fb-ui-entries-header-error' }),
      button: Object.freeze({ type: 'button', size: 'sm', variant: 'ghost' }),
      /**
       * UI-POLISH-F: icon-only, named by aria-label and DSH's Tooltip, as DSH's own header actions
       * (jobs, subagents) are: sliders for Fishball's own settings, the gear for DSH's (the glyph of
       * DSH's Settings trigger). Not the fish: on this page it means "back to Fishball" (the bar).
       */
      tooltip: Object.freeze({ side: 'bottom', align: 'end', portal: true }),
      icon: 16,
    })

    const en = {
      entryFishball: 'Fishball settings',
      entryDsh: 'DSH settings',
      settingsUnavailable: 'DSH Settings cannot be opened from here right now; use Settings in the sidebar.',
    }
    const zh = {
      entryFishball: 'Fishball 设置',
      entryDsh: 'DSH 设置',
      settingsUnavailable: '现在无法从这里打开 DSH 设置；请使用侧边栏中的“设置”。',
    }
    // Inside the header actions bar: one line, no block margin, so the bar keeps its height.
    const css = `.${ENTRIES.css.headerError}{align-self:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40ch;font-size:12px;color:var(--dsw-alias-state-error-primary)}`

    /** Re-render on a locale change (the dictionaries are looked up at render time). */
    function useLocale(ctx) {
      React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
    }

    /** One icon-only header entry: DSH's Button with `Icon`, named `label` in aria-label and Tooltip. */
    function iconEntry(kit, label, Icon, props) {
      return h(Tooltip, { ...ENTRIES.tooltip, label },
        h(Button, { ...ENTRIES.button, ...props, className: kit.css.iconButton, 'aria-label': label }, h(Icon, { size: ENTRIES.icon })))
    }

    function makeFishballEntry(ctx, t, kit) {
      return function FishballSettingsEntry() {
        useLocale(ctx)
        return iconEntry(kit, t('entryFishball'), IconSlidersTwoOutlineRegular, { 'data-fishball-settings-entry': 'fishball', onClick: () => kit.openCoreSettings(ctx) })
      }
    }

    function makeDshEntry(ctx, t, kit) {
      return function DshSettingsEntry() {
        const [missing, setMissing] = React.useState(false)
        useLocale(ctx)
        // Looked up on press: the launcher is a portal fishball-page may mount after this entry.
        // DSH offers no toast service, so a missing launcher is said inline, as one short line in
        // the header bar (the full text stays readable as its title).
        const open = () => {
          const launcher = document.querySelector(ENTRIES.settingsLauncher)
          setMissing(launcher === null)
          launcher?.click()
        }
        return h(React.Fragment, null,
          iconEntry(kit, t('entryDsh'), IconSettingsOutlineRegular, { 'aria-haspopup': 'dialog', 'data-fishball-settings-entry': 'dsh', onClick: open }),
          missing ? h('span', { className: ENTRIES.css.headerError, role: 'alert', title: t('settingsUnavailable') }, t('settingsUnavailable')) : null)
      }
    }

    /**
     * `view=settings` opens core's settings page once at load, and once more when the Fishball page
     * first marks its conversation ready (its one-time manager selection closes panels). Nothing
     * reopens it after that, so the user's own navigation is never overridden.
     */
    function openFromContinuation(ctx, kit) {
      const wanted = new URLSearchParams(window.location.hash.slice(1)).get(ENTRIES.continuation.name) === ENTRIES.continuation.value
      if (!wanted) return () => {}
      const open = () => { try { kit.openCoreSettings(ctx) } catch { /* the Plugins panel is not registered yet */ } }
      // The second open only restores what the page's selection closed: when the user opened
      // another panel meanwhile, that choice stands.
      const reopen = () => { if ([null, ENTRIES.pluginsPanel].includes(ctx.layout.panelInfo.getSnapshot().activePanelId)) open() }
      queueMicrotask(open)
      const root = document.documentElement
      if (root.hasAttribute(ENTRIES.sessionReady)) return () => {}
      const observer = new MutationObserver(() => {
        if (!root.hasAttribute(ENTRIES.sessionReady)) return
        observer.disconnect()
        queueMicrotask(reopen)
      })
      observer.observe(root, { attributes: true, attributeFilter: [ENTRIES.sessionReady] })
      return () => observer.disconnect()
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function entriesPart(kit) {
      function apply(ctx) {
        const t = ctx.locale.bind(ENTRIES.locale)
        ctx.effect(() => ctx.locale.register(ENTRIES.locale, { en, zh }), ENTRIES.name + ': dictionaries')
        ctx.effect(() => kit.mountStyle(ENTRIES.css.id, css), ENTRIES.name + ': styles')
        const header = (key, Component) => ctx.effect(() => ctx.slots.inject(ENTRIES.slot, () => ctx.slots.register({
          name: ENTRIES.slot, id: ENTRIES.id[key], order: ENTRIES.order[key], locale: ENTRIES.locale,
        }, Component)), ENTRIES.name + ': ' + ENTRIES.id[key])
        header('fishball', makeFishballEntry(ctx, t, kit))
        header('dsh', makeDshEntry(ctx, t, kit))
        ctx.effect(() => openFromContinuation(ctx, kit), ENTRIES.name + ': view continuation')
      }
      return Object.freeze({ name: ENTRIES.name, inject: ['slots', 'layout', 'locale'], apply })
    }

    return { entriesPart }
  },
})
