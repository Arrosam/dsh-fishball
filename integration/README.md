# Integration packages

An integration package tests behaviour that needs more than one package of this repository at
once. Each package under [`packages/`](<../packages>) tests only its own code; when a behaviour only
exists when two packages run together, or when a rule compares all packages with each other, its
suites live here instead.

An integration package is a private npm workspace with no product code: only a `package.json`
(its dependencies are the packages it brings together and
[`dsh-connector-test-helpers`](<../packages/dsh-connector-test-helpers/README.md>)) and a `tests/`
folder laid out like a package's.

**They run only before a release.** Day to day you run the package you changed. Before a release,
`npm run test:release` runs every package and every integration package on the release matrix.
You can still run one by hand:

```bash
npm test --workspace <npm name>
```

| Folder | npm name | What it checks |
| --- | --- | --- |
| [`connector-watchdog/`](<connector-watchdog/README.md>) | `dsh-connector-integration-watchdog` | `dsh-connector-watchdog` beside `dsh-agent-connector` in one real DSH (WD-L01…13). |
| [`package-icons/`](<package-icons/README.md>) | `dsh-connector-integration-package-icons` | The plugin icons of every package together (PI-*). |

See [the testing guide](<../docs/testing/README.md>).
