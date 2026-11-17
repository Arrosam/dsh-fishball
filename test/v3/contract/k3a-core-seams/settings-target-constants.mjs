/**
 * Vocabulary for K3a-TARGET (E-FIX-1 B1): the hosted child's target URL must be visible through
 * DSH's own `settings` service, the way core reads it:
 *   ctx.settings.describe().find((e) => e.ns === HOSTED_IMPORT.targetSetting.row)?.value?.[field]
 * read once at the reader's own start and again on every `settings/document-updated`.
 *
 * Every expected value comes from the E-FIX-1 requirement or from DSH's public settings contract
 * (dsh-settings README: forms expose only volatile fields of active entries), never from the
 * child row's implementation. Targets are fixture values on an unused port; nothing listens there
 * and nothing is dialled (the fakes below answer no request).
 */
import path from 'node:path'

/** The installed DSH packages the composition is built from (both SDKs ship each one). */
export const SETTINGS_DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  loader: '@deepseek-ai/cordis-plugin-loader',
  configEditor: '@deepseek-ai/dsh-config-editor',
  settings: '@deepseek-ai/dsh-settings',
  appBoot: '@deepseek-ai/dsh-app-boot',
  /** The anchor a profile resolves bundles from (profileContext.installAnchor). */
  installAnchor: path.join('node_modules', '@deepseek-ai', 'dsh', 'package.json'),
  /** DSH's event, emitted by SettingsForms when a form appears, changes or goes. */
  documentUpdated: 'settings/document-updated',
  /** cordis FiberState.ACTIVE: the state SettingsForms requires of a listed entry. */
  activeState: 2,
  /** Every log level, so a child-row part that logs its own failure is recorded. */
  allLevels: 3,
})

/** The scratch profile: an empty bundle list, an empty user patch and the root config the row is in. */
export const PROFILE = Object.freeze({
  name: 'fbtest-k3a-target',
  manifest: 'package.json',
  /** DSH's PROFILE_PATCH_FILENAME (dsh-app-boot) and PROFILE_ROOT_FILENAME (dsh profile-boot). */
  patch: 'cordis.patch.yml',
  root: 'cordis.yml',
  emptyPatch: '[]\n',
  tempPrefix: 'fbtest-k3a-target-',
})

/** Module path of the child-side row inside packages/dsh-instance (its `./child-row` export). */
export const CHILD_ROW_FILE = 'child-row.js'

/**
 * The child row's inject list names services a bare composition lacks. Each fake only lets the
 * row's fiber become active; none answers a real request. `webServer.getOrigin` is the child's own
 * loopback origin (its admission route asks for it). `settings` and `configEditor` are never faked:
 * the real DSH services are the subject.
 */
export const FAKE_SERVICES = Object.freeze({
  plain: Object.freeze(['llm', 'credentials', 'authorization', 'connection']),
  webServer: 'webServer',
  nativeRuntime: 'nativeRuntime',
  origin: 'http://127.0.0.1:43129',
})

/**
 * EP over the configured target (B1 row 1). `expected` is what core must read: the URL itself, or
 * "no target" for the blank one. DSH may list a blank field as `''` or leave it out; both mean no
 * target, so a blank row asserts the entry exists and its value is `''` or absent.
 */
export const TARGETS = Object.freeze([
  // A typical hosted target: the main DSH's connector endpoint on loopback.
  Object.freeze({ partition: 'EP typical URL', targetUrl: 'http://127.0.0.1:7713/api/agent/mcp', blank: false }),
  // The boundary of "no target": the row is configured but blank; still listed, still read as none.
  Object.freeze({ partition: 'EP blank (no target)', targetUrl: '', blank: true }),
])
/** The blank values that both mean "no target" to core (DSH may project the blank field away). */
export const NO_TARGET = Object.freeze(['', undefined])

/**
 * State transition for B1 row 3: how the child row becomes active after the reader started.
 * - `late service`: the row is configured but waits for `nativeRuntime`, which arrives later
 *   (the order a hosted child really has: core's row may start before the instance's services);
 * - `enabled later`: the row starts disabled and is switched on through the Loader.
 */
export const ACTIVATION = Object.freeze({
  lateService: 'late service',
  enabledLater: 'enabled later',
})
/** The target each transition row uses (the typical partition). */
export const TRANSITION_TARGET = TARGETS[0].targetUrl
/** How long a transition may take to settle once the row is active (ms), and the poll step. */
export const SETTLE = Object.freeze({ budgetMs: 5000, pollMs: 20 })
