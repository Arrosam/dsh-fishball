# Fishball

Fishball is an always-on personal assistant that runs inside DeepSeek Harness (DSH) as a standard DSH plugin. It keeps one long-lived session that gathers information from your other sessions, from plugins and from you. It manages your daily life and work as an information-processing centre: it reads, sorts, decides and delegates, but does no work itself and never writes local files.

The design is in [DESIGN.md](DESIGN.md). The original brief is [SMART-PROMPT.md](SMART-PROMPT.md).

## Status

Rebuild in progress on branch `rebuild/assistant`. The earlier "dsh-fishball (df)" preview is archived at tag `archive/df-preview-2026-10-23` and can be checked out from there.

## Host

- DSH Web 0.2.1-rc.2 (Cordis 4.0.5), as installed by DSH-X.
- Node 22.22.2.

## Licence

[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The repository is private on GitHub. Branches are pushed there; the package is not published.
