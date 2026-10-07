# October7 supported UI access and ownership amendment

Root checkpoint: `0433a7f035b9ad5b8fcda4a6b4b099323452945f`, local branch
`feat/S3-integrations`. This supplements the immutable
[a58c522 handoff](manual-web-qa-current-package-handoff.md); it does not identify an
already-open page as that installed package.

The observations below are historical, before the fresh approved startup. The
[current running handoff](manual-web-qa-running-handoff-2026-10-07.md) now records
the replacement QA thread, new isolated fixture, exact immutable package, PID91027
and private native access path. Root owns that original CLI listener; anonymous
HTTP401 confirms its authentication gate. No provenance is inferred for the old
browser page.

The independent UI lane reported native Chrome access to a page titled DeepSeek
Harness at `127.0.0.1:3080/`, and stopped before inspecting its contents because
ownership was then unverified. The parent subsequently conveyed the owner's
explicit confirmation that this existing DSH instance is isolated and authorized
Luna to resume UI QA without another isolation question. The owner also reported
updating Mac Codex; interrupted commands must be reconciled before replay.

Root's fresh read-only checks established:

- The reserved `.runtime/ui-qa-a58c522/` path is absent, not a symlink. Root has
  neither prepared that profile nor launched its reserved listener.
- The immutable archive remains revision
  `a58c522f32dd2be2ec29a697ec32ed295e154614`, SHA256
  `fa3fb398d901a5c3d04d1f6f949878eb190f1d1fb737b16210347963d0afb5c0`.
- `/usr/sbin/lsof -nP -iTCP:3080 -sTCP:LISTEN` returned exit1, empty stdout/stderr
  at the check. This establishes no visible listener in that observation; it does
  not identify the browser page's running profile or installed revision.
- The earlier `/usr/bin/lsof` attempt returned exit127 because that executable
  path does not exist. The supported system executable is `/usr/sbin/lsof`.
- No process was stopped, profile or credential read/copied, listener launched,
  source replaced, or interrupted runtime mutation replayed by these checks.

Luna may use its supported Chrome/CUA tools to validate the owner-confirmed
isolated existing instance, preserving synthetic-only bounds. Record its actual
connection state and package/profile provenance. Until that provenance is
established, do not attribute those observations to the frozen a58c522 archive or
to the newer NI3–NI6 source proposals. Do not start a second listener, take over an
unrelated process, change ports/routing, or alter the preserved NI2 profile.
Root will keep the archive, installed package and any QA-owned fixture unchanged.

The previously approved fresh-profile launch in the original handoff remains the
supported fallback after actual3080 ownership is reconciled. It uses the pinned
original CLI, fresh AuthService credential and isolated QA paths; it does not
reuse another profile's database, keys, browser auth or session history. The root
has issued no new launch here. This record conveys ownership authorization and
read-only observations, not a Web PASS or acceptance result. All87 remains HOLD.
