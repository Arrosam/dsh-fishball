import { registerTaskCases } from './support.mjs';

// The observable oracle is pre-activation reachability/authority, never a model
// that navigates back or archives after the prohibited action already happened.
const CONTEXT = Object.freeze({
  task: 'LITE',
  source: 'docs/planning/v2-final-scope.md §4 LITE, §4.3 all; docs/plugins/instance-extension-points.md §11 retained clauses; docs/test-design/v2-origin-lite-set-cases.md §2',
  missing: 'LITE: no documented runnable child input-readiness/native shortcuts/rendered reachability/authority harness; retain task-named TODO.',
});
const FIXTURE = Object.freeze({
  manager: 'session-fishball-case',
  ordinary: 'session-other-case',
  origin: 'Verified isolated current owned child origin; main nonempty localStorage and shortcut sentinels.',
  mapping: 'Relevant editable commands use native-validated distinct complex single-key combinations or explicit null; prefer null; no direct storage injection.',
  unchanged: 'Main localStorage byte-identical, no child-caused main storage update, unrelated child preferences preserved.',
  forbiddenFallback: 'Zero corrective openSession/selectPanel calls and zero automatic ordinary-session archive cleanup.',
});

export const CASES = Object.freeze([
  {
    id: 'LITE-UC-01', title: 'Reconcile child native shortcuts before relevant input becomes usable', technique: 'Use Case',
    preconditions: ['Actor: owner; PG-ORIGIN isolated and current; app/manager identity ready; input gate closed; config/catalog can arrive separately.', FIXTURE.origin, FIXTURE.mapping],
    steps: ['Main: wait actual service/catalog readiness; inventory relevant editable commands; normalize desired map; serialize native revision-checked edits; verify all satisfied; select assigned manager once; enable safe surface.', 'Alternative: already-satisfied bindings cause zero writes; late relevant registration enters supported safety reconciliation.', 'Exception: unreadable/stale/conflict/write/catalog-publication failure never claims protection; hold unavailable with status/Retry.'],
    expected: ['Native Fishball-only conversation; no prohibited launcher reachable/focusable; no timer readiness, reset-all, direct storage write or duplicate registration override.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-UC-02', title: 'Preserve native Settings and Plugins with explicit Fishball return', technique: 'Use Case',
    preconditions: ['Actor: owner; protected manager; allowed explicit links.', FIXTURE.manager],
    steps: ['Main: open native Settings, Plugins and plugin config, then explicitly return to Fishball.', 'Alternative: open slim SET from header/connector; use native model/effort picker and harmless ecosystem contributions.', 'Exception: user-reachable operation fails; observe truthful error without losing return path.'],
    expected: ['Allowed native pages and explicit return work; same assigned manager after return.', 'No automatic drift correction, hidden-focusable prohibited item or main settings change.'],
  },
  {
    id: 'LITE-UC-03', title: 'Keep effective read-only with sole narrow private Skills exception', technique: 'Use Case',
    preconditions: ['Actor: manager/ordinary child agent and owner using native Settings; read-only overlay effective; generic creation/subagent/schedule absent.'],
    steps: ['Main: read/query/send on current conversation; attempt generic file write/widen/ordinary child creation/delegation/schedule.', 'Alternative: exercise manager-only dedicated private Skills authority boundary; user native settings/plugin-owned storage are separate.', 'Exception: save higher sandbox mode or invoke permission widening; newly enabled plugin exposes potential write tool.'],
    expected: ['No generic write/widen/ordinary child session/subagent/schedule authority; no escalation prompt; effective mode remains read-only.', 'Private Skills only approved narrow exception; no general filesystem widening or worker access; detailed SK cases stay outside this task.', 'Connector-mediated main-session work and user-native configuration are not misclassified as generic child creation/write.'],
  },
  {
    id: 'LITE-EP-01', title: 'Protect editable session.new on page and composer', technique: 'EP',
    preconditions: [FIXTURE.origin, FIXTURE.mapping, 'session.new has native/default or saved custom binding.'],
    steps: ['Reconcile through native service; press former binding in page and composer.'],
    expected: ['Accepted mapping is explicit null or approved distinct valid complex binding; former gesture opens/creates no new session.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-EP-02', title: 'Protect editable session.search and its launcher', technique: 'EP',
    preconditions: [FIXTURE.origin, FIXTURE.mapping, 'session.search registered.'],
    steps: ['Reconcile; exercise former gesture and available menu activation path.'],
    expected: ['Session-search launcher unreachable; no ordinary session opened.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-EP-03', title: 'Protect editable session.fork for nonblank manager', technique: 'EP',
    preconditions: [FIXTURE.origin, FIXTURE.mapping, 'Nonblank manager; session.fork registered.'],
    steps: ['Reconcile; exercise former gesture and launcher.'],
    expected: ['No ordinary child fork/session; no reactive archive cleanup.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-EP-04', title: 'Protect editable session.archive without archive fallback', technique: 'EP',
    preconditions: [FIXTURE.origin, FIXTURE.mapping, 'session.archive registered.'],
    steps: ['Reconcile; exercise former gesture.'],
    expected: ['Manager not archived; no ordinary-session cleanup archive.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-EP-05', title: 'Protect editable workspace.add', technique: 'EP',
    preconditions: [FIXTURE.origin, FIXTURE.mapping, 'workspace.add registered; unrelated child preference present.'],
    steps: ['Reconcile; exercise former gesture.'],
    expected: ['No workspace/session-navigation launcher; no unrelated preference reset.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-EP-06', title: 'Include editable session.rename in targeted inventory', technique: 'EP',
    preconditions: [FIXTURE.origin, FIXTURE.mapping, 'session.rename registered.'],
    steps: ['Reconcile approved inventory; exercise former gesture.'],
    expected: ['Targeted rename binding handled without opening removed workspace controls or resetting other preferences.', FIXTURE.unchanged],
  },
  {
    id: 'LITE-EP-07', title: 'Account for settings.open and shortcuts.open without banning allowed settings', technique: 'EP',
    preconditions: [FIXTURE.origin, 'settings.open and shortcuts.open registered now or late; native Settings is explicitly allowed.'],
    steps: ['Inventory both commands and destinations; open native Settings/shortcut UI and use explicit Fishball return.'],
    expected: ['Allowed native settings destinations remain reachable; no forced remap of harmless allowed destination merely because editable.', 'Any chosen child-only preference edit leaves main shortcuts unchanged; native explicit return preserved.'],
  },
  {
    id: 'LITE-EP-08', title: 'Make sidebar session and new-chat handlers unreachable', technique: 'EP',
    preconditions: [FIXTURE.origin, `Sidebar/search/session-list/new-chat fixture references ${FIXTURE.ordinary}; SDK-specific local handlers.`],
    steps: ['Traverse Tab focus and pointer access; try Enter, Space and click using real reachable surfaces; cover rc.1 focused-row keyboard and rc.5 click behavior.'],
    expected: ['Controls absent/nonfocusable/unreachable, not only visually hidden; owner-local open handler does not fire.', FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-EP-09', title: 'Make lineage and catalogue tree session-open handlers unreachable', technique: 'EP',
    preconditions: [FIXTURE.origin, `Header lineage and lineage/catalog tree items target ${FIXTURE.ordinary}.`],
    steps: ['Try Tab/pointer, Enter/Space/click through actual available UI.'],
    expected: ['Cannot focus/reach/invoke ordinary-session opening in either SDK; editable remapping alone is not counted as this proof.', FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-EP-10', title: 'Prevent fixed Enter and contributed commands from opening prohibited surfaces', technique: 'EP',
    preconditions: [FIXTURE.origin, 'Reachable menus, slash popup and session-scoped composer contribution claims are inventoried.'],
    steps: ['Activate fixed.select Enter, command popup Enter/Tab/click and fixed.send claim dispatch paths.'],
    expected: ['No reachable contribution opens/creates/switches ordinary child session or reopens prohibited panel.', 'Unsafe launcher removed/unreachable before activation; concrete unavoidable action is reported for decision, not assumed harmless.', FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-EP-11', title: 'Retain harmless send newline dismiss stop and approval actions', technique: 'EP',
    preconditions: [FIXTURE.origin, 'Current Fishball composer/dialog/eligible response/approval fixtures; no unsafe contribution claim.'],
    steps: ['Exercise ordinary Enter send, Shift+Enter newline, Escape dismiss/reject, double-Escape Stop, Queue/Steer and approval Enter; safe slash/mention input.'],
    expected: ['Native current-conversation actions still work; no blanket Enter/Escape disable.', 'Stop/dismiss are not treated as session-navigation escapes; contribution effects remain independently inventoried.'],
  },
  {
    id: 'LITE-EP-12', title: 'Preserve child native ecosystem contributions and untouched main composition', technique: 'EP',
    preconditions: ['Enabled child native UI plugin with harmless chat node/composer dock/header/rightbar contributions; main lacks child page row.'],
    steps: ['Load native child client composition and use harmless contribution; compare main composition/preferences.'],
    expected: ['Native plugin loading/conversation contributions retained, no client scan filtering or DSH code/bundle patch.', 'No page-row installation or unrelated removal in main; permission/new-session escape surfaces remain absent.'],
  },
  {
    id: 'LITE-EP-13', title: 'Refuse ordinary child creation and general agent write escapes', technique: 'EP',
    preconditions: ['Effective read-only overlay; saved higher permission value; manager/ordinary agent authority fixtures; private Skills boundary fixture only.'],
    steps: ['Independently exercise intended reachable generic child new/subagent/schedule/write/widen paths, permission command and newly enabled write-tool exposure.', 'Distinguish user-native Settings and plugin-owned storage from agent tool authority.'],
    expected: ['No ordinary child creation/delegation/schedule, generic write or widening authority; effective read-only and no escalation remain.', 'Only narrow manager private Skills exception; no general authority derived from it.', 'Bypass-UI/unreachable native race documented, not a fabricated precreation RPC veto; user-reachable failure must be handled.'],
  },
  {
    id: 'LITE-EP-14', title: 'Keep transcript session-reference and ui-reference from opening other sessions', technique: 'EP',
    preconditions: [FIXTURE.origin, `Transcript has session-reference and ui-reference to ${FIXTURE.ordinary}.`],
    steps: ['Try actual reachable click, Enter and Space activation of rendered references.'],
    expected: ['Ordinary child view never activated; forbidden reference launcher inert/unreachable before action; harmless transcript content retained.', FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-BVA-01', title: 'Open protection gate only when no relevant command remains unsatisfied', technique: 'BVA',
    preconditions: [FIXTURE.origin, 'Actual service/catalog ready; relevant unsatisfied command count 2, then 1, then 0.'],
    steps: ['Complete desired native edits one at a time; also start already satisfied at zero.'],
    expected: ['Count 2/1 cannot be reported protected; count zero permits input only with actual gate proof.', 'Already satisfied zero causes zero edits/revision bumps; no timer shortcut.'],
  },
  {
    id: 'LITE-BVA-02', title: 'Respect Web single-key validation and distinct-binding conflict boundary', technique: 'BVA',
    preconditions: [FIXTURE.origin, 'Native describeBinding/edit boundary; candidate single physical key + multiple modifiers versus two-key chord; two targeted commands.'],
    steps: ['Validate one physical key multi-modifier candidate; compare two physical keys; compare distinct candidates versus identical overlapping binding; include explicit null alternative.'],
    expected: ['Only native-valid conflict-free candidate accepted; Web chord/same-binding overlap not forced via preference JSON.', 'Explicit null permitted per targeted command; no invented numeric complexity definition or OS-delivery guarantee.'],
  },
  {
    id: 'LITE-DT-01', title: 'Reconciliation R1 forbids writes before isolated current origin proof', technique: 'Decision Table',
    preconditions: ['R1: verified isolated current child origin=false; remaining conditions irrelevant.'],
    steps: ['Start reconciliation.'], expected: ['No preference write; unavailable rather than touching shared main origin.', FIXTURE.unchanged],
  },
  {
    id: 'LITE-DT-02', title: 'Reconciliation R2 waits for real config and catalogue events', technique: 'Decision Table',
    preconditions: [FIXTURE.origin, 'R2: config/catalog actually ready=false.'],
    steps: ['Start reconciliation without ready event.'], expected: ['Wait actual supported event; no timer-success or assumed empty catalog; gate unavailable.'],
  },
  {
    id: 'LITE-DT-03', title: 'Reconciliation R3 holds gate on unreadable accepted preferences', technique: 'Decision Table',
    preconditions: [FIXTURE.origin, 'R3: services ready; accepted config unreadable.'],
    steps: ['Attempt reconciliation.'], expected: ['Honest unavailable/Retry, no reset-all/default overwrite/storage injection.', FIXTURE.unchanged],
  },
  {
    id: 'LITE-DT-04', title: 'Reconciliation R4 skips already normalized desired bindings', technique: 'Decision Table',
    preconditions: [FIXTURE.origin, 'R4: ready/readable; normalized desired map already satisfied.'],
    steps: ['Reconcile same map repeatedly.'], expected: ['Zero edit persistence/revision bump; no duplicate registration; readiness only when full boundary proven.', FIXTURE.unchanged],
  },
  {
    id: 'LITE-DT-05', title: 'Reconciliation R5 serializes successful current-revision edits', technique: 'Decision Table',
    preconditions: [FIXTURE.origin, 'R5: ready/readable; desired map unsatisfied; native edit saved.'],
    steps: ['Use latest revision for each serialized edit; reread and verify result.'],
    expected: ['Skip normalized satisfied commands; accept protection only after all required mappings verified.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-DT-06', title: 'Reconciliation R6 rereads stale revision before reevaluating', technique: 'Decision Table',
    preconditions: [FIXTURE.origin, 'R6: ready/readable unsatisfied command; edit returns stale.'],
    steps: ['Observe stale; deliver updated config/catalog; reevaluate need and current revision.'],
    expected: ['No blind replay, lost unrelated edit or false protection; may skip if now satisfied.', FIXTURE.unchanged],
  },
  {
    id: 'LITE-DT-07', title: 'Reconciliation R7 holds gate on native invalid or conflicting candidate', technique: 'Decision Table',
    preconditions: [FIXTURE.origin, 'R7: unsatisfied command; native conflict/invalid result.'],
    steps: ['Attempt candidate through supported native API.'],
    expected: ['Honest unavailable/Retry; no displacement bypass, invalid JSON injection or global reset.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-DT-08', title: 'Reconciliation R8 holds gate after write failure', technique: 'Decision Table',
    preconditions: [FIXTURE.origin, 'R8: unsatisfied command; native persistence fails.'],
    steps: ['Finish failed edit; observe readiness/status and accepted preferences.'],
    expected: ['No false protected state; preserve accepted preferences, show failure/Retry.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-DT-09', title: 'Reconciliation R9 handles catalogue publication failure honestly', technique: 'Decision Table',
    preconditions: [FIXTURE.origin, 'R9: unsatisfied command; native edit rejects/throws while publishing accepted catalog.'],
    steps: ['Observe failure and reread accepted state before any further action.'],
    expected: ['Unavailable/Retry; no guessed rollback, false protection or blind edit replay.', FIXTURE.unchanged, FIXTURE.forbiddenFallback],
  },
  {
    id: 'LITE-ST-01', title: 'Make duplicate startup and catalogue notifications write-idempotent', technique: 'State Transition',
    preconditions: [FIXTURE.origin, 'Waiting config/catalog; desired command map may already be partly satisfied.'],
    steps: ['Emit duplicate startup/config/catalog events through reconciliation; repeat after satisfied.'],
    expected: ['One owned serialized reconciliation; no duplicate subscriptions or repeat edits/revision bumps for satisfied commands.', FIXTURE.unchanged],
  },
  {
    id: 'LITE-ST-02', title: 'Gate late registration reload and disposal without stale writes', technique: 'State Transition',
    preconditions: [FIXTURE.origin, 'Protected child; later relevant command registration and reload/dispose callbacks possible.'],
    steps: ['Register relevant command late; enter supported safety gate, reconcile, regain protection; dispose; complete old callback.'],
    expected: ['No silently unprotected active-command interval called protected; disposal removes subscriptions.', 'Old callback cannot write or restore readiness; no timer or corrective/archive fallback.'],
  },
  {
    id: 'LITE-ST-03', title: 'Reconcile concurrent child views through current revisions', technique: 'State Transition',
    preconditions: [FIXTURE.origin, 'Two child views share same child origin store; unrelated concurrent preference edit.'],
    steps: ['Race native edits/storage events; force stale result; reread and reevaluate.'],
    expected: ['No claim of cross-tab transactional lock; converge without lost unrelated edit/reset; honest gate failure if not proven.', FIXTURE.unchanged],
  },
  {
    id: 'LITE-ST-04', title: 'Allow initial selection and explicit return but never corrective navigation', technique: 'State Transition',
    preconditions: [FIXTURE.origin, FIXTURE.manager, 'Navigation and archive observers; separately unreachable drift fixture.'],
    steps: ['Initially select assigned manager; explicitly open allowed Settings/Plugins and return; separately inject unreachable drift.'],
    expected: ['Initial selection/user return legitimate; no continuous openSession/selectPanel drift correction.', FIXTURE.forbiddenFallback, 'Any actual user-reachable escape fails acceptance, not repaired into a pass or dismissed as edge-only.'],
  },
].map((entry) => Object.freeze({ ...CONTEXT, ...entry })));

registerTaskCases(CASES);
