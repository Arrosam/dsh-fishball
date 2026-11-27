/**
 * `@deepseek-ai/dsh-client-ui-primitives` for a scripted settings page, with DSH's own form logic.
 *
 * The form logic is DSH's own: `SettingsFormModel` and `settingsTextField` are taken unchanged from
 * the SDK's shipped web frontend bundle (dsh-web-frontend/dist/assets/index-*.js, both SDKs carry the
 * same logic) and evaluated here, so the page's staging, plan, save order and failure flag are the
 * real ones, not a copy. The bundle cannot be imported as a module in Node (it is a browser build that
 * touches the DOM at load), so the two definitions are cut out by their export names and evaluated
 * alone. The model's only outside dependency is the bundle's tiny snapshot store (`bind`), replaced
 * by `snapshotStore` below with the same face (getSnapshot, subscribe, set, update).
 *
 * The view components are stand-ins that keep the real components' props and DOM shape (the same
 * bundle, functions `SettingsForm`, `SettingsSecretField`, `SettingsValueField`, `Button`):
 * - SettingsForm: `state.available` false → a status line `labels.unavailable` only; otherwise an
 *   optional read-only line, the children, the failed line `labels.saveFailed` when `state.failed`,
 *   and one Save button disabled when `!dirty || invalid || saving`; `onDiscard` runs at unmount;
 * - SettingsSecretField: label, a state tag `stateLabel` (tone from `configured`), a password input
 *   whose value is `text`, `onEdit(value)` on change;
 * - SettingsValueField: label, a text input whose value is `text`, `onEdit(value)` on change, and a
 *   reset button when `overridden`;
 * - Button: a `<button type="button">` with every other prop forwarded.
 * `data-fbtest-*` attributes are this harness's own handles on the stand-ins (never product markers).
 * Every other export is a generic element (fakePrimitives below).
 */
import fs from 'node:fs'
import path from 'node:path'
import { frontendAssetsOf } from './sdk.mjs'

const BUNDLE = /^index-[\w-]+\.js$/
const EXPORT = (name) => new RegExp('[{,]' + name + ':([\\w$]+)[,}]')
const STORE_CALL = /bind\(e\)\{const t=([\w$]+)\(e\(\)\)/

/** The text of one balanced `{…}` block starting at `open`. */
function block(source, open) {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1)
  }
  throw new Error('unbalanced block in the SDK bundle')
}

/** The bundle's snapshot store face, as SettingsFormModel.bind uses it. */
export function snapshotStore(initial) {
  let value = initial
  const listeners = new Set()
  const notify = () => { for (const fn of [...listeners]) fn() }
  return {
    getSnapshot: () => value,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: (next) => { value = next; notify() },
    update: (fn) => { const draft = structuredClone(value); fn(draft); value = draft; notify() },
  }
}

const cache = new Map()
/** `{SettingsFormModel, settingsTextField}` of one SDK, DSH's own code. */
export function realFormLogic(sdk) {
  if (cache.has(sdk)) return cache.get(sdk)
  const dir = frontendAssetsOf(sdk)
  const file = fs.readdirSync(dir).find((f) => BUNDLE.test(f))
  if (!file) throw new Error('no web frontend bundle in ' + dir)
  const source = fs.readFileSync(path.join(dir, file), 'utf8')
  const local = (name) => {
    const match = source.match(EXPORT(name))
    if (!match) throw new Error(`the SDK ${sdk} bundle exports no ${name}`)
    return match[1]
  }
  const model = local('SettingsFormModel')
  const classAt = source.indexOf(model + '=class{')
  const classText = 'class' + block(source, classAt + model.length + '=class'.length)
  const storeName = classText.match(STORE_CALL)?.[1]
  if (!storeName) throw new Error('SettingsFormModel.bind no longer calls one store factory (SDK ' + sdk + ')')
  const field = local('settingsTextField')
  const fnAt = source.indexOf('function ' + field + '(')
  const braceAt = source.indexOf('{', fnAt)
  const fieldText = source.slice(fnAt, braceAt) + block(source, braceAt)
  const logic = Object.freeze({
    SettingsFormModel: new Function(storeName, 'return (' + classText + ')')(snapshotStore),
    settingsTextField: new Function('return (' + fieldText + ')')(),
  })
  cache.set(sdk, logic)
  return logic
}

/** Harness handles on the stand-ins (test-owned). */
export const STAND_IN = Object.freeze({
  primitive: 'data-primitive',
  save: 'data-fbtest-save',
  saveFailed: 'data-fbtest-save-failed',
  unavailable: 'data-fbtest-form-unavailable',
  secretState: 'data-fbtest-secret-configured',
  /** UI-POLISH-F: the design stand-ins' handles (variant of a Button, a Tooltip's label and side, its bubble, shortcut keys). */
  variant: 'data-fbtest-variant',
  tooltip: 'data-fbtest-tooltip',
  tooltipSide: 'data-fbtest-tooltip-side',
  portal: 'data-fbtest-portal',
  shortcut: 'data-fbtest-shortcut',
  /** The Modal stand-in's close control. */
  modalClose: 'data-fbtest-modal-close',
})

