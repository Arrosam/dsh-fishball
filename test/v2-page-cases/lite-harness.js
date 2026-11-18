/*
 * LITE in-browser harness (test-owned classic script; served at the child origin).
 *
 * It builds a native-like child document, starts the SELECTED SDK's real dsh-client-shortcuts
 * browser service (ShortcutsService over real localStorage at this origin), and then loads the
 * product page client unread through window.__ModuleLoader__. Every other injected service is a
 * recording fake with the public SDK shape. Fault injection wraps the public service (it never
 * edits the product): see `faults` in start().
 */
(() => {
  'use strict'
  const H = {
    storageKey: 'dsh.keybindings.v1',
    pageScript: '/page/client.js',
    sdkPrefix: '/sdk/',
    sessionRoute: '/api/fishball/session',
    pageScriptMarker: '/page/client.js',
    pageNav: 'nav[aria-label="fishball-page"]',
    statusRole: '[role="status"]',
    primitivesModule: '@deepseek-ai/dsh-client-ui-primitives',
    buttonType: 'button',
  }
  const sdk = new URLSearchParams(location.search).get('sdk')
  const log = { focused: [], timeline: [], registerCalls: [], fixedInputs: [], edits: [], editResults: [], calls: [], timers: [], opens: [], handlers: [], keys: [], openSettings: 0, setLocale: [], storageWrites: [], maxInFlight: 0, errors: [] }
  window.addEventListener('error', (event) => log.errors.push(String(event.message)))
  // Every element that ever receives focus (Tab walks, programmatic focus) is recorded by id.
  document.addEventListener('focusin', (event) => { if (event.target?.id) log.focused.push(event.target.id) }, true)
  window.addEventListener('unhandledrejection', (event) => log.errors.push(String(event.reason?.stack ?? event.reason)))

  // --- timers: record only those scheduled from the page client's own code ---------------------
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) {
    const original = window[name]
    if (typeof original !== 'function') continue
    window[name] = function (...args) {
      const stack = new Error().stack ?? ''
      if (stack.includes(H.pageScriptMarker)) log.timers.push(name)
      return original.apply(this, args)
    }
  }
  // --- window.open is recorded, never performed --------------------------------------------------
  window.open = (...args) => { log.opens.push(args.map(String)); return null }
  // --- storage writes at this origin are recorded (setItem/removeItem/clear) --------------------
  const storageFaults = { failWrite: false }
  const proto = Storage.prototype
  const setItem = proto.setItem
  const removeItem = proto.removeItem
  const clear = proto.clear
  // The direct caller frame tells a native SDK write (/sdk/) from a product write (/page/client.js).
  // Attribution by script URL on the call stack, not by frame index: the nearest frame from a
  // served script (page client or SDK bundle) owns the write. The harness's own frames are skipped.
  const writer = () => {
    for (const frame of (new Error().stack ?? '').split('\n').slice(1)) {
      if (frame.includes(H.pageScriptMarker)) return 'page'
      if (frame.includes(H.sdkPrefix)) return 'sdk'
    }
    return 'other'
  }
  proto.setItem = function (key, value) {
    log.storageWrites.push({ op: 'set', key: String(key), by: writer() })
    if (storageFaults.failWrite && key === H.storageKey) throw new Error('fbtest: injected storage write failure')
    return setItem.call(this, key, value)
  }
  proto.removeItem = function (key) { log.storageWrites.push({ op: 'remove', key: String(key), by: writer() }); return removeItem.call(this, key) }
  proto.clear = function () { log.storageWrites.push({ op: 'clear', by: writer() }); return clear.call(this) }

  // --- tiny observable store -----------------------------------------------------------------------
  function store(initial) {
    let value = initial
    const listeners = new Set()
    return {
      getSnapshot: () => value,
      subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
      set(next) { value = next; for (const fn of [...listeners]) fn() },
      listeners,
    }
  }

  // --- minimal React (function components, hooks, full re-render per root) ----------------------
  const Fragment = Symbol('Fragment')
  const roots = []
  let currentRoot = null
  function createElement(type, props, ...children) { return { type, props: props ?? {}, children: children.flat(Infinity) } }
  function hook(init) {
    const root = currentRoot
    const index = root.hookIndex++
    if (!(index in root.hooks)) root.hooks[index] = init()
    return root.hooks[index]
  }
  const depsChanged = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]))
  const React = {
    Fragment,
    createElement,
    useState(initial) {
      const root = currentRoot
      const cell = hook(() => ({ value: typeof initial === 'function' ? initial() : initial }))
      return [cell.value, (next) => { cell.value = typeof next === 'function' ? next(cell.value) : next; schedule(root) }]
    },
    useReducer(reducer, initial) {
      const root = currentRoot
      const cell = hook(() => ({ value: initial }))
      return [cell.value, (action) => { cell.value = reducer(cell.value, action); schedule(root) }]
    },
    useRef: (initial) => hook(() => ({ current: initial })),
    useMemo(fn, deps) { const cell = hook(() => ({})); if (depsChanged(cell.deps, deps)) { cell.value = fn(); cell.deps = deps } return cell.value },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps) },
    useSyncExternalStore(subscribe, getSnapshot) {
      const root = currentRoot
      const cell = hook(() => ({}))
      if (cell.subscribe !== subscribe) { cell.unsubscribe?.(); cell.subscribe = subscribe; cell.unsubscribe = subscribe(() => schedule(root)); root.cleanups.add(() => cell.unsubscribe?.()) }
      return getSnapshot()
    },
    useEffect(fn, deps) { const cell = hook(() => ({})); if (depsChanged(cell.deps, deps)) { cell.deps = deps; currentRoot.effects.push(cell); cell.fn = fn } },
    useLayoutEffect(fn, deps) { React.useEffect(fn, deps) },
    useId: () => hook(() => ({ id: 'fb' + Math.random().toString(36).slice(2) })).id,
  }
  React.default = React
  /**
   * Harness plumbing, not an oracle: the page takes DSH's design-system `Button` from the client
   * primitives. The stand-in renders the one native `<button type="button">` the real one renders
   * (variant/size are styling only), so cases that find a button by tag and text stay valid.
   * The real styled Button was observed in the V2 child-web boot (child-boot-nav, deleted with it).
   */
  function PrimitiveButton({ variant: _variant, size: _size, children, ...props }) {
    return createElement(H.buttonType, { type: H.buttonType, ...props }, children)
  }
  // UI-POLISH-F: the page also takes DSH's Tooltip, StateDot and icons. The stand-ins render what the
  // real ones render where a case looks: Tooltip its one child (the bubble is hover-only), StateDot an
  // aria-hidden dot, an icon one aria-hidden <svg>.
  const PrimitiveTooltip = ({ children }) => (Array.isArray(children) ? children[0] : children) ?? null
  const PrimitiveStateDot = ({ state }) => createElement('span', { 'data-state': state, 'aria-hidden': 'true' })
  const PrimitiveIcon = () => createElement('svg', { 'aria-hidden': 'true' })
  const pagePrimitives = new Proxy({ Button: PrimitiveButton, Tooltip: PrimitiveTooltip, StateDot: PrimitiveStateDot, FISH_LOGO_PATH: 'M0 0h18v18H0z', FISH_LOGO_VIEWBOX: { width: 18, height: 18 }, modalSelector: '[role="dialog"][aria-modal="true"]' }, {
    get: (target, key) => (key in target ? target[key] : typeof key === 'string' && /^(Icon|FishLogo)/.test(key) ? PrimitiveIcon : undefined),
  })
  /**
   * UI-POLISH-F (SPEC §1): the nav buttons are icon-only, their name is the aria-label. A button's
   * name is its aria-label when it has one, else its text (the accessible-name rule for buttons).
   */
  const nameOf = (node) => node.getAttribute('aria-label') ?? node.textContent
  const ReactDOM = { createPortal: (node, container) => ({ portal: true, node, container }) }
  function setProps(element, props, root) {
    for (const [name, value] of Object.entries(props)) {
      if (name === 'children' || name === 'key' || name === 'ref' || value === undefined || value === null || value === false) continue
      if (name === 'className') element.className = value
      else if (name === 'style' && typeof value === 'object') Object.assign(element.style, value)
      else if (/^on[A-Z]/.test(name) && typeof value === 'function') element.addEventListener(name.slice(2).toLowerCase(), value)
      else if (name === 'htmlFor') element.setAttribute('for', value)
      else element.setAttribute(name, value === true ? '' : String(value))
    }
    if (typeof props.ref === 'object' && props.ref) props.ref.current = element
    // Callback refs (React calls them with the node after mount and with null when it goes).
    // Collected here and called once the whole tree is attached (see commitRefs).
    else if (typeof props.ref === 'function') root.nextRefs.push([props.ref, element])
  }
  /**
   * Every render rebuilds the DOM, so each callback ref is told its old node is gone (null) and
   * then given the new one, as React does when a ref's node is replaced. A ref that stores the node
   * for another root (a portal seat) therefore never keeps a detached element.
   */
  function commitRefs(root, next) {
    const previous = root.refs ?? []
    root.refs = next
    for (const [ref] of previous) ref(null)
    for (const [ref, element] of next) ref(element)
  }
  function build(node, parent, root) {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (Array.isArray(node)) { for (const child of node) build(child, parent, root); return }
    if (typeof node === 'string' || typeof node === 'number') { parent.appendChild(document.createTextNode(String(node))); return }
    if (node.portal) { const holder = document.createElement('div'); holder.dataset.fbtestPortal = root.container.dataset.fbtestSlot ?? ''; node.container.appendChild(holder); root.portals.push(holder); build(node.node, holder, root); return }
    if (node.type === Fragment) { build(node.children, parent, root); return }
    if (typeof node.type === 'function') { build(node.type({ ...node.props, children: node.children.length <= 1 ? node.children[0] : node.children }), parent, root); return }
    const element = document.createElement(node.type)
    setProps(element, node.props, root)
    build(node.children.length ? node.children : node.props.children, element, root)
    parent.appendChild(element)
  }
  function renderRoot(root) {
    if (root.unmounted) return
    root.pending = false
    for (const portal of root.portals.splice(0)) portal.remove()
    root.container.replaceChildren()
    currentRoot = root
    root.hookIndex = 0
    root.effects = []
    root.nextRefs = []
    let tree
    try {
      try { tree = root.Component(root.props()) } catch (error) { log.errors.push('render: ' + (error?.stack ?? error)) }
      // Nested components need the hook dispatcher too, but build failures must still escape.
      build(tree, root.container, root)
    } finally { currentRoot = null }
    commitRefs(root, root.nextRefs)
    for (const cell of root.effects) { cell.cleanup?.(); const out = cell.fn(); cell.cleanup = typeof out === 'function' ? out : undefined }
  }
  function schedule(root) { if (root.pending || root.unmounted) return; root.pending = true; queueMicrotask(() => renderRoot(root)) }
  function mount(container, Component, props) {
    const root = { container, Component, props, hooks: [], cleanups: new Set(), portals: [], effects: [] }
    roots.push(root)
    renderRoot(root)
    return () => {
      root.unmounted = true
      for (const cell of root.hooks) cell?.cleanup?.()
      for (const cleanup of root.cleanups) cleanup()
      for (const portal of root.portals.splice(0)) portal.remove()
      container.replaceChildren()
      commitRefs(root, [])
    }
  }

  // --- module loader -------------------------------------------------------------------------------
  // Both the SDK bundle and the page client register through window.__ModuleLoader__.load; each
  // script is loaded alone, so the registration seen while it runs is that script's module.
  let nextModule = null
  window.__ModuleLoader__ = { load(entry) { const take = nextModule; nextModule = null; take?.(entry) } }
  function loadModule(src) {
    return new Promise((resolve, reject) => {
      nextModule = resolve
      const script = document.createElement('script')
      script.src = src
      script.onload = () => { if (nextModule === resolve) reject(new Error('no module registered by ' + src)) }
      script.onerror = () => reject(new Error('script failed ' + src))
      document.head.appendChild(script)
    })
  }

  // --- SDK service dependencies (cordis Service base, client store, ui primitives) ---------------
  class Service { constructor(ctx, name) { this.ctx = ctx; this.name = name } }
  function createSnapshotStore(initial) { return store(initial) }
  const sdkRequire = (name) => {
    if (name === '@deepseek-ai/cordis') return { Service }
    if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { modalSelector: '[role="dialog"][aria-modal="true"]', observeComposition: () => ({ guards: (event) => event.isComposing, dispose() {} }) }
    throw new Error('unexpected SDK require ' + name)
  }

  // --- native-like child document ------------------------------------------------------------------
  const handler = (name) => () => log.handlers.push(name)
  function nativeDocument(labels, options = {}) {
    document.body.innerHTML = ''
    const frame = document.createElement('div')
    frame.className = 'pI_x6G_frame'
    frame.style.display = 'grid'
    frame.style.gridTemplateColumns = '56px minmax(0px, 1fr) minmax(0px, 0px)'
    frame.style.height = '600px'
    frame.innerHTML = `
      <div class="pI_x6G_sidebarCol" data-slot="sidebar">
        <button id="fb-sidebar-new" aria-label="${labels.sessionNew}">${labels.sessionNew}</button>
        <button id="fb-sidebar-search">search</button>
        <div role="tree"><div id="fb-sidebar-row" role="treeitem" tabindex="0">session-other-case</div></div>
        <div class="bhn1Oq_headerActions" id="fb-sidebar-actions" style="opacity:1;visibility:visible;display:flex"><button id="fb-add-workspace" aria-label="Add workspace">+</button></div>
        <div id="fb-settings-row"></div>
      </div>
      <div class="pI_x6G_centerCol">
        <div class="pI_x6G_leadingSeat" data-shell-leading><button id="fb-shell-toggle">toggle</button></div>
        <div data-slot="main.conversation" id="fb-conversation">
          <header>
            <div data-conversation-header-leading><button id="fb-header-leading">leading</button></div>
            <nav aria-label="${labels.hierarchy}" id="fb-nav"><span class="crumbSeg" id="fb-crumb-seg" tabindex="0"><button id="fb-crumb">parent session</button></span><span class="crumbSeg" id="fb-crumb-current" tabindex="0"><span>/</span><span>Fishball</span></span></nav>
            <div data-slot="conversation.session.header.lineage"><button id="fb-lineage">lineage</button><div role="treeitem" tabindex="0" id="fb-lineage-tree">child</div></div>
            <div data-slot="conversation.session.header.actions"><button id="fb-header-action">harmless header action</button><button id="fb-new-elsewhere" aria-label="${labels.sessionNew}">+</button></div>
          </header>
          <div class="wSkVaW_heroWorkspaceRow" id="fb-hero-row" style="display:flex">
            <button type="button" class="pXSMma_workspace" id="fb-hero-workspace" aria-label="${labels.chooseWorkspace}" aria-haspopup="menu" aria-expanded="false"><span>${labels.chooseWorkspace}</span></button>
            <div data-slot="conversation.hero.workspace" id="fb-hero-slot"></div>
          </div>
          ${options.heroEmpty ? `<div class="uV2eYG_card uV2eYG_cardWorkspaceTrigger" id="fb-inert-card"><div class="uV2eYG_input" id="fb-inert-composer" tabindex="0" aria-label="${labels.chooseWorkspace}" aria-haspopup="menu" aria-expanded="false" style="min-height:24px"></div></div>` : ''}
          <div id="fb-transcript">
            <p id="fb-transcript-text">harmless transcript text</p>
            <a id="fb-ref-link" href="/session/session-other-case">session-other-case</a>
            <a id="fb-ext-link" href="https://example.invalid/out">external</a>
            <a id="fb-hash-link" href="#fb-transcript">same document</a>
            <a id="fb-blank-link" href="https://example.invalid/blank" target="_blank">blank</a>
            <a id="fb-top-link" href="https://example.invalid/top" target="_top">top</a>
            <a id="fb-parent-link" href="https://example.invalid/parent" target="_parent">parent</a>
            <a id="fb-named-link" href="https://example.invalid/named" target="fbtest-not-a-frame">named</a>
            <a id="fb-self-link" href="https://example.invalid/self" target="_self">self</a>
            <svg id="fb-svg" width="120" height="16" style="display:block"><a id="fb-svg-link" href="https://example.invalid/svg"><rect width="120" height="16" fill="#ccc"></rect></a></svg>
            <button id="fb-branch" aria-label="${labels.branch}">branch</button>
          </div>
          <div data-slot="conversation.composer.dock"><button id="fb-dock">harmless dock</button></div>
          <textarea id="fb-composer" data-slot="conversation.input"></textarea>
        </div>
      </div>
      <div class="pI_x6G_drawerMask" data-sidebar-drawer-mask id="fb-mask" tabindex="0" style="position:absolute;top:0;left:0;width:24px;height:24px"></div>
      <div class="pI_x6G_overlayLayer" id="fb-overlay"></div>`
    document.body.appendChild(frame)
    const wire = (id, name) => document.getElementById(id).addEventListener('click', handler(name))
    wire('fb-sidebar-new', 'sidebar-new'); wire('fb-sidebar-search', 'sidebar-search'); wire('fb-shell-toggle', 'shell-toggle')
    wire('fb-header-leading', 'header-leading'); wire('fb-crumb', 'crumb-open'); wire('fb-lineage', 'lineage-open'); wire('fb-hero-workspace', 'hero-workspace')
    wire('fb-branch', 'branch'); wire('fb-mask', 'mask'); wire('fb-new-elsewhere', 'new-elsewhere'); wire('fb-add-workspace', 'add-workspace')
    // rc.1 crumb segments open the session menu (Fork/Archive/Rename/Pin) on context-menu input.
    for (const id of ['fb-crumb-seg', 'fb-crumb-current']) {
      const segment = document.getElementById(id)
      segment.addEventListener('contextmenu', () => log.handlers.push(id + '-menu'))
      segment.addEventListener('keydown', (event) => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) log.handlers.push(id + '-menu-key') })
    }
    // Native chip: toggles the slot's picker. Native inert composer trigger (no workspace title on
    // the empty hero): card click and Enter/Space on the editable request the picker.
    document.getElementById('fb-hero-workspace').addEventListener('click', () => { hero.open = !hero.open; hero.render() })
    if (options.heroEmpty) {
      const requestPicker = (name) => { log.handlers.push(name); hero.open = true; hero.render() }
      document.getElementById('fb-inert-card').addEventListener('click', () => requestPicker('inert-trigger-click'))
      document.getElementById('fb-inert-composer').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); requestPicker('inert-trigger-key') } })
    }
    document.getElementById('fb-add-workspace').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') log.handlers.push('add-workspace-key') })
    wire('fb-dock', 'dock'); wire('fb-header-action', 'header-action'); wire('fb-sidebar-row', 'row-open')
    for (const id of ['fb-sidebar-row', 'fb-lineage-tree']) document.getElementById(id).addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') log.handlers.push(id + '-key') })
    const composer = document.getElementById('fb-composer')
    composer.addEventListener('keydown', (event) => log.keys.push({ where: 'composer', key: event.key, code: event.code, shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey, prevented: event.defaultPrevented }))
    window.addEventListener('keydown', (event) => log.keys.push({ where: 'window-bubble', key: event.key, code: event.code, prevented: event.defaultPrevented }))
    // Pre-protection geometry: a later real click at these points proves pointer unreachability.
    api.rects = {}
    for (const element of frame.querySelectorAll('[id^="fb-"]')) { const rect = element.getBoundingClientRect(); api.rects[element.id] = { x: rect.x + Math.min(rect.width / 2, 8), y: rect.y + Math.min(rect.height / 2, 8), w: rect.width, h: rect.height } }
    return frame
  }

  // --- conversation.hero.workspace: native single-slot semantics ----------------------------------
  // dsh-client-ui-slots (both SDKs): entries sort by priority and the LOWEST renders; a second
  // registration at an equal priority throws. ui-workspace registers WorkspacePicker at the default
  // priority 0. The first render happens after every plugin applied, as in the booted shell.
  const hero = {
    open: false,
    entries: [],
    started: false,
    unmount: null,
    holder: () => document.getElementById('fb-hero-slot'),
    add(options, Component, registrant) {
      const priority = options.priority ?? 0
      const same = hero.entries.find((entry) => entry.priority === priority)
      if (same) throw new Error(`single slot "conversation.hero.workspace" already has a registration at priority ${priority} (registered by ${same.registrant})`)
      const entry = { priority, Component, registrant }
      hero.entries.push(entry)
      hero.entries.sort((a, b) => a.priority - b.priority)
      hero.render()
      return () => { const at = hero.entries.indexOf(entry); if (at >= 0) { hero.entries.splice(at, 1); hero.render() } }
    },
    render() {
      if (!hero.started) return
      hero.unmount?.()
      hero.unmount = null
      const active = hero.entries[0]
      document.getElementById('fb-hero-workspace')?.setAttribute('aria-expanded', String(hero.open))
      if (active) hero.unmount = mount(hero.holder(), active.Component, () => ({
        open: hero.open,
        anchorRef: { current: document.getElementById('fb-hero-workspace') },
        selectedId: undefined,
        // Native onPick: close, then selectWorkspace connects/creates that workspace's blank session and opens it.
        onPick: (workspaceId) => { hero.open = false; log.handlers.push('hero-pick:' + workspaceId); hero.render() },
        onClose: () => { hero.open = false; hero.render() },
      }))
    },
  }
  /** Native-like WorkspacePicker: its menu is portalled to document.body while open. */
  function NativeWorkspacePicker({ open, onPick }) {
    log.handlers.push('native-picker-render')
    if (!open) return null
    log.handlers.push('native-picker-open')
    return ReactDOM.createPortal(createElement('div', { role: 'menu', id: 'fb-native-picker-menu', style: { position: 'fixed', top: '300px', left: '300px', zIndex: 1000, background: '#fff' } },
      createElement('button', { role: 'menuitem', id: 'fb-native-pick', onClick: () => onPick('workspace-other-case') }, 'Other workspace')), document.body)
  }

  function recorder(name, target) {
    return new Proxy(target, {
      get(object, key) {
        const value = object[key]
        if (typeof value !== 'function' || typeof key === 'symbol') return value
        return (...args) => { const call = { service: name, method: String(key), args: JSON.parse(JSON.stringify(args ?? null) ?? 'null') }; log.calls.push(call); log.timeline.push({ kind: 'call', service: name, method: String(key), args: call.args }); return value.apply(object, args) }
      },
    })
  }

  // --- start one scenario ------------------------------------------------------------------------
  let disposers = []
  const api = {
    log,
    storageFaults,
    async start(options, prepareShell) {
      const o = { locale: 'en', commands: [], fixed: [], session: { sessionId: 'session-fishball-case' }, holdSession: false, faults: {}, ...options }
      const labels = { sessionNew: o.dicts.sidebar[o.locale]['session.new.label'], branch: o.dicts.chat[o.locale]['message.branch'], hierarchy: o.dicts.conversation[o.locale]['session.hierarchy'], chooseWorkspace: o.dicts.conversation[o.locale]['hero.chooseWorkspace'] }
      hero.open = false
      hero.entries.length = 0
      hero.started = false
      // Frame-layout cases supply their SDK-shaped sidebar fixture instead of LITE's session tree.
      if (api.mountHost) api.mountHost()
      else nativeDocument(labels, { heroEmpty: o.heroEmpty })
      hero.add({ name: 'conversation.hero.workspace' }, NativeWorkspacePicker, 'native:ui-workspace')
      // Cases share one browser profile: each starts from an empty child store unless it models a
      // second view of the same store (keepStorage).
      if (!o.keepStorage) localStorage.clear()
      if (typeof o.storage === 'string') localStorage.setItem(H.storageKey, o.storage)
      log.storageWrites.length = 0
      // Real native shortcut service of the selected SDK.
      const entry = await loadModule(H.sdkPrefix + encodeURIComponent(sdk))
      const ShortcutsService = entry.factory(sdkRequire)
      const localeStore = store({ active: o.locale, locales: [{ id: 'en', label: 'English' }, { id: 'zh', label: '中文' }], revision: 0 })
      const serviceEffects = []
      const service = new ShortcutsService({ effect(fn) { serviceEffects.push(fn()) }, locale: { subscribe: localeStore.subscribe } })
      disposers.push(() => { for (const dispose of serviceEffects) dispose?.() })
      api.service = service
      const registered = new Map()
      api.register = (id, defaults) => {
        const off = service.register({ id, label: () => id, aliases: [], defaults, regions: ['page', 'editable'], modals: [], resolve: () => ({ status: 'handled', run: () => log.handlers.push('command:' + id) }) })
        registered.set(id, off)
        return off
      }
      api.unregister = (id) => { registered.get(id)?.(); registered.delete(id) }
      for (const command of o.commands) api.register(command.id, command.defaults)
      for (const fixed of o.fixed) service.registerFixed({ id: fixed.id, label: () => fixed.id, keys: [], bindings: [fixed.binding], group: 'application' })
      // Wait for the real adapter's first accepted read before the page starts (native readiness).
      if (!o.faults.holdConfig) await new Promise((resolve) => { if (service.config.getSnapshot().status !== 'loading') return resolve(); const off = service.config.subscribe(() => { if (service.config.getSnapshot().status !== 'loading') { off(); resolve() } }) })
      for (const pre of o.preEdits ?? []) {
        const result = await service.edit({ type: 'set', id: pre.id, binding: pre.binding }, service.config.getSnapshot().revision)
        if (result.status !== 'saved') throw new Error('fixture pre-edit failed: ' + result.status)
      }
      if (o.extraStorage) for (const [key, value] of Object.entries(o.extraStorage)) localStorage.setItem(key, value)
      log.storageWrites.length = 0
      storageFaults.failWrite = Boolean(o.failWrite)
      service.observeFixedInput((input) => { if (input.type === 'keydown') log.fixedInputs.push(input.gesture.code) })
      api.before = service.catalog.getSnapshot().map((row) => ({ id: row.id, binding: row.binding }))
      api.beforeRevision = service.config.getSnapshot().revision
      api.facade = facade(service, o.faults)
      // Native-like session/workspace/layout services.
      const current = store({ key: null })
      // The host catalogue: the manager the route names and one ordinary session. Native
      // ctx.sessions.list (dsh-api-session-controller SessionListState, both SDKs) carries every
      // catalogued Session whether or not a view shows it, so both are listed from the start; only
      // the local retain counts follow the selection, and a source with no reference has no key.
      const catalog = (mainId) => {
        const ids = [o.session.sessionId, 'session-other-case'].filter(Boolean)
        const byId = {}
        for (const known of ids) byId[known] = { id: known, displayTitle: known, running: false, blank: false, updatedAt: 0, retainedBy: known === mainId ? { mainView: 1 } : {} }
        return { ids, byId, phase: 'ready', projectionsBySession: {} }
      }
      const list = store(catalog(null))
      const panel = store({ activePanelId: null })
      const show = (id) => {
        list.set(catalog(id))
        current.set({ key: id })
      }
      // Drift arrives without a user action (bypass-UI): the timeline marks it so a later
      // navigation can be told apart from a user-requested return.
      // restoredSession: DSH itself already shows this session when the page starts (a reload).
      if (o.restoredSession) show(o.restoredSession)
      api.drift = (id) => { log.timeline.push({ kind: 'drift', session: id }); show(id) }
      api.showPanel = (id) => { log.timeline.push({ kind: 'drift', panel: id }); panel.set({ activePanelId: id }) }
      api.panel = () => panel.getSnapshot().activePanelId
      // Background refreshes that succeed: a sessions-list notification and a window focus.
      api.notifyList = () => list.set({ ...list.getSnapshot() })
      api.focusWindow = () => window.dispatchEvent(new Event('focus'))
      // A preference change made by someone else through the real native service (not the page).
      api.externalEdit = async (id, binding) => (await service.edit({ type: 'set', id, binding }, service.config.getSnapshot().revision)).status
      let openFailures = o.openFails ?? 0
      // holdOpen: openSession stays pending until the case settles it (rejectHeldOpen), so a
      // rejection can arrive after the main view already shows the session.
      api.heldOpens = []
      api.rejectHeldOpen = () => { const held = api.heldOpens.shift(); held?.reject(new Error('fbtest: injected late openSession rejection')); return Boolean(held) }
      const uiWorkspace = recorder('uiWorkspace', {
        async openSession(id) {
          if (o.holdOpen) return new Promise((resolve, reject) => { api.heldOpens.push({ id, resolve, reject }) })
          if (openFailures > 0) { openFailures--; throw new Error('fbtest: injected openSession rejection') }
          show(id)
        },
        async archiveSession() {}, async startSession() {}, async forkSession() {},
      })
      const layout = recorder('layout', { panelInfo: panel, selectPanel: (id) => panel.set({ activePanelId: id }), toggleSidebar: () => api.toggleHost?.() })
      // Session route answered by the harness (the child origin's own route).
      let releaseSession
      const sessionGate = new Promise((resolve) => { releaseSession = resolve })
      if (!o.holdSession) releaseSession()
      api.releaseSession = () => releaseSession()
      const realFetch = window.fetch.bind(window)
      window.fetch = async (input, init = {}) => {
        const url = new URL(String(input), document.baseURI)
        if (url.pathname === H.sessionRoute) {
          log.calls.push({ service: 'fetch', method: String(init.method ?? 'GET').toUpperCase(), args: [url.pathname] })
          await sessionGate
          return new Response(JSON.stringify(o.session), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        return realFetch(input, init)
      }
      const dictFor = (ns) => o.dicts[ns] ?? { en: {}, zh: {} }
      const locale = recorder('locale', {
        bind: (ns) => (key) => dictFor(ns)[localeStore.getSnapshot().active]?.[key] ?? dictFor(ns).en?.[key] ?? key,
        subscribe: localeStore.subscribe,
        getSnapshot: localeStore.getSnapshot,
        getLocale: () => localeStore.getSnapshot(),
        setLocale(id) { log.setLocale.push(id); const snap = localeStore.getSnapshot(); localeStore.set({ ...snap, active: id, revision: snap.revision + 1 }) },
        register: () => () => {},
      })
      const slotMounts = []
      const slots = recorder('slots', {
        register(options, Component) {
          slotMounts.push(options.name)
          // Control only (never used by a case's oracle): drop the page's own occupant of a slot to
          // prove the native picker would render and open without it.
          if ((o.skipPageSlots ?? []).includes(options.name)) return () => {}
          if (options.name === 'conversation.hero.workspace') return hero.add(options, Component, 'page')
          const container = api.seatFor?.(options.name) ?? (options.name === 'settings.launcher' ? document.getElementById('fb-settings-row') : document.getElementById('fb-overlay'))
          const holder = document.createElement('div')
          holder.dataset.fbtestSlot = options.name
          if (api.seatFor) holder.style.display = 'contents' // test render root, not a host layout box
          container.appendChild(holder)
          const props = () => options.name === 'settings.launcher' ? { wide: false, settingsOpen: false, openSettings: () => { log.openSettings++ }, openOnboarding() {} } : {}
          const unmount = mount(holder, Component, props)
          return () => { unmount(); holder.remove() }
        },
        inject(_name, fn) { const out = fn(); return () => { if (typeof out === 'function') out() } },
        entries: () => [],
        subscribe: () => () => {},
      })
      api.slotMounts = slotMounts
      const pageEffects = []
      const ctx = {
        effect(fn) { const out = fn(); pageEffects.push(out); return out },
        slots, layout, uiWorkspace, locale,
        uiSession: { adapter: { current } },
        sessions: recorder('sessions', { list, async archive() {}, async fork() {}, async create() {} }),
        shortcuts: api.facade.shortcuts,
      }
      const platform = (name) => {
        if (name === 'react') return React
        if (name === 'react-dom') return ReactDOM
        if (name === H.primitivesModule) return pagePrimitives
        throw new Error('unexpected page require ' + name)
      }
      // Optional scenario-specific native outlets and an independently lifecycled client.
      prepareShell?.({ ctx, platform, mount, loadModule })
      const page = (await loadModule(H.pageScript)).factory(platform)
      api.plugin = { name: page.name, inject: page.inject }
      page.apply(ctx)
      hero.started = true
      hero.render()
      api.heroActive = () => hero.entries[0]?.registrant ?? null
      api.disposePage = () => { for (const out of pageEffects.splice(0).reverse()) { if (typeof out === 'function') out(); else out?.dispose?.() } }
      disposers.push(api.disposePage)
      return true
    },
    /** Snapshot of the page-visible state the cases assert on. */
    state() {
      const statuses = [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent)
      // UI-POLISH-F: buttons by accessible name (icon-only nav buttons have no text).
      const buttons = [...document.querySelectorAll('[data-fbtest-slot] button, [data-fbtest-portal] button')].map(nameOf)
      return {
        protectedMarker: document.documentElement.hasAttribute('data-fishball-session'),
        statuses, buttons,
        catalog: api.service.catalog.getSnapshot().map((row) => ({ id: row.id, binding: row.binding, modified: row.modified, conflicts: row.conflicts, issue: row.issue })),
        config: { status: api.service.config.getSnapshot().status, revision: api.service.config.getSnapshot().revision },
        raw: localStorage.getItem(H.storageKey),
        listeners: api.facade.listenerCount(),
        current: location.href,
      }
    },
    clickSlotButton(text) {
      // UI-POLISH-F: found by accessible name (icon-only nav buttons have no text).
      const button = [...document.querySelectorAll('[data-fbtest-slot] button, [data-fbtest-portal] button')].find((node) => nameOf(node) === text)
      if (!button) return false
      log.timeline.push({ kind: 'user', button: text })
      button.click()
      return true
    },
    /** Visibility, focusability and hit-testing of one element. */
    reach(id) {
      const element = document.getElementById(id)
      const rect = element.getBoundingClientRect()
      element.focus()
      const focused = document.activeElement === element
      element.blur()
      const hit = rect.width > 0 && rect.height > 0 ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null
      return { visible: element.checkVisibility({ visibilityProperty: true, opacityProperty: false }), focused, hit: hit !== null && (hit === element || element.contains(hit)), rect: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height } }
    },
    /** Texts of role=status nodes a user can actually see, and whether a visible Retry exists. */
    honest() {
      const shown = (node) => node.checkVisibility({ visibilityProperty: true }) && node.getBoundingClientRect().width > 0
      return {
        statuses: [...document.querySelectorAll('[role="status"]')].filter(shown).map((node) => node.textContent.trim()).filter(Boolean),
        // UI-POLISH-F: Retry is icon-only; its name is its aria-label.
        retry: [...document.querySelectorAll('button')].some((node) => nameOf(node) === 'Retry' && shown(node)),
      }
    },
    /** Status nodes and buttons inside the page's own bottom-left navigation. */
    navStatus() {
      const nav = document.querySelector(H.pageNav)
      if (!nav) return null
      return {
        statuses: [...nav.querySelectorAll(H.statusRole)].map((node) => node.textContent.trim()),
        // UI-POLISH-F: by accessible name (icon-only).
        buttons: [...nav.querySelectorAll('button')].map((node) => nameOf(node).trim()),
        text: nav.textContent,
      }
    },
    /** Ids under a root that the browser would let a user reach (visible box that hit-tests to it). */
    reachableUnder(selector) {
      const out = []
      for (const element of document.querySelectorAll(selector + ', ' + selector + ' *')) {
        if (!element.id) continue
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0 || !element.checkVisibility({ visibilityProperty: true })) continue
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        if (hit && (hit === element || element.contains(hit))) out.push(element.id)
      }
      return out
    },
    gridTracks: () => getComputedStyle(document.querySelector('.pI_x6G_frame')).gridTemplateColumns,
    stop() { for (const dispose of disposers.splice(0).reverse()) dispose() },
  }

  /** Public ctx.shortcuts facade over the real service, with optional injected faults. */
  function facade(service, faults) {
    const own = new Set()
    let held = Boolean(faults.holdConfig)
    let inFlight = 0
    const plan = { results: [...(faults.results ?? [])], holdEdits: Boolean(faults.holdEdits) }
    const releases = []
    const notify = () => { for (const fn of [...own]) fn() }
    const counted = (subscribe) => (fn) => {
      own.add(fn)
      const off = subscribe(fn)
      return () => { own.delete(fn); off() }
    }
    const config = {
      getSnapshot: () => held ? { ...service.config.getSnapshot(), status: 'loading' } : service.config.getSnapshot(),
      subscribe: counted((fn) => service.config.subscribe(fn)),
    }
    const catalog = { getSnapshot: () => service.catalog.getSnapshot(), subscribe: counted((fn) => service.catalog.subscribe(fn)) }
    async function edit(operation, revision) {
      const call = { operation: JSON.parse(JSON.stringify(operation)), revision, liveRevision: service.config.getSnapshot().revision, at: log.edits.length }
      log.edits.push(call)
      log.timeline.push({ kind: 'edit', id: operation.id, type: operation.type, protectedMarker: document.documentElement.hasAttribute('data-fishball-session') })
      inFlight++
      log.maxInFlight = Math.max(log.maxInFlight, inFlight)
      try {
        if (plan.holdEdits) await new Promise((resolve) => releases.push(resolve))
        const injected = plan.results.shift()
        let result
        if (injected === 'throw') throw new Error('fbtest: injected catalog publication failure')
        else if (injected === 'stale-by-concurrent-edit') {
          // A concurrent writer (same origin, same native service) changes an unrelated command first.
          const same = faults.concurrentId === undefined
          await service.edit({ type: 'set', id: same ? operation.id : faults.concurrentId, binding: same ? operation.binding : faults.concurrentBinding }, service.config.getSnapshot().revision)
          result = await service.edit(operation, revision)
        } else if (injected) result = { status: injected, snapshot: service.config.getSnapshot() }
        else result = await service.edit(operation, revision)
        log.editResults.push(result.status)
        log.timeline.push({ kind: 'result', id: operation.id, status: result.status })
        return result
      } catch (error) {
        log.editResults.push('threw')
        throw error
      } finally { inFlight-- }
    }
    return {
      shortcuts: { runtime: service.runtime, platform: service.platform, stopSequenceMs: service.stopSequenceMs, catalog, config, fixedCatalog: service.fixedCatalog, describeBinding: (binding) => service.describeBinding(binding), edit, register: (command) => { log.registerCalls.push(command.id); return service.register(command) }, registerFixed: (command) => service.registerFixed(command), observeFixedInput: (listener) => service.observeFixedInput(listener), recording: (active) => service.recording(active), closeWindow: () => service.closeWindow() },
      release() { held = false; notify() },
      notify,
      releaseEdit() { releases.shift()?.() },
      hold() { plan.holdEdits = true },
      inject(results) { plan.results.push(...results) },
      pendingEdits: () => releases.length,
      stopHolding() { plan.holdEdits = false; for (const release of releases.splice(0)) release() },
      listenerCount: () => own.size,
    }
  }
  window.__lite = api
})()
