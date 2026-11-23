/**
 * Multi-step, multi-page first-run onboarding for the hosted Fishball instance.
 *
 * Mounted into `dsh-connector-ui`'s portal view through the generic `dshConnectorUiPortal`
 * client service (`registerGate`): `dsh-connector-ui` owns no onboarding state or UI.
 *
 * Trigger & flow:
 * - On portal open, reads `GET api/dsh-instance/onboarding/state`. If onboarding was already
 *   completed/skipped or Fishball's model was already configured before onboarding started,
 *   the gate immediately yields to `renderFrame()`.
 * - While the child is starting/warming up (`needed === null`), waits cleanly (with a Skip escape
 *   hatch) unless the child is `failed`, `disabled`, or `stopped` (in which case it yields to
 *   `renderFrame()` so DSH's normal error/Retry view is never blocked).
 * - When `needed === true`, walks the user through four skippable pages:
 *   1. Fishball model: one-click sync of main DSH providers into Fishball (`models/check` +
 *      `models/add`), then pick the model Fishball uses (`POST onboarding/model`);
 *   2. Watchdog model: inline model selector writing `dsh-connector-watchdog`'s `model` field
 *      via `configForms` when loaded, or a friendly note when unavailable;
 *   3. Memory plugins: shows curated memory-category recommended plugins (`fishballKit`) with
 *      live installed state and the shared Fishball install dialog;
 *   4. Warm welcome: recaps what was configured and starts Fishball (`POST onboarding/complete`).
 */
