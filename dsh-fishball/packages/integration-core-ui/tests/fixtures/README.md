# Fixtures

Stand-in bundles the booted DSH installs beside core (copied from the old test/v3 guards and wire suites).
None is a real package of this repository.

| folder | what |
|---|---|
| `fishball-board/` | a bundle only named fishball-board, one trivial row (SHELVE / WIRE-SYS "board present"; a broken copy is made from it) |
| `dsh-instance/`, `fbtest-other-plugin/`, `fbtest-deselected/` | stand-in rows that only record `<row> <pid>` in `<DSH_HOME>/standin.log` when they start (a real dsh-instance would start a nested child) |
| `fbtest-extra-presets/` | offers one more agent preset than core's (PLAT-UC-04 A1 agent-presets) |
