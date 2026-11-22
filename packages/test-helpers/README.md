# fishball-test-helpers

Shared test tools for the Fishball packages. Private, never published or shipped; no package under
test imports it, and it imports no package under test. Each package's tests reach it by name
(`fishball-test-helpers/<module>`). See [docs/testing/README.md](<../../docs/testing/README.md>) for the
rules it serves.

## Modules

| module | what it gives |
|---|---|
| `./dsh` | the current DSH (`DSH_VERSION`, `DSH_RUNTIME`), the release matrix, `importDsh(name)` |
| `./bind` | `importBound(file)`: a repository module with its `@deepseek-ai/*` imports bound to the current DSH |
| `./cases` | `caseName` / `caseTest`: `<ID> <row> [DSH <v>] <title>` |
| `./wait` | `until`, `settle`, `settleFor`, `sleep` |
| `./packages` | the package catalogue (`packageByName`, `testFiles`, `exportPath`) |
| `./boundaries` | the independence check `scripts/test.mjs` runs first |
| `./runner` | `runFiles(files, version)` in an isolated environment |

## Testing

```bash
node scripts/test.mjs fishball-test-helpers
```