window.__ModuleLoader__.load({
  id: 'dsh-instance',
  chunk: 'client.onboarding.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const {
      Button, StateDot, Tag, IconChevronRightOutlineRegular, IconRefreshOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const FEATURE = Object.freeze({
      name: 'dsh-instance-onboarding',
      ns: 'dshInstanceOnboarding',
      styleId: 'dsh-instance-onboarding-style',
      portalService: 'dshConnectorUiPortal',
      portalVersion: 1,
      remoteSession: 'remote.session',
      settingsSchema: 'settingsSchema',
      pluginNavigation: 'pluginNavigation',
      watchdogNs: 'dsh-connector-watchdog',
      watchdogField: 'model',
      pluginsPanelId: 'plugins',
      layoutService: 'layout',
    })

    const API = Object.freeze({
      state: 'api/dsh-instance/onboarding/state',
      model: 'api/dsh-instance/onboarding/model',
      complete: 'api/dsh-instance/onboarding/complete',
      read: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      post: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }) }),
      unreadable: 'request-failed',
      pollMs: 1000,
    })

    const OUTCOME = Object.freeze({ completed: 'completed', skipped: 'skipped' })
    const GATE = Object.freeze({ loading: 'loading', waiting: 'waiting', active: 'active', done: 'done' })
    const BLOCKED_CHILD_STATES = Object.freeze(['failed', 'disabled', 'stopped'])
    const READY_STATE = 'ready'

    const STEP = Object.freeze({
      fishballModel: 'fishball-model',
      watchdog: 'watchdog',
      memory: 'memory',
      welcome: 'welcome',
    })
    const STEPS = Object.freeze([STEP.fishballModel, STEP.watchdog, STEP.memory, STEP.welcome])
    const STEP_STATE = Object.freeze({ done: 'done', current: 'current', upcoming: 'upcoming' })
    const WATCHDOG_STATE = Object.freeze({ loading: 'loading', missing: 'missing', unsupported: 'unsupported', ready: 'ready' })
    const SEP = Object.freeze({ reason: ' — ', list: ', ' })

    const MODEL = Object.freeze({
      unset: '',
      effortless: null,
      providerField: 'provider',
      modelField: 'model',
      effortField: 'reasoningEffort',
      routeSeparator: ' / ',
      catalog: Object.freeze({ loading: 'loading', ready: 'ready', failed: 'failed' }),
      configReady: 'ready',
      configUnavailable: 'unavailable',
      schemaObject: 'object',
      schemaString: 'string',
    })

    const SYNC = Object.freeze({
      idle: 'idle',
      syncing: 'syncing',
      done: 'done',
      error: 'error',
    })

    const STATE_DOT = Object.freeze({ ongoing: 'ongoing', done: 'done', error: 'error', idle: 'idle' })
    const TONE = Object.freeze({ info: 'info', outline: 'outline' })
    const ICON_PX = Object.freeze({ header: 18, button: 14, welcome: 34, dot: 8, spinner: 18 })

    /** Stable singleton snapshot for `useSyncExternalStore` fallbacks (Object.is-identical across renders). */
    const EMPTY_SNAPSHOT = Object.freeze({})
    const EMPTY_STORE = Object.freeze({ subscribe: () => () => {}, getSnapshot: () => EMPTY_SNAPSHOT })

    const FISH_MARK = Object.freeze({
      viewBox: '0 0 24 24',
      body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
      eye: 'M14.6 7.4 h2 v2 h-2 Z',
      accent: '#EC0A6E',
    })

    const CLS = Object.freeze({
      root: 'fb-onb',
      header: 'fb-onb-header',
      titleGroup: 'fb-onb-title-group',
      title: 'fb-onb-title',
      headerActions: 'fb-onb-header-actions',
      scroll: 'fb-onb-scroll',
      shell: 'fb-onb-shell',
      stepper: 'fb-onb-stepper',
      stepItem: 'fb-onb-step',
      stepNum: 'fb-onb-step-num',
      stepLabel: 'fb-onb-step-label',
      card: 'fb-onb-card',
      pageHead: 'fb-onb-page-head',
      heading: 'fb-onb-heading',
      lead: 'fb-onb-lead',
      section: 'fb-onb-section',
      sectionHead: 'fb-onb-section-head',
      sectionTitle: 'fb-onb-section-title',
      hint: 'fb-onb-hint',
      status: 'fb-onb-status',
      tagRow: 'fb-onb-tag-row',
      error: 'fb-onb-error',
      callout: 'fb-onb-callout',
      groups: 'fb-onb-groups',
      group: 'fb-onb-group',
      groupTitle: 'fb-onb-group-title',
      modelList: 'fb-onb-model-list',
      modelChoice: 'fb-onb-model-choice',
      modelChoiceSelected: 'fb-onb-model-choice-selected',
      modelName: 'fb-onb-model-name',
      modelMeta: 'fb-onb-model-meta',
      select: 'fb-onb-select',
      pluginList: 'fb-onb-plugin-list',
      pluginRow: 'fb-onb-plugin-row',
      pluginMain: 'fb-onb-plugin-main',
      pluginName: 'fb-onb-plugin-name',
      pluginActions: 'fb-onb-plugin-actions',
      link: 'fb-onb-link',
      welcome: 'fb-onb-welcome',
      welcomeBadge: 'fb-onb-welcome-badge',
      welcomeTitle: 'fb-onb-welcome-title',
      welcomeText: 'fb-onb-welcome-text',
      summary: 'fb-onb-summary',
      summaryRow: 'fb-onb-summary-row',
      summaryKey: 'fb-onb-summary-key',
      summaryVal: 'fb-onb-summary-val',
      footer: 'fb-onb-footer',
      footerRight: 'fb-onb-footer-right',
      center: 'fb-onb-center',
      details: 'fb-onb-details',
      notOfferedList: 'fb-onb-not-offered',
    })

    const CSS_TOKENS = Object.freeze({
      headerMinHeight: '52px',
      headerPadding: '10px 28px',
      headerStart: '20px',
      shellMaxWidth: '640px',
      cardPadding: '24px',
      listMaxHeight: 'min(280px, 40vh)',
      selectHeight: '36px',
      welcomeBadgePx: '72px',
    })

    const css = [
      `.${CLS.root}{display:flex;flex-direction:column;flex:1;width:100%;height:100%;min-width:0;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:1.5}`,
      `.${CLS.header}{box-sizing:border-box;flex:none;display:flex;align-items:center;gap:8px;min-height:${CSS_TOKENS.headerMinHeight};padding:${CSS_TOKENS.headerPadding};padding-inline-start:max(${CSS_TOKENS.headerStart}, var(--dsh-frame-leading-clearance,0px));border-bottom:.5px solid var(--dsw-alias-border-l3)}`,
      `.${CLS.titleGroup}{display:inline-flex;align-items:center;gap:8px;min-width:0}`,
      `.${CLS.title}{font-size:14px;line-height:20px;font-weight:500;white-space:nowrap}`,
      `.${CLS.headerActions}{display:flex;align-items:center;gap:8px;margin-inline-start:auto;-webkit-app-region:no-drag}`,
      `.${CLS.scroll}{flex:1;min-height:0;overflow:auto;padding:28px 20px 36px;display:flex;justify-content:center;align-items:flex-start}`,
      `.${CLS.shell}{width:100%;max-width:${CSS_TOKENS.shellMaxWidth};display:grid;gap:20px}`,
      `.${CLS.stepper}{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;list-style:none;margin:0;padding:0}`,
      `.${CLS.stepItem}{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);font-size:12px;min-width:0}`,
      `.${CLS.stepItem}[data-step-state="${STEP_STATE.current}"]{border-color:color-mix(in srgb, var(--fb-accent,${FISH_MARK.accent}) 55%, var(--dsw-alias-border-l3));color:var(--dsw-alias-label-primary);font-weight:500}`,
      `.${CLS.stepItem}[data-step-state="${STEP_STATE.done}"]{color:var(--dsw-alias-label-secondary)}`,
      `.${CLS.stepNum}{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:600;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}`,
      `.${CLS.stepItem}[data-step-state="${STEP_STATE.current}"] .${CLS.stepNum}{background:var(--fb-accent,${FISH_MARK.accent});color:#fff}`,
      `.${CLS.stepItem}[data-step-state="${STEP_STATE.done}"] .${CLS.stepNum}{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);color:var(--dsw-alias-state-success-primary)}`,
      `.${CLS.stepLabel}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
      `.${CLS.card}{display:grid;gap:20px;padding:${CSS_TOKENS.cardPadding};border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}`,
      `.${CLS.pageHead}{display:grid;gap:6px}`,
      `.${CLS.heading}{margin:0;font-size:18px;line-height:26px;font-weight:600;color:var(--dsw-alias-label-primary)}`,
      `.${CLS.lead}{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}`,
      `.${CLS.section}{display:grid;gap:10px}`,
      `.${CLS.sectionHead}{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}`,
      `.${CLS.sectionTitle}{margin:0;font:var(--dsw-font-s-strong-14);color:var(--dsw-alias-label-primary)}`,
      `.${CLS.hint}{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.status}{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}`,
      `.${CLS.tagRow}{display:inline-flex;align-items:center;gap:6px;color:inherit}`,
      `.${CLS.error}{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}`,
      `.${CLS.callout}{display:grid;gap:6px;padding:12px 14px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}`,
      `.${CLS.groups}{display:grid;gap:12px;max-height:${CSS_TOKENS.listMaxHeight};overflow-y:auto;padding:2px}`,
      `.${CLS.group}{display:grid;gap:4px}`,
      `.${CLS.groupTitle}{margin:0;padding:0 4px;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.modelList}{display:grid;gap:2px;margin:0;padding:4px;list-style:none;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-base));box-shadow:inset 0 0 0 .5px var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l3))}`,
      `.${CLS.modelChoice}{width:100%;justify-content:flex-start;gap:8px;font:var(--dsw-font-xs-13)}`,
      `.${CLS.modelChoiceSelected}{background:color-mix(in srgb, var(--fb-accent,${FISH_MARK.accent}) 10%, transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb, var(--fb-accent,${FISH_MARK.accent}) 45%, transparent)}`,
      `.${CLS.modelName}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:start}`,
      `.${CLS.modelMeta}{display:inline-flex;align-items:center;gap:6px;margin-inline-start:auto;flex-shrink:0}`,
      `.${CLS.select}{box-sizing:border-box;width:100%;height:${CSS_TOKENS.selectHeight};padding:0 12px;border:.5px solid var(--dsw-alias-border-l4,var(--dsw-alias-border-l3));border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-primary)}`,
      `.${CLS.pluginList}{display:grid;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-base);overflow:hidden}`,
      `.${CLS.pluginRow}{display:flex;align-items:center;gap:12px;padding:12px 14px}`,
      `.${CLS.pluginRow}+.${CLS.pluginRow}{border-top:.5px solid var(--dsw-alias-border-l2)}`,
      `.${CLS.pluginMain}{flex:1;min-width:0;display:grid;gap:3px}`,
      `.${CLS.pluginName}{font-family:var(--dsw-font-markdown-code-font-family);font-weight:500;overflow-wrap:anywhere}`,
      `.${CLS.pluginActions}{display:flex;align-items:center;gap:8px;flex-shrink:0}`,
      `.${CLS.link}{color:var(--dsw-alias-link,var(--fb-accent,${FISH_MARK.accent}));font-size:12px;text-decoration:none;justify-self:start}`,
      `.${CLS.welcome}{display:grid;justify-items:center;text-align:center;gap:14px;padding:12px 4px 4px}`,
      `.${CLS.welcomeBadge}{display:inline-flex;align-items:center;justify-content:center;width:${CSS_TOKENS.welcomeBadgePx};height:${CSS_TOKENS.welcomeBadgePx};border-radius:50%;background:radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--fb-accent,${FISH_MARK.accent}) 22%, transparent), color-mix(in srgb, var(--fb-accent,${FISH_MARK.accent}) 8%, var(--dsw-alias-bg-module-platform)));box-shadow:0 0 0 1px color-mix(in srgb, var(--fb-accent,${FISH_MARK.accent}) 28%, transparent);color:var(--dsw-alias-label-primary)}`,
      `.${CLS.welcomeTitle}{margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary)}`,
      `.${CLS.welcomeText}{margin:0;max-width:460px;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary)}`,
      `.${CLS.summary}{width:100%;display:grid;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-base);text-align:start;overflow:hidden}`,
      `.${CLS.summaryRow}{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;font-size:12px}`,
      `.${CLS.summaryRow}+.${CLS.summaryRow}{border-top:.5px solid var(--dsw-alias-border-l2)}`,
      `.${CLS.summaryKey}{color:var(--dsw-alias-label-tertiary);flex-shrink:0}`,
      `.${CLS.summaryVal}{color:var(--dsw-alias-label-primary);font-weight:500;text-align:end;overflow-wrap:anywhere}`,
      `.${CLS.footer}{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-top:4px;border-top:.5px solid var(--dsw-alias-border-l2)}`,
      `.${CLS.footerRight}{display:flex;align-items:center;gap:8px;margin-inline-start:auto}`,
      `.${CLS.center}{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 20px;text-align:center;color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.details}{font-size:12px;color:var(--dsw-alias-label-tertiary)}`,
      `.${CLS.notOfferedList}{margin:6px 0 0;padding-inline-start:18px;display:grid;gap:4px}`,
    ].join('')

    const en = {
      defaultTitle: 'Fishball',
      preparing: 'Preparing Fishball…',
      skipAll: 'Skip setup',
      back: 'Back',
      next: 'Next',
      skipStep: 'Skip for now',
      'step.fishball-model': 'Fishball Model',
      'step.watchdog': 'Watchdog',
      'step.memory': 'Memory Plugin',
      'step.welcome': 'Welcome',
      'model.title': 'Set up Fishball\'s model',
      'model.lead': 'Fishball runs in its own private DSH instance. Sync your model providers from this DSH to Fishball, then pick the model Fishball should use.',
      'model.syncSection': '1. Sync providers to Fishball',
      'model.syncButton': 'Sync models from DSH',
      'model.syncing': 'Syncing models…',
      'model.syncDoneAdded': 'Synced {count} provider(s) to Fishball.',
      'model.syncDoneAlready': 'Providers are already up to date ({count} available in Fishball).',
      'model.syncDoneEmpty': 'No API-key providers were found to sync from this DSH. Add a provider in DSH Settings → Models, or log in inside Fishball later.',
      'model.syncPartialFailed': '{count} provider(s) could not be synced.',
      'model.syncNotOffered': 'Not synced automatically ({count})',
      'model.syncNotReady': 'Waiting for Fishball to finish starting…',
      'model.syncFailed': 'Could not sync models ({code}).',
      'model.pickSection': '2. Choose Fishball\'s model',
      'model.refresh': 'Refresh models',
      'model.selected': 'Selected',
      'model.saved': 'Fishball model set to {model}.',
      'model.saveFailed': 'Could not save the selected model. Please try again.',
      'model.empty': 'No models are available in Fishball yet. Click "Sync models from DSH" above, or configure a model in DSH Settings first.',
      'model.effort': '{model} · {effort}',
      'watchdog.title': 'Configure Watchdog model',
      'watchdog.lead': 'Watchdog supervises sessions you hand over to Fishball and can automatically handle in-scope permission approvals using its own dedicated model.',
      'watchdog.label': 'Watchdog model',
      'watchdog.disabled': 'Disabled (no model selected)',
      'watchdog.tip': 'A fast, lightweight model works great for Watchdog checks. You can change or disable this anytime in Plugins → dsh-connector-amenities.',
      'watchdog.checking': 'Checking Watchdog status…',
      'watchdog.loading': 'Loading models from this DSH…',
      'watchdog.none': 'No models are configured in this DSH yet.',
      'watchdog.failed': 'Could not read available models from this DSH.',
      'watchdog.saved': 'Watchdog model saved.',
      'watchdog.saveFailed': 'Could not save the Watchdog model. Please try again.',
      'watchdog.missing': 'Watchdog (dsh-connector-watchdog) is not installed or active in this DSH yet.',
      'watchdog.missingHint': 'You can continue without it now, or install dsh-connector-amenities from Plugins whenever you want Watchdog supervision.',
      'watchdog.schemaOld': 'The currently loaded Watchdog version does not expose a dedicated model setting yet. You can skip this step and configure it once updated.',
      'watchdog.openPlugins': 'Open Plugins',
      'memory.title': 'Add a memory plugin (recommended)',
      'memory.lead': 'Fishball does not ship with built-in long-term memory. Installing one memory plugin lets Fishball remember your preferences, project conventions, and past context across sessions.',
      'memory.installed': 'Installed',
      'memory.install': 'Install',
      'memory.source': 'Source',
      'memory.readyNote': 'Nice! Fishball has a memory plugin installed ({names}).',
      'memory.skipNote': 'Installing a plugin restarts Fishball automatically in the background. You can also skip this step and install one later in Plugins → Fishball.',
      'memory.loading': 'Checking installed Fishball plugins…',
      'memory.loadFailed': 'Could not check installed Fishball plugins right now.',
      'welcome.title': 'Welcome to Fishball',
      'welcome.body': 'Everything is ready for you. Hand over any session whenever you want an extra pair of hands, and Fishball will keep watch, coordinate tasks, and nudge you only when it truly needs you.',
      'welcome.start': 'Start using Fishball',
      'welcome.starting': 'Opening Fishball…',
      'welcome.summaryFishball': 'Fishball model',
      'welcome.summaryWatchdog': 'Watchdog model',
      'welcome.summaryMemory': 'Memory plugin',
      'welcome.notSet': 'Not configured yet (can be set later)',
      'welcome.notInstalled': 'None installed yet (optional)',
    }

    const zh = {
      defaultTitle: 'Fishball',
      preparing: '正在准备 Fishball…',
      skipAll: '跳过引导',
      back: '上一步',
      next: '下一步',
      skipStep: '暂不配置',
      'step.fishball-model': 'Fishball 模型',
      'step.watchdog': 'Watchdog 模型',
      'step.memory': '记忆插件',
      'step.welcome': '开始使用',
      'model.title': '配置 Fishball 模型',
      'model.lead': 'Fishball 运行在独立的私有 DSH 子实例中。先一键把当前 DSH 的模型提供商同步过去，再选择 Fishball 要使用的模型。',
      'model.syncSection': '1. 同步模型到 Fishball',
      'model.syncButton': '从当前 DSH 同步模型',
      'model.syncing': '正在同步模型…',
      'model.syncDoneAdded': '已同步 {count} 个模型提供商到 Fishball。',
      'model.syncDoneAlready': '模型提供商已同步（Fishball 中已有 {count} 个可用）。',
      'model.syncDoneEmpty': '当前 DSH 中没有可同步的 API Key 提供商。请先在 DSH 设置 → 模型中添加，或稍后在 Fishball 内登录。',
      'model.syncPartialFailed': '有 {count} 个提供商未能同步。',
      'model.syncNotOffered': '未自动同步（{count} 个）',
      'model.syncNotReady': '正在等待 Fishball 启动完成…',
      'model.syncFailed': '同步模型失败（{code}）。',
      'model.pickSection': '2. 选择 Fishball 模型',
      'model.refresh': '刷新模型列表',
      'model.selected': '已选择',
      'model.saved': '已将 Fishball 模型设为 {model}。',
      'model.saveFailed': '未能保存所选模型，请重试。',
      'model.empty': 'Fishball 中暂时还没有可用模型。请点击上方“从当前 DSH 同步模型”，或先在 DSH 设置中配置模型。',
      'model.effort': '{model} · {effort}',
      'watchdog.title': '配置 Watchdog 模型',
      'watchdog.lead': 'Watchdog 会在后台监督交由 Fishball 托管的会话，并使用独立模型自动判断并处理授权范围内的权限请求。',
      'watchdog.label': 'Watchdog 模型',
      'watchdog.disabled': '未配置（暂不启用 Watchdog）',
      'watchdog.tip': '建议为 Watchdog 选择响应较快、性价比高的模型。之后随时可在“插件 → dsh-connector-amenities”中修改或停用。',
      'watchdog.checking': '正在检查 Watchdog 状态…',
      'watchdog.loading': '正在读取当前 DSH 的可用模型…',
      'watchdog.none': '当前 DSH 还没有配置模型。',
      'watchdog.failed': '无法读取当前 DSH 的可用模型。',
      'watchdog.saved': 'Watchdog 模型已保存。',
      'watchdog.saveFailed': '未能保存 Watchdog 模型，请重试。',
      'watchdog.missing': '当前 DSH 尚未安装或启用 Watchdog（dsh-connector-watchdog）。',
      'watchdog.missingHint': '你可以先跳过此步，之后需要自动巡查与权限审批时，在插件页安装 dsh-connector-amenities 即可。',
      'watchdog.schemaOld': '当前加载的 Watchdog 版本尚未包含独立模型配置项。你可以先跳过此步，更新后再来配置。',
      'watchdog.openPlugins': '打开插件页',
      'memory.title': '推荐配置一个记忆插件',
      'memory.lead': 'Fishball 本身不内置长期记忆。建议安装一个记忆类插件，让 Fishball 在跨会话协作中记住你的偏好、项目背景与重要约定。',
      'memory.installed': '已安装',
      'memory.install': '安装',
      'memory.source': '来源',
      'memory.readyNote': '太棒了！已为 Fishball 安装记忆插件（{names}）。',
      'memory.skipNote': '安装插件后 Fishball 会在后台自动重启加载。你也可以先跳过，随时在“插件 → Fishball”中安装。',
      'memory.loading': '正在检查 Fishball 已安装的插件…',
      'memory.loadFailed': '暂时无法读取 Fishball 已安装的插件列表。',
      'welcome.title': '欢迎来到 Fishball',
      'welcome.body': '一切都已为你准备妥当。随时把需要推进的会话交给 Fishball，它会默默帮你盯住进度、理顺任务，只在真正需要你拍板时轻轻提醒你。',
      'welcome.start': '开始使用 Fishball',
      'welcome.starting': '正在进入 Fishball…',
      'welcome.summaryFishball': 'Fishball 模型',
      'welcome.summaryWatchdog': 'Watchdog 模型',
      'welcome.summaryMemory': '记忆插件',
      'welcome.notSet': '暂未配置（进入后可随时设置）',
      'welcome.notInstalled': '暂未安装（可选）',
    }

    function FishMark({ size }) {
      return h('svg', { width: size, height: size, viewBox: FISH_MARK.viewBox, 'aria-hidden': true },
        h('path', { d: FISH_MARK.body, fill: 'currentColor' }),
        h('path', { d: FISH_MARK.eye, fill: FISH_MARK.accent }))
    }

    /** Shared portal header drawn for both the preparing screen and the active wizard. */
    function PortalHeader({ title, skipLabel, skipDisabled, onSkip }) {
      return h('header', { className: CLS.header, 'data-window-drag': true },
        h('span', { className: CLS.titleGroup },
          h(FishMark, { size: ICON_PX.header }),
          h('span', { className: CLS.title }, title)),
        onSkip
          ? h('div', { className: CLS.headerActions },
            h(Button, {
              type: 'button', size: 'sm', variant: 'ghost', disabled: skipDisabled,
              'data-onboarding-skip-all': true,
              onClick: onSkip,
            }, skipLabel))
          : null)
    }

    async function readJson(path, init, signal) {
      try {
        const response = await fetch(new URL(path, document.baseURI).toString(), signal === undefined ? init : { ...init, signal })
        const value = await response.json()
        if (typeof value?.ok === 'boolean') return value
      } catch { /* unreachable, aborted, or unreadable */ }
      return { ok: false, code: API.unreadable }
    }

    const fetchOnboardingState = (signal) => readJson(API.state, API.read, signal)
    const postOnboarding = (path, payload, signal) => readJson(path, { ...API.post, body: JSON.stringify(payload ?? {}) }, signal)

    const normalizeSelection = (value) => {
      if (value === null || typeof value !== 'object') return null
      const provider = typeof value[MODEL.providerField] === 'string' ? value[MODEL.providerField].trim() : ''
      const model = typeof value[MODEL.modelField] === 'string' ? value[MODEL.modelField].trim() : ''
      if (provider === '' || model === '') return null
      const effort = typeof value[MODEL.effortField] === 'string' ? value[MODEL.effortField].trim() : ''
      return effort === '' ? { provider, model } : { provider, model, reasoningEffort: effort }
    }

    const selectionKey = (selection) => (selection === null ? MODEL.unset
      : JSON.stringify([selection.provider, selection.model, selection.reasoningEffort ?? MODEL.effortless]))

    const sameSelection = (a, b) => a !== null && b !== null
      && a.provider === b.provider && a.model === b.model && (a.reasoningEffort ?? null) === (b.reasoningEffort ?? null)

    function formatSelectionLabel(selection, catalog, t) {
      if (selection === null) return null
      for (const group of catalog?.groups ?? []) {
        if (group.id !== selection.provider) continue
        for (const entry of group.models ?? []) {
          if (entry.id !== selection.model) continue
          const base = group.name + MODEL.routeSeparator + entry.name
          if (!selection.reasoningEffort) return base
          const effort = (entry.reasoning?.efforts ?? []).find((item) => item.id === selection.reasoningEffort)
          return t('model.effort', { model: base, effort: effort?.name ?? selection.reasoningEffort })
        }
      }
      const fallback = selection.provider + MODEL.routeSeparator + selection.model
      return selection.reasoningEffort ? t('model.effort', { model: fallback, effort: selection.reasoningEffort }) : fallback
    }

    function groupedChoices(catalog, t) {
      return (catalog?.groups ?? []).map((group) => ({
        id: group.id,
        name: group.name,
        choices: (group.models ?? []).flatMap((entry) => {
          const base = { provider: group.id, model: entry.id }
          const full = group.name + MODEL.routeSeparator + entry.name
          const efforts = entry.reasoning?.efforts ?? []
          const build = (selection, label, effort) => ({ key: selectionKey(selection), label, name: entry.name, effort, selection })
          return efforts.length === 0
            ? [build(base, full, null)]
            : efforts.map((effort) => build({ ...base, reasoningEffort: effort.id }, t('model.effort', { model: full, effort: effort.name }), effort.name))
        }),
      })).filter((group) => group.choices.length > 0)
    }

    /** Checks whether a node matches `{provider: string, model: string}` (rehydrated or serialized schemastery). */
    function isModelSchemaNode(node, refs) {
      const resolve = (entry) => (typeof entry === 'number' || typeof entry === 'string' ? refs?.[entry] : entry)
      const target = resolve(node)
      if (!target || target.type !== MODEL.schemaObject) return false
      const provider = resolve(target.dict?.[MODEL.providerField])
      const model = resolve(target.dict?.[MODEL.modelField])
      return provider?.type === MODEL.schemaString && model?.type === MODEL.schemaString
    }

    /** Checks whether a served schema object exposes a `{provider, model}` `model` field. */
    function hasWatchdogModelField(ctx, served) {
      if (served === undefined) return false
      const schemaService = ctx.get?.(FEATURE.settingsSchema)
      if (typeof schemaService?.rehydrate === 'function' && served.schema !== undefined) {
        try {
          const root = schemaService.rehydrate(served.schema)
          return isModelSchemaNode(root?.dict?.[FEATURE.watchdogField], undefined)
        } catch { /* fall through to raw schema inspection */ }
      }
      const raw = served.schema
      const rootNode = raw?.refs?.[raw?.uid] ?? raw
      return isModelSchemaNode(rootNode?.dict?.[FEATURE.watchdogField], raw?.refs)
    }

    /** Stable `useSyncExternalStore` subscription wrapper for a `{subscribe, getSnapshot}` source. */
    function useExternalStore(source) {
      const target = source ?? EMPTY_STORE
      const subscribe = React.useCallback((listener) => target.subscribe(listener), [target])
      const getSnapshot = React.useCallback(() => target.getSnapshot(), [target])
      return React.useSyncExternalStore(subscribe, getSnapshot)
    }

    /** Subscribes to Watchdog's served status & live `model` selection in the main DSH. */
    function useWatchdogModel(ctx) {
      const describe = React.useMemo(
        () => (typeof ctx.configForms?.describe === 'function' ? ctx.configForms.describe() : null),
        [ctx.configForms],
      )
      const mirrored = useExternalStore(describe)
      const scope = React.useMemo(
        () => (typeof ctx.configForms?.get === 'function' ? ctx.configForms.get(FEATURE.watchdogNs) : null),
        [ctx.configForms],
      )
      const snapshot = useExternalStore(scope)
      const describeLoading = describe !== null && mirrored?.view === undefined && snapshot?.status !== MODEL.configReady
      const served = Array.isArray(mirrored?.view?.namespaces)
        ? mirrored.view.namespaces.find((entry) => entry.ns === FEATURE.watchdogNs)
        : undefined
      const available = served !== undefined || (describe === null && snapshot?.status === MODEL.configReady)
      const supportsModel = served !== undefined ? hasWatchdogModelField(ctx, served) : available
      const saved = normalizeSelection(snapshot?.value?.[FEATURE.watchdogField])
      const writable = snapshot?.writable !== false && snapshot?.status !== MODEL.configUnavailable
      const state = describeLoading ? WATCHDOG_STATE.loading
        : !available ? WATCHDOG_STATE.missing
          : !supportsModel ? WATCHDOG_STATE.unsupported
            : WATCHDOG_STATE.ready
      return { state, saved, scope, writable }
    }

    function makeOnboardingGate({ ctx, t, statusT, fishballT, shared, syncKit, fishballKit }) {
      const memoryItems = fishballKit.recommended.filter((item) => item.category === fishballKit.category.memory)
      const inventory = fishballKit.getInventory(ctx.remote)
      // Once this browser session knows onboarding is finished, subsequent portal opens yield to
      // the frame synchronously with zero loading flash and zero background polling.
      let completedLocally = false

      /** Page 1: Sync models from DSH + choose Fishball's model. */
      function FishballModelStep({ childReady, canRefresh, model, catalog, onRefreshState, onModelSaved }) {
        const [syncView, setSyncView] = React.useState({ phase: SYNC.idle })
        const [savingKey, setSavingKey] = React.useState(null)
        const [saveState, setSaveState] = React.useState({ status: null, label: null })
        const [refreshing, setRefreshing] = React.useState(false)
        const mounted = React.useRef(true)
        React.useEffect(() => {
          mounted.current = true
          return () => { mounted.current = false }
        }, [])

        const reasonText = (code) => (syncKit.paths.reasons.includes(code) ? statusT('syncReason.' + code) : code)
        const syncErrorText = (code) => {
          if (code === syncKit.paths.busy) return statusT('sync.busy')
          if (syncKit.paths.restarted.includes(code)) return statusT('sync.restarted')
          return t('model.syncFailed', { code })
        }

        const handleSync = async () => {
          if (!childReady || syncView.phase === SYNC.syncing) return
          setSyncView({ phase: SYNC.syncing })
          const checked = await syncKit.request(syncKit.paths.check)
          if (!mounted.current) return
          if (!checked.ok) {
            setSyncView({ phase: SYNC.error, code: checked.error.code })
            return
          }
          const { checkId, missing, notOffered, present } = checked.result
          let addedCount = 0
          let failedCount = 0
          if (missing.length > 0) {
            const added = await syncKit.request(syncKit.paths.add, { checkId, ids: missing.map((entry) => entry.id) })
            if (!mounted.current) return
            if (!added.ok) {
              setSyncView({ phase: SYNC.error, code: added.error.code })
              return
            }
            addedCount = added.result.items.filter((item) => item.outcome === syncKit.paths.outcome.added).length
            failedCount = added.result.items.filter((item) => item.outcome === syncKit.paths.outcome.failed).length
          }
          setSyncView({ phase: SYNC.done, addedCount, failedCount, present: present + addedCount, notOffered })
          await onRefreshState()
        }

        const handlePick = async (choice) => {
          if (!childReady || savingKey !== null) return
          setSavingKey(choice.key)
          setSaveState({ status: null, label: null })
          const answer = await postOnboarding(API.model, choice.selection)
          if (!mounted.current) return
          setSavingKey(null)
          if (answer.ok) {
            const saved = normalizeSelection(answer.model) ?? choice.selection
            onModelSaved(saved)
            setSaveState({ status: STATE_DOT.done, label: choice.label })
          } else {
            setSaveState({ status: STATE_DOT.error, label: null })
          }
        }

        const handleRefresh = async () => {
          if (!canRefresh || refreshing) return
          setRefreshing(true)
          await onRefreshState()
          if (mounted.current) setRefreshing(false)
        }

        const groups = groupedChoices(catalog, t)
        const syncing = syncView.phase === SYNC.syncing
        const allFailed = syncView.phase === SYNC.done && syncView.addedCount === 0 && syncView.failedCount > 0

        return h(React.Fragment, null,
          h('div', { className: CLS.pageHead },
            h('h2', { className: CLS.heading }, t('model.title')),
            h('p', { className: CLS.lead }, t('model.lead'))),
          h('section', { className: CLS.section, 'data-onboarding-sync': syncView.phase },
            h('div', { className: CLS.sectionHead },
              h('h3', { className: CLS.sectionTitle }, t('model.syncSection')),
              h(Button, {
                type: 'button', size: 'sm', variant: 'primary',
                disabled: !childReady || syncing, 'aria-busy': syncing,
                'data-onboarding-sync-button': true,
                onClick: () => void handleSync(),
              }, syncing ? t('model.syncing') : t('model.syncButton'))),
            !childReady ? h('p', { className: CLS.status, role: 'status' }, h(StateDot, { state: STATE_DOT.ongoing, size: ICON_PX.dot }), t('model.syncNotReady')) : null,
            syncView.phase === SYNC.error ? h('p', { className: CLS.error, role: 'alert' }, h(StateDot, { state: STATE_DOT.error, size: ICON_PX.dot }), syncErrorText(syncView.code)) : null,
            syncView.phase === SYNC.done ? h('div', { className: CLS.callout, role: 'status' },
              allFailed
                ? h('p', { className: CLS.error }, h(StateDot, { state: STATE_DOT.error, size: ICON_PX.dot }), t('model.syncPartialFailed', { count: syncView.failedCount }))
                : h('p', { className: CLS.status },
                  h(StateDot, { state: syncView.failedCount > 0 ? STATE_DOT.error : STATE_DOT.done, size: ICON_PX.dot }),
                  syncView.addedCount > 0 ? t('model.syncDoneAdded', { count: syncView.addedCount })
                    : syncView.present > 0 ? t('model.syncDoneAlready', { count: syncView.present })
                      : t('model.syncDoneEmpty')),
              !allFailed && syncView.failedCount > 0 ? h('p', { className: CLS.error }, t('model.syncPartialFailed', { count: syncView.failedCount })) : null,
              syncView.notOffered.length > 0 ? h('details', { className: CLS.details },
                h('summary', null, t('model.syncNotOffered', { count: syncView.notOffered.length })),
                h('ul', { className: CLS.notOfferedList }, syncView.notOffered.map((entry) => h('li', { key: entry.id },
                  h('strong', null, entry.name), SEP.reason, reasonText(entry.reason))))) : null) : null),
          h('section', { className: CLS.section, 'data-onboarding-model-picker': true },
            h('div', { className: CLS.sectionHead },
              h('h3', { className: CLS.sectionTitle }, t('model.pickSection')),
              h(Button, {
                type: 'button', size: 'sm', variant: 'ghost',
                icon: h(IconRefreshOutlineRegular, { size: ICON_PX.button }),
                disabled: refreshing || !canRefresh,
                'data-onboarding-model-refresh': true,
                onClick: () => void handleRefresh(),
              }, t('model.refresh'))),
            groups.length === 0
              ? h('div', { className: CLS.callout, 'data-onboarding-model-empty': true }, h('p', { className: CLS.hint }, t('model.empty')))
              : h('div', { className: CLS.groups },
                groups.map((group) => h('div', { key: group.id, className: CLS.group },
                  h('p', { className: CLS.groupTitle }, group.name),
                  h('ul', { className: CLS.modelList },
                    group.choices.map((choice) => {
                      const selected = sameSelection(choice.selection, model)
                      return h('li', { key: choice.key },
                        h(Button, {
                          type: 'button', variant: 'ghost',
                          className: [CLS.modelChoice, selected ? CLS.modelChoiceSelected : ''].filter(Boolean).join(' '),
                          disabled: !childReady || savingKey !== null,
                          'aria-pressed': selected,
                          'aria-label': choice.label,
                          'data-onboarding-model-choice': choice.key,
                          onClick: () => void handlePick(choice),
                        },
                          h('span', { className: CLS.modelName }, choice.name),
                          choice.effort ? h(Tag, { tone: TONE.outline }, choice.effort) : null,
                          h('span', { className: CLS.modelMeta },
                            selected ? h(React.Fragment, null, h(StateDot, { state: STATE_DOT.done, size: ICON_PX.dot }), h(Tag, { tone: TONE.info }, t('model.selected')))
                              : h(IconChevronRightOutlineRegular, { size: ICON_PX.button }))))
                    }))))),
            saveState.status === STATE_DOT.done && saveState.label
              ? h('p', { className: CLS.status, role: 'status', 'data-onboarding-model-saved': true }, h(StateDot, { state: STATE_DOT.done, size: ICON_PX.dot }), t('model.saved', { model: saveState.label }))
              : null,
            saveState.status === STATE_DOT.error
              ? h('p', { className: CLS.error, role: 'alert' }, h(StateDot, { state: STATE_DOT.error, size: ICON_PX.dot }), t('model.saveFailed'))
              : null))
      }

      /** Page 2: Guide & inline model selector for Watchdog (`dsh-connector-watchdog.model`). */
      function WatchdogStep({ watchdog, mainCatalog }) {
        const [busy, setBusy] = React.useState(false)
        const [feedback, setFeedback] = React.useState(null)
        const selectId = React.useId()
        const mounted = React.useRef(true)
        React.useEffect(() => {
          mounted.current = true
          return () => { mounted.current = false }
        }, [])

        const choices = mainCatalog.status === MODEL.catalog.ready
          ? groupedChoices(mainCatalog.value, t).flatMap((group) => group.choices)
          : []
        const currentValue = selectionKey(watchdog.saved)

        const handlePick = async (value) => {
          if (busy || !watchdog.scope) return
          const choice = choices.find((entry) => entry.key === value)
          if (value !== MODEL.unset && choice === undefined) return
          setBusy(true)
          setFeedback(null)
          let accepted = false
          try {
            accepted = await (choice === undefined
              ? watchdog.scope.unset(FEATURE.watchdogField)
              : watchdog.scope.set(FEATURE.watchdogField, choice.selection))
          } catch { accepted = false }
          if (!mounted.current) return
          setBusy(false)
          setFeedback(accepted ? STATE_DOT.done : STATE_DOT.error)
        }

        const openPlugins = () => {
          const navigation = ctx.get?.(FEATURE.pluginNavigation)
          if (typeof navigation?.openList === 'function') navigation.openList()
          else ctx.get?.(FEATURE.layoutService)?.selectPanel?.(FEATURE.pluginsPanelId)
        }

        return h(React.Fragment, null,
          h('div', { className: CLS.pageHead },
            h('h2', { className: CLS.heading }, t('watchdog.title')),
            h('p', { className: CLS.lead }, t('watchdog.lead'))),
          watchdog.state === WATCHDOG_STATE.loading
            ? h('p', { className: CLS.status, role: 'status', 'data-onboarding-watchdog-state': WATCHDOG_STATE.loading },
              h(StateDot, { state: STATE_DOT.ongoing, size: ICON_PX.dot }), t('watchdog.checking'))
            : watchdog.state === WATCHDOG_STATE.missing
              ? h('div', { className: CLS.callout, 'data-onboarding-watchdog-state': WATCHDOG_STATE.missing },
                h('p', { className: CLS.status }, h(StateDot, { state: STATE_DOT.idle, size: ICON_PX.dot }), t('watchdog.missing')),
                h('p', { className: CLS.hint }, t('watchdog.missingHint')),
                h('div', null, h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: openPlugins }, t('watchdog.openPlugins'))))
              : watchdog.state === WATCHDOG_STATE.unsupported
                ? h('div', { className: CLS.callout, 'data-onboarding-watchdog-state': WATCHDOG_STATE.unsupported },
                  h('p', { className: CLS.status }, h(StateDot, { state: STATE_DOT.idle, size: ICON_PX.dot }), t('watchdog.schemaOld')))
                : h('section', { className: CLS.section, 'data-onboarding-watchdog-state': WATCHDOG_STATE.ready },
                  h('label', { className: CLS.sectionTitle, htmlFor: selectId }, t('watchdog.label')),
                  h('select', {
                    id: selectId,
                    className: CLS.select,
                    value: currentValue,
                    disabled: !watchdog.writable || busy,
                    'data-onboarding-watchdog-select': true,
                    onChange: (event) => void handlePick(event.target.value),
                  },
                    h('option', { value: MODEL.unset }, t('watchdog.disabled')),
                    watchdog.saved !== null && !choices.some((entry) => entry.key === currentValue)
                      ? h('option', { value: currentValue }, formatSelectionLabel(watchdog.saved, mainCatalog.value, t))
                      : null,
                    choices.map((choice) => h('option', { key: choice.key, value: choice.key }, choice.label))),
                  mainCatalog.status === MODEL.catalog.loading ? h('p', { className: CLS.hint, role: 'status' }, t('watchdog.loading'))
                    : mainCatalog.status === MODEL.catalog.failed ? h('p', { className: CLS.error, role: 'alert' }, t('watchdog.failed'))
                      : choices.length === 0 ? h('p', { className: CLS.hint }, t('watchdog.none'))
                        : null,
                  h('p', { className: CLS.hint }, t('watchdog.tip')),
                  feedback === STATE_DOT.done ? h('p', { className: CLS.status, role: 'status', 'data-onboarding-watchdog-saved': true }, h(StateDot, { state: STATE_DOT.done, size: ICON_PX.dot }), t('watchdog.saved')) : null,
                  feedback === STATE_DOT.error ? h('p', { className: CLS.error, role: 'alert' }, h(StateDot, { state: STATE_DOT.error, size: ICON_PX.dot }), t('watchdog.saveFailed')) : null))
      }

      /** Page 3: Recommended memory plugins with live install state and shared install dialog. */
      function MemoryStep({ childPlugins, installedMemoryNames }) {
        React.useEffect(() => { void inventory.refresh() }, [])
        const installedSet = new Set(installedMemoryNames)
        const loading = childPlugins.status === STATE_DOT.ongoing

        return h(React.Fragment, null,
          h('div', { className: CLS.pageHead },
            h('h2', { className: CLS.heading }, t('memory.title')),
            h('p', { className: CLS.lead }, t('memory.lead'))),
          loading
            ? h('p', { className: CLS.status, role: 'status' }, h(StateDot, { state: STATE_DOT.ongoing, size: ICON_PX.dot }), t('memory.loading'))
            : null,
          childPlugins.status === STATE_DOT.error
            ? h('p', { className: CLS.error, role: 'alert' }, h(StateDot, { state: STATE_DOT.error, size: ICON_PX.dot }), t('memory.loadFailed'))
            : null,
          h('div', { className: CLS.pluginList, 'data-onboarding-memory-list': true },
            memoryItems.map((item) => {
              const present = installedSet.has(item.packageName)
              return h('div', { key: item.packageName, className: CLS.pluginRow, 'data-onboarding-memory-item': item.packageName },
                h('div', { className: CLS.pluginMain },
                  h('span', { className: CLS.pluginName }, item.packageName),
                  item.noteKey ? h('span', { className: CLS.hint }, fishballT(item.noteKey)) : null,
                  h('a', { href: item.source, target: fishballKit.link.target, rel: fishballKit.link.rel, className: CLS.link }, t('memory.source'))),
                h('div', { className: CLS.pluginActions },
                  loading ? null
                    : present
                      ? h(Tag, { tone: TONE.info }, h('span', { className: CLS.tagRow }, h(StateDot, { state: STATE_DOT.done, size: ICON_PX.dot }), t('memory.installed')))
                      : h(Button, {
                        type: 'button', size: 'sm', variant: 'outline',
                        'data-onboarding-memory-install': item.packageName,
                        onClick: () => fishballKit.openDialog(item.spec),
                      }, t('memory.install'))))
            })),
          installedMemoryNames.length > 0
            ? h('div', { className: CLS.callout, role: 'status', 'data-onboarding-memory-ready': true },
              h('p', { className: CLS.status }, h(StateDot, { state: STATE_DOT.done, size: ICON_PX.dot }), t('memory.readyNote', { names: installedMemoryNames.join(SEP.list) })))
            : h('p', { className: CLS.hint }, t('memory.skipNote')))
      }

      /** Page 4: Warm welcome screen with concise setup summary and Start CTA. */
      function WelcomeStep({ fishballLabel, watchdogLabel, installedMemoryNames }) {
        return h('div', { className: CLS.welcome, 'data-onboarding-welcome': true },
          h('div', { className: CLS.welcomeBadge, 'aria-hidden': true }, h(FishMark, { size: ICON_PX.welcome })),
          h('h2', { className: CLS.welcomeTitle }, t('welcome.title')),
          h('p', { className: CLS.welcomeText }, t('welcome.body')),
          h('div', { className: CLS.summary },
            h('div', { className: CLS.summaryRow },
              h('span', { className: CLS.summaryKey }, t('welcome.summaryFishball')),
              h('span', { className: CLS.summaryVal }, fishballLabel ?? t('welcome.notSet'))),
            h('div', { className: CLS.summaryRow },
              h('span', { className: CLS.summaryKey }, t('welcome.summaryWatchdog')),
              h('span', { className: CLS.summaryVal }, watchdogLabel ?? t('welcome.notSet'))),
            h('div', { className: CLS.summaryRow },
              h('span', { className: CLS.summaryKey }, t('welcome.summaryMemory')),
              h('span', { className: CLS.summaryVal }, installedMemoryNames.length > 0 ? installedMemoryNames.join(SEP.list) : t('welcome.notInstalled')))))
      }

      /**
       * Active onboarding flow: owns status polling, Watchdog form subscription, child plugin list
       * and main catalog read ONLY while onboarding is checking or active. Once `onDone` fires,
       * this component unmounts so zero polls or subscriptions linger behind the live Fishball frame.
       */
      function OnboardingFlow({ title, renderFrame, onDone }) {
        useExternalStore(ctx.locale)
        const [instanceStatus] = shared.useInstanceStatus()
        const watchdog = useWatchdogModel(ctx)
        const childPlugins = fishballKit.useStore(inventory.child)

        const [gate, setGate] = React.useState({ status: GATE.loading, model: null, catalog: null, childReady: false })
        const activeRef = React.useRef(false)
        const mountedRef = React.useRef(true)
        const finishingRef = React.useRef(false)
        const [stepIndex, setStepIndex] = React.useState(0)
        const [finishing, setFinishing] = React.useState(false)
        const [mainCatalog, setMainCatalog] = React.useState({ status: MODEL.catalog.loading, value: null })

        React.useEffect(() => {
          mountedRef.current = true
          return () => { mountedRef.current = false }
        }, [])

        // Load main DSH's model catalog once onboarding becomes active (used by Watchdog & summary).
        React.useEffect(() => {
          if (gate.status !== GATE.active) return undefined
          let live = true
          Promise.resolve()
            .then(() => ctx.get?.(FEATURE.remoteSession)?.modelCatalog?.())
            .then((answer) => {
              if (!live) return
              setMainCatalog(answer?.ok === true ? { status: MODEL.catalog.ready, value: answer.value } : { status: MODEL.catalog.failed, value: null })
            }, () => {
              if (live) setMainCatalog({ status: MODEL.catalog.failed, value: null })
            })
          return () => { live = false }
        }, [gate.status])

        const refreshState = React.useCallback(async (signal) => {
          const answer = await fetchOnboardingState(signal)
          if (!mountedRef.current || signal?.aborted || finishingRef.current) return
          if (!answer.ok) {
            if (!activeRef.current) onDone(false)
            return
          }
          if (answer.completed || answer.needed === false) {
            onDone(true)
            return
          }
          if (answer.needed === true) {
            activeRef.current = true
            setGate({ status: GATE.active, model: answer.model ?? null, catalog: answer.catalog ?? null, childReady: Boolean(answer.childReady) })
            return
          }
          setGate((current) => (current.status === GATE.active
            ? { ...current, childReady: Boolean(answer.childReady) }
            : { status: GATE.waiting, model: null, catalog: answer.catalog ?? null, childReady: false }))
        }, [onDone])

        // Serialized, abortable polling while probing initial onboarding state (paused if the child is blocked).
        const blockedBeforeStart = gate.status !== GATE.active && BLOCKED_CHILD_STATES.includes(instanceStatus?.state)
        const probing = (gate.status === GATE.loading || gate.status === GATE.waiting) && !blockedBeforeStart
        React.useEffect(() => {
          if (!probing) return undefined
          const abort = new AbortController()
          let inFlight = false
          const probe = () => {
            if (inFlight || document.hidden || abort.signal.aborted) return
            inFlight = true
            void refreshState(abort.signal).finally(() => { inFlight = false })
          }
          probe()
          const timer = setInterval(probe, API.pollMs)
          return () => { clearInterval(timer); abort.abort() }
        }, [probing, refreshState])

        // Recover `gate.childReady` automatically after an in-wizard child restart (e.g., Step 3
        // memory plugin install) once `instanceStatus` returns to `ready`.
        const needsRecoveryProbe = gate.status === GATE.active && !gate.childReady && instanceStatus?.state === READY_STATE
        React.useEffect(() => {
          if (!needsRecoveryProbe) return undefined
          const abort = new AbortController()
          void refreshState(abort.signal)
          return () => abort.abort()
        }, [needsRecoveryProbe, refreshState])

        const finish = async (outcome) => {
          if (finishingRef.current) return
          finishingRef.current = true
          setFinishing(true)
          const res = await postOnboarding(API.complete, { outcome })
          if (!mountedRef.current) return
          finishingRef.current = false
          setFinishing(false)
          onDone(res.ok === true)
        }

        // Done, or child failed/disabled/stopped before onboarding started: never block normal recovery UI.
        if (gate.status === GATE.done || blockedBeforeStart) return renderFrame()

        const portalTitle = title || t('defaultTitle')

        if (gate.status !== GATE.active) {
          return h('section', { className: CLS.root, 'aria-label': portalTitle, 'data-fishball-onboarding': gate.status },
            h(PortalHeader, {
              title: portalTitle,
              skipLabel: t('skipAll'),
              skipDisabled: finishing,
              onSkip: () => void finish(OUTCOME.skipped),
            }),
            h('div', { className: CLS.center },
              h(StateDot, { state: STATE_DOT.ongoing, size: ICON_PX.spinner }),
              h('p', { role: 'status' }, t('preparing'))))
        }

        const currentStep = STEPS[stepIndex]
        const instanceIsReady = instanceStatus === undefined || instanceStatus.state === READY_STATE
        const childReady = gate.childReady && instanceIsReady
        const canRefresh = childReady || instanceStatus?.state === READY_STATE
        const installedMemoryNames = memoryItems
          .filter((item) => childPlugins.bundles.some((bundle) => bundle.name === item.packageName))
          .map((item) => item.packageName)

        const fishballLabel = formatSelectionLabel(gate.model, gate.catalog, t)
        const watchdogLabel = formatSelectionLabel(watchdog.saved, mainCatalog.value, t)

        const stepHasValue = currentStep === STEP.fishballModel ? gate.model !== null
          : currentStep === STEP.watchdog ? watchdog.saved !== null
            : currentStep === STEP.memory ? installedMemoryNames.length > 0
              : true

        const pageBody = currentStep === STEP.fishballModel
          ? h(FishballModelStep, {
            childReady,
            canRefresh,
            model: gate.model,
            catalog: gate.catalog,
            onRefreshState: () => refreshState(),
            onModelSaved: (saved) => setGate((current) => ({ ...current, model: saved })),
          })
          : currentStep === STEP.watchdog
            ? h(WatchdogStep, { watchdog, mainCatalog })
            : currentStep === STEP.memory
              ? h(MemoryStep, { childPlugins, installedMemoryNames })
              : h(WelcomeStep, { fishballLabel, watchdogLabel, installedMemoryNames })

        const lastStep = stepIndex === STEPS.length - 1

        return h('section', { className: CLS.root, 'aria-label': portalTitle, 'data-fishball-onboarding': GATE.active, 'data-onboarding-step': currentStep },
          h(PortalHeader, {
            title: portalTitle,
            skipLabel: t('skipAll'),
            skipDisabled: finishing,
            onSkip: () => void finish(OUTCOME.skipped),
          }),
          h('div', { className: CLS.scroll },
            h('div', { className: CLS.shell },
              h('ol', { className: CLS.stepper, 'aria-label': portalTitle },
                STEPS.map((step, index) => {
                  const state = index < stepIndex ? STEP_STATE.done : index === stepIndex ? STEP_STATE.current : STEP_STATE.upcoming
                  return h('li', { key: step, className: CLS.stepItem, 'data-step-state': state },
                    h('span', { className: CLS.stepNum, 'aria-hidden': true }, index + 1),
                    h('span', { className: CLS.stepLabel }, t('step.' + step)))
                })),
              h('div', { className: CLS.card },
                pageBody,
                h('footer', { className: CLS.footer },
                  stepIndex > 0
                    ? h(Button, {
                      type: 'button', size: 'sm', variant: 'outline', disabled: finishing,
                      'data-onboarding-back': true,
                      onClick: () => setStepIndex((index) => Math.max(0, index - 1)),
                    }, t('back'))
                    : h('span'),
                  h('div', { className: CLS.footerRight },
                    lastStep
                      ? h(Button, {
                        type: 'button', size: 'sm', variant: 'primary', disabled: finishing,
                        'data-onboarding-start': true,
                        onClick: () => void finish(OUTCOME.completed),
                      }, finishing ? t('welcome.starting') : t('welcome.start'))
                      : h(Button, {
                        type: 'button', size: 'sm', variant: stepHasValue ? 'primary' : 'outline',
                        'data-onboarding-next': true,
                        onClick: () => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1)),
                      }, stepHasValue ? t('next') : t('skipStep'))))))))
      }

      /**
       * Thin portal gate registered with `dshConnectorUiPortal`. Yields straight to `renderFrame()`
       * with zero extra hooks or timers as soon as onboarding is completed or skipped.
       */
      return function OnboardingGate({ title, renderFrame }) {
        const [done, setDone] = React.useState(() => completedLocally)
        const handleDone = React.useCallback((persistLocally) => {
          if (persistLocally) completedLocally = true
          setDone(true)
        }, [])
        return done ? renderFrame() : h(OnboardingFlow, { title, renderFrame, onDone: handleDone })
      }
    }

    /**
     * Onboarding client sub-plugin started by `client.js` beside `instancePlugin` and `fishballPlugin`.
     * Registers its gate into `dshConnectorUiPortal` whenever that service is available (regardless
     * of plugin load order).
     */
    module.exports.onboardingPlugin = (shared, syncKit, fishballKit) => ({
      name: FEATURE.name,
      inject: ['locale', 'configForms', 'remote'],
      apply(ctx) {
        const t = ctx.locale.bind(FEATURE.ns)
        const statusT = ctx.locale.bind(shared.locale)
        const fishballT = ctx.locale.bind(fishballKit.locale)
        ctx.effect(() => ctx.locale.register(FEATURE.ns, { en, zh }), FEATURE.name + ': dictionaries')
        ctx.effect(() => shared.mountStyle(FEATURE.styleId, css), FEATURE.name + ': styles')
        const Gate = makeOnboardingGate({ ctx, t, statusT, fishballT, shared, syncKit, fishballKit })
        ctx.inject([FEATURE.portalService], (scope) => {
          const portal = scope[FEATURE.portalService]
          if (portal?.apiVersion !== FEATURE.portalVersion || typeof portal.registerGate !== 'function') return
          scope.effect(() => portal.registerGate(Gate), FEATURE.name + ': portal gate')
        })
      },
    })
    return module.exports
  },
})
