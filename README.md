# Fishball

Fishball is an always-on personal assistant that runs inside DeepSeek Harness (DSH) as a standard DSH plugin. It keeps one long-lived session that gathers information from your other sessions, from plugins and from you. It manages your daily life and work as an information-processing centre: it reads, sorts, decides and delegates, but does no work itself and never writes local files.

The design is in [DESIGN.md](DESIGN.md). The original brief is [SMART-PROMPT.md](SMART-PROMPT.md).

## Status

First release: v0.1.0, on `main`. The earlier "dsh-fishball (df)" preview is archived at tag `archive/df-preview-2026-10-23` and can be checked out from there.

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

## Licence

[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The repository is public on GitHub. The package is not published to npm.
