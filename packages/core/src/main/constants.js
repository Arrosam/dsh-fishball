/**
 * Values of core's main row (task F-WIRE; design §5a.1, §6.3, §6.4; R-FB-02…14). Every value of the
 * modules it composes is that module's own; these are the row's: its id, its inject list, the DSH
 * names it reads, and its log lines.
 */
import { UI_INSTANCE } from 'fishball-shared/ui-seam'
import { FISHBALL_MODEL } from '../../contracts/constants.js'
import { SETTINGS } from '../settings/constants.js'

export const MAIN = Object.freeze({
  /** The row id and Cordis plugin name: also its settings namespace (SETTINGS.namespace, FISHBALL_MODEL). */
  name: SETTINGS.namespace,
  /**
   * The DSH services the row cannot start without (both SDKs): `storageDomain` (dsh-storage-domain's
   * facility, `ctx.storage.domain`) for its tables, `credentials` and `authorization` the link's
   * (F-LINK-SAVE), `connection` the owner-only routes', `settings` the instance's target read,
   * `agents` / `tools` the manager's. Injecting them makes Cordis start the row only once they exist.
   * Read on use instead, because Fishball runs without them: `webServer` (only for the web callback;
   * a DSH without dsh-web-app's listener has no browser on another machine to serve), `llm`,
   * `agentDefaultModel` and `workspaceRegistry` (the manager session reads them as optional).
   */
  inject: Object.freeze(['agents', 'tools', 'credentials', 'authorization', 'storage', 'storageDomain', 'connection', 'settings']),
  /** DSH's web listener, read on use (above). */
  webServer: 'webServer',
  /** DSH's attachment store (dsh-attachment), read on use: the façade saves an image the model reads into it. */
  attachments: 'attachments',
  /**
   * `fishballInstance` (K3 `index.d.ts`, its name fishball-shared's `UI_INSTANCE.service`) and its
   * version: MULTI-0's 2 (`index.d.ts` `FishballInstance.apiVersion`: `ui`, `bridge` and `attention`
   * changed shape). Not `UI_INSTANCE.apiVersion`, which still reads 1 since R-FIX-FUI and which no
   * reader uses any more (MULTI-3 retired the pairing route); reported to MULTI-0.
   */
  service: UI_INSTANCE.service,
  apiVersion: 2,
  /** The setting paths the row follows, as nested key paths in its own config. */
  setting: Object.freeze({
    metadataUrl: Object.freeze(['connect', 'clientMetadataUrl']),
    id: Object.freeze(['identity', 'id']),
    name: Object.freeze(['identity', 'name']),
    model: FISHBALL_MODEL.path,
  }),
  /** DSH events: a volatile config change of a row (cordis-plugin-loader) and a settings document change (dsh-settings). */
  event: Object.freeze({ volatileUpdate: 'loader/volatile-update', settingsUpdated: 'settings/document-updated' }),
  /** The plugin id core's own manager-scope contributions register under (X2). */
  setupId: Object.freeze({ reminders: 'fishball-core-reminders', bridge: 'fishball-core-bridge' }),
  /** The image input modality of a model (dsh-llm `inputModalities`, 0.2.2; absent = unknown, allowed, as the V2 image gate judged it). */
  imageModality: 'image',
  logger: 'fishball-core',
  text: Object.freeze({
    failed: '%s failed (%s)',
    recover: 'recovering the acceptance ledger',
    resume: 'resuming pending notices',
    model: 'applying Fishball\'s model',
    id: 'applying Fishball\'s id setting',
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
