# October7 exact-model integration authorization

The owner explicitly authorized the already-running local Ollama model
`deepseek-v4.1-flash:cloud` for DF tests and acknowledged its cloud inference and
ample available usage. This narrowly supersedes the earlier synthetic-provider-only
restriction. After endpoint/model verification and a bounded smoke, proceed with
necessary realistic DF functional integration on this exact model. Keep cases,
calls and loops bounded; record outcomes and available usage, with deterministic
tests reported separately. No repeated quota approval is required.

Verify the existing endpoint/version and exact model through normal read-only
APIs first. Do not pull/install models, switch models/providers, change accounts
or credentials, create persistent access, or use this authorization for unrelated
workloads. The blocked security investigation must not be routed through Ollama.
Prefer sufficient synthetic baseline data. The owner also allowed personal files
in principle, which is not an instruction to upload arbitrary files. If a real
file is materially needed, identify the exact data and cloud destination for
scoped confirmation before transmission. Never transmit credentials or secrets.

On2026-10-07 root observed the existing Ollama process listening on
`127.0.0.1:11434` and verified three read-only APIs through the normal approved
execution path: version`0.40.0`; local catalogue empty; exact model `/api/show`
HTTP200 with completion/thinking/tools/vision capabilities. No inference had run
at that checkpoint. This is model metadata availability, not proof of a successful
cloud inference or account/quota/billing outcome. The intended smoke uses genuine
DSH provider/session/permission interfaces and the DF worker path.

The owner separately requested recovery/startup of the approved isolated local
DSH test service and a fresh local Codex UI session after the Mac update. New UI
lane`01a1151f-2118-7419-9d27-aa74dddc809a` replaces the completed old lane. Root owns
isolated service preparation/startup until coordinated handoff. HTTP readiness is
separate from supported CUA/browser availability and actual visual validation.
