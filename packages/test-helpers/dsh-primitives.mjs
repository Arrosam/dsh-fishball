/**
 * `@deepseek-ai/dsh-client-ui-primitives` for a scripted page, over ./react-shim's React.
 *
 * The form logic is DSH's own: `SettingsFormModel` and `settingsTextField` are cut unchanged from
 * the current DSH's shipped web frontend bundle (dsh-web-frontend/dist/assets/index-*.js) and
 * evaluated here, so a page's staging, plan, save order and failure flag are the real ones. The
 * bundle cannot be imported in Node (a browser build that touches the DOM at load), so the two
 * definitions are found by their export names and evaluated alone. The model's one outside
 * dependency, the bundle's snapshot store (`bind`), is ./react-shim `snapshotStore` (same face:
 * getSnapshot, subscribe, set, update).
 *
 * The view components are stand-ins that keep the real components' props and DOM shape:
 * - SettingsForm: `state.available` false → a status line `labels.unavailable` only; otherwise a
 *   read-only line when `!state.writable`, the children, the failed line `labels.saveFailed` when
 *   `state.failed`, and one Save button disabled when `!dirty || invalid || saving`; `onDiscard`
 *   runs at unmount;
 * - SettingsSecretField: label, a state tag `stateLabel`, a password input whose value is `text`,
 *   `onEdit(value)` on change; SettingsValueField: label, a text input, a reset button when
 *   `overridden`;
 * - Button: `<button type="button">` with every other prop forwarded (its `variant` kept as a handle,
 *   DSH's default being ghost);
 * - StateDot, Tag, Tooltip, Checkbox, Modal (with `{modal: true}`), FishLogo and every `Icon*`
 *   export as DSH's bundle draws them (DESIGN below says where each is faithful);
 * - every other export a generic `<div data-primitive="<name>">`.
 * `data-fbtest-*` attributes (STAND_IN) are this harness's handles on the stand-ins, never product
 * markers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DSH_VERSION, dshPackageDir } from './dsh.mjs'
import { SHIM, primitivesModule, snapshotStore } from './react-shim.mjs'

const BUNDLE = Object.freeze({
  package: 'dsh-web-frontend',
  assets: path.join('dist', 'assets'),
  file: /^index-[\w-]+\.js$/,
  exportOf: (name) => new RegExp('[{,]' + name + ':([\\w$]+)[,}]'),
  /** SettingsFormModel.bind(e) makes its store with one factory call: `bind(e){const t=<store>(e())`. */
  storeCall: /bind\(e\)\{const t=([\w$]+)\(e\(\)\)/,
  classOpen: '=class',
})

/** The frontend assets folder of one DSH version. */
export const frontendAssets = (version = DSH_VERSION) => path.join(dshPackageDir(BUNDLE.package, version), BUNDLE.assets)

/** The text of one balanced `{…}` block starting at `open`. */
function block(source, open) {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1)
  }
  throw new Error('unbalanced block in the DSH frontend bundle')
}

const cache = new Map()
/** `{SettingsFormModel, settingsTextField}` of one DSH version (default the current one): DSH's own code. */
export function realFormLogic(version = DSH_VERSION) {
  if (cache.has(version)) return cache.get(version)
  const dir = frontendAssets(version)
  const file = fs.readdirSync(dir).find((f) => BUNDLE.file.test(f))
  if (!file) throw new Error('no web frontend bundle in ' + dir)
  const source = fs.readFileSync(path.join(dir, file), 'utf8')
  const local = (name) => {
    const match = source.match(BUNDLE.exportOf(name))
    if (!match) throw new Error('the DSH ' + version + ' bundle exports no ' + name)
    return match[1]
  }
  const model = local('SettingsFormModel')
  const classAt = source.indexOf(model + BUNDLE.classOpen + '{')
  const classText = 'class' + block(source, classAt + model.length + BUNDLE.classOpen.length)
  const storeName = classText.match(BUNDLE.storeCall)?.[1]
  if (!storeName) throw new Error('SettingsFormModel.bind no longer calls one store factory (DSH ' + version + ')')
  const field = local('settingsTextField')
  const fnAt = source.indexOf('function ' + field + '(')
  const braceAt = source.indexOf('{', fnAt)
  const fieldText = source.slice(fnAt, braceAt) + block(source, braceAt)
  const logic = Object.freeze({
    SettingsFormModel: new Function(storeName, 'return (' + classText + ')')(snapshotStore),
    settingsTextField: new Function('return (' + fieldText + ')')(),
  })
  cache.set(version, logic)
  return logic
}

/** Harness handles on the stand-ins (test-owned). */
export const STAND_IN = Object.freeze({
  primitive: SHIM.primitive,
  save: 'data-fbtest-save',
  saveFailed: 'data-fbtest-save-failed',
  unavailable: 'data-fbtest-form-unavailable',
  secretState: 'data-fbtest-secret-configured',
  /** A Button's variant, a Tooltip's label and side, its bubble's portal flag, the shortcut keys. */
  variant: 'data-fbtest-variant',
  tooltip: 'data-fbtest-tooltip',
  tooltipSide: 'data-fbtest-tooltip-side',
  portal: 'data-fbtest-portal',
  shortcut: 'data-fbtest-shortcut',
  /** The Modal stand-in's close control. */
  modalClose: 'data-fbtest-modal-close',
})

