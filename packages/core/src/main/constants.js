/**
 * Values of core's main row (task F-WIRE; design §5a.1, §6.3, §6.4; R-FB-02…14). Every value of the
 * modules it composes is that module's own; these are the row's: its id, its inject list, the DSH
 * names it reads, and its log lines.
 */
import { FISHBALL_MODEL, HOSTED_IMPORT } from '../../contracts/constants.js'
import { SETTINGS } from '../settings/constants.js'

export const MAIN = Object.freeze({
  /** The row id and Cordis plugin name: also its settings namespace (SETTINGS.namespace, FISHBALL_MODEL). */
  name: SETTINGS.namespace,
  /**
   * The DSH services the row cannot start without (both SDKs). `storageDomain` is dsh-storage-domain's
   * facility (`ctx.storage.domain`), `credentials` and `authorization` the link's (F-LINK-SAVE),
   * `connection` and `webServer` the routes', `settings` the identity write, `agents` / `tools` the
   * manager, `llm` and `agentDefaultModel` the model rule (src/manager/session.js). Reading them in
   * `inject` makes Cordis start the row only once they exist, so nothing is looked up as absent.
   */
  inject: Object.freeze(['agents', 'tools', 'credentials', 'authorization', 'storage', 'storageDomain', 'connection', 'webServer', 'settings', 'llm', 'agentDefaultModel']),
  /** `fishballInstance` (K3 `index.d.ts`), its version, and the status service (F-STATUS). */
  service: 'fishballInstance',
  apiVersion: 1,
  /** The setting paths the row follows, as nested key paths in its own config. */
  setting: Object.freeze({
    target: Object.freeze(['target', 'url']),
    metadataUrl: Object.freeze(['connect', 'clientMetadataUrl']),
    id: Object.freeze(['identity', 'id']),
    name: Object.freeze(['identity', 'name']),
    model: FISHBALL_MODEL.path,
  }),
  /** The instance's target in a hosted child (K3a HOSTED_IMPORT.targetSetting): another row's settings, read from DSH's settings service. */
  instanceTarget: HOSTED_IMPORT.targetSetting,
  /** DSH events: a volatile config change of a row (cordis-plugin-loader) and a settings document change (dsh-settings). */
  event: Object.freeze({ volatileUpdate: 'loader/volatile-update', settingsUpdated: 'settings/document-updated' }),
  /** dsh-settings' path-operation verb. */
  /** The plugin id core's own manager-scope contributions register under (X2). */
  setupId: Object.freeze({ asks: 'fishball-core-asks', reminders: 'fishball-core-reminders', bridge: 'fishball-core-bridge' }),
  /** The image input modality of a model (dsh-llm `inputModalities`, 0.2.2; absent = unknown, allowed, as the V2 image gate judged it). */
  imageModality: 'image',
  logger: 'fishball-core',
  text: Object.freeze({
    failed: '%s failed (%s)',
    open: 'opening fishball-core',
    recover: 'recovering the acceptance ledger',
    reconcile: 'reconciling the ask cards',
    intake: 'taking a polled event',
    resume: 'resuming pending notices',
    model: 'applying Fishball\'s model',
    reconnect: 'reconnecting after a settings change',
  }),
})

/** The generated `identity.id`'s own storage domain (identity.js): one table, one record. */
export const IDENTITY_STORE = Object.freeze({
  domain: 'fishball_core_main',
  table: 'identity',
  version: 1,
  key: 'generated-id',
  malformed: 'fishball-core: malformed generated id record',
})
