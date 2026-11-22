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
import { PAGE_STREAM } from './page-stream.mjs'

/**
 * fishball-ui's client parts, each a package-local chunk the client loads and the factory it exports
 * (F-UI, LOGO-BUTTON: the brand part between the strip and the model dialog). The fault rows deliver
 * every other part inert, so only the brand part owns the resources they count.
 */
export const UI_PARTS = Object.freeze([
  Object.freeze({ file: 'client.entries.js', export: 'entriesPart' }),
  Object.freeze({ file: 'client.asks.js', export: 'asksPart' }),
  Object.freeze({ file: 'client.strip.js', export: 'stripPart' }),
  Object.freeze({ file: 'client.brand.js', export: 'brandPart' }),
  Object.freeze({ file: 'client.model.js', export: 'modelPart' }),
])
export const BRAND_PART = UI_PARTS.find((part) => part.file === 'client.brand.js')

export const SLOT = Object.freeze({ mark: 'sidebar.brand.mark', name: 'sidebar.brand.name' })

/** The V1 mechanism: a priority below the shell's own 0. */
export const PRIORITY = -1

/** DSH's page root mark while the Fishball page is open (fishball-page's public root mark). */
export const PAGE_MARK = 'data-fishball-page'

/**
 * The two Fishball views the brand reads its state from. Since the image-loop fix both arrive on the
 * page's ONE connection (./page-stream.mjs PAGE_STREAM), each under its topic, with the
 * frame its old route sent (strip: /api/fishball/strip?lang&tz; asks: /api/fishball/asks/events).
 */
export const ROUTE = Object.freeze({ page: PAGE_STREAM.relative, path: PAGE_STREAM.path, strip: PAGE_STREAM.topic.strip, asks: PAGE_STREAM.topic.asks })

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
export const BRAND_FIXTURE = Object.freeze({
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

/**
 * GENTLE-TOOLS avatar (the lead's relayed requirement A, 2026-11-21, and its refinement): Fishball's
 * reply rows on its page get an avatar drawn by the row's ::before as a CSS mask. Every value is the
 * requirement's: the row hooks, core's settings namespace and field, the two themes, the Fishball fish
 * (tag v0.1.0 assets/icon.svg: viewBox 0 0 24 24, the body and the eye paths, the eye #EC0A6E), the two
 * DSH tokens and the page's <html data-fishball-page-brand> attribute. `dshPath` / `dshViewBox` are fixture
 * values handed to the page as the primitives' FISH_LOGO_PATH / FISH_LOGO_VIEWBOX, so the DeepSeek mask
 * is observably the export's.
 *
 * Review fix (the user, 2026-11-21): the <html> theme attribute was renamed from data-fishball-brand to
 * data-fishball-page-brand, because core's settings section uses data-fishball-brand as its own hook
 * (`settingsHook`); the page must leave that hook, and any element carrying it, alone.
 */
export const AVATAR = Object.freeze({
  namespace: 'fishball-core',
  field: 'brandStyle',
  /** Marks "no brandStyle field in the section" (not a stored value). */
  absent: Symbol('absent brandStyle'),
  brandAttr: 'data-fishball-page-brand',
  /** Core's settings section's own hook (the old <html> name): never on <html>, never touched by the page. */
  settingsHook: 'data-fishball-brand',
  /** A settings-section-like element in the same document (fixture tag and hook value). */
  settingsSection: Object.freeze({ tag: 'section', value: 'fbtest-settings-section' }),
  pageAttr: PAGE_MARK,
  /**
   * MSG-USER re-baseline (the lead, 2026-11-21): the avatar, the "Fishball" label and the bubble are on
   * Fishball's message row, `[data-chat-flow-kind="fishball-message"]` (row > conversation.chat.node >
   * div[data-fishball-message], the bubble > the Markdown block); an expanded assistant reply
   * (`assistant-step` / `response`) keeps DSH's plain look.
   */
  row: Object.freeze({
    conversation: 'main.conversation', node: 'conversation.chat.node',
    kind: 'fishball-message', bubble: 'data-fishball-message',
    reply: 'assistant-step', part: 'response', otherPart: 'reasoning',
  }),
  fish: Object.freeze({
    viewBox: '0 0 24 24',
    body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
    eye: 'M14.6 7.4 h2 v2 h-2 Z',
    eyeFill: /fills*=s*["']#EC0A6E["']/i,
  }),
  dshPath: 'M1.5 2.5 L16.5 2.5 L16.5 15.5 L1.5 15.5 Z',
  dshViewBox: Object.freeze({ width: 18, height: 18 }),
  /** The two DSH tokens, each given a distinct colour in the laid-out document. */
  labelToken: '--dsw-alias-label-primary',
  businessToken: '--dsw-alias-state-business-primary',
  tokens: Object.freeze([['--dsw-alias-label-primary', 'rgb(11, 22, 33)'], ['--dsw-alias-state-business-primary', 'rgb(44, 55, 66)']]),
  /** The reply's name label (::after), which stays. */
  name: 'Fishball',
  /** Stored values that read as the Fishball theme besides 'fishball' (EP: other case, unknown, empty, non-string). */
  readAsFishball: Object.freeze([['DeepSeek (other case)', 'DeepSeek'], ['unknown', 'orca'], ['empty', ''], ['null', null], ['number', 7], ['boolean', true], ['object', Object.freeze({ style: 'deepseek' })]]),
  form: Object.freeze({ ready: 'ready', revision: 3 }),
})

/** DSH's StateDot primitive's stand-in marker (`data-primitive`). */
export const STATE_DOT = 'StateDot'

/**
 * The DeepSeek theme's mark (the user, 2026-11-20; DESIGN.md LOGO-BUTTON): DSH's own whale, the
 * primitives' `FishLogo` element at the mark's size, the same mark DSH's official brand plugin
 * (dsh-client-ui-brand-official `OfficialBrandMark({size})` → `<FishLogo size>`) puts in
 * `sidebar.brand.mark`, not a Fishball-drawn whale. `viewBox` and `defaultSize` are DSH's own
 * (dsh-web-frontend bundle, both SDKs: `FISH_LOGO_VIEWBOX` = 23.16 × 17.04, `size = 24`); `path` is a
 * fixture outline the page's FishLogo stand-in draws; `sizeHandle` is the stand-in's record of the
 * `size` the caller passed (a harness handle, never a product marker).
 */
export const DSH_MARK = Object.freeze({
  primitive: 'FishLogo',
  /** The stand-in's function name for every Icon and logo export (fishball-core/settings/primitives.mjs). */
  standIn: 'Icon',
  defaultSize: 24,
  viewBox: Object.freeze({ width: 23.16, height: 17.04 }),
  path: 'M1 8.5 L11.6 1 L22.2 8.5 L11.6 16 Z',
  sizeHandle: 'data-fbtest-fishlogo-size',
})

/**
 * The themes' accent (the user, 2026-11-20): the tag's text shadow and the count pill. Fishball's is
 * magenta with the pill at #D40063 (unchanged); DeepSeek's is DeepSeek blue #4D6BFE, and its pill is a
 * darkened blue whose fill reaches WCAG 1.4.3's 4.5:1 against the pill's white text.
 */
export const ACCENT = Object.freeze({
  deepseek: 'rgb(77, 107, 254)',
  fishballPill: 'rgb(212, 0, 99)',
  pillText: 'rgb(255, 255, 255)',
  cards: 1,
})
