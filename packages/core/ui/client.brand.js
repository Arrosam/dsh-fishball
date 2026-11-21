/**
 * Fishball's logo in DSH's sidebar brand row (LOGO-BUTTON): the V1 mechanism, on V3's page.
 *
 * V1 filled DSH's `sidebar.brand.mark` / `sidebar.brand.name` slots at priority -1 and took over
 * the enclosing shell button's click; DSH's shell still owns that button (its New Session handler
 * and its `aria-label`), so the click is captured before the shell's and the label is written back
 * after each shell re-render (the reason V1 added its MutationObserver, 524aa33a). The difference
 * from V1 is only the state source and the page: this is Fishball's page in the hosted child, where
 * fishball-page hides New Session and this logo is the way back to the one manager session.
 *
 * State (no new server state):
 * - `api/fishball/strip` (fishball-ui's status view): core on/off and the saved logo theme;
 * - `api/fishball/asks/events` (core's card stream): the one manager session id and the open cards;
 * - `ctx.sessions.list`: the manager's live `running` flag (working or idle).
 * A lost asks stream, core off, or no manager session yet is offline (the strip only carries
 * presentation, so its own health does not claim a disconnection). An open card is "needs
 * attention": the V1 count pill, 99+. Working is what animates: the fish wags, the whale swims
 * (the DeepSeek theme is DSH's own whale mark beside Fishball's wordmark, its accent DeepSeek blue,
 * so the button still reads as Fishball). `prefers-reduced-motion` keeps the still
 * state. The wide button's accessible name is "Fishball"; the status is its description and a
 * visually hidden text node. The rail renders only the mark, inside the shell's collapse/expand
 * button: that button keeps its own label and click, so the rail still expands, and only the
 * expanded brand row is Fishball's control.
 *
 * It registers only while fishball-page's mark is on `<html>` (kit `whilePage`), so another DSH that
 * merely has fishball-ui keeps DSH's own brand. It is a package-local chunk because DSH serves only
 * flat `client.<name>.js` files beside a package's `client.js` (CLIENT_CHUNK, both SDKs).
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  chunk: 'client.brand.js',
  factory(require) {
    const React = require('react')
    const { StateDot, FishLogo } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /**
     * The brand's public values. `theme` is `fishball-shared/ui-seam`'s `SEAM_BRAND` and `pageRoot`
     * is fishball-page's `PAGE.root`; both are restated because a browser chunk cannot import either
     * (Q-G2: fishball-ui imports nothing of core; the chunk loads no library module).
     */
    const BRAND = Object.freeze({
      markSlot: 'sidebar.brand.mark',
      nameSlot: 'sidebar.brand.name',
      priority: -1,
      name: 'FISHBALL',
      tag: 'Deepseek Harness',
      accessibleName: 'Fishball',
      theme: Object.freeze({ fishball: 'fishball', deepseek: 'deepseek', default: 'fishball' }),
      themes: Object.freeze(['fishball', 'deepseek']),
      route: Object.freeze({ strip: 'api/fishball/strip', asks: 'api/fishball/asks/events' }),
      state: Object.freeze({ idle: 'idle', working: 'working', offline: 'offline', attention: 'attention' }),
      card: Object.freeze({ open: 'open' }),
      /** The mark's status light, with DSH's own StateDot states (done / ongoing / warning / error). */
      light: Object.freeze({ idle: 'done', working: 'ongoing', attention: 'warning', offline: 'error' }),
      /** V1's count pill: the count up to `max`, then `${max}+`, so it stays narrow in the sidebar. */
      badgeMax: 99,
      badgeSuffix: '+',
      /** The attention copy's one placeholder (`text.attention`). */
      countPlaceholder: '{count}',
      /**
       * Each theme's one accent colour (the fish's eye, the tag's hard shadow) and its count pill's
       * fill. The pill is the accent darkened to reach 4.5:1 with its white count: V1's magenta
       * #EC0A6E is 4.36:1 and DeepSeek's brand blue #4D6BFE is 4.33:1.
       */
      accent: Object.freeze({
        fishball: Object.freeze({ color: '#EC0A6E', badge: '#D40063' }),
        deepseek: Object.freeze({ color: '#4D6BFE', badge: '#4161F5' }),
      }),
      /** The custom properties the theme classes set, so one tag/badge rule serves both themes. */
      accentVar: '--fb-brand-accent',
      badgeVar: '--fb-brand-badge-fill',
      size: 24,
      motionQuery: '(prefers-reduced-motion: no-preference)',
      reducedMotionQuery: '(prefers-reduced-motion:reduce)',
      key: Object.freeze({ enter: 'Enter', space: ' ' }),
      /** The shell's own `aria-label` on the brand button is overwritten by each re-render; restored on teardown. */
      labelAttribute: 'aria-label',
      controlAttribute: 'data-fishball-logo-control', // fishball-page exposes the wide button only while captured.
      descriptionAttribute: 'aria-description',
      shortcutAttribute: 'aria-keyshortcuts',
      /** V1 had no title; a native title is the fallback where `aria-description` is not exposed. */
      titleAttribute: 'title',
      /** How many ancestors above the name to search for the shell's clipping box (V1's bound). */
      clipDepth: 4,
      css: Object.freeze({
        id: 'fishball-brand-style', mark: 'fb-brand-mark', art: 'fb-brand-art', wag: 'fb-brand-wag', swim: 'fb-brand-swim',
        light: 'fb-brand-light', badge: 'fb-brand-badge', name: 'fb-brand-name', word: 'fb-brand-word', tag: 'fb-brand-tag',
        hidden: 'fb-brand-hidden', theme: 'fb-brand-theme-',
      }),
      classPrefix: 'fb-brand',
      animation: Object.freeze({
        wag: 'fb-brand-wag', swim: 'fb-brand-swim', seconds: 2.2, origin: '70% 40%',
        wagKeyframes: Object.freeze([[0, 'none'], [55, 'none'], [62, 'rotate(-14deg)'], [70, 'rotate(12deg)'], [78, 'rotate(-9deg)'], [86, 'rotate(5deg)'], [100, 'none']]),
        swimKeyframes: Object.freeze([[0, 'none'], [55, 'none'], [64, 'rotate(-5deg) translate(-.4px,-1px)'], [74, 'rotate(4deg) translate(.3px,.4px)'], [86, 'rotate(-2deg)'], [100, 'none']]),
      }),
      /** V1's FishMark (the owner's app): body and eye on a 24-unit grid. */
      fish: Object.freeze({
        viewBox: '0 0 24 24',
        body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
        eye: 'M14.6 7.4 h2 v2 h-2 Z',
      }),
      /**
       * V1's word logo and "Deepseek Harness" tag, restored exactly (V1 client.js WORDMARK and
       * BRAND_TAG, last at aa8e1d57; the user, 2026-11-20: "not identical to what it looks like in
       * V1"). The word keeps the shell's own name size (dsh-client-ui-sidebar .brandName, 18px) and
       * is lifted so the tag can cover its bottom edge without hiding the letters. The tag is a flat
       * sticker over the word's bottom-right corner: it takes no layout space, overhangs the shell's
       * 24px brand box (releaseClip opens it), swaps the sidebar's label colours so it reads on light
       * and dark themes, and spends the brand's one colour on its hard drop shadow. Both end on named
       * Latin faces: a bare `sans-serif` follows <html lang> and turned PingFang in Chinese (6dd51bf7).
       */
      latinFont: 'Helvetica,Arial,sans-serif',
      wordmark: Object.freeze({ family: '"Archivo","Helvetica Neue"', weight: 900, letterSpacing: '-0.5px', lineHeight: 1, lift: '-2px' }),
      sticker: Object.freeze({
        fontSize: '9px', lineHeight: '11px', fontWeight: 800, paddingX: '4px', radius: '1px', right: '-16px', bottom: '-9px',
        fill: 'var(--dsw-alias-label-primary)', textColor: 'var(--dsw-alias-label-primary-inverted)',
        ring: '0 0 0 1.5px var(--dsw-alias-label-primary-inverted)', shadowOffset: '2px 2px 0 1.5px',
      }),
      text: Object.freeze({
        en: { idle: 'Connected', working: 'Working', offline: 'Offline', attention: 'Waiting for you ({count})' },
        zh: { idle: '已连接', working: '工作中', offline: '离线', attention: '等你处理（{count}）' },
      }),
    })

    const C = BRAND.css
    const badgeWord = (count) => (count > BRAND.badgeMax ? BRAND.badgeMax + BRAND.badgeSuffix : String(count))
    const statusText = (lang, state, count) => {
      const text = BRAND.text[lang] ?? BRAND.text.en
      return state === BRAND.state.attention ? text.attention.replace(BRAND.countPlaceholder, badgeWord(count)) : text[state]
    }

    /** The keyframes of one animation class, as data. */
    const keyframes = (name, frames) => `@keyframes ${name}{${frames.map(([at, transform]) => `${at}%{transform:${transform}}`).join('')}}`
    const css = [
      `.${C.mark}{position:relative;display:inline-flex;align-items:center;justify-content:center;width:${BRAND.size}px;height:${BRAND.size}px;flex:none;color:currentColor}`,
      `.${C.art}{display:inline-flex;line-height:0;transform-origin:${BRAND.animation.origin}}`,
      `.${C.art}.${C.wag}{animation:${BRAND.animation.wag} ${BRAND.animation.seconds}s ease-in-out infinite}`,
      `.${C.art}.${C.swim}{animation:${BRAND.animation.swim} ${BRAND.animation.seconds}s ease-in-out infinite}`,
      // The light sits on the mark's corner, in a ring of the sidebar's ground so it separates on both themes.
      `.${C.light}{position:absolute;right:-2px;bottom:-2px;display:inline-flex;padding:1px;border-radius:999px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-layer-1))}`,
      // Each theme class sets the accent variables; the tag and the pill read them.
      ...BRAND.themes.map((theme) => `.${C.theme}${theme}{${BRAND.accentVar}:${BRAND.accent[theme].color};${BRAND.badgeVar}:${BRAND.accent[theme].badge}}`),
      `.${C.badge}{position:absolute;top:-6px;right:-8px;min-width:16px;height:16px;box-sizing:border-box;padding:0 4px;border-radius:8px;background:var(${BRAND.badgeVar});color:#fff;font:800 10px/16px sans-serif;text-align:center;box-shadow:0 0 0 2px var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-layer-1))}`,
      // V1's word logo (BRAND.wordmark): the shell's name size, lifted; the tag is placed against it.
      // The face sits on the name, as in V1, so the tag inherits the word's tracking instead of the
      // shell's wider .brandName letter-spacing; the tag then sets only its own font.
      `.${C.name}{position:relative;display:inline-block;top:${BRAND.wordmark.lift};font-family:${BRAND.wordmark.family},${BRAND.latinFont};font-weight:${BRAND.wordmark.weight};letter-spacing:${BRAND.wordmark.letterSpacing};line-height:${BRAND.wordmark.lineHeight};pointer-events:none}`,
      `.${C.word}{white-space:nowrap}`,
      // V1's sticker (BRAND.sticker), overlaid on the corner so it cannot push the sidebar controls.
      `.${C.tag}{position:absolute;right:${BRAND.sticker.right};bottom:${BRAND.sticker.bottom};padding:0 ${BRAND.sticker.paddingX};border-radius:${BRAND.sticker.radius};background:${BRAND.sticker.fill};color:${BRAND.sticker.textColor};font:${BRAND.sticker.fontWeight} ${BRAND.sticker.fontSize}/${BRAND.sticker.lineHeight} ${BRAND.latinFont};box-shadow:${BRAND.sticker.ring},${BRAND.sticker.shadowOffset} var(${BRAND.accentVar});white-space:nowrap;pointer-events:none}`,
      `.${C.hidden}{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}`,
      keyframes(BRAND.animation.wag, BRAND.animation.wagKeyframes),
      keyframes(BRAND.animation.swim, BRAND.animation.swimKeyframes),
      `@media ${BRAND.reducedMotionQuery}{.${C.art}.${C.wag},.${C.art}.${C.swim}{animation:none}}`,
    ].join('')

    /**
     * The fish (Fishball theme), its eye the magenta accent; or DeepSeek's whale (DeepSeek theme):
     * DSH's own `FishLogo`, the mark DSH's official brand plugin puts in this slot, in the sidebar's
     * label colour as DSH draws it. The name stays Fishball's wordmark in both themes (the user,
     * 2026-11-20), so the button still reads as Fishball; only the accent turns DeepSeek blue.
     */
    function Art({ theme, size }) {
      if (theme === BRAND.theme.deepseek) return h(FishLogo, { size })
      return h('svg', { width: size, height: size, viewBox: BRAND.fish.viewBox, 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: BRAND.fish.body, fill: 'currentColor' }),
        h('path', { d: BRAND.fish.eye, fill: BRAND.accent.fishball.color }))
    }

    /**
     * The shell clips the brand row to a 24px box; V1 opened the nearest clipping ancestor so the
     * tag and the badge overhang stay visible. Each occupant calls this: the name opens the box
     * around the word, the mark may already have opened the shell brand box, so the name's walk can
     * reach the shell's logo row and open that too; both are restored on unmount. The inline
     * `overflow` shorthand is saved and restored as a whole (the shell's current rules are
     * class-based, so no inline longhand is lost; revisit if DSH starts setting inline overflow-x/y).
     */
    function releaseClip(node) {
      if (typeof getComputedStyle !== 'function') return undefined
      let box = node?.parentElement
      for (let depth = 1; box && depth < BRAND.clipDepth && getComputedStyle(box).overflowX === 'visible'; depth += 1) box = box.parentElement
      if (!box || getComputedStyle(box).overflowX === 'visible') return undefined
      const previous = box.style.overflow
      box.style.overflow = 'visible'
      return () => { box.style.overflow = previous }
    }

    /** The browser's motion preference, followed live; no matchMedia (a non-browser host) is static. */
    function useMotion() {
      const media = React.useMemo(() => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(BRAND.motionQuery) : null), [])
      const subscribe = React.useCallback((listener) => {
        if (media === null) return () => {}
        media.addEventListener('change', listener)
        return () => media.removeEventListener('change', listener)
      }, [media])
      return React.useSyncExternalStore(subscribe, () => media?.matches ?? false, () => false)
    }

    /**
     * One state read for both slots: the two live streams, the sessions list's manager row, and the
     * language. The state precedence is offline first (nothing claimed while the connection is
     * down), then a pending card, then a running turn, then idle. `working` stays a fact even while a
     * card is open, so the animation follows the turn, while the light follows the more important state.
     */
    function useBrandState(kit, ctx, sources) {
      const lang = kit.useLang(ctx)
      const strip = React.useSyncExternalStore(sources.strip.subscribe, sources.strip.get)
      const asks = React.useSyncExternalStore(sources.asks.subscribe, sources.asks.get)
      const subscribe = React.useCallback((listener) => ctx.sessions.list.subscribe(listener), [])
      const sessions = React.useSyncExternalStore(subscribe, () => ctx.sessions.list.getSnapshot())
      // An empty id is "no manager yet", as core's route reports no manager; never a session to open.
      const asked = asks.frame.managerSessionId
      const managerId = typeof asked === 'string' && asked.trim() !== '' ? asked : null
      const cards = asks.frame.cards ?? []
      const open = cards.filter((card) => card.state === BRAND.card.open).length
      // The asks stream is the page's live link to core: its loss is the disconnection. The strip
      // only carries presentation (the theme and core's on/off), so a stale strip while asks still
      // answers does not make the session unreachable; only an explicit `on:false` (core reported
      // off) does, never merely a frame that has not arrived yet.
      const offline = asks.health !== kit.HEALTH.live || strip.frame.on === false || managerId === null
      const managerRow = managerId === null ? undefined : sessions?.byId?.[managerId]
      const working = !offline && managerRow?.running === true
      const listed = managerRow !== undefined
      const attention = !offline && open > 0
      const state = offline ? BRAND.state.offline : attention ? BRAND.state.attention : working ? BRAND.state.working : BRAND.state.idle
      const theme = BRAND.themes.includes(strip.frame.brandStyle) ? strip.frame.brandStyle : BRAND.theme.default
      return Object.freeze({
        state, theme, working, listed, count: attention ? open : 0, managerId, lang,
        status: statusText(lang, state, open),
      })
    }

    /** The mark: art, status light and the V1 count pill; the animation follows the running turn. */
    function makeMark(kit, ctx, sources) {
      return function FishballBrandMark({ size }) {
        const mark = useBrandState(kit, ctx, sources)
        const motion = useMotion()
        const ref = React.useRef(null)
        React.useEffect(() => releaseClip(ref.current), [])
        const animated = mark.working && motion
        const art = [C.art, animated ? (mark.theme === BRAND.theme.deepseek ? C.swim : C.wag) : null].filter(Boolean).join(' ')
        return h('span', {
          className: `${C.mark} ${C.theme}${mark.theme}`, ref,
          'data-fishball-logo-mark': true, 'data-fishball-logo-state': mark.state, 'data-fishball-logo-theme': mark.theme,
        },
        h('span', { className: art }, h(Art, { theme: mark.theme, size: size ?? BRAND.size })),
        h('span', { className: C.light, 'aria-hidden': 'true', 'data-fishball-logo-light': mark.state }, h(StateDot, { state: BRAND.light[mark.state] })),
        mark.count > 0 ? h('span', { className: C.badge, 'data-fishball-logo-badge': true }, badgeWord(mark.count)) : null)
      }
    }

    /**
     * Open or focus the manager view. `true` when the view accepted it; a fresh child origin can
     * answer `unknown session` before the session list carries the id (fishball-page waits for that
     * list), so a refused attempt is kept as pending and retried when the list next carries it.
     */
    function activate(ctx, sessionId) {
      try { return Promise.resolve(ctx.uiWorkspace.openSession(sessionId)).then(() => true, () => false) } catch { return Promise.resolve(false) }
    }

    /**
     * The wordmark and its tag, and the expanded brand row's control: DSH's shell button gets
     * Fishball's accessible name and status description, restored after every re-render, and a
     * capture-phase activation that opens the one manager session instead of New Session. Enter and
     * Space are handled on keydown so the control works before any browser-generated click, and the
     * native click is always consumed: no manager means nothing happens, never a new session.
     */
    function makeName(kit, ctx, sources) {
      return function FishballBrandName() {
        const ref = React.useRef(null)
        const buttonRef = React.useRef(null)
        const opening = React.useRef(false)
        const pendingOpen = React.useRef(null)
        const mark = useBrandState(kit, ctx, sources)
        const latest = React.useRef(mark)
        latest.current = mark
        React.useEffect(() => releaseClip(ref.current), [])
        React.useEffect(() => {
          const button = ref.current?.closest('button')
          if (!button) return undefined
          buttonRef.current = button
          const previous = {
            label: button.getAttribute(BRAND.labelAttribute),
            description: button.getAttribute(BRAND.descriptionAttribute),
            shortcuts: button.getAttribute(BRAND.shortcutAttribute),
            title: button.getAttribute(BRAND.titleAttribute),
          }
          // DSH writes its own "New Session" label on every re-render (V1's fix, 524aa33a). Equal
          // labels are left alone, so the write cannot loop with this observer.
          const keep = () => {
            if (button.getAttribute(BRAND.labelAttribute) !== BRAND.accessibleName) button.setAttribute(BRAND.labelAttribute, BRAND.accessibleName)
            const wanted = latest.current.status
            if (button.getAttribute(BRAND.descriptionAttribute) !== wanted) button.setAttribute(BRAND.descriptionAttribute, wanted)
            if (button.getAttribute(BRAND.titleAttribute) !== wanted) button.setAttribute(BRAND.titleAttribute, wanted)
            // The shell's New Session shortcut hint would announce a command this button no longer runs.
            if (button.hasAttribute(BRAND.shortcutAttribute)) button.removeAttribute(BRAND.shortcutAttribute)
          }
          keep()
          const watch = new MutationObserver(keep)
          watch.observe(button, { attributes: true, attributeFilter: [BRAND.labelAttribute, BRAND.descriptionAttribute, BRAND.shortcutAttribute, BRAND.titleAttribute] })
          const open = () => {
            const sessionId = latest.current.managerId
            // No manager yet: consume the activation and create nothing. The one session is opened
            // only by its known id; New Session is never a fallback.
            if (sessionId === null) return
            // The manager may already be the current session while a panel (Plugins, a target's
            // details) covers it; closing the panel first is what makes this a focus, not only an open
            // (fishball-page's own back() does the same before its shown check).
            ctx.layout.selectPanel(null)
            const shown = ctx.uiSession?.adapter?.current?.getSnapshot?.()?.key
            if (shown === sessionId) { pendingOpen.current = null; return }
            if (opening.current) return
            opening.current = true
            pendingOpen.current = sessionId
            void activate(ctx, sessionId).then((ok) => {
              opening.current = false
              if (ok) pendingOpen.current = null
            })
          }
          const click = (event) => {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            open()
          }
          const keydown = (event) => {
            if (event.key !== BRAND.key.enter && event.key !== BRAND.key.space) return
            // Consume even a repeat so a held Space does not scroll; only the first press opens.
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            if (event.repeat) return
            open()
          }
          button.addEventListener('click', click, true)
          button.addEventListener('keydown', keydown, true)
          button.setAttribute(BRAND.controlAttribute, '')
          return () => {
            button.removeAttribute(BRAND.controlAttribute)
            watch.disconnect()
            button.removeEventListener('click', click, true)
            button.removeEventListener('keydown', keydown, true)
            if (previous.label === null || previous.label === undefined) button.removeAttribute(BRAND.labelAttribute)
            else button.setAttribute(BRAND.labelAttribute, previous.label)
            if (previous.description === null || previous.description === undefined) button.removeAttribute(BRAND.descriptionAttribute)
            else button.setAttribute(BRAND.descriptionAttribute, previous.description)
            if (previous.shortcuts !== null && previous.shortcuts !== undefined) button.setAttribute(BRAND.shortcutAttribute, previous.shortcuts)
            if (previous.title === null || previous.title === undefined) button.removeAttribute(BRAND.titleAttribute)
            else button.setAttribute(BRAND.titleAttribute, previous.title)
            buttonRef.current = null
          }
        }, [])
        // The status is written again when it changes; the watcher's guard keeps it from looping.
        React.useEffect(() => {
          const button = buttonRef.current
          if (button && button.getAttribute(BRAND.descriptionAttribute) !== mark.status) button.setAttribute(BRAND.descriptionAttribute, mark.status)
        }, [mark.status])
        // A click before the session list carried the manager was refused; retry once the list does.
        React.useEffect(() => {
          const sessionId = pendingOpen.current
          if (sessionId === null || sessionId !== mark.managerId || !mark.listed || opening.current) return
          const shown = ctx.uiSession?.adapter?.current?.getSnapshot?.()?.key
          if (shown === sessionId) { pendingOpen.current = null; return }
          opening.current = true
          void activate(ctx, sessionId).then((ok) => {
            opening.current = false
            if (ok) pendingOpen.current = null
          })
        }, [mark.listed, mark.managerId])
        return h('span', { ref, className: `${C.name} ${C.theme}${mark.theme}`, 'data-fishball-logo-name': true, 'data-fishball-logo-state': mark.state },
          h('span', { className: C.word, 'data-fishball-logo-word': true }, BRAND.name),
          h('span', { className: C.tag, 'data-fishball-logo-tag': true }, BRAND.tag),
          h('span', { className: C.hidden, 'data-fishball-logo-status': mark.state }, mark.status))
      }
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function brandPart(kit) {
      function apply(ctx) {
        const sources = Object.freeze({
          // Language is not needed for the theme or `on`; the strip route's own default is enough.
          strip: kit.liveStream({
            url: () => new URL(BRAND.route.strip, document.baseURI).toString(),
            valid: (next) => next !== null && typeof next === 'object' && typeof next.on === 'boolean',
            initial: Object.freeze({ on: null, brandStyle: BRAND.theme.default }),
          }),
          asks: kit.liveStream({
            url: () => new URL(BRAND.route.asks, document.baseURI).toString(),
            valid: (next) => next !== null && typeof next === 'object' && Array.isArray(next.cards),
            initial: Object.freeze({ managerSessionId: null, cards: Object.freeze([]) }),
          }),
        })
        const Mark = makeMark(kit, ctx, sources)
        const Name = makeName(kit, ctx, sources)
        ctx.effect(() => kit.mountStyle(C.id, css), BRAND.classPrefix + ': styles')
        ctx.effect(() => kit.whilePage((fail) => {
          // inject may return a waiting controller. Catch at registration, before the SDK can
          // retire just this slot and rethrow on a microtask, leaving the sibling live.
          const inject = (name, Component) => {
            let failed = false
            const stop = ctx.slots.inject(name, () => {
              if (failed) return
              try { return ctx.slots.register({ name, priority: BRAND.priority }, Component) }
              catch (error) { failed = true; fail(error) }
            })
            // The renderer records this declaration's effect *after* our callback returns. On a
            // deferred failure let it finish before stopping this controller, or that effect leaks.
            // The observer and the sibling still stop synchronously; no retry can register here.
            return () => { if (failed) queueMicrotask(stop); else stop() }
          }
          const disposeMark = inject(BRAND.markSlot, Mark)
          try {
            const disposeName = inject(BRAND.nameSlot, Name)
            return () => { try { disposeName() } finally { disposeMark() } }
          } catch (error) {
            disposeMark()
            throw error
          }
        }, error => ctx.logger?.warn?.(BRAND.classPrefix, error)), BRAND.classPrefix + ': brand slots')
      }
      return Object.freeze({ name: 'fishball-ui: brand', inject: ['slots', 'locale', 'sessions', 'uiSession', 'uiWorkspace', 'layout'], apply })
    }

    return { brandPart }
  },
})
