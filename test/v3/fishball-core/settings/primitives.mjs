/**
 * `@deepseek-ai/dsh-client-ui-primitives` for the F-SETTINGS scripted page.
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
 * Every other export is a generic element, as support/set-panel.mjs fakes it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { frontendAssetsOf } from './constants.mjs'

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
})

/** The primitives module for one SDK, rendering through `React` (the hook shim). */
export function primitivesFor(sdk, React) {
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
  function Button({ children, variant, size, icon, ...rest }) {
    return h('button', { type: 'button', [STAND_IN.primitive]: 'Button', ...rest }, icon ?? null, children)
  }
  const known = { SettingsFormModel, settingsTextField, SettingsForm, SettingsSecretField, SettingsValueField, Button }
  const generic = new Map()
  const primitives = new Proxy(known, {
    get(target, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return primitives
      if (name in target) return target[name]
      if (!generic.has(name)) generic.set(name, function Primitive({ children, ...rest }) { return h('div', { [STAND_IN.primitive]: name, ...rest }, children) })
      return generic.get(name)
    },
  })
  return primitives
}