/** The primitives module for one SDK, rendering through `React` (the hook shim). */
/**
 * `options.modal` (MULTI-1): use the faithful Modal stand-in below. Off by default, so a harness that
 * builds on the generic element (fishball-ui's model-dialog wraps `createElement` for it) is unchanged.
 */
export function primitivesFor(sdk, React, options = {}) {
  const h = React.createElement
  const { SettingsFormModel, settingsTextField } = realFormLogic(sdk)
  function SettingsForm({ state, labels, onSave, onDiscard, children }) {
    const discard = React.useRef(onDiscard)
    discard.current = onDiscard
    React.useEffect(() => () => { discard.current?.() }, [])
    if (!state.available) return h('p', { role: 'status', [STAND_IN.unavailable]: true }, labels?.unavailable)
    const disabled = !state.dirty || state.invalid || state.saving
    return h('div', { [STAND_IN.primitive]: 'SettingsForm' },
      state.writable ? null : h('p', { role: 'status' }, labels?.readOnly),
      children,
      h('div', null,
        state.failed ? h('p', { role: 'status', [STAND_IN.saveFailed]: true }, labels?.saveFailed) : null,
        h('button', { type: 'button', [STAND_IN.save]: true, disabled, onClick: onSave }, state.saving ? labels?.saving : labels?.save)))
  }
  function SettingsSecretField(props) {
    return h('div', { [STAND_IN.primitive]: 'SettingsSecretField' },
      h('label', { htmlFor: props.id }, props.label),
      h('span', { [STAND_IN.secretState]: String(Boolean(props.configured)) }, props.stateLabel),
      h('input', { id: props.id, type: 'password', autoComplete: 'new-password', value: props.text, disabled: props.disabled, onChange: (event) => props.onEdit(event.target.value) }),
      h('p', null, props.hint))
  }
  function SettingsValueField(props) {
    return h('div', { [STAND_IN.primitive]: 'SettingsValueField' },
      h('label', { htmlFor: props.id }, props.label),
      props.overridden ? h('button', { type: 'button', disabled: props.disabled, onClick: props.onReset }, props.resetLabel) : null,
      h('input', { id: props.id, type: 'text', value: props.text, placeholder: props.placeholder ?? '', disabled: props.disabled, onChange: (event) => props.onEdit(event.target.value) }),
      props.invalid || props.hint ? h('p', null, props.invalid ? props.invalidLabel : props.hint) : null)
  }
  // UI-POLISH-F: the stand-in keeps `variant` as a harness handle, so a case can tell DSH's primary
  // and outline looks apart (SPEC §2 control, §3 first choice, §7 Connect); DSH's own default is ghost.
  function Button({ children, variant = DESIGN.defaultVariant, size, icon, ...rest }) {
    return h('button', { type: 'button', [STAND_IN.primitive]: 'Button', [STAND_IN.variant]: variant, ...rest }, icon ?? null, children)
  }
  const design = designStandIns(React, options)
  return proxied({ SettingsFormModel, settingsTextField, SettingsForm, SettingsSecretField, SettingsValueField, Button, ...design.known }, h, design.icon)
}

/**
 * UI-POLISH-F: DSH's design primitives as they render on both SDKs (dsh-web-frontend's bundle, the
 * functions behind the primitives module's `StateDot`, `Tag`, `Tooltip`, `FishLogo` and `Icon*`
 * exports, read 2026-11-18). Kept faithful where a case observes them:
 * - StateDot `{state}`: `ongoing` → `<svg data-state="ongoing" aria-hidden>` (the spinner), any other
 *   state → `<span data-state aria-hidden>`;
 * - Tag `{tone, className, children}`: `<span data-tone>`; DSH's Tag forwards NO other prop, so a
 *   `data-*` hook given to it is lost in a real DSH (and here);
 * - Tooltip `{label, shortcutKeys, side, portal, children}`: renders its one child with hover and
 *   focus handlers chained to the child's own; while hovered or focused it adds the bubble
 *   `<span role="tooltip">` with the label (a string or a function) and the shortcut keys. DSH
 *   portals the bubble to document.body when `portal` is set; here the bubble stays inline and
 *   carries `data-fbtest-portal`. The stand-in stamps `data-fbtest-tooltip` (label) and
 *   `data-fbtest-tooltip-side` on the child, harness handles only;
 * - FishLogo and every `Icon*` export: one `<svg aria-hidden="true">`;
 * - Checkbox `{checked, onChange, label, disabled, title, className}` (R-FIX-FUI): `<label title class>`
 *   holding `<input type="checkbox" checked disabled>` whose change calls `onChange(event.target.checked)`,
 *   and `<span>` with the label. DSH's Checkbox forwards no other prop, so a `data-*` hook given to it is lost.
 */
