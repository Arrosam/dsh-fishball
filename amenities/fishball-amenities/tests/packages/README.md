# fishball-amenities: the split, from the umbrella's side (AM-*)

Ported from `test/v3/fishball-amenities/packages` (2026-11-22, the test restructure). The requirement (the user's
decision, 2026-11-21) is quoted in [constants.mjs](<constants.mjs>): every amenity is its own package and DSH
bundle at 1.0.0-alpha.1, the umbrella pulls them in and inserts their rows in its own patch, only a package with
browser code carries `dsh.client`, a member installed alone uses its own patch.

**Techniques.** EP per package (AM-EP-01…06, 08), DT for `dsh.client` × browser code (AM-DT-01) and the
umbrella's rows × each member's own (AM-DT-02), BVA on the pinned version (AM-BVA-01), static rows (AM-SC-01…03).

**How it is observed** ([observe.mjs](<observe.mjs>)). The members and their library are this package's
dependencies, reached by name (`createRequire(import.meta.url).resolve('<name>/package.json')`,
[../support/packages.mjs](<../support/packages.mjs>)). Manifests are read as JSON; each `dsh.bundle.patch` is parsed
by the current DSH's own `loadOverlayPatches` (dsh-app-boot); DSH's own `PluginManager.inspect` checks each folder
as the Plugins page's "add" does, offline; the umbrella's shipped files are `npm pack --dry-run --json`
(scripts ignored); the members' import specifiers come from Node's own acorn in a worker
([specifiers-worker.mjs](<specifiers-worker.mjs>)).

**Not here.** AM-EP-07 (the repository root's `workspaces` list the four folders and fishball-shared's) is about
the repository's root manifest, not a package: an integration row.

| id | rows |
|---|---|
| AM-EP-01 | each package: own manifest and name; a patch inserting rows; DSH's inspection accepts it as bundle name@version |
| AM-BVA-01 | each package's version is exactly 1.0.0-alpha.1 |
| AM-DT-01 | dsh.client (web), exports ./client and a shipped client.js exactly on the umbrella and fishball-taskboard |
| AM-EP-02 | a member's own patch inserts only its own row, named by its package |
| AM-EP-03 | the umbrella's patch: its row and every member's, no path row, no duplicate id |
| AM-DT-02 | the umbrella's copy of a member's row equals the member's own |
| AM-EP-04 | the umbrella depends on and bundles every member and fishball-shared, pinned |
| AM-EP-05 | every member depends on and bundles fishball-shared, pinned |
| AM-EP-06 | the umbrella's `files` and packed files hold no member folder |
| AM-COLLECTION | Consultant dependency pinned and bundled once; both install modes insert the same exact Consultant row |
| AM-EP-08 | fishball-shared exports ./instance-follower and ./ui-seam |
| AM-SC-01…03 | no member import leaves its root, none imports another member, each imports fishball-shared/instance-follower |
