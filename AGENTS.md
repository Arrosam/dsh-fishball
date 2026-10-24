# Fishball development rules

## Git stays local
- Commit logical units on local branches. Never add a remote, push, publish or open remote issues.
- Never rewrite, reset or delete existing branch history or tags. The old preview is kept at tag `archive/df-preview-2026-10-23`.

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
- [DESIGN.md](DESIGN.md) is the approved plan. Change it when a spike or the user changes the design.
- Each delivery phase ends with tests, an independent code review and a local commit.
