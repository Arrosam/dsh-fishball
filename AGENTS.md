# Fishball development rules

## Git and the GitHub repo
- Commit logical units on local branches. Pushing branches to `origin` (the GitHub repo) is allowed.
- The repository has gone public on GitHub (the user confirmed this on 2026-11-02): anything pushed is visible to everyone. Never add another remote or open remote issues.
- Never publish to npm or any registry yourself. V3 is published by the user from their own terminal, with the commands `dsh-fishball/scripts/pack-v3.mjs` writes to `dsh-fishball/.runtime/release/<version>/PUBLISH.md`.
- Never rewrite, reset or delete existing branch history or tags. The old preview is kept at tag `archive/df-preview-2026-10-23`.

## Workspace and boundaries
- The root is a private npm workspace, not a plugin. See the [root README](README.md) for the component map.
- Fishball talks to the connector over its public MCP surface. Sharing a checkout adds no cross-side imports.
- Use the [local test environments skill](.agents/skills/local-test-envs/SKILL.md) to open or refresh an isolated dev or staging Fishball instance. Never operate the real DSH for lab work.
- Run only the package you changed day to day: `npm test --workspace <npm-name>` from the monorepo root. Integration suites and DSH-version matrices are release-only. Use isolated test homes, never a real DSH profile.

## Coding principles
Follow the user's `general-coding-principle` skill for all code and test work. In short:
- Read the relevant code, callers and DSH host APIs first. Reuse existing DSH services and components before writing new ones.
- Never invent behaviour. When a requirement is missing or ambiguous, ask the user.
- No repeated code blocks. Share behaviour through functions, or through base classes for similar variants.
- No bare numbers or strings in behaviour code. Put them in feature-owned constant objects or in the plugin's typed config.
- Keep to SOLID and make surgical changes: the smallest complete change, with no unrelated refactors.
- Tests are written by a separate subagent from the requirements alone. It uses boundary values, equivalence partitions, decision tables and state transitions. While coding, do not read the test code.
- Comment non-obvious constraints and the reasons behind design choices.

## Process
- [Fishball’s DESIGN.md](dsh-fishball/DESIGN.md) is the approved plan. Change it when a spike or the user changes the design.
- Each delivery phase ends with tests, an independent code review and a local commit.
