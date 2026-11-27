"""Soft limits; only expired, unpinned test evidence is ever removed."""
from datetime import datetime, timedelta, timezone
import os
import re
import shutil
import stat

GIB = 1024**3
RUN_BYTES = 100 * 1024**2
POOL_BYTES = 5 * GIB
POLICY = {'integration': (8 * GIB, 30), 'dev-1': (2 * GIB, 7), 'dev-2': (2 * GIB, 7)}
RUN_ID = re.compile(r'([0-9]{8}T[0-9]{6}Z)-[0-9a-f]{7,40}-[a-zA-Z0-9_-]+')


def size(path):
    total = 0
    for folder, dirs, files in os.walk(path, followlinks=False):
        for name in (*dirs, *files):
            item = os.lstat(os.path.join(folder, name))
            total += item.st_blocks * 512
    return total


def cleanup(root):
    now = datetime.now(timezone.utc)
    evidence = root / 'evidence'
    removed, warnings = [], []
    for ident, (budget, days) in POLICY.items():
        parent = evidence / ident
        if parent.resolve() != parent:
            raise ValueError('Linked evidence location refused')
        parent.mkdir(exist_ok=True)
        for run in sorted(parent.iterdir()):
            match = RUN_ID.fullmatch(run.name)
            if not match or not stat.S_ISDIR(run.lstat().st_mode):
                continue
            try:
                created = datetime.strptime(match[1], '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if created <= now - timedelta(days=days) and not os.path.lexists(run / '.pin'):
                shutil.rmtree(run)
                removed.append(f'{ident}/{run.name}')
            elif size(run) >= RUN_BYTES:
                warnings.append(f'{ident}/{run.name} is at or above the 100 MiB evidence limit')
        env = root / 'envs' / ident
        if size(env) >= budget:
            warnings.append(f'{ident} is at or above its {budget // GIB} GiB soft limit; stop adding data')
    if size(evidence) >= POOL_BYTES:
        warnings.append('Evidence pool is at or above 5 GiB; do not start new evidence runs')
    return {'removed': removed, 'warnings': warnings}
