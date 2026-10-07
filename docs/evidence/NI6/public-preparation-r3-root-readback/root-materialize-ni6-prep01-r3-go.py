"""Root metadata materialization only; never imports or executes candidates."""
from pathlib import Path
import hashlib
import json
import os
import stat
import sys

ROOT = Path('/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball')
CAPSULE = '.runtime/ni6-public-preparation-r3'
EXECUTOR = '.runtime/ni6-prep01-executor-r3'
GRAPH = '.runtime/ni3-native-runtime/public-graph-pins.json'
sha = lambda b: hashlib.sha256(b).hexdigest()

def read(name):
    return json.loads((ROOT / name).read_bytes())

def pin(name):
    p = Path(name) if name.startswith('/') else ROOT / name
    if p.resolve() != p or not stat.S_ISREG(p.lstat().st_mode):
        raise SystemExit('GO_NONCANONICAL_PUBLIC_FILE')
    return sha(p.read_bytes())

if len(sys.argv) != 2 or sys.argv[1] not in ('build', 'test'):
    raise SystemExit('GO_PHASE')
phase = sys.argv[1]
decision = read('.runtime/root-ni6-prep01-r3-review-readback.json')
if decision['rootReviewedFinalSource'] is not True or decision['newSourceBlockers'] != 0:
    raise SystemExit('GO_FINAL_REVIEW_REQUIRED')
for name, digest in decision['exactFinalReviews'].items():
    if pin(name) != digest:
        raise SystemExit('GO_REVIEW_DRIFT')
manifest_name = CAPSULE + '/source-manifest.json'
executor_manifest_name = EXECUTOR + '/source-manifest.json'
if pin(manifest_name) != decision['fixtureManifestSha256'] or pin(executor_manifest_name) != decision['executorManifestSha256']:
    raise SystemExit('GO_SOURCE_SEAL_DRIFT')
manifest, executor = read(manifest_name), read(executor_manifest_name)
proposal_name = CAPSULE + ('/build-plan.proposed.json' if phase == 'build' else '/test-plan.proposed.json')
plan = read(proposal_name)
records = manifest['ownedFiles'] + manifest['inputFiles'] + executor['ownedFiles'] + executor['inputFiles']
pins = {}
for row in records:
    name, digest = row['path'], row['sha256']
    p = Path(name) if name.startswith('/') else ROOT / name
    if p.stat().st_size != row['bytes'] or pin(name) != digest or (name in pins and pins[name] != digest):
        raise SystemExit('GO_MANIFEST_DRIFT')
    pins[name] = digest
required = set(pins)
required.update([manifest_name, proposal_name, GRAPH,
    'docs/ni6-preparation-r2-executor-freeze-2026-10-07.md',
    'docs/contracts/ni6-public-preparation-diagnostic-v1.md',
    'docs/ni6-executor-r2-remediation-freeze-2026-10-07.md',
    'docs/ni6-executor-r3-ownership-selection-freeze-2026-10-07.md',
    'docs/ni6-preparation-executor-r3-coupled-selection-2026-10-07.md',
    EXECUTOR + '/runner.py', executor_manifest_name])
required.update(manifest['requiredAffectedReviews'])
required.update(manifest['requiredRootGoPins'])
required.update(['docs/evidence/NI6/public-preparation-r2-executor-independent-design.md',
    'docs/evidence/NI6/public-preparation-r2-executor-independent-design.json'])
if set(manifest['requiredAffectedReviews']) != set(decision['exactFinalReviews']):
    raise SystemExit('GO_REVIEW_SET')
if phase == 'test':
    observed = read('.runtime/root-ni6-prep01-r3-observed-build-return.json')
    if observed['actualDriverExitCode'] != 0 or observed['fixtureManifestSha256'] != decision['fixtureManifestSha256']:
        raise SystemExit('GO_REAL_BUILD_RETURN_REQUIRED')
    required.update(CAPSULE + '/' + name for name in [
        'package/lib/client.js', 'package/native-source-manifest.json', 'build-attempt.json', 'build-readback.json'])
    required.add('docs/evidence/NI6/public-preparation-r3-build/command-results.json')
    plan['actualBuildDriverExitCode'] = 0
for name in required:
    pins[name] = pin(name)
input_names = {r['path'] for r in manifest['inputFiles']}
copies = {r['path'] for r in manifest['ownedFiles']}
copies.update(name for name in required - input_names if not name.startswith('/'))
if any('/private-' in name or '/private-runtime/' in name for name in copies):
    raise SystemExit('GO_PRIVATE_COPY_FORBIDDEN')
plan.update({'rootReviewedBuildGO': phase == 'build', 'rootReviewedExecutionGO': phase == 'test',
    'pins': dict(sorted(pins.items())), 'sourceCopies': sorted(copies), 'publicGraphManifest': GRAPH,
    'rootDecision': 'EXACT_FINAL_SOURCE_AND_EIGHT_INDEPENDENT_REPORTS_FULLY_READ; SUPPORTED_ACTION_TIME_APPROVAL_STILL_REQUIRED',
    'accepted': 0, 'all87': 'HOLD', 'CODE': 'BLOCKED_UNCHANGED'})
name = '.runtime/root-ni6-public-preparation-r3-' + ('build-plan.json' if phase == 'build' else 'execution-plan.json')
raw = (json.dumps(plan, indent=2, sort_keys=True) + '\n').encode()
fd = os.open(ROOT / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, 'wb') as h:
    h.write(raw)
print(json.dumps({'phase': phase, 'plan': name, 'sha256': sha(raw), 'pins': len(pins),
    'sourceCopies': len(copies), 'applicationExecution': 0, 'modelCalls': 0}, sort_keys=True))
