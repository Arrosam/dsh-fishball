/**
 * LOGO-BUTTON vocabulary: Fishball's brand in DSH's sidebar brand row and rail (the take-2
 * requirement, relayed 2026-11-19). Every expected word, hook and value is from the requirement
 * itself; none is read from `packages/fishball-ui/client.brand.js` or from core's implementation.
 *
 * The stable hooks are the requirement's list:
 * - `data-fishball-logo-mark` / `-name` / `-badge` / `-status` on the occupants and the badge/status;
 * - `data-fishball-logo-state` and `data-fishball-logo-theme` on the mark;
 * - `data-fishball-brand-style` on the settings control (fishball-core.settings rows).
 */
export const SLOT = Object.freeze({ mark: 'sidebar.brand.mark', name: 'sidebar.brand.name' })

/** The V1 mechanism: a priority below the shell's own 0. */
export const PRIORITY = -1

/** DSH's page root mark while the Fishball page is open (fishball-page's public root mark). */
export const PAGE_MARK = 'data-fishball-page'

/** The two Fishball streams the brand reads its state from. */
export const ROUTE = Object.freeze({ strip: 'api/fishball/strip', asks: 'api/fishball/asks/events' })

/** The requirement's stable observation hooks. */
export const HOOK = Object.freeze({
  control: 'data-fishball-logo-control',
  mark: 'data-fishball-logo-mark',
  name: 'data-fishball-logo-name',
  badge: 'data-fishball-logo-badge',
  status: 'data-fishball-logo-status',
  state: 'data-fishball-logo-state',
  theme: 'data-fishball-logo-theme',
  setting: 'data-fishball-brand-style',
})

/** The theme words the strip frame carries (and the settings option values). */
export const THEME = Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' })

/**
 * The four statuses. `state` is the mark's `data-fishball-logo-state`; `text` is the status text node;
 * `dot` is DSH StateDot's own state word (done / ongoing / warning / error — the light's colour).
 */
export const STATUS = Object.freeze({
  connected: Object.freeze({ state: 'idle', text: 'Connected', dot: 'done' }),
  working: Object.freeze({ state: 'working', text: 'Working', dot: 'ongoing' }),
  offline: Object.freeze({ state: 'offline', text: 'Offline', dot: 'error' }),
  attention: Object.freeze({ state: 'attention', text: 'Waiting for you', dot: 'warning' }),
})

/** Badge boundaries: 1..99 is the number, above that "99+", zero shows no badge. */
export const BADGE = Object.freeze({ none: 0, first: 1, last: 99, over: 100, overText: '99+' })

/** ask-card states: only `open` is pending. */
export const CARD_STATE = Object.freeze({ open: 'open', answered: 'answered', closed: 'closed', voided: 'voided' })
export const PENDING_CARD_STATES = Object.freeze([CARD_STATE.open])

/** The brand button's accessible name; the shell's initial/own label is the sidebar's New Session word. */
export const LABEL = Object.freeze({
  brand: 'Fishball',
  newSession: Object.freeze({ en: 'New session', zh: '新建会话' }),
  railOpen: Object.freeze({ en: 'Open sidebar', zh: '打开侧边栏' }),
  toggle: Object.freeze({ en: 'Collapse sidebar', zh: '收起侧边栏' }),
})

/** The shell's own attributes the brand borrows while mounted and must put back. */
export const SHELL = Object.freeze({
  /** The shell's New Session shortcut as the wide brand button carries it before the brand mounts. */
  shortcut: 'Mod+Shift+N',
  /** The shell brand button has no title of its own (null -> removed on teardown). */
  title: null,
})

/** The wordmark and its tag. */
export const WORDMARK = Object.freeze({ text: 'FISHBALL', tag: 'Deepseek Harness' })

/** Fixture data only. */
export const FIXTURE = Object.freeze({
  manager: 'fbtest-fishball-manager',
  otherManager: 'fbtest-other-manager',
  mountKey: 'fbtest-brand-shell',
  ownerSize: 24,
  revision: 7,
  /** The reduced-motion media query the requirement names. */
  reducedMotion: '(prefers-reduced-motion: reduce)',
  /** A colour word the eye may be drawn with; the requirement says magenta. */
  magenta: /^(#ff00ff|#f0f|magenta|rgb\(\s*255\s*,\s*0\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*0\s*,\s*255\s*,\s*1\s*\))$/i,
})

/** DSH's StateDot primitive's stand-in marker (`data-primitive`). */
export const STATE_DOT = 'StateDot'
