# fishball-core tests: contracts

Core's own published contracts (`contracts/`: `constants.js` and the `.d.ts` files; K3a), checked
against the connector's published K1 / K2 modules, vendored as fishball-test-helpers/connector-contract
since the connector left this repository (6b7c53bf), and against the current DSH's own credentials and
storage grammars. Ported from test/v3/contract/k3a-core-seams and test/v3/contract/own-schema.

| ids | file | what |
|---|---|---|
| K3a-ARCH, K3a-MCP, K3a-META, K3a-NAMES, K3a-LINK, K3a-DECL, K3a-HOST, K3a-CONNECT, K3a-UI | k3a-cases.mjs | core's copy of the MCP surface equals K1/K2 (EP per group, BVA on the copied grammars), the metadata documents (one row per field), the neutral names, LINK, declared unions equal the constants, the hosted names against DSH's credential grammar, Connect's declarations, the fishballInstance.ui seam declarations |
| K3a-MULTI-* | targets-cases.mjs (+ targets-rules.mjs, targets-constants.mjs) | MULTI-0's TARGETS and SEAM_TARGETS: ids, credential names, tuple keys, tool names, duplicate names (README Examples), storage names |
| K3a-MULTI-SEC-* | multi-security-cases.mjs | the review amendments stated in the public freeze (binding, selectors, description framing) |
| OWN-ARCH | own-schema-cases.mjs | F-OWN-SCHEMA: no generated schema; core's runtime code imports nothing of the DSH side and no other package's folder |
| F-LINK done 7 (link area) | absence.mjs | shared "no generated schema" check |

Level: unit. Declarations are read as text (`declarations.mjs`, `contracts.mjs`: the old K3 reader,
ported without its K3-only data-only rows). No DSH is booted. Retired: the rows that read
packages/dsh-instance (K3a-HOST instance copy, K3a-TARGET), the todo rows whose behaviour is another
area's or another package's, and the old OWN-ARCH check of every Fishball package's folder (each
package checks its own; the cross-package part is an integration row).
