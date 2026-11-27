import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { owner } from './test-workspaces.mjs'

const ROOT_FILES = /^(?:tests\/|assets\/|locale\/|index\.js$|client(?:\.amenities)?\.js$|cordis\.patch\.yml$|scripts\/(?:test[.-]|module-specifiers\.mjs$|amenity-boundaries\.mjs$))/
const GLOBAL_FILES = new Set(['package.json', 'package-lock.json', '.npmrc', '.node-version', '.nvmrc', '.gitignore'])
const COMPONENT_SCRIPTS = /^(dsh-fishball(?:-instance)?|dsh-connector)\/scripts\//

export function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (error) { throw new Error('git ' + args.join(' ') + ': ' + (error.stderr?.trim() || error.message)) }
}

function changedFiles(root, base) {
  const ref = base === undefined
    ? git(root, ['merge-base', 'HEAD', 'refs/heads/staging']).trim()
    : git(root, ['rev-parse', '--verify', '--end-of-options', base + '^{commit}']).trim()
  // Compare each layer so a working-tree reversion cannot hide a staged or committed change.
  // --no-renames reports both sides as ordinary paths, even across two workspaces.
  const diff = ['diff', '--name-only', '-z', '--no-renames']
  const args = [[...diff, ref, 'HEAD', '--'], [...diff, '--cached', '--'], [...diff, '--'], ['ls-files', '--others', '--exclude-standard', '-z']]
  return [...new Set(args.flatMap((a) => git(root, a).split('\0')).filter(Boolean))].sort()
}

function consumers(catalog, pkg) {
  const reached = new Set([pkg.name])
  for (let size; reached.size !== size;) {
    size = reached.size
    for (const candidate of catalog) if ([...candidate.uses].some((dep) => reached.has(dep))) reached.add(candidate.name)
  }
  reached.delete(pkg.name)
  return [...reached].sort()
}

export function changedPackages(root, catalog, base, report = console.error) {
  const selected = new Set()
  const rootPackage = catalog[0]
  const names = (targets) => targets.map((p) => p.name).sort()
  const impact = (file, affected) => report(file + ': affects ' + affected.join(', ') + ' (not automatically selected)')
  for (const file of changedFiles(root, base)) {
    const pkg = owner(catalog, path.join(root, file))
    if (pkg && pkg !== rootPackage) {
      if (pkg.integration) report(file + ': release-only (' + pkg.name + ')')
      else {
        selected.add(pkg)
        if (pkg.helper) {
          const dependents = consumers(catalog, pkg)
          if (dependents.length) impact(file, dependents)
        }
      }
    } else if (GLOBAL_FILES.has(file)) {
      impact(file, names(catalog))
    } else if (ROOT_FILES.test(file)) {
      selected.add(rootPackage)
      if (file.startsWith('scripts/')) impact(file, names(catalog.filter((p) => p !== rootPackage)))
    } else if (COMPONENT_SCRIPTS.test(file)) {
      const component = COMPONENT_SCRIPTS.exec(file)[1]
      const script = path.join(root, file)
      impact(file, names(catalog.filter((p) => p.dir.startsWith(component + '/') ||
        p.manifest.scripts?.test?.split(/\s+/).slice(1).some((entry) => path.resolve(p.abs, entry) === script))))
    } else report(file + ': no mapping to a package')
  }
  return [...selected].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}