/**
 * DSH's design primitives as its bundle renders them (dsh-web-frontend, the functions behind the
 * primitives module's exports). Faithful where a case observes them:
 * - StateDot `{state}`: `ongoing` → `<svg data-state="ongoing" aria-hidden>`, any other → `<span data-state aria-hidden>`;
 * - Tag `{tone, className, children}`: `<span data-tone>`; DSH's Tag forwards NO other prop, so a
 *   `data-*` hook given to it is lost in DSH (and here);
 * - Tooltip `{label, shortcutKeys, side, portal, disabled, children}`: its one child with hover and
 *   focus handlers chained to the child's own; while hovered or focused, the bubble
 *   `<span role="tooltip">` with the label (string or function) and the keys. DSH portals the bubble
 *   to document.body when `portal` is set; here it stays inline and carries `data-fbtest-portal`;
 * - Checkbox `{checked, onChange, label, disabled, title, className}`: `<label>` holding
 *   `<input type="checkbox">` (change → `onChange(checked)`) and `<span>` with the label; no other prop;
 * - Modal `{open, onClose, title, closeLabel, description, children, footer}`: nothing while closed;
 *   open, `role="dialog"` with title, description, children, footer and a close button (inline,
 *   not portalled); only its `data-*` props are kept;
 * - FishLogo, BrandWordmark and every `Icon*` export: one `<svg aria-hidden="true">`.
 */
export const DESIGN = Object.freeze({
  defaultVariant: 'ghost',
  defaultTone: 'outline',
  defaultSide: 'right',
  ongoing: 'ongoing',
  tooltipRole: 'tooltip',
  dialogRole: 'dialog',
  statusRole: 'status',
  hidden: 'true',
  iconPrefix: 'Icon',
  logos: Object.freeze(['FishLogo', 'BrandWordmark']),
})

function formStandIns(React) {
  const h = React.createElement
  function SettingsForm({ state, labels, onSave, onDiscard, children }) {
    const discard = React.useRef(onDiscard)
    discard.current = onDiscard
    React.useEffect(() => () => { discard.current?.() }, [])
    if (!state.available) return h('p', { role: DESIGN.statusRole, [STAND_IN.unavailable]: true }, labels?.unavailable)
    const disabled = !state.dirty || state.invalid || state.saving
    return h('div', { [STAND_IN.primitive]: 'SettingsForm' },
      state.writable ? null : h('p', { role: DESIGN.statusRole }, labels?.readOnly),
      children,
      h('div', null,
        state.failed ? h('p', { role: DESIGN.statusRole, [STAND_IN.saveFailed]: true }, labels?.saveFailed) : null,
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
  function Button({ children, variant = DESIGN.defaultVariant, size, icon, ...rest }) {
    return h('button', { type: 'button', [STAND_IN.primitive]: 'Button', [STAND_IN.variant]: variant, ...rest }, icon ?? null, children)
  }
  return { SettingsForm, SettingsSecretField, SettingsValueField, Button }
}

function designStandIns(React, { modal = false } = {}) {
  const h = React.createElement
  const svg = (name) => function Icon() { return h('svg', { [STAND_IN.primitive]: name, 'aria-hidden': DESIGN.hidden }) }
  function StateDot({ state }) {
    return h(state === DESIGN.ongoing ? 'svg' : 'span', { [STAND_IN.primitive]: 'StateDot', 'data-state': state, 'aria-hidden': DESIGN.hidden })
  }
  function Tag({ tone = DESIGN.defaultTone, className, children }) {
    return h('span', { [STAND_IN.primitive]: 'Tag', 'data-tone': tone, className }, children)
  }
  function Tooltip({ label, shortcutKeys, side = DESIGN.defaultSide, portal = false, disabled = false, children }) {
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
  function Modal({ open, onClose, title, closeLabel, description, children, footer, ...rest }) {
    if (!open) return null
    const own = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('data-')))
    return h('div', { [STAND_IN.primitive]: 'Modal', role: DESIGN.dialogRole, ...own },
      title ? h('h2', null, title) : null,
      description ? h('p', null, description) : null,
      children ?? null,
      footer ?? null,
      h('button', { type: 'button', [STAND_IN.modalClose]: true, 'aria-label': closeLabel, onClick: onClose }))
  }
  const icons = new Map()
  const icon = (name) => {
    if (!name.startsWith(DESIGN.iconPrefix) && !DESIGN.logos.includes(name)) return undefined
    if (!icons.has(name)) icons.set(name, svg(name))
    return icons.get(name)
  }
  return { known: { StateDot, Tag, Tooltip, Checkbox, ...(modal ? { Modal } : {}) }, icon }
}

/**
 * The primitives module of one DSH version, rendering through `React` (./react-shim).
 * @param options.version - the DSH whose form logic runs (default the current one).
 * @param options.modal - include the faithful Modal stand-in (off: Modal is a generic element, so a
 *   harness that wraps createElement for its own Modal keeps it).
 * @param options.extra - more components by export name (they win over the stand-ins).
 */
export function primitivesFor(React, { version = DSH_VERSION, modal = false, extra = {} } = {}) {
  const { SettingsFormModel, settingsTextField } = realFormLogic(version)
  const design = designStandIns(React, { modal })
  return primitivesModule(React, { SettingsFormModel, settingsTextField, ...formStandIns(React), ...design.known, ...extra }, design.icon)
}
