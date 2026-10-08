# Owner browser entry preference

Effective 2026-10-08 for all future browser operations, including DF browser acceptance: use the Chrome browser extension or Codex's built-in browser only. If neither supported entry is available, report the blocker; do not switch to native Chrome app controls or another browser-control route.

This supersedes earlier native Chrome QA handoffs. It does not change authorized non-browser testing, authorize bypassing a denied action, permit automatic/manual unlock by this implementation lane, or select a new UI listener/profile/package. Send this constraint in every future browser worker prompt and handoff.

Current UI status remains paused: the last QA read-only call was rejected because the Mac was locked and automatic unlock failed; no click or refresh occurred. No corrected connected UI fixture has been handed over. The existing cancelled QA task 4da34a6d remains unavailable for execution.

Source: explicit owner preference delivered in parent coordination thread `01a118cd-12fe-765f-8a53-9c8ac727e0df`. Root acknowledged the constraint during active R8 non-browser source preparation. No browser operation occurred.
