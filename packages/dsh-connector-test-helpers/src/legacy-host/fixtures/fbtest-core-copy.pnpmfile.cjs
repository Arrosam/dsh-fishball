/**
 * pnpm hook for the v2-r4 offline install: every dependency named in FBTEST_CORE_COPY_STAGE
 * ({name: absolute directory}) resolves to that local copy of the selected SDK's own package,
 * so the install never asks a registry. Not shipped: the plugin's "files" are its package.json and index.js.
 */
const stage = JSON.parse(process.env.FBTEST_CORE_COPY_STAGE ?? '{}')
module.exports = {
  hooks: {
    readPackage(pkg) {
      for (const [name, dir] of Object.entries(stage)) if (pkg.dependencies?.[name]) pkg.dependencies[name] = 'file:' + dir
      return pkg
    },
  },
}
