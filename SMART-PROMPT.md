# SMART-PROMPT workspace knowledge

## Project vocabulary
- "dsh-fishball": a separate, related repo/project. Content such as design documents has been moved from it into this repo.
- "watchdog": a component or feature that has its own design document. Its original notes were kept in dsh-fishball. The user wants it implemented in `dsh-connector-amenities`.
- This repo combined several packages into one, including `dsh-connector-adapter`, `dsh-connector-amenities` and `dsh-connector-ui`.
- Shorthand: "connector amenities" = `dsh-connector-amenities` (likewise "connector adapter" / "connector ui" for the other packages).

## Recurring themes
- Design documents are being moved from dsh-fishball into this repo. The user worries that some may not have moved over properly.
- When docs move, the user wants the old copies deleted from dsh-fishball and references there repointed to this repo.
- "here" in drafts means this repo, as opposed to dsh-fishball.

## Conventions
- Tests go in each package's own directory (e.g. `dsh-connector-amenities/tests/`). Each package has its own test config and `test` script, so its tests can run on their own.
