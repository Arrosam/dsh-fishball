# Running immutable Web QA fixture: October7

This is the current handoff for the replacement independent UI QA thread
`01a1151f-2118-7419-9d27-aa74dddc809a`. The previous thread
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
  A fresh `/usr/sbin/lsof` observation confirms that PID listens on exactly
  `127.0.0.1:3080`. The launcher remains running.
- Original startup audit completed. Original `BrowserAuth` and
  `LocalCredentialProvider` generated fresh fixture authentication.
  Anonymous HTTP returned401 (68 bytes, SHA256
  `3aad6226baa021e747c19d2c55cbd7a5995d10f43c1d05b248af37836942acaf`).
  This is service/authentication readiness, not visual acceptance.

## Private native access and approved interaction

The access handoff is the local private file
`/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/ui-qa-a58c522/private/fresh-native-access.txt`
(mode0600). The new QA lane may privately read it and navigate through its
supported native Chrome/CUA tools. Never copy its token/query/cookies into chat,
screenshots, evidence, Git or other profiles. This report deliberately contains
only the path. Do not use a stale browser tab as package/profile provenance.

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
before stopping/restarting the process. UI is NOT_RUN here; all87 and the separate
blocked final CODE review remain HOLD.
