"""Root-only finite byte verification; no JS/product/host import or native state."""
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path('/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball')
CAPSULE = ROOT / '.runtime/ni6-public-preparation-r1'
HOST = ROOT / '.runtime/dsh-web'
PRODUCT = CAPSULE / 'package'
PLAN = ROOT / '.runtime/root-ni6-public-preparation-r1-build-plan.json'
sha = lambda data: hashlib.sha256(data).hexdigest()

def require(condition, code):
    if not condition:
        raise RuntimeError(code)

def read(path):
    return json.loads(path.read_text())

def verify():
    require(Path(__file__).resolve() == CAPSULE / 'verify-built-package.py', 'PREP01_BUILD_PATH')
    plan = read(PLAN)
    require(plan['rootReviewedBuildGO'] is True and plan['runCountAuthorized'] == 1
        and plan['all87'] == 'HOLD' and plan['CODE'] == 'BLOCKED_UNCHANGED', 'PREP01_BUILD_GO')
    manifest_path = CAPSULE / 'source-manifest.json'
    require(plan['pins']['.runtime/ni6-public-preparation-r1/source-manifest.json'] == sha(manifest_path.read_bytes()), 'PREP01_BUILD_SEAL')
    manifest = read(manifest_path)
    for key in ('NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT'):
        require(key not in os.environ, 'PREP01_BUILD_ENVIRONMENT')
    require(Path('/opt/homebrew/opt/node@22/bin/node').resolve() == Path(manifest['node']['resolvedBinary']), 'PREP01_BUILD_NODE')
    require(Path(sys.executable).resolve() == Path(manifest['python']['resolvedBinary']), 'PREP01_BUILD_PYTHON')
    for row in manifest['ownedFiles'] + manifest['inputFiles']:
        path = Path(row['path']) if row['path'].startswith('/') else ROOT / row['path']
        require(path.resolve() == path and path.is_file(), 'PREP01_BUILD_PIN_PATH')
        data = path.read_bytes()
        require(len(data) == row['bytes'] and sha(data) == row['sha256'], 'PREP01_BUILD_PIN_DRIFT')
    for name, digest in plan['pins'].items():
        path = Path(name) if name.startswith('/') else ROOT / name
        require(path.resolve() == path and sha(path.read_bytes()) == digest, 'PREP01_BUILD_REVIEW_PIN_DRIFT')
    for name in manifest['requiredAffectedReviews']:
        require(name in plan['pins'], 'PREP01_BUILD_AFFECTED_REVIEW_PIN')
    graph = read(ROOT / manifest['publicGraphManifest'])
    require(graph['root'] == str(HOST) and len(graph['files']) == 27577 and len(graph['links']) == 12, 'PREP01_BUILD_GRAPH')
    for name, digest in graph['files'].items():
        path = HOST / name
        require(path.resolve() == path and sha(path.read_bytes()) == digest, 'PREP01_BUILD_HOST_DRIFT')
    for name, value in graph['links'].items():
        path = HOST / name
        require(path.is_symlink() and os.readlink(path) == value['target'] and str(path.resolve()) == value['resolved'], 'PREP01_BUILD_HOST_LINK')
    require(not (CAPSULE / 'private-runtime').exists(), 'PREP01_BUILD_RUNTIME_ABSENT')
    return manifest, sha(manifest_path.read_bytes())

