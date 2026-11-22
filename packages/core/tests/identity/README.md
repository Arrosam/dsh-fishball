# fishball-core tests: identity

Core's identity and pairing (F-PAIR, core's `src/identity/`: `createPairing`, `openRecords`,
`createRecords`, `generateId`, `acceptId`, `requestedName`), driving core's own link. Requirements
R-ID-02/05/07/10/13, R-OA-18/19, R-FB-04, R-NAME-02/03/05, R-HOST-10.

| ids | technique | what |
|---|---|---|
| AUTH-UC-05, NAME-UC-02, HOST-UC-04 | use case | pairing on first connect, already-paired (match / mismatch), id-taken, a new token and id; set_name reactions; an entry switched off and on |
| AUTH-EP-03, TOKEN-REVOKED | EP | the generated id, identity.id validity; token-refused vs token-revoked |
| AUTH-BVA-02 | BVA | identity.id length 0, 1, 2, 63, 64, 65 |
| AUTH-DT-06, NAME-DT-03 | decision table | record × scope × pair answer; the name answers of pair and set_name |
| AUTH-ST-03 | state transition | NoRecord → Paired / WarnMatch / WarnMismatch / NeedToken / NeedId / IdMismatch / TokenRefused, one invalid transition |
| OWN-NAME | EP | a normalisation-equivalent name setting sends no set_name (F-OWN-SCHEMA) |

Observation: a loopback fake connector (fishball-test-helpers/fake-connector `startFakeConnector`)
over `FakePairs`, an in-memory pair registry following K1's rules; its request and call log is what
core sent. The records port runs in the current DSH's real storage (dsh-storage over
dsh-storage-json in a throwaway root, `storage.mjs`, shared with link-save), so a restart reopens the
same files. The NAME-UC-02 rows ran over the connector's real pair store (C-PAIR); that store left
with the connector (6b7c53bf), so they run over FakePairs: the subject is core's reaction to K1's
answers. The page rows (the warning's tick and Continue, the name-clash line, the marks) were `todo`
for E2E-CORE / E2E-UI and belong to fishball-ui; they are not ported.
