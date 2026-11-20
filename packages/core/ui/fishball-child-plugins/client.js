/**
 * The instance-run child's Plugins page (DESIGN §28; the user, 2026-11-20): every package operation
 * on the child's profile runs in the main DSH, through dsh-instance, so the child's own install
 * entries are hidden, not refused ("Just hide it would be enough to keep it away from normal user
 * path"): DSH's Add plugin button and its "Choose how to add a plugin" menu, the Discover tab
 * (dsh-client-ui-plugin-market, the experimental plugin-market bundle), every Uninstall control and
 * every Update control (both run pnpm in the child).
 * Where Add plugin was, a notice says where this Fishball's plugins are installed instead.
 *
 * It is served only in an instance-run child: core's patch switches its row on only then
 * (fishball-child-plugins/index.js). One style sheet does all of it.
 *
 * DEPENDENCY ON DSH'S MARKUP (dsh-client-ui-plugin-manager `PluginManagerPage.tsx`, checked in
 * 0.2.2-rc.3). No hashed CSS-module class is used; the selectors read what DSH renders:
 * - `[data-plugin-toolbar]`: the main list's toolbar, where Refresh and Add plugin sit;
 * - Add plugin: the `role="group"` with `aria-label` = DSH's `addPlugin` word, holding the
 *   primary button (same label) and the menu anchor (`aria-label` = `chooseAddMethod`). The menu
 *   is portalled and opens only from that anchor, so hiding the anchor keeps the menu shut;
 * - Discover: SegmentedTabs gives each tab `id = <useId>-<entry id>`, and plugin-market registers
 *   the entry id `discover` and marks its panel's root `data-plugin-tab="discover"` (DSH_PAGE);
 * - Uninstall and Update: the bundle page's buttons inside `[data-plugin-detail]` whose
 *   `aria-label` is DSH's `uninstallLabel`, `updateLabel` or `versionsUpdateLabel` (DSH_PAGE.runsPnpm). The words are read from DSH's own `pluginManager`
 *   dictionary through the locale service, in the active language, so the rule follows a language
 *   switch and DSH's own translations without a copy here.
 * No DSH slot sits in the page header (the page declares `plugins.add.actions` inside the hidden
 * menu, `plugins.tab` and the detail-page slots only), so the notice is the toolbar's `::after`
 * generated text: it is exposed to assistive technology, but cannot be selected or copied.
 * Accepted risk (DESIGN §28): a change to that markup or those words in a later DSH can bring a
 * control back or misplace the notice; nothing on the Host refuses the operation.
 */
