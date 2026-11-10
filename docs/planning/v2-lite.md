# LITE: the A-lite Fishball child page (V2)

Delivers the LITE row of [final V2 scope §4](<v2-final-scope.md#L151>) and §4.3. Cases:
[LITE cases](<../test-design/v2-origin-lite-set-cases.md#L93-L158>). Prevention, not correction.
The user rejected corrective navigation and archive cleanup ("这个方案听起来就很不稳定。不要"), and
none is built.

## Owned files

| File | Role |
|---|---|
| [page client](<../../packages/instance/child-web/fishball-page/client.js>) | `fishball-page` dsh.client plugin, loaded only in the child by the launch overlay row |
| [launch overlay](<../../packages/instance/src/native-runtime/overlay.js>) | child-only row edits for effective read-only and removed navigation surfaces |

There is no DSH host patch. The main DSH and the old main-DSH Fishball (`eaa33f5`) are untouched.

## Public behaviour (contract for tests)

### Page plugin (`fishball-page`, `inject: slots, layout, uiWorkspace, uiSession, sessions, locale, shortcuts`)

1. **Hash continuation.** On apply, the plugin reads `location.hash` as `URLSearchParams`. It acts
   only on `view=settings` and `lang=zh|en`. Any other name or value is ignored.
   - `lang`: `locale.setLocale(lang)` only when the language is registered and not already active.
   - `view=settings`: native Settings opens once per page load, through the native
     `settings.launcher` owner's `openSettings`.
2. **Session.** The GET/POST `api/fishball/session` flow is unchanged (PAGE 7.A). The assigned
   manager is selected once, when it first becomes known and the shortcut gate is protected.
   After that, only the Fishball button and Retry select it. A selection is
   `selectPanel(null)` followed by `openSession(manager)` when the main view is not already
   showing it (plan §4.3 (5) item 4: initial selection and explicit return are legitimate). No subscription ever re-opens it,
   calls `selectPanel(null)` on drift, or archives anything. The conversation is marked
   ready (`data-fishball-session`) only while the main view shows the manager and the gate is
   protected; otherwise it stays hidden.
3. **Shortcut gate.** The gate starts only after the child's own session route has answered. That
   proves the document runs at the child origin (PG-ORIGIN) before any child preference is
   written. The gate goes through the public `ctx.shortcuts` service only.

   | Command | Desired binding (all four modifiers) |
   |---|---|
   | `session.new` | Ctrl+Alt+Shift+Meta+F13 |
   | `session.search` | Ctrl+Alt+Shift+Meta+F14 |
   | `session.fork` | Ctrl+Alt+Shift+Meta+F15 |
   | `session.archive` | Ctrl+Alt+Shift+Meta+F16 |
   | `workspace.add` | Ctrl+Alt+Shift+Meta+F17 |
   | `session.rename` | Ctrl+Alt+Shift+Meta+F18 |
   | `sidebar.left.toggle` | Ctrl+Alt+Shift+Meta+F19 |

   - Each binding is distinct, because native validation rejects one binding on two commands. A
     candidate that native `describeBinding` rejects on this device, or that conflicts with
     another command, becomes explicit `null` (unbound). On Web Linux, three or more modifiers
     are not admitted, so these commands are unbound there.
   - `settings.open` and `shortcuts.open` are allowed destinations and are not edited. Nothing
     else is edited: no `reset`, `reset-all` or direct `localStorage` write.
   - Unregistered commands are skipped. A command that registers late re-enters reconciliation
     through the native catalog subscription.
   - Reconciliation is serialized. A notification during a run causes one rerun.
   - Outcomes:
     - Satisfied commands get zero edits.
     - `saved` or `stale` leads to a reread from the live snapshot. A second `saved` for the same
       still-unsatisfied command is a failure. Repeated `stale` results reread without a bound;
       each one needs a real concurrent edit.
     - `loading` or `not-ready` waits for the next native event. No timer is used.
     - `unreadable`, `conflict`, `write-failed`, `unreadable` config or a thrown `edit` fails the gate.
   - A failed gate shows the status "Fishball shortcut protection unavailable" / "Fishball 快捷键保护不可用"
     with Retry, and holds: later catalog/config notifications neither write nor change it until
     Retry.
   - While the manager is known and the gate is still pending, the status "Preparing Fishball
     shortcut protection" / "正在准备 Fishball 快捷键保护" shows with Retry, never a blank page.
   - A failed manager selection (`openSession` rejects) keeps "Fishball session unavailable" with
     Retry; a later background lookup does not clear it.
   - While a relevant command is unsatisfied, a keydown that exactly matches its current binding is
     stopped in the window capture phase. Nothing else is suppressed: plain Enter, Escape and the
     other fixed actions are untouched.
4. **Hidden surfaces.** These are hidden with `display:none`/`visibility:hidden`, so they are
   not focusable and not pointer-reachable:
   - the sidebar column and every descendant (native CSS gives some descendants
     `visibility:visible`), the 56 px rail (grid track 0 px), `shell.leading`, the drawer mask;
   - the header leading area and the header lineage slot;
   - the empty-session hero's workspace picker: the slot `conversation.hero.workspace` gets an
     empty occupant at priority −1 (its native menu is portalled to the body, and picking a
     workspace connects or creates another session and opens it). The chip, the button labelled
     `conversation` `hero.chooseWorkspace`, is hidden. The inert composer's "choose workspace"
     trigger then opens nothing;
   - every button whose native localized label is `sidebar` `session.new.label` or `chat`
     `message.branch` (the reply's branch action, which forks and opens a new session);
   - the whole conversation top navigation, the `nav` labelled `conversation` `session.hierarchy`
     (its crumbs open other sessions; in 0.2.2-rc.1 every crumb, the current title too, is a
     context-menu trigger for Fork/Archive/Rename/Pin).
5. **Frame guard.** This keeps the child document on Fishball when liveshare or a third-party
   child plugin tries to navigate the frame.
   - A primary-button click on an HTML `<a href>`/`<area href>` that leaves this document is
     cancelled, unless its target is `_blank` or names a frame inside this document. Empty,
     `_self`, `_top`, `_parent` and unknown targets are cancelled. An `http(s)` destination opens in a new window instead
     (`noopener,noreferrer`).
   - Where the browser has the Navigation API, a cancelable `navigate` event leaving this document
     is cancelled the same way, and only user-initiated ones open in a new window.
   - Hash changes, downloads, reload, history traversal and same-document destinations pass.
6. **Removed:** the old `gaps` export and the continuous navigation guard.

### Launch overlay (child only)

- **`permission`:** presets become `{ 'read-only': { sandbox: 'read-only', approval: 'ask' } }`
  with `defaultPreset: 'read-only'`, so `/permission` refuses every other name.
- **Rows disabled when present:** `ui-subagent`, `ui-schedule`, `schedule`, `ui-permission`,
  `ui-agent-preset`, `entry-customization`, `ui-open-in-app`, `open-in-app`,
  `ui-sidebar-terminal`, `terminal-controller`.
- **Agent-preset plugin rows disabled:** `tool-subagent`, `tool-subagent-fork`, `workflow-ptc`,
  `tool-workflow`, `tool-subagent-control`, `tool-subagent-list-agents`, `tool-schedule`.
- **Kept:** `sandbox-policy` read-only, approval `ask`, and the child's own reminder tools.
  Fishball's own widening requests are already rejected by the child approvals row.

## Remaining limits

- **Shortcuts are remapped, not vetoed.** A user can still press the complex combo, or remap it
  back in native Settings → Shortcuts.
  - The combos act on the user's own child only. After remapping, `session.search`, `session.new`
    and `workspace.add` reach hidden UI.
  - Keyboard remapping is not authorization. Server-side read-only is the authority boundary.
- **Ephemeral port.** Each child generation is a new origin and a new store, so the gate runs per
  generation. Old-origin entries are left in place.
- **No cross-tab transaction lock.** Two child views converge through native revisions only.
- **Fixed actions that cannot be remapped** (both SDKs):
  - `fixed.select` Enter activates whatever menu item is reachable. The prohibited menus are
    unreachable.
  - `fixed.send` and slash/mention trigger contributed commands. No native command in either
    SDK opens another session, and `/permission` accepts only read-only. A third-party child
    plugin's command is outside this inventory.
  - Dismiss, stop, approval, newline and Queue/Steer stay native and are harmless.
- **Frame navigation.**
  - Script `location` writes in a browser without the Navigation API are not intercepted.
  - Script writes to `top`/`parent` location cannot be vetoed from inside the frame.
  - Without the Navigation API, `<form>` submissions to another origin, SVG `<a>` links and
    cross-origin `download` links (browsers navigate those) are not intercepted. Native DSH
    renders none of them.
  - A cancelled script navigation is silent: for example the rc.1 liveshare viewer's Sign in and
    Directory actions do nothing in the child page.
  - `ui-workflow-run` stays enabled for transcript rendering. Its member rows call
    `uiWorkspace.openSession`; they appear only in transcripts of workflow runs, and the
    workflow tools are disabled in the child.
  - A plugin can still call `uiWorkspace.openSession` directly. That is a bypass-the-UI case; the
    page shows nothing as ready until the user returns.
- **Labels.** Matching hidden buttons by native localized labels follows the SDK dictionaries.
  A language pack without those keys falls back to English, which still matches.
- **Host launches.** In 0.2.2-rc.1, ui-file-actions' "Show in Finder/folder" after a save and the
  deliverables' open action ask the child host to reveal or open a file in a desktop app. They
  leave neither the page nor the session and touch no session, so they stay enabled; the
  desktop app opens outside the browser.
- **Empty composer (fixed on `dev/v2-manager-ws`, attach policy on `dev/v2-manager-ws-2`; not
  verified in a browser).** Native content makes the hero composer inert while the session is
  blank and no workspace title resolves (ui-conversation `inert = … || hero && chipTitle ===
  undefined`, both SDKs), and dsh-workspace adds members only through `attachSession`. Every
  manager activation (create or resume, chat.js `attach`) ensures the child workspace over the
  manager's folder (`workspaceRegistry.create`, idempotent per path) and attaches the manager to
  it (idempotent). The hidden hero picker stays closed. Attach policy (Fishball's decision,
  2026-11-11):
  - The page path (`POST api/fishball/session`, `manager.ensureSession`; chat.js
    `activateAttached`) requires the attach. A failure answers 503 and the page shows "Fishball
    session unavailable" with Retry.
  - Background activations (chat.js `activate`: inbox delivery, reminders, cards, model changes,
    plugin notices and their recovery) do not block on the attach. Each makes one attempt, logs a
    failure, proceeds and leaves the manager unattached. The manager is published to the
    extension rows before the attach on both paths, so a failed page open does not leave plugin
    notices refusing with `manager-not-ready`.
    `manager.sessionId()` (and so GET) names the manager only once it is attached, so the page's
    next open reads null, POSTs, retries the attach and surfaces any error; the page protocol is
    unchanged. Cost: manager tools that authenticate against `sessionId()` (fold, board)
    refuse during a turn queued while the attach is failing.
  - Moved child home: when the stored session folder does not resolve (missing or
    untraversable) or resolves to another path than the current `<home>/fishball/assistant`,
    the activation still creates the workspace for the current folder, logs the mismatch and
    counts as attached. The manager stays outside that workspace: DSH has no public call that
    changes a session's cwd (the header is frozen creation metadata, resume takes no cwd), and
    `attachSession` refuses a cwd that does not resolve to the workspace path (dsh-workspace,
    both SDKs). The hero composer of such a manager stays inert while it is blank; a manager
    with a turn renders no hero.
  - A workspace the user deleted is recreated, with the SDK default title `assistant`, on the
    next activation.
- **Native startup on a reopened page (open; no up-front mechanism in either SDK; not verified
  in a browser).** Each child generation is a new origin, so ui-workspace's persisted selection
  (`dsh.sessions.current`, a localStorage snapshot store) is empty, and its startup
  `restoreSelection` (identical in 0.2.1-rc.5 and 0.2.2-rc.1) runs once the workspace and
  session lists are ready, before any page selection is known. With no saved selection it
  targets the most recent workspace, which is the manager's, and calls `connectWorkspace`.
  While the manager is blank that names the manager (`session.create` reuse); once it has a
  turn the host creates one ordinary blank Session in that workspace. Neither SDK exposes a
  public way to seed that selection or veto the startup target deterministically:
  `UiWorkspace` has no selection setter; `layout.beginNavigation` and `selectPanel` abort only
  the final open, after `connectWorkspace` has already created the Session; and the host
  `session.create` has no creation hook. The one public call that skips the restore is
  `uiWorkspace.openSession(manager)` issued before both lists are ready (it sets the main
  reference, and `watchNavigation` then marks startup done), but the page learns the manager id
  only from its own HTTP route, so whether it wins is a race with the native list streams, not
  a guarantee. Options, for a user decision: (a) the page calls `openSession` as early as it
  knows the id (public, but racy: the extra Session still appears when the lists win);
  (b) seed the `dsh.sessions.current` localStorage key before ui-workspace constructs (a
  private store format, and the id would have to reach the child document before boot, for
  example in the admission fragment); (c) do not attach the manager to a workspace (the
  composer is inert while it is blank, the 7.A problem); (d) an upstream DSH interface (a
  startup selection hook or a "no auto session" option).
- **Plugin inventory.** `ui-settings-plugin-inventory` stays enabled and lists `ui-agent-preset`
  as an optional client dependency; with that row disabled, preset names it shows may fall back
  to their raw keys.
- **Hashed selectors.** The layout selectors (`.pI_x6G_*`) were checked against rc.5 and rc.1
  only.
- **Widening approvals.** The sandbox stays read-only and approval stays `ask`. The manager's
  own widening request meets the child's explicit `approval/request` rejection (approvals.js).
  This task did not prove that listener runs before a native browser approval card in the child.
  If one answers first, the owner can allow a one-off widening from the child page. That would
  be a user action, not agent authority.
- **Plugin authority.** A newly installed child plugin that registers its own write tool
  outside the sandbox is outside this boundary (the documented read-only scope of §11.6).
