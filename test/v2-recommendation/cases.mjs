import test from 'node:test';

// These are requirements, not a product adapter or an executable product oracle.
// Keep nested case data immutable so the two SDK registrations cannot diverge.
function freezeData(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeData);
    Object.freeze(value);
  }
  return value;
}

export const RECOMMENDATION_TEST_DATA = freezeData({
  feature: 'T-RP',
  status: 'Not Run',
  sdks: { rc5: '0.2.1-rc.5', rc1: '0.2.2-rc.1' },
  title: { separator: ' | ', sdk: 'SDK=', owners: 'TODO ', ownerSeparator: '+' },
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
      profileKind: 'fresh or V2-only disposable main and child profiles',
      absentPackage: 'dsh-idle-compact',
      secondDistinctPackage: 'smart-compaction',
      notePackage: 'meow-memory',
      installSource: 'reviewed local fixture pack substituted at the native-flow test boundary',
      versionRule: 'owner.install takes an already-confirmed exact target; prove its supported acquisition/handoff separately without prescribing a native version-picker or extra confirmation screen; historical checked versions are not requirements',
    },
  },
  cases: [
    {
      id: 'TC-01', techniques: ['Use Case', 'EP'], ac: ['AC1', 'AC2', 'AC11'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'child native Plugins page; locale en',
      data: 'Fresh child; en; no curated bundles installed. Open Plugins and select fishball-recommended.',
      intent: 'show one child-native Fishball Recommended tab and the curated categories, preserving native tabs',
    },
    {
      id: 'TC-02', techniques: ['Use Case', 'EP'], ac: ['AC1', 'AC2', 'AC11'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'child native Plugins page; locale zh',
      data: 'Fresh child; zh; no curated bundles installed. Open Plugins and select fishball-recommended.',
      intent: 'show one Fishball 推荐 tab with the same stable id and localized curated structure',
    },
    {
      id: 'TC-03', techniques: ['Use Case', 'EP', 'Decision Table R1'], ac: ['AC1', 'AC11'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'main native Plugins page',
      data: 'V2 connector and instance present in disposable main. Open main Plugins in en, then zh.',
      intent: 'keep fishball-recommended absent from main DSH without changing its native tabs',
    },
    {
      id: 'TC-04', techniques: ['Use Case', 'State Transition'], ac: ['AC3', 'AC4', 'AC5'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'child recommendation Install -> native confirmation/result',
      data: 'dsh-idle-compact absent in both profiles; approved local pack. Invoke Install and explicitly confirm the native target/version.',
      intent: 'install through the native child flow, show actual Installed state, leave main unchanged and run no model turn',
    },
    {
      id: 'TC-05', techniques: ['Use Case', 'EP', 'Decision Table R3'], ac: ['AC3'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'child recommendation row',
      data: 'dsh-idle-compact present and enabled in child; main absent. Open recommendation tab.',
      intent: 'show Installed without an Install or legacy On in Fishball action when child bundle is enabled',
    },
    {
      id: 'TC-06', techniques: ['Use Case', 'EP', 'Decision Table R3'], ac: ['AC3'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'child recommendation row after native disable',
      data: 'dsh-idle-compact present but disabled using child native Installed controls. Revisit recommendation tab.',
      intent: 'keep Installed for a disabled child bundle without offering legacy Turn on for Fishball',
    },
    {
      id: 'TC-07', techniques: ['Use Case', 'EP', 'Decision Table R2'], ac: ['AC3', 'AC4'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'child row with main-only installation',
      data: 'dsh-idle-compact present in main only; child absent. Invoke child Install with approved local pack.',
      intent: 'offer native Install for main-only presence and target child without mutating main',
    },
    {
      id: 'TC-08', techniques: ['Use Case', 'EP', 'State Transition'], ac: ['AC4', 'AC5'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'native install check from recommendation row',
      data: 'Child bundle absent; local native check fixture rejects before package application.',
      intent: 'display native check failure and actual absent state without Fishball retry, rollback or model turn',
    },
    {
      id: 'TC-09', techniques: ['Use Case', 'EP', 'State Transition'], ac: ['AC5'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'native package operation result',
      data: 'Confirmed local fixture produces failed package outcome; native reconciliation reports child bundle absent.',
      intent: 'retain native package failure with Install for actual absence, adding no Fishball recovery protocol',
    },
    {
      id: 'TC-10', techniques: ['Use Case', 'EP', 'State Transition'], ac: ['AC3', 'AC5'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'native application/publication failure result',
      data: 'Native application fails after dependency remains; authoritative native child listing reports bundle present.',
      intent: 'retain the native failure and show Installed for present remainder rather than infer absence from failure',
    },
    {
      id: 'TC-11', techniques: ['Use Case', 'EP', 'State Transition'], ac: ['AC5', 'AC6'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'native cancel control at a cancellable stage',
      data: 'Start local install, cancel only where native flow offers Cancel, then observe native settlement and child inventory.',
      intent: 'honor native confirmed cancellation and actual inventory without promising rollback or cancellation during applying',
    },
    {
      id: 'TC-12', techniques: ['Use Case', 'EP', 'State Transition'], ac: ['AC5', 'AC6'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'native unresolved/lost-result flow',
      data: 'Approved native-flow fixture withholds final confirmation after response loss; no authoritative settlement yet.',
      intent: 'preserve native unknown or unconfirmed state, not claim success/cancellation or start a Fishball retry',
    },
    {
      id: 'TC-13', techniques: ['Use Case', 'BVA', 'State Transition'], ac: ['AC6'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'rapid recommendation Install actions',
      data: 'Local fixture remains native pending/unconfirmed; perform zero, one, then two rapid UI invocations in separate runs.',
      intent: 'delegate repeated-action blocking and dedup to native pending semantics without a competing Fishball operation',
    },
    {
      id: 'TC-14', techniques: ['Use Case', 'State Transition'], ac: ['AC10', 'AC11'],
      owners: ['BROWSER'], after: ['LITE', 'SET', 'RP', 'INTEGRATE'], entrypoint: 'explicit child Fishball/Settings/Plugins navigation',
      data: 'From Fishball use allowed Settings, Plugins and recommendation tab, then explicit Fishball return; repeat in en and zh.',
      intent: 'preserve native Settings and Plugins access and explicit return to the same Fishball without another session',
    },
    {
      id: 'TC-15', techniques: ['Use Case', 'EP'], ac: ['AC8'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'meow-memory row; locale en',
      data: 'en; Memory category; meow-memory absent and then present through native fixture inventory.',
      intent: 'show a nonempty English optional-external-memory note explaining no built-in V2 memory and no board link',
    },
    {
      id: 'TC-16', techniques: ['Use Case', 'EP'], ac: ['AC8'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'meow-memory row; locale zh',
      data: 'zh; Memory category; meow-memory absent and then present through native fixture inventory.',
      intent: 'show a nonempty Chinese optional-external-memory note with the same semantics and no board link',
    },
    {
      id: 'TC-17', techniques: ['Use Case', 'EP'], ac: ['AC2', 'AC8'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'curated category headings, highlights and Pet empty note',
      data: 'en then zh; fixed curated list has Context/Memory/Channel/Pet with 3/3/4/0 entries.',
      intent: 'render empty Pet note and approved highlights without stale no-browser-part claims or V3-dependent promises',
    },
    {
      id: 'TC-18', techniques: ['Use Case', 'State Transition'], ac: ['AC3', 'AC5'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'child native Installed controls -> recommendation revisit',
      data: 'Child dsh-idle-compact installed. Disable, remove via native UI, revisit; explicitly reinstall from recommendation.',
      intent: 'follow actual child presence across disable, removal and explicit reinstall without changing main',
    },
    {
      id: 'TC-19', techniques: ['Use Case', 'State Transition'], ac: ['AC5', 'AC7'],
      owners: ['BROWSER'], after: ['RP', 'INTEGRATE'], entrypoint: 'child document disposal/reload during native install',
      data: 'Local native operation pending. Leave or reload child view to dispose old client, allow native completion, reopen current view.',
      intent: 'allow native install to finish while disposed views stay inactive and reopened view shows current native inventory',
    },
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
      owners: ['BOUNDARY', 'INTEGRATE'], after: ['RP'], entrypoint: 'fresh V2 release artifact, initial profile and loader composition',
      data: 'Fresh/V2-only child; no manual recommendation Install. Inspect payloads, placement, enablement and startup dependencies.',
      intent: 'keep recommendations opt-in with no standalone recommendation package, deferred board/Watchdog/fold-notify payloads or startup dependencies',
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

// All product execution is forbidden in T-RP. A TODO has no callback and cannot
// accidentally pass by comparing this requirements catalogue to itself.
export function registerRecommendationCases(sdk) {
  const data = RECOMMENDATION_TEST_DATA;
  for (const caseData of data.cases) {
    test.todo([
      data.feature,
      caseData.id,
      data.title.sdk + sdk,
      data.title.owners + caseData.owners.join(data.title.ownerSeparator),
      caseData.intent,
    ].join(data.title.separator));
  }
}
