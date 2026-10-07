"""Freeze only the reviewed continuation; this script does not execute fixtures."""
import hashlib
import json
from pathlib import Path

ROOT = Path('/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball')
BASE = ROOT / '.runtime/ni6-preparation-independent-continuation-r2'
MANIFEST_HASH = '74ed025c33df6eab4bbf19709c33ae8440ee8ce8657d2538060df846a438b199'
NODE_RESOLVED = Path('/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node')
sha = lambda data: hashlib.sha256(data).hexdigest()
manifest_path = BASE / 'source-manifest.json'
assert sha(manifest_path.read_bytes()) == MANIFEST_HASH
manifest = json.loads(manifest_path.read_text())
rows = manifest['inputs'] + manifest['ownedFiles']
assert len(rows) == 126
pins = {}
for row in rows:
    path = Path(row['absolutePath'])
    assert path.resolve() == NODE_RESOLVED or path.resolve().is_relative_to(ROOT)
    data = path.read_bytes()
    assert len(data) == row['bytes'] and sha(data) == row['sha256'], row['path']
    name = str(NODE_RESOLVED) if path.resolve() == NODE_RESOLVED else str(path.relative_to(ROOT))
    if name in pins:
        assert pins[name] == row['sha256']
    pins[name] = row['sha256']
extra = {
    '.runtime/ni6-preparation-independent-continuation-r2/source-manifest.json': MANIFEST_HASH,
    'docs/evidence/NI6/preparation-continuation-r2-independent-source-review.md': 'a44c384b2f821f3dcbbdbf9c5a8a2d40bfcb714a0928a336647d324c56ba032e',
    'docs/evidence/NI6/preparation-continuation-r2-independent-source-review.json': '721cefebda056f9ec8f61a59842c470115bc229d1477cdf4f7cccfa7625e7058',
}
for name, expected in extra.items():
    assert sha((ROOT / name).read_bytes()) == expected, name
    pins[name] = expected
for name in ['.runtime/root-ni6-public-continuation-r2.test.mjs', '.runtime/root-compose-ni6-continuation-plan.py']:
    pins[name] = sha((ROOT / name).read_bytes())
assert not (BASE / 'runs').exists()
assert not (BASE / 'leaves/mig-01.mjs').exists()
wrapper = '.runtime/root-ni6-public-continuation-r2.test.mjs'
plan = {
    'rootReviewedExecutionGO': True,
    'runCountAuthorized': 1,
    'all87': 'HOLD',
    'CODE': 'BLOCKED_UNCHANGED',
    'evidenceDirectory': 'docs/evidence/NI6/schema7-r2-independent-public-continuation-execution',
    'pins': dict(sorted(pins.items())),
    'sourceCopies': sorted(name for name in pins if name.startswith('.runtime/') and not name.endswith('.sqlite')),
    'commands': [
        ['/opt/homebrew/opt/node@22/bin/node', '--check', wrapper],
        ['/opt/homebrew/opt/node@22/bin/node', '--test', '--test-concurrency=1', '--test-reporter=tap', wrapper],
    ],
    'reviewedScope': 'Corrected MIG02 plus exactly24 stopped public leaves; MIG01 excluded, current r2 core only, one run then stop on first failure',
    'effectsUpperBounds': {'selectedLeaves': 25, 'constructorsAndOwnedCloses': 56, 'directPrepareCalls': 123, 'newScratchDatabases': 25, 'modelNetworkNativeServiceProfileEffects': 0},
    'scopeCaveat': 'MIG02 three explicit getMemory calls exclude two transitive state reads; no private backend operation bound, new owner-intent adoption, original full host graph verification or native/installed acceptance',
}
target = ROOT / '.runtime/root-ni6-public-continuation-r2-plan.json'
assert not target.exists()
target.write_text(json.dumps(plan, indent=2, sort_keys=True) + '\n')
print(json.dumps({'plan': str(target.relative_to(ROOT)), 'sha256': sha(target.read_bytes()), 'declaredPins': len(pins), 'fixturesExecuted': 0}))
