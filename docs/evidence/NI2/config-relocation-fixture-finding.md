# NI2 config dependency in the preserved NI1 relocation fixture

The first affected authored run is retained in [raw TAP](config-author-first.tap):140 tests,132 passed and8 failed. The NI1 relocation family copied a fixed source closure into each synthetic flat host. NI2 adds the frozen installed-worker configuration validator import, so that closure lacked `src/installed-worker-config.mjs`. Import failed before the canonical estimator case or any hostile provenance predicate could run.

Root verified the old independent file against Git object `3bee1c0:test/installed-memory-adversarial.test.mjs`: SHA256 `7fc6dcc3c004cf314ed2470b700899ac1a946d8dfcb53db69357db6e55e89a02`. Root changes only its copied source list by adding the actual new transitive module. The canonical case, all six hostile source/origin cases, zero unreviewed-code marker, no database-write assertion and every other original assertion remain intact. No host gate, resolver fallback, test or assertion is removed.

This is a fixture dependency correction required by the held NI2 contract. The unchanged former test is recoverable from granular Git history; the first failed TAP remains evidence. A held-source rerun is required before this logical config unit is reported functionally verified. No acceptance or CODE/browser verdict follows from the correction.