window.__ModuleLoader__.load({
  id: 'fishball-child-plugins',
  factory() {
    const CHILD = Object.freeze({
      name: 'fishball-child-plugins',
      ns: 'fishballChildPlugins',
      style: 'fishball-child-plugins-style',
      effect: 'fishball-child-plugins: hide install entries',
      dictionaries: 'fishball-child-plugins: dictionaries',
    })
    /** DSH's Plugins page markup and words this rule reads (see the header comment). */
    const DSH_PAGE = Object.freeze({
      ns: 'pluginManager',
      words: Object.freeze({ addPlugin: 'addPlugin', chooseAddMethod: 'chooseAddMethod' }),
      /**
       * The bundle page's buttons that run pnpm in the child, each by its `aria-label` template and
       * that template's one placeholder (PluginManagerPage.tsx L770-779, versions.tsx L153): Uninstall
       * ("Uninstall {name}"), the Git/registry Update ("Update {name}") and the version Update
       * ("Update to {version}", in the head and on each Versions row). Hidden like Uninstall (the user,
       * 2026-11-20): updating is uninstalling and reinstalling from the main DSH.
       */
      runsPnpm: Object.freeze([
        Object.freeze({ word: 'uninstallLabel', parameter: 'name' }),
        Object.freeze({ word: 'updateLabel', parameter: 'name' }),
        Object.freeze({ word: 'versionsUpdateLabel', parameter: 'version' }),
      ]),
      /**
       * A template's placeholder is filled with this marker, then split there into prefix and suffix.
       * A private-use character, which no dictionary word contains.
       */
      nameMarker: '\uE000',
      toolbar: '[data-plugin-toolbar]',
      detail: '[data-plugin-detail]',
      tabsPart: '[data-plugin-header-part="tabs"]',
      /**
       * plugin-market's Discover tab, matched exactly. DSH builds a tab's id as
       * `${useId()}-${entry.id}` (PluginManagerPage.tsx L1742-1743, 0.2.2-rc.3), plugin-market
       * registers the entry id `discover`, and React's `useId` ends with `:` (`:r1:`) in every
       * React the DSH web frontend bundles: 0.2.1-rc.2 through 0.2.2-rc.3, 0.2.1-rc.5 and 0.2.2-rc.1
       * included (checked in each installation's dsh-web-frontend bundle). So only `:-discover` is
       * Discover; another entry whose own id ends in `-discover` (`fbtest-discover`) ends
       * `fbtest-discover` after the delimiter and does not match. A DSH whose React changes that
       * delimiter (React 19.1 ends with `»`) brings the tab back: the accepted risk above. CSS
       * cannot compare `aria-controls` with the panel's id, so the id ending is the exact test.
       */
      discoverTab: '[role="tab"][id$=":-discover"]',
      /** SegmentedTabs marks the selected tab so; DSH remembers the selected tab across visits. */
      selected: '[aria-selected="true"]',
      /**
       * The Discover panel, matched exactly by either of two facts: DSH's panel id
       * `${useId()}-${tab}-panel` (PluginManagerPage.tsx L1756), with the same `:` delimiter as
       * `discoverTab`, or plugin-market's own root marker inside it (DiscoverSection.tsx L634,
       * `data-plugin-tab="discover"`). A selector list, so either one alone still hides it.
       */
      discoverPanel: '[role="tabpanel"][id$=":-discover-panel"],[role="tabpanel"]:has([data-plugin-tab="discover"])',
      /** The third tab button (Installed and Discover are the first two): another plugin's tab. */
      thirdTab: '[role="tab"]:nth-of-type(3)',
    })
    const zh = { notice: '这个 Fishball 的插件在主 DSH 中安装：插件 → Fishball 标签页。' }
    const en = { notice: 'Plugins for this Fishball are installed from the main DSH: Plugins → Fishball tab.' }

    /** A CSS string literal of `text` (CSS.escape's output is valid inside a quoted string). */
    const quoted = (text) => '"' + CSS.escape(text) + '"'
    const hide = (selectors) => selectors.join(',') + '{display:none!important}'

    /**
     * The `aria-label` match of one templated DSH button in the active language: the template's
     * text before and after its placeholder. A part that is empty adds no condition; an unregistered
     * dictionary answers the key itself, which matches no button until the dictionary arrives.
     */
    function templateMatch(dsh, { word, parameter }) {
      const [prefix, suffix = ''] = dsh(word, { [parameter]: DSH_PAGE.nameMarker }).split(DSH_PAGE.nameMarker)
      return (prefix === '' ? '' : `[aria-label^=${quoted(prefix)}]`) + (suffix === '' ? '' : `[aria-label$=${quoted(suffix)}]`)
    }

    function css(dsh, t) {
      const label = (word) => `[aria-label=${quoted(dsh(word))}]`
      // An empty match would hide every detail-page button, so none is written for it.
      const pnpmButtons = DSH_PAGE.runsPnpm.map((template) => templateMatch(dsh, template)).filter((match) => match !== '')
      return [
        hide([
          `${DSH_PAGE.toolbar} [role="group"]${label(DSH_PAGE.words.addPlugin)}`,
          `${DSH_PAGE.toolbar} button${label(DSH_PAGE.words.addPlugin)}`,
          `${DSH_PAGE.toolbar} button${label(DSH_PAGE.words.chooseAddMethod)}`,
          DSH_PAGE.discoverTab,
          DSH_PAGE.discoverPanel,
          // With Discover the only contributed tab, the bar would show Installed alone (and its arrow
          // keys could still select the hidden tab), so the whole tab bar goes. Beside another tab only
          // the Discover tab hides; DSH's selection indicator then keeps its width for one tab more.
          // Never while Discover is the selected tab: DSH remembers the selection across visits, so a
          // page that last showed Discover opens on its (hidden, empty) panel, and the bar keeps
          // Installed clickable as the way back.
          `${DSH_PAGE.tabsPart}:has(${DSH_PAGE.discoverTab}):not(:has(${DSH_PAGE.thirdTab})):not(:has(${DSH_PAGE.discoverTab}${DSH_PAGE.selected}))`,
          ...pnpmButtons.map((match) => `${DSH_PAGE.detail} button${match}`),
        ]),
        // DSH tokens only, the toolbar's own secondary text.
        `${DSH_PAGE.toolbar}::after{content:${quoted(t('notice'))};color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13)}`,
      ].join('')
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(CHILD.ns, { zh, en }), CHILD.dictionaries)
      const dsh = ctx.locale.bind(DSH_PAGE.ns)
      const t = ctx.locale.bind(CHILD.ns)
      ctx.effect(() => {
        const style = document.createElement('style')
        style.id = CHILD.style
        const render = () => { style.textContent = css(dsh, t) }
        render()
        document.head.appendChild(style)
        // A language switch and a dictionary registration (DSH's own included) both notify.
        const stop = ctx.locale.subscribe(render)
        return () => { stop(); style.remove() }
      }, CHILD.effect)
    }

    return { name: CHILD.name, inject: ['locale'], apply }
  },
})