def main():
    require(len(sys.argv) == 2 and sys.argv[1] in ('--prebuild', '--seal-built'), 'PREP01_BUILD_MODE')
    manifest, seal = verify()
    client = PRODUCT / 'lib/client.js'
    descriptor_path = PRODUCT / 'native-source-manifest.json'
    link = PRODUCT / 'node_modules'
    attempt = CAPSULE / 'build-attempt.json'
    readback = CAPSULE / 'build-readback.json'
    if sys.argv[1] == '--prebuild':
        require(not any(path.exists() or path.is_symlink() for path in (client, descriptor_path, link, attempt, readback)), 'PREP01_BUILD_ALREADY_STARTED')
        with attempt.open('x') as handle:
            json.dump({'contractVersion':'df.ni6-prep01-build-attempt/v1','sourceManifestSha256':seal,'runCountAuthorized':1}, handle, sort_keys=True)
            handle.write('\n')
        os.chmod(attempt, 0o600)
        link.symlink_to(HOST / 'node_modules', target_is_directory=True)
        print(json.dumps({'prebuildVerified':True,'productBuildInputs':63,'hostGraphFiles':27577,'hostGraphLinks':12}))
        return
    require(attempt.is_file() and read(attempt)['sourceManifestSha256'] == seal and not readback.exists(), 'PREP01_BUILD_READBACK_ORDER')
    require(link.is_symlink() and os.readlink(link) == str(HOST / 'node_modules') and link.resolve() == HOST / 'node_modules', 'PREP01_BUILD_PEER_BINDING')
    descriptor = read(descriptor_path)
    require(descriptor['contractVersion'] == 'df.native-source/v1' and descriptor['product']['name'] == 'dsh-fishball'
        and descriptor['product']['version'] == '0.1.0-preview.1', 'PREP01_BUILD_DESCRIPTOR')
    expected = sorted([row['path'] for row in manifest['productBuildInputs']] + ['lib/client.js'])
    require(len(expected) == 64 and [row['path'] for row in descriptor['product']['files']] == expected, 'PREP01_BUILD_64_PATHS')
    for row in descriptor['product']['files']:
        path = PRODUCT / row['path']
        require(path.resolve() == path and path.is_file() and sha(path.read_bytes()) == row['digest'], 'PREP01_BUILD_PRODUCT_DRIFT')
    graph = read(ROOT / manifest['publicGraphManifest'])
    require(descriptor['host']['version'] == '0.2.1-alpha.1' and descriptor['host']['lockDigest'] == graph['lockSha256'], 'PREP01_BUILD_DESCRIPTOR_HOST')
    require([row['name'] for row in descriptor['host']['modules']] == sorted(manifest['expectedNativeDescriptorModules']), 'PREP01_BUILD_HOST_MODULES')
    host_files = 0
    for module in descriptor['host']['modules']:
        require([row['path'] for row in module['files']] == manifest['expectedNativeDescriptorModules'][module['name']], 'PREP01_BUILD_HOST_FILES')
        base = HOST / 'node_modules' / module['name']
        require(read(base / 'package.json')['version'] == module['version'], 'PREP01_BUILD_HOST_VERSION')
        for row in module['files']:
            require(sha((base / row['path']).read_bytes()) == row['digest'], 'PREP01_BUILD_HOST_BYTES')
            host_files += 1
    value = {'contractVersion':'df.ni6-prep01-build-readback/v1','sourceManifestSha256':seal,
        'buildAttemptSha256':sha(attempt.read_bytes()),'productBuildInputCount':63,'productDescriptorFileCount':64,
        'hostModuleCount':len(descriptor['host']['modules']),'hostModuleFileCount':host_files,
        'generated':{'clientSha256':sha(client.read_bytes()),'descriptorSha256':sha(descriptor_path.read_bytes())},
        'originalBuilderSourcesPinned':True,'rootBuildCommandResultsRequiredSeparately':True,
        'runtimeExecuted':False,'all87':'HOLD','CODE':'BLOCKED_UNCHANGED'}
    with readback.open('x') as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write('\n')
    os.chmod(readback, 0o600)
    print(json.dumps({'builtPackageVerified':True,'productDescriptorFiles':64,'clientSha256':value['generated']['clientSha256'],
        'descriptorSha256':value['generated']['descriptorSha256']}))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error)
        print(message if message.startswith('PREP01_') and message.replace('_','').isalnum() else 'PREP01_BUILD_VERIFICATION_FAILED', file=sys.stderr)
        sys.exit(1)
