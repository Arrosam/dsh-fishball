# Review: V2 B1 fix (`fix/v2-page-boot` @ fd4e99d, base 7d6c9a8)

Reviewer branch: `review-opus/v2-page-boot`. Standard: the `general-coding-principle` skill plus a normal code review.
SDK facts were checked in the installed 0.2.1-rc.5 and 0.2.2-rc.1 runtimes.

## SDK facts used

- `SlotCore.register` (web frontend bundle): a `list` slot needs `options.id`. A second entry with the same id at the
  same priority throws. `keyed` needs `key`, `single` allows one entry per priority.
- Slot kinds, the same in both SDKs: `shell.overlay` list, `conversation.session.header.actions` list, `plugins.tab`
  list, `main` keyed, `plugins.row.config` keyed, `settings.launcher` single, `conversation.hero.workspace` single.
- `slots.register`, `slots.inject`, `ctx.on`, `remote.$on` (gateway `events.subscribe` → `ctx.on`) and `tools.register`
  (`layers.effect(this.ctx, …)`) are all effects on the calling fiber. When `apply` throws, cordis `_unload` disposes
  them. `ctx.locale.subscribe`, `MutationObserver`, window/document listeners, `adoptedStyleSheets` and `<html>`
  attributes are plain browser or JS resources, and no fiber owns them. Only these can outlive a failed setup, and they
  are what B1 leaked.
- cordis `effect()` dispose loop (both SDKs): `for (… of disposables.splice(0).reverse()) runDisposable(…)` has no
  per-disposer `try`. A throwing disposer stops the loop, and while a setup is unwinding, its error replaces the setup
  error (`finalizeDisposal` rethrows before `throw reason`). So a native iterable effect would not give the guarantee
  below either.

## Findings

### F1 (should-fix) `mountAll` is wrong when a disposer throws
`disposeAll` runs `for (const dispose of disposers.splice(0).reverse()) dispose()` with no guard:
1. Leak: a throwing disposer stops the loop. The parts mounted before it are already spliced out, so nothing disposes
   them later. This is the B1 symptom again (a live observer or subscriber on an inactive context).
2. Masked cause: when setup fails, a throwing disposer inside `catch` replaces the setup error. Cordis then logs and
   reports the disposer's error, not the real cause (for example the list-slot refusal).

Fix: every disposer runs, and a disposer's error never stops the others. When setup failed, the setup error propagates.
On teardown, the first disposer error propagates. Every other error is rethrown on its own microtask, which reaches the
page's uncaught-error reporting (`queueMicrotask`, which the Node fakes also have, unlike `reportError`). One helper owns
the rule. The design comment now gives the real reason not to use a native iterable effect (the cordis loop above), not
"the callback shape".

### F2 (should-fix) fishball-settings: shared card mounts have the same no-cleanup-on-throw shape
`disposers = [ctx.locale.register(…), shared.mountStyles(), shared.mountStyle(…)]`: if the second or third call
throws, the earlier registrations are never assigned to `disposers`. The effect's cleanup then cannot remove them, so the
dictionaries or styles stay after the row is disposed. This runs in a loader listener, not in setup, so the fiber stays
active, and the right fix is ownership as each part mounts, not an immediate unwind. Each disposer is recorded as soon
as its part is mounted. `mountAll` is not needed here, so it is not shared: only fishball-page needs it.

Not fixed (needs a product decision): the throw still escapes the loader listener. `sharedLoader.set` notifies with
`Set.forEach`, so the panel's own React subscriber after it would miss that notification. Showing the panel's
"could not be loaded" state for a mount failure would be new behaviour.

### Checked, no finding
- fishball-page `PAGE.overlay` `{name: 'shell.overlay', id: 'fishball-page.navigation'}`: correct for the list slot in
  both SDKs. The id is in the feature constant object with the reason. The other two page registrations are single slots
  at `PAGE.priority`, and `register` needs no id there.
- fishball-page `mountAll` ownership order: each part is owned right after it mounts. Teardown runs in reverse mount
  order, so the slot entries go before the session, shortcuts, removals and styles. Fiber-owned slot effects are
  idempotent, so disposing them in `mountAll` and again in the fiber's `_unload` is harmless. `readContinuation` and
  `applyLanguage` mount nothing (`setLocale` is a deliberate persisted preference write).
- fishball-settings: `main` registers with `key`, and the header-actions list registers with `id`. Each part is its own
  fiber-bound `ctx.effect`, so a throw in a later effect unwinds the earlier ones through cordis.
- fishball-recommend-plugins: `plugins.tab` registers with `id`. `remote.$on`, `ctx.on` and `slots.inject` are
  fiber-bound, and the controller's dispose is its own effect. No finding.
- `packages/instance/src/slim/child`: no `ctx.slots` use (Node rows). The tool-registration loops are fiber-bound
  (`tools.register`) or already unwind on throw (session-tools, approvals). No finding.
- Tests (`child-boot.test.mjs`, host, fixtures, `launchChromium`, suites, CASES): black box over the real SDK web boot.
  The oracles come from the requirements, and the R4 precondition guards the forced refusal. Homes are created only
  under the test-homes root, and Chromium temp dirs only under `os.tmpdir()`. The `launchInto` extraction removes the
  duplicated launch block and keeps `startEnvironment`'s behaviour. No finding.

### Test gaps (for an independent test subagent)
- G1 (F1): a page part whose disposer throws, while a failed setup unwinds and in normal teardown. The setup error is the
  reported cause, and every other mounted part is still disposed.
- G2 (F2): a shared card mount that throws after an earlier one succeeded. The earlier registration is removed when the
  row is disposed.
