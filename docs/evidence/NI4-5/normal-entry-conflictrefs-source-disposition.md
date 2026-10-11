# Conflict references: preserved source and withdrawn widening

Status: SOURCE ONLY. No source or fixture change; no execution. Root withdrew the proposed maximum-256 parser change after checking the exact original source. NP01–NP05 remain NOT_RUN; all 87 AC remain HOLD.

The immutable `before/src/memory.mjs` and current `src/memory.mjs` both have SHA256 `dba915b9f3c2a76ef05cce50611a553ecb792e896b7095b70e7491a9cae72a01`. At line 25 both literally declare `function array(value, max = 16)`. At lines 74 and 133 the fact validator and candidate validator invoke `array(value.conflictRefs)` / `array(input.conflictRefs)` without an override. The actual original adapter response domain is therefore at most 16 conflict references. The outer continuity `capture()` array ceiling of 128 does not widen that inner validation.

The first ordinary review's maximum-256 premise is contradicted by its own declared exact source pin. The reviewer was asked to preserve the first report and provide a transparent source recheck. This author does not overwrite or silently repair that independent report.

No genuine positive 17-reference or 256-reference fixture can be proposed through these unchanged original adapter operations. The client line `normalRefs(fact.conflictRefs, { unique: false })` remains unchanged, retaining the helper's maximum 16. A future boundary fixture could genuinely write/read 16 and reject an attempted correction with 17 through the original continuity/adapter stack, but that source delta is not requested or implemented here.

Exact candidate source, both closures, literal delta, adapter/continuity sources, and the first review pair are copied byte-for-byte under `.runtime/ni4-5-normal-wiring-proposal/history/parser-73c808-before-conflictrefs-disposition/manifest.json`. The candidate pins remain draft closure `73c8088d785211c117820cb9205029a72262ccaab2b95962214b15b48287ddee`, parser closure `4f37d24fe84f31f2930e1eca784914847bb379582a4fb3b6dc5387d2a9124ac2`, client `8789517fd4271eff7e1531b57ee34713de24c8cbc1899938c4e60b53a0b26e74`, fixture `f4693d8e827cda18b898a752a8e82768784fa394e0fb8611ba0016d0fb6e515d`, delta `fd0e2052780f2249d9e850afa89ad2c02774ffe61f2e332b0c5b13a27ee5f164`.

NP02 still uses declared cold feature wire; it is not an installed endpoint or Panel oracle. Later NI3 MB01 source remains excluded; the target retains captured `4bb9` dependency. No positive publication or acceptance gate changes.
