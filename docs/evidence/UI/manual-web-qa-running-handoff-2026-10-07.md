# Running immutable Web QA fixture: October7

This is the current handoff for the working replacement independent UI QA thread
`01a11541-bd03-7669-9a89-7baca8daf0bf`. The parent verified supported native
Chrome AX/CUA in that fresh session and assigned it exclusive QA interaction.
The stalled `01a1151f-2118-7419-9d27-aa74dddc809a` completed a delayed read-only
inspection with no mutations; it is no longer an active QA owner. The previous thread
`01a10a1b-eb23-7049-b0cd-f0e365cf8093` created no listener or profile and has
completed. Root owns listener startup and lifecycle; the new lane owns supported
browser interaction. Do not create a second listener or profile.

## Exact candidate and running ownership

- Product revision: `a58c522f32dd2be2ec29a697ec32ed295e154614`.
- Package: `dsh-fishball-0.1.0-preview.1.tgz`, SHA256
  `fa3fb398d901a5c3d04d1f6f949878eb190f1d1fb737b16210347963d0afb5c0`,
  4,114,465 bytes. The isolated package's 1,114 regular files match that archive.
- Original host: DSH Web0.2.1-alpha.1, pinned lock
  `68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3`.
- Fixture root:
  `/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ui-qa-a58c522/`.
  Its home, web profile, workspace, agents, DF ledger/session paths and private
  directory are newly isolated; the preserved NI2 physical profile was not reused.
- Root launched the reviewed `launch.mjs` through the original installed CLI:
  `--profile web --host 127.0.0.1 --port 3080 --no-open`.
  Root PTY session is `36229`; original CLI child PID is `91027`.
  Fresh `/usr/sbin/lsof` observations, including after the working replacement
  request, confirm that PID listens on exactly
  `127.0.0.1:3080`. The launcher remains running.
- Original startup audit completed. Original `BrowserAuth` and
  `LocalCredentialProvider` generated fresh fixture authentication.
  Anonymous HTTP returned401 (68 bytes, SHA256
  `3aad6226baa021e747c19d2c55cbd7a5995d10f43c1d05b248af37836942acaf`).
  This is service/authentication readiness, not visual acceptance.

Root reverified all1,114 package file bytes against the fa3fb398 archive after
the working replacement requested handoff; there were no mismatches or file-set
differences. This listener still uses the same root-launched candidate/profile.

## Private native access and approved interaction

The access handoff is the local private file
`/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ui-qa-a58c522/private/fresh-native-access.txt`
(mode0600). The new QA lane may privately read it and navigate through its
supported native Chrome/CUA tools. Never copy its token/query/cookies into chat,
screenshots, evidence, Git or other profiles. This report deliberately contains
only the path. Do not use a stale browser tab as package/profile provenance.

The replacement lane initially observed the authentication-required body and
stopped. Root then used the pinned original DSH WebApp `internals.openBrowser`
normal OS browser opener with the existing private access handoff. The original
opener exited0; sanitized evidence is
`.runtime/ui-qa-a58c522/evidence/normal-browser-open.json`. Private stdout/stderr
remain mode0600 and are excluded from tracked evidence. No credentials were
changed, copied into a task message or transferred manually by the owner.

The current QA lane subsequently reported the authenticated page visibly shows
host `0.2.1-alpha.1`, preset `df-ni2-empty` with no tools/models/child plugins,
`Df Read Only`, and `Synthetic local worker / Synthetic deterministic`. These
are lane-reported native Chrome observations; root has no CUA tool and makes no
independent visual-pass claim. The page has not been observed to display the
Git revision or archive digest; those remain filesystem-verified provenance.
No alternative browser bridge, port, proxy, CDP, AppleScript or credential change
is authorized.

The approved preparation source and exact minimal launcher/access implementation
are frozen in `.runtime/ui-qa-a58c522-preparation-source/`, closure SHA256
`bf42e95ae6eeadbb0fc7f8ea5d4adec68b21674ecfe3666663076266b5818c15`.
Root verified its public source pins and package bytes before preparing the fresh
target and starting the original CLI. No rebuilt candidate or NI3–NI6 source
proposal was substituted into this package.

Only synthetic inputs are approved for this QA baseline. The worker configuration
uses `df-testing-worker-v1`, an empty tool preset and `never` approval policy,
maxActive1/maxAttempts1/maxTotalAttempts1, bounded request/result/output, usage
and runtime, and configured synthetic cost0. Root startup has made no worker
grant, dispatch or inference call. The newly authorized real Ollama integration
is a separate source/testing lane and is not installed in this fixture.

Follow the frozen package's existing first-worker UI acceptance plan with explicit
owner actions, record actual profile/package provenance, and redact private
authentication. Report any supported browser access failure without alternative
ports/proxies/CDP or private browser workarounds. Coordinate root lifecycle handoff
before stopping/restarting the process. UI regression is in progress; all87 and
the separate blocked final CODE review remain HOLD.

## Current worker recovery blocker

The sole QA lane completed the exact local setup plan and reports encrypted
storage ready. Its current task `4da34a6d`, “UI regression smoke task,” is queued
at version1. It reports no admitted worker execution, captured artifact or result.
The Native worker card says `Host disconnected. Worker decisions are cleared.`
and all worker controls, including read-only status refresh, are disabled.

Root rechecked listener ownership: the original PID91027 still listens on exactly
127.0.0.1:3080. A loaded SPA and a live HTTP listener do not establish current
worker readiness. Source inspection found that this frozen client clears worker
state on `connection/reset`, refreshes only setup/task state, and never restores
worker state when a generation recovers. Its card disables the status refresh
while offline. An independent SOURCE root-cause lane is reviewing the actual
original host connection/reset ordering and proposing a narrow correction.

The running a58 archive/profile remain unchanged. Dependent worker QA is paused;
independently testable UI can proceed under the same exclusive browser owner.
Root has not restarted the listener, reset storage or substituted an unreviewed
package. A corrected immutable successor requires review, bounded regression,
exact package/build handoff and coordinated lifecycle adoption before worker QA
can claim recovery.