export const DESIGN = Object.freeze({
  defaultVariant: 'ghost',
  ongoing: 'ongoing',
  tooltipRole: 'tooltip',
  hidden: 'true',
  iconPrefix: 'Icon',
  logos: Object.freeze(['FishLogo', 'BrandWordmark']),
})
function designStandIns(React, options = {}) {
  const h = React.createElement
  const svg = (name) => function Icon() { return h('svg', { [STAND_IN.primitive]: name, 'aria-hidden': DESIGN.hidden }) }
  function StateDot({ state }) {
    return state === DESIGN.ongoing
      ? h('svg', { [STAND_IN.primitive]: 'StateDot', 'data-state': state, 'aria-hidden': DESIGN.hidden })
      : h('span', { [STAND_IN.primitive]: 'StateDot', 'data-state': state, 'aria-hidden': DESIGN.hidden })
  }
  function Tag({ tone = 'outline', className, children }) {
    return h('span', { [STAND_IN.primitive]: 'Tag', 'data-tone': tone, className }, children)
  }
  function Tooltip({ label, shortcutKeys, side = 'right', portal = false, disabled = false, children }) {
    const [open, setOpen] = React.useState(false)
    const child = Array.isArray(children) ? children[0] : children
    if (!child || !child.$$rp) return child ?? null
    const chain = (name, next) => (event) => { child.props[name]?.(event); next() }
    const text = typeof label === 'function' ? label() : label
    const props = {
      ...child.props,
      [STAND_IN.tooltip]: text, [STAND_IN.tooltipSide]: side,
      onMouseEnter: chain('onMouseEnter', () => setOpen(true)), onMouseLeave: chain('onMouseLeave', () => setOpen(false)),
      onFocus: chain('onFocus', () => setOpen(true)), onBlur: chain('onBlur', () => setOpen(false)),
    }
    const clone = { ...child, props }
    if (!open || disabled) return clone
    return h(React.Fragment, null, clone,
      h('span', { role: DESIGN.tooltipRole, [STAND_IN.portal]: String(Boolean(portal)) },
        text ? h('span', null, text) : null,
        shortcutKeys?.length ? h('span', { [STAND_IN.shortcut]: true }, shortcutKeys.join(' ')) : null))
  }
  function Checkbox({ checked, onChange, label, disabled = false, title, className }) {
    return h('label', { [STAND_IN.primitive]: 'Checkbox', title, className },
      h('input', { type: 'checkbox', checked, disabled, onChange: (event) => onChange?.(event.target.checked) }),
      h('span', null, label))
  }
  const icons = new Map()
  const icon = (name) => {
    if (!name.startsWith(DESIGN.iconPrefix) && !DESIGN.logos.includes(name)) return undefined
    if (!icons.has(name)) icons.set(name, svg(name))
    return icons.get(name)
  }
  /**
   * MULTI-1: Modal `{open, onClose, title, closeLabel, description, children, footer}` as DSH's bundle
   * renders it (dsh-web-frontend, both SDKs): nothing while closed; open, a `role="dialog"` with the
   * title, description, children and footer (DSH portals it to document.body; here it stays inline,
   * which a case cannot tell apart through the props it reads).
   */
  function Modal({ open, onClose, title, closeLabel, description, children, footer, ...rest }) {
    if (!open) return null
    const own = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('data-')))
    return h('div', { [STAND_IN.primitive]: 'Modal', role: 'dialog', ...own },
      title ? h('h2', null, title) : null,
      description ? h('p', null, description) : null,
      children ?? null,
      footer ?? null,
      h('button', { type: 'button', [STAND_IN.modalClose]: true, 'aria-label': closeLabel, onClick: onClose }))
  }
  return { known: { StateDot, Tag, Tooltip, Checkbox, ...(options.modal ? { Modal } : {}) }, icon }
}

/** A primitives module: the `known` components, `special(name)` when it answers, and a generic element for every other export. */
function proxied(known, h, special = () => undefined) {
  const generic = new Map()
  const primitives = new Proxy(known, {
    get(target, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return primitives
      if (name in target) return target[name]
      const own = special(name)
      if (own) return own
      if (!generic.has(name)) generic.set(name, function Primitive({ children, ...rest }) { return h('div', { [STAND_IN.primitive]: name, ...rest }, children) })
      return generic.get(name)
    },
  })
  return primitives
}

/** Primitives with no DSH logic at all: Button is a host <button>, every other export a generic element; all props kept. */
export function fakePrimitives(React) {
  const cache = new Map()
  const make = (name) => function Primitive({ children, ...rest }) {
    return React.createElement(name === 'Button' ? 'button' : 'div', { [STAND_IN.primitive]: name, ...rest }, children)
  }
  const primitives = new Proxy({}, {
    get(_target, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return primitives
      if (!cache.has(name)) cache.set(name, make(name))
      return cache.get(name)
    },
  })
  return primitives
}
