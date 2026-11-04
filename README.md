# Fishball

Fishball is an always-on personal assistant that runs inside DeepSeek Harness (DSH) as a standard DSH plugin. It keeps one long-lived session that gathers information from your other sessions, from plugins and from you. It manages your daily life and work as an information-processing centre: it reads, sorts, decides and delegates, but does no work itself and never writes local files.

The design is in [DESIGN.md](DESIGN.md). The original brief is [SMART-PROMPT.md](SMART-PROMPT.md).

## Status

First release: v0.1.0, on `main`. The earlier "dsh-fishball (df)" preview is archived at tag `archive/df-preview-2026-10-23` and can be checked out from there.

## Isolation status

The current release uses a private agent scope inside the main DSH runtime, **not a fully isolated profile/runtime**. Fishball plugin switches control tool visibility and private plugin rows; they do not exclude main-profile global hooks or shared services. The [runtime isolation investigation](<docs/runtime-isolation.md>) describes the proposed same-installation child runtime and the unresolved hook-free model-account bridge. This migration has not shipped.

## Host

- DSH Web 0.2.1-rc.2 (Cordis 4.0.5), as installed by DSH-X.
- Node 22.22.2.

## Install

Fishball is not published to npm. Install it from GitHub into a DSH profile (here `web`) with DSH's own plugin command, then start DSH as usual:

```bash
dsh plugin --profile web add github:Arrosam/dsh-fishball#v0.1.0
```

```bash
dsh web
```

The command installs the package into the profile and turns it on. Fishball's session starts by itself when DSH starts. pnpm lists DSH's own packages as missing peers during the install; DSH provides them when it runs, so the warning is expected.

These steps were verified on 2026-11-02 with the same mechanics, from branch `rebuild/assistant`, in a throwaway DSH home on DSH 0.2.1-rc.2 and Node 22.22.2: the plugin installed, loaded from the profile and started Fishball's session.

## Choose Fishball’s model

Open **Fishball settings** from its chat header or the model-setting prompt above its composer. Under **Model for Fishball**, choose a model, optionally choose its reasoning effort, and press **Save**.

Fishball’s composer stays blocked until a dedicated model is saved. An existing chat model or DSH default does not count as this explicit choice. The selection survives restarts and does not change ordinary sessions or DSH’s default model. The model switcher is no longer shown in Fishball’s composer.

## Choose a model for delegated work

Fishball can pass optional `model` and `reasoning_effort` to `start_session`:

```json
{
  "folder": "/absolute/existing/project",
  "title": "Review the changes",
  "message": "Review the current changes and report findings.",
  "model": "codex/gpt-6.1-sol",
  "reasoning_effort": "high",
  "notify_when_finished": true
}
```

Use an available `provider/model` id from DSH's live catalog. Effort values depend on that model; `reasoning_effort` requires `model`. Omit effort for provider defaults, or omit both new parameters to keep the existing default-model behavior. Invalid choices return a clear error and `availableModels` / `availableReasoningEfforts` instead of falling back.

The choice is committed before the first message runs and affects only the new session, not DSH defaults or Fishball's own dedicated model. If selection cannot be confirmed after creation, the error includes `sessionId`; no first message or watch is sent. Use that existing session rather than creating a duplicate. Switching models of existing sessions through a Fishball tool is not included in this change.

## Licence

[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The repository is public on GitHub. The package is not published to npm.
