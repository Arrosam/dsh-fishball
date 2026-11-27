#!/usr/bin/env node
// Compatibility entry; the root runner owns release scheduling.
process.argv.splice(2, 0, '--component=dsh-fishball')
await import('../../scripts/test-release.mjs')
