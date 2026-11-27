/**
 * The Recommended tab's requirements catalogue (T-RP, docs/test-design/v2-recommendation-tab.md
 * AC1–AC11), the cases fishball-ui's own tests run: each has an executable check in ./checks.mjs.
 * The post-merge e2e rows (owners BROWSER / INTEGRATE: a real child Plugins page, native install
 * flows) and the instance/connector artifact halves left with dsh-instance and dsh-connector
 * (6b7c53bf) and are retired, not registered as todo.
 */
function freezeData(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeData);
    Object.freeze(value);
  }
  return value;
}

export const RECOMMENDATION_TEST_DATA = freezeData({
  feature: 'T-RP',
  contract: {
    tabId: 'fishball-recommended',
    labels: { en: 'Fishball Recommended', zh: 'Fishball 推荐' },
    // Test aliases map requirements categories, not product serialized enum values.
    categoryOrder: ['context', 'memory', 'channel', 'pet'],
    highlightedCategories: ['context', 'memory'],
    entryIds: {
      context: ['dsh-idle-compact', 'dsh-plugin-save-token', 'smart-compaction'],
      memory: ['meow-memory', '@a9i5k4/dsh-auto-memory', '@zilliz/memsearch-dsh'],
      channel: ['@michengai/dsh-im-connect', 'dsh-telegram-notify', 'dsh-plugin-discord', 'dsh-dingtalk-channel'],
      pet: [],
    },
    fixtures: {
      profileKind: 'fresh disposable main and hosted-child profiles',
      absentPackage: 'dsh-idle-compact',
      secondDistinctPackage: 'smart-compaction',
      notePackage: 'meow-memory',
      installSource: 'reviewed local fixture pack substituted at the native-flow test boundary',
      versionRule: 'owner.install takes an already-confirmed exact target; prove its supported acquisition/handoff separately without prescribing a native version-picker or extra confirmation screen; historical checked versions are not requirements',
    },
  },
  cases: [
    {
      id: 'TC-20', techniques: ['EP'], ac: ['AC2', 'AC8'],
      owners: ['RP'], after: ['reviewed shipped-data unit seam'], entrypoint: 'one public unit seam for actual shipped curated constants',
      data: 'Read actual shipped instance-owned data, not this catalogue: four category order, ten listed ids, highlight flags, empty Pet note layout and nonempty en/zh resources.',
      intent: 'validate actual shipped curated data structure and localization resources with no exact prose or historical version pins',
    },
    {
      id: 'TC-21', techniques: ['EP', 'State Transition'], ac: ['AC1', 'AC4', 'AC11'],
      owners: ['RP'], after: ['reviewed public slot seam on selected SDK'], entrypoint: 'root plugins.tab owner injection and component registration',
      data: 'Use documented root/list slot and owner-supplied props in each SDK; register the instance child module.',
      intent: 'render through the documented native owner seam or a proven supported native alternative without assuming a global or raw-entry installer contract',
    },
    {
      id: 'TC-22', techniques: ['Use Case', 'State Transition'], ac: ['AC4'],
      owners: ['RP'], after: ['reviewed native confirmed-target seam on selected SDK'], entrypoint: 'curated name/spec -> native confirmed-target handoff',
      data: 'dsh-idle-compact local fixture with an already-confirmed spec/title/exact version for owner.install; prove the supported handoff or reviewed native alternative, without prescribing a version-picker or extra confirmation screen or historical version pins.',
      intent: 'hand a confirmed native target into child install without inventing confirmation UX or custom install/model path',
    },
    {
      id: 'TC-23', techniques: ['EP', 'BVA', 'Decision Table R1-R3'], ac: ['AC1', 'AC3'],
      owners: ['RP'], after: ['reviewed authoritative child-inventory seam'], entrypoint: 'component row state from native child bundle presence',
      data: 'Same curated package: child presence 0/1, enabled/disabled when present; main-only or absent; main page context.',
      intent: 'apply minimized visibility/presence rules with Installed based solely on child presence regardless enablement',
    },
    {
      id: 'TC-24', techniques: ['BVA', 'EP'], ac: ['AC2', 'AC3'],
      owners: ['RP'], after: ['reviewed authoritative child-inventory seam'], entrypoint: 'component rendering of distinct curated rows',
      data: 'Seed zero, then dsh-idle-compact only, then dsh-idle-compact plus smart-compaction in child; meow-memory remains absent.',
      intent: 'keep Installed state row-local for zero, one and two distinct installed recommendations without hiding the fixed list',
    },
    {
      id: 'TC-25', techniques: ['BVA', 'State Transition'], ac: ['AC1', 'AC7', 'AC11'],
      owners: ['RP'], after: ['reviewed slot/lifecycle seam'], entrypoint: 'zero/one/two child composition activations and re-entry',
      data: 'Observe before activation, activate once, then repeat supported same-id registration or leave/re-enter; do not inject impossible duplicate bundles.',
      intent: 'keep one live tab contribution and correct active subscriptions after repeated activation without requiring duplicate-id rejection',
    },
    {
      id: 'TC-26', techniques: ['BVA', 'State Transition'], ac: ['AC7'],
      owners: ['RP'], after: ['reviewed lifecycle disposer seam'], entrypoint: 'subscription ownership and repeated disposer calls',
      data: 'Record owned subscriptions at zero/one activation; dispose once and twice; deliver callback from disposed owner.',
      intent: 'remove each owned subscription once, make repeated disposal inert and prevent disposed updates',
    },
    {
      id: 'TC-27', techniques: ['State Transition'], ac: ['AC5', 'AC7'],
      owners: ['RP'], after: ['reviewed generation/inventory seam'], entrypoint: 'old pending completion after dispose and replacement activation',
      data: 'Generation A pending, dispose A, activate B, then settle A and deliver old inventory callback; native install may commit.',
      intent: 'fence old-generation UI updates while B obtains actual current child state without canceling native completion',
    },
    {
      id: 'TC-28', techniques: ['BVA', 'State Transition'], ac: ['AC5', 'AC6'],
      owners: ['RP'], after: ['reviewed native pending handoff seam'], entrypoint: 'component zero/one/two user install invocations',
      data: 'Zero, one and two invocations while native pending or unconfirmed; separately explicit invocation after native settlement.',
      intent: 'reuse native blocking/dedup and allow only native-authorized subsequent work without added Fishball retry or lock policy',
    },
    {
      id: 'TC-29', techniques: ['EP', 'State Transition'], ac: ['AC3', 'AC5'],
      owners: ['RP'], after: ['reviewed native result and independent inventory seams'], entrypoint: 'native error/result presentation plus authoritative bundle listing',
      data: 'Check failure/absent; package failure/absent; application failure/present; cancel confirmed/native actual presence; unresolved result.',
      intent: 'preserve native outcomes independently of Installed presence, including failure with present remainder and truthful unknown',
    },
    {
      id: 'TC-30', techniques: ['EP'], ac: ['AC2', 'AC4'],
      owners: ['RP'], after: ['reviewed curated-source/component seam'], entrypoint: 'recommendation component source selection and Install intent',
      data: 'Fixed curated shipped data and local pack; an unrelated market suggestion is available only in test harness native discovery fixture.',
      intent: 'render only instance-curated recommendations and pass listed spec to native flow without market-derived rows or discovery request',
    },
    {
      id: 'TC-31', techniques: ['Use Case', 'EP'], ac: ['AC1', 'AC9'],
      owners: ['BOUNDARY', 'INTEGRATE'], after: ['RP'], entrypoint: 'proposed release artifact and actual child/main composition',
      data: 'Inspect proposed connector/instance artifacts and fresh child composition on each SDK using authorized later artifact checks.',
      intent: 'ship recommendation as instance-owned child client asset with no standalone placed recommendation package or main contribution',
    },
    {
      id: 'TC-32', techniques: ['Use Case', 'EP'], ac: ['AC9'],
      owners: ['BOUNDARY', 'INTEGRATE'], after: ['RP'], entrypoint: 'release artifact, initial hosted-child profile and loader composition',
      data: 'Fresh hosted child; no manual recommendation Install. Inspect payloads, placement, enablement and startup dependencies.',
      intent: 'keep recommendations opt-in: nothing placed, inserted or depended on because of the tab (no recommended or standalone recommendation package, no feature-plugin dependency)',
    },
    {
      id: 'TC-33', techniques: ['EP'], ac: ['AC2', 'AC8'],
      owners: ['RP'], after: ['reviewed component localization seam'], entrypoint: 'localized meow-memory and empty-category rendering',
      data: 'Actual trusted en/zh resources; render meow-memory row absent/present and Pet with no entries; no runtime malformed-data injection.',
      intent: 'render localized optional-memory note under meow-memory and empty-category note without exact-copy snapshots or board link',
    },
    {
      id: 'TC-34', techniques: ['State Transition'], ac: ['AC1', 'AC7', 'AC11'],
      owners: ['RP'], after: ['reviewed root-slot ownership seam'], entrypoint: 'contribution activation -> disposal -> reactivation with native tabs',
      data: 'Retain native Installed and other installed SDK-native tabs; activate/dispose/reactivate child contribution with stable id.',
      intent: 'remove only the owned recommendation contribution on disposal and restore one on reactivation without altering native tabs',
    },
  ],
});
