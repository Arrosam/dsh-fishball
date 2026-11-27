# Workspace and release layout

- [Bundle](../README.md) is the publishable `dsh-fishball-bundle` package at the workspace root. `npm pack --dry-run` at the root lists only bundle files; its published manifest pins registry versions, not local `file:` paths. Inside this checkout, npm can link local workspace packages instead. Test the packed bundle outside the workspace to check what users install.
- [Fishball](../dsh-fishball/README.md) owns the child-side core, UI, shared package and integration packages. Its `scripts/test.mjs` still runs one package at a time; `npm run pack:v3` builds to `dsh-fishball/.runtime/release/`.
- [Connector](../dsh-connector/README.md) owns `dsh-agent-connector`, its adapter and shared package. The connector's pack command writes to `dsh-connector/.runtime/release/`.
- [Instance](../dsh-fishball-instance/README.md) owns the hosted child and its integration fixtures; its pack command writes to `dsh-fishball-instance/.runtime/release/` and can use the Fishball packer's output for offline child installation.
- [Fishball amenities](../amenities/fishball-amenities/README.md) and [connector amenities](../amenities/connector-amenities/README.md) install in the child and parent Web profiles, respectively. Their package names do not change when installed individually or carried by a release bundle.

`npm run test:release` delegates to the existing component release runners in order. It is a release command, not a substitute for checking one package. `--component=<directory>` limits delegation to one component; flags after that selection go to its original runner.
