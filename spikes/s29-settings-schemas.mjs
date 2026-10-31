/**
 * S29 (revision 10, DESIGN §10d): can the Host read each private-tree row's config schema
 * (the module's `Config`, as cordis reads it), redact secrets with DSH's own `redactSecrets`,
 * send `schema.toJSON()` to the browser, and check a candidate? Which field kinds do the
 * owner's installed plugins and Fishball's built-ins use?
 *
 * The owner's `web` profile plugins are LINKED read-only from ~/.dsh/profiles/web into a
 * throwaway home (as the P9 rehearsal does); nothing in ~/.dsh is written.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, host, hostPkg, runSpike, until, REPO } from './harness.mjs'

const WEB = '/Users/samuel/.dsh/profiles/web'
process.env.BSK_HOME ??= path.join(REPO, '.runtime', 'bsk-home')

/** Field kinds the planned form draws (§10d "The form"). */
const DRAWN = new Set(['string', 'number', 'natural', 'percent', 'boolean'])

/** Classify every leaf field of a live Schemastery schema. */
function classify(schema, at = [], out = { fields: [], secrets: 0 }) {
  if (!schema) return out
  const meta = schema.meta ?? {}
  if (meta.hidden) return out
  const type = schema.type
  if (type === 'object') { for (const [key, inner] of Object.entries(schema.dict ?? {})) classify(inner, [...at, key], out); return out }
  if (type === 'intersect') { for (const inner of schema.list ?? []) classify(inner, at, out); return out }
  const field = { path: at.join('.') || '(root)', type, drawn: false }
  if (meta.role === 'secret') { field.secret = true; out.secrets += 1 }
  if (DRAWN.has(type)) field.drawn = true
  else if (type === 'union') {
    const branches = schema.list ?? []
    field.drawn = branches.length > 0 && branches.every((b) => b.type === 'const')
    if (!field.drawn) field.branches = branches.map((b) => b.type).join('|')
  } else if (type === 'array') {
    field.drawn = DRAWN.has(schema.inner?.type)
    field.inner = schema.inner?.type
  }
  out.fields.push(field)
  return out
}

/** The rows of a bundle patch, group children included. */
const flatten = (rows) => rows.flatMap((row) => (row.group && Array.isArray(row.config) ? [row, ...flatten(row.config)] : [row]))

