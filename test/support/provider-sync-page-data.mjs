/** Requirement-owned UI and owner-route vocabulary; never imported from sync implementation. */
export const PAGE = Object.freeze({
  api: '/api/fishball/provider-sync', origin: 'http://fishball.test', foreignOrigin: 'https://not-the-owner.test',
  selectors: Object.freeze({ panel: 'data-fishball-provider-sync', preview: 'data-fishball-sync-preview', result: 'data-fishball-sync-result', model: 'data-fishball-model-settings', gate: 'data-fishball-model-gate' }),
  settingsKey: 'fishball-connector', settingsSlot: /config/,
  method: 'POST', contentType: 'application/json', bodyMode: 'buffered', refused: 'provider-sync-refused',
  actions: Object.freeze({ status: 'status', invite: 'invite', begin: 'begin', approve: 'approve', finish: 'finish', preview: 'preview', confirm: 'confirm', close: 'close' }),
  labels: Object.freeze({
    title: /Sync model providers and API keys/i, zhTitle: /同步.*(?:服务商|提供商).*API.*(?:密钥|Key)/i,
    preview: /^(?:Preview sync|预览同步)$/, confirm: /^(?:Confirm selected additions|确认.*新增.*)$/,
    invite: /(?:invitation|邀请)/i, begin: /(?:begin|connect|开始|连接)/i, approve: /(?:approve|批准|同意配对)/i,
    finish: /(?:Confirm target on source|确认目标|完成配对)/i, close: /(?:close|disconnect|关闭|断开)/i,
    partial: /(?:partial|partially|部分|未全部)/i, unknown: /(?:unknown|uncertain|未知|不确定|结果未确认)/i,
    shortLived: /(?:short[- ]lived|expir|短期|短时|过期|有效期)/i,
    invitationScope: /(?:capability|scoped|仅.*配对|专用|能力|凭据)/i,
    notWebToken: /(?:not.*(?:DSH Web|DSHWeb|OAuth)|不是.*(?:DSH Web|DSHWeb|OAuth)|非.*(?:DSH Web|DSHWeb|OAuth))/i,
  }),
  mask: '••••••••', groupNames: Object.freeze(['add', 'existsSkip', 'conflictSkip', 'unsupported']),
  ids: Object.freeze({ first: 'added-one', second: 'added-two', exists: 'already-on-target', conflict: 'conflicting-target', unsupported: 'unsupported-provider' }),
  names: Object.freeze({ first: 'Add Cedar', second: 'Add Birch', exists: 'Existing Maple', conflict: 'Conflict Elm', unsupported: 'Unsupported Pine' }),
  previewId: 'safe-preview-ui-fixture', nextPreviewId: 'safe-preview-ui-fixture-fresh', pairId: 'safe-pair-ui-fixture',
  invitation: 'fishball-pairing-fixture-only',
  display: Object.freeze({ api: 'openai-completions', protocol: 'anthropic-messages', endpoint: 'https://provider-fixture.example/v1', firstModel: 'cedar-display-model', secondModel: 'birch-display-model' }),
  errorMarker: 'FIXTURE_ERROR_MUST_NOT_REACH_BROWSER',
  forbidden: Object.freeze(['FIXTURE_RAW_API_KEY', 'FIXTURE_SECRET_RECORD', 'FIXTURE_TARGET_IMPORT_TOKEN']),
  oversizeBytes: 8 * 1024 * 1024, statusOk: 200, expiresInMs: 60000,
  zero: 0, one: 1, two: 2, flushRounds: 6,
  source: Object.freeze({ runtimeId: 'source-runtime', profileId: 'source-profile', schemaVersion: '1', version: 'fixture-version' }),
  target: Object.freeze({ runtimeId: 'target-runtime', profileId: 'target-profile', schemaVersion: '1', version: 'fixture-version' }),
})

const item = (id, name) => ({ id, name, models: [id + '-model'], keyMask: PAGE.mask })
export function previewDTO(previewId = PAGE.previewId) {
  return { previewId, source: { ...PAGE.source }, target: { ...PAGE.target }, expiresAt: Date.now() + PAGE.expiresInMs,
    groups: {
      add: [item(PAGE.ids.first, PAGE.names.first), item(PAGE.ids.second, PAGE.names.second)],
      existsSkip: [item(PAGE.ids.exists, PAGE.names.exists)],
      conflictSkip: [item(PAGE.ids.conflict, PAGE.names.conflict)],
      unsupported: [item(PAGE.ids.unsupported, PAGE.names.unsupported)],
    },
  }
}

export function outcomeDTO({ partial = false, unknown = false } = {}) {
  return { complete: !partial && !unknown, results: [
    { id: PAGE.ids.first, config: 'created', key: 'created', status: 'created', catalogAdvertised: true },
    { id: PAGE.ids.second, config: 'created', key: unknown ? 'unknown' : partial ? 'failed' : 'created', status: unknown ? 'unknown' : partial ? 'partial' : 'created', catalogAdvertised: true },
  ] }
}
