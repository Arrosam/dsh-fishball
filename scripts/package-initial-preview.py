"""Package the explicitly selected public initial preview; never runs product code."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile

VERSION = '0.1.0-preview.1'
PREFIX = 'dsh-fishball-' + VERSION + '-initial-preview'
REQUIRED = ('LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'AGENTS.md',
            'scripts/initial-preview.mjs', 'scripts/initial-preview-host.mjs',
            'scripts/package-initial-preview.py', 'docs/INITIAL-PREVIEW.md',
            'docs/INITIAL-PREVIEW-WORKLOG.md')

def fail(code):
    raise ValueError(code)

def public_path(value):
    p = PurePosixPath(value)
    if not isinstance(value, str) or p.is_absolute() or str(p) != value or any(x in ('', '.', '..') for x in value.split('/')):
        fail('PAYLOAD_PATH_INVALID')
    if any(x.startswith('.') for x in value.split('/')):
        fail('PRIVATE_PATH_EXCLUDED')
    return value

def read(root, name):
    path = root
    for component in public_path(name).split('/'):
        path = path / component
        if stat.S_ISLNK(path.lstat().st_mode):
            fail('PAYLOAD_LINK_EXCLUDED')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or path.resolve() != path:
        fail('PAYLOAD_NOT_REGULAR')
    # The body is opaque data, including protected canonical members.
    with path.open('rb') as stream:
        before = os.fstat(stream.fileno())
        data = stream.read()
        after = os.fstat(stream.fileno())
    if (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
        fail('PAYLOAD_CHANGED')
    return data

def exclusive(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--commit', required=True, help='Exact40-character source commit supplied by root; no Git call')
    parser.add_argument('--date', required=True, help='Initial-preview date label, YYYY-MM-DD')
    parser.add_argument('--output', type=Path, required=True, help='Fresh .tar.gz destination; never replaces an archive')
    parser.add_argument('--include', action='append', default=[], help='Exact additional public docs contract path; repeat as needed')
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.commit) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
        fail('BUILD_LABEL_INVALID')
    root = args.source.absolute()
    if root.resolve() != root or not root.is_dir():
        fail('SOURCE_ROOT_UNSAFE')
    output = args.output.absolute()
    if not str(output).endswith('.tar.gz') or output.parent.resolve() != output.parent or not output.parent.is_dir():
        fail('OUTPUT_PATH_UNSAFE')
    sidecars = [Path(str(output) + '.sha256'), Path(str(output) + '.members.json')]
    if any(p.exists() or p.is_symlink() for p in [output] + sidecars):
        fail('OUTPUT_ALREADY_EXISTS')
    native_bytes = read(root, 'native-source-manifest.json')
    native = json.loads(native_bytes)
    product = native['product']
    if product['name'] != 'dsh-fishball' or product['version'] != VERSION or len(product['files']) != 64:
        fail('CANONICAL65_REQUIRED')
    selected = {public_path(row['path']): row['digest'] for row in product['files']}
    if len(selected) != 64:
        fail('CANONICAL_DUPLICATE')
    selected['native-source-manifest.json'] = hashlib.sha256(native_bytes).hexdigest()
    for path in REQUIRED:
        selected.setdefault(path, None)
    for path in args.include:
        public_path(path)
        if not path.startswith('docs/') or path.startswith('docs/evidence/') or not path.endswith('.md'):
            fail('ADDITIONAL_PUBLIC_CONTRACT_ONLY')
        selected.setdefault(path, None)
    members = []
    rows = []
    for name, expected in sorted(selected.items()):
        data = read(root, name)
        digest = hashlib.sha256(data).hexdigest()
        if expected is not None and digest != expected:
            fail('CANONICAL_SEAL_MISMATCH')
        members.append((name, data))
        rows.append({'path': name, 'bytes': len(data), 'sha256': digest})
    metadata = {'schema': 'df.initial-preview-build/v1', 'package': 'dsh-fishball', 'version': VERSION,
                'release': 'initial-preview', 'date': args.date, 'sourceCommit': args.commit,
                'host': 'DSH Web0.2.1-rc.2; separately supplied flat pinned host', 'node': '22.22.2',
                'membersExcludingMetadata': rows, 'includesPrivateState': False, 'acceptedMVP': False}
    metadata_bytes = (json.dumps(metadata, indent=2, sort_keys=True) + '\n').encode()
    members.append(('BUILD-METADATA.json', metadata_bytes))
    members.sort(key=lambda row: row[0])
    rows.append({'path': 'BUILD-METADATA.json', 'bytes': len(metadata_bytes), 'sha256': hashlib.sha256(metadata_bytes).hexdigest()})
    rows.sort(key=lambda row: row['path'])
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as raw:
        with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w|', format=tarfile.USTAR_FORMAT) as archive:
                directories = {PREFIX}
                for name, _ in members:
                    parent = PurePosixPath(PREFIX + '/' + name).parent
                    while str(parent) != '.':
                        directories.add(str(parent)); parent = parent.parent
                for directory in sorted(directories):
                    info = tarfile.TarInfo(directory)
                    info.type = tarfile.DIRTYPE
                    info.mode = 0o755
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ''
                    archive.addfile(info)
                for name, data in members:
                    info = tarfile.TarInfo(PREFIX + '/' + name)
                    info.mode = 0o644
                    info.size = len(data)
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ''
                    archive.addfile(info, io.BytesIO(data))
        raw.flush()
        os.fsync(raw.fileno())
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    exclusive(sidecars[0], (digest + '  ' + output.name + '\n').encode())
    manifest = {'schema': 'df.initial-preview-package-members/v1', 'archive': output.name,
                'bytes': output.stat().st_size, 'sha256': digest, 'prefix': PREFIX, 'members': rows}
    exclusive(sidecars[1], (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode())
    print(json.dumps({'archive': str(output), 'sha256': digest, 'members': len(rows),
                      'bytes': output.stat().st_size, 'version': VERSION, 'sourceCommit': args.commit}))

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]+', str(error)) else 'PACKAGE_BUILD_REFUSED'
        raise SystemExit(code)