await runSpike('S29-settings-schemas', async () => {
  const schemastery = await host('@deepseek-ai/schemastery/lib/index.mjs'); const Schema = schemastery.default ?? schemastery
  const { redactSecrets } = await hostPkg('dsh-settings')
  const webPkg = JSON.parse(fs.readFileSync(path.join(WEB, 'package.json'), 'utf8'))
  const deps = Object.keys(webPkg.dependencies ?? {}).filter((d) => d !== 'dsh-fishball')
  const { ctx, profileDir } = await bootDsh('s29', [], { setupProfile: (dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    for (const name of deps) {
      const source = path.join(WEB, 'node_modules', name)
      if (!fs.existsSync(source) || pkg.dependencies?.[name] !== undefined) continue
      const target = fs.realpathSync(source)
      pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
      fs.mkdirSync(path.dirname(path.join(dir, 'node_modules', name)), { recursive: true })
      if (!fs.existsSync(path.join(dir, 'node_modules', name))) fs.symlinkSync(target, path.join(dir, 'node_modules', name))
    }
    // dsh-fishball linked, so DSH's runtime resolution serves our src files' imports (as in DSH).
    pkg.dependencies['dsh-fishball'] = 'link:' + REPO
    pkg.dsh.profile.bundles.push('dsh-fishball')
    fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  } })
  await until(() => ctx.pluginManager !== undefined, 20000, 100)
  const { resolveBundleDir } = await hostPkg('dsh-app-boot')
  const SURFACE = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-acp-app', '@deepseek-ai/dsh-headless', '@deepseek-ai/dsh-sdk-app', '@deepseek-ai/dsh-sdk-minimal'])
  const { readPackageRows, anchorRowModules } = await import(path.join(REPO, 'src', 'bundle-rows.js'))
  const { BUILTIN_PLUGINS } = await import(path.join(REPO, 'src', 'builtins.js'))
  const bundles = (await ctx.pluginManager.listBundles()).filter((b) => b.availability !== 'missing')

  const results = []
  const inspect = async (plugin, row, url, config) => {
    const record = { plugin, row: row.id, module: row.name }
    try {
      const mod = await import(url)
      const schema = mod.Config ?? mod.default?.Config ?? mod.schema ?? mod.default?.schema
      if (!Schema.isSchema?.(schema) && typeof schema !== 'function') { record.config = 'none'; return record }
      const { fields, secrets } = classify(schema)
      record.config = 'schema'
      record.fields = fields.length
      record.drawn = fields.filter((f) => f.drawn).length
      record.notDrawn = fields.filter((f) => !f.drawn).map((f) => `${f.path}:${f.type}${f.inner ? '<' + f.inner + '>' : ''}${f.branches ? '(' + f.branches + ')' : ''}`)
      record.secrets = secrets
      // The browser receives the JSON envelope and rebuilds the schema (as DSH's settings view does).
      // Equivalent if the rebuilt schema resolves the patch config to the same value.
      const rebuilt = new Schema(JSON.parse(JSON.stringify(schema.toJSON())))
      try { record.jsonRoundTrip = JSON.stringify(rebuilt(config ?? {})) === JSON.stringify(schema(config ?? {})) } catch { record.jsonRoundTrip = 'invalid-config' }
      // Checking a candidate: the patch's config resolves; a wrong type is refused.
      try { schema(config ?? {}); record.patchConfigValid = true } catch (error) { record.patchConfigValid = String(error.message).slice(0, 120) }
      const firstNumber = fields.find((f) => ['number', 'natural'].includes(f.type) && !f.path.includes('.'))
      if (firstNumber) { try { schema({ ...(config ?? {}), [firstNumber.path]: 'not a number' }); record.badValueRefused = false } catch { record.badValueRefused = true } }
      if (secrets > 0) record.redacted = redactSecrets(schema, schema(config ?? {})).secrets.map((s) => s.path.join('.') + (s.set ? ':set' : ':unset'))
    } catch (error) { record.config = 'import-failed: ' + String(error.message).slice(0, 160) }
    return record
  }

  // DSH plugins: rows read from each bundle's own patch, module names resolved from its folder.
  for (const bundle of bundles) {
    let rows, dir
    // Fishball's catalog leaves out the installation's surface bundles (DESIGN §4).
    if (SURFACE.has(bundle.name)) continue
    try { dir = resolveBundleDir('dsh-fishball', bundle.name, ctx.profileContext.installAnchor, ctx.profileContext.dir) } catch { results.push({ plugin: bundle.name, config: 'no-dir' }); continue }
    try { rows = anchorRowModules(flatten(readPackageRows(dir)), dir) } catch (error) { results.push({ plugin: bundle.name, config: 'rows: ' + (error.code ?? error.message) }); continue }
    for (const row of rows) if (!row.group && typeof row.name === 'string') results.push(await inspect(bundle.name, row, row.name, row.config))
  }
  // Fishball's built-ins: modules from the DSH installation.
  const installed = (name) => path.join('/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules', name, 'lib', 'index.js')
  for (const plugin of BUILTIN_PLUGINS) {
    for (const row of flatten(plugin.rows)) {
      if (row.group || typeof row.name !== 'string') continue
      const url = row.name.startsWith('@') ? installed(row.name) : path.join(REPO, row.name)
      results.push(await inspect(plugin.key, row, fs.existsSync(url) ? url : row.name, row.config))
    }
  }
  const withSchema = results.filter((r) => r.config === 'schema')
  const fields = withSchema.reduce((n, r) => n + r.fields, 0)
  const drawn = withSchema.reduce((n, r) => n + r.drawn, 0)
  const kinds = {}
  for (const r of withSchema) for (const f of r.notDrawn) { const k = f.split(':').slice(1).join(':'); kinds[k] = (kinds[k] ?? 0) + 1 }
  return {
    pass: results.every((r) => r.config === 'schema' || r.config === 'none' || r.config === 'rows: edits-other-rows') && withSchema.every((r) => r.jsonRoundTrip !== false),
    summary: { rows: results.length, withSchema: withSchema.length, noSettings: results.filter((r) => r.config === 'none').length, failed: results.filter((r) => !['schema', 'none'].includes(r.config)).length, fields, drawn, drawnShare: fields ? Math.round((drawn / fields) * 100) + '%' : null, notDrawnKinds: kinds, rowsWithSecrets: withSchema.filter((r) => r.secrets > 0).map((r) => r.plugin + '#' + r.row) },
    results,
  }
})
