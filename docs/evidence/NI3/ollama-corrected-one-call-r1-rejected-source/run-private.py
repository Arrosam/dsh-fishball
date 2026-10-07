"""Prospective root-owned one-child runner. Never forward private child streams."""
import hashlib
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time

CAPSULE = Path(__file__).resolve().parent
NODE = Path('/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node')
STREAM_CAP = 65536
WORK_SECONDS = 160
DRAIN_SECONDS = 5


def digest(data):
    return hashlib.sha256(data).hexdigest()


def bounded_regular(path, limit):
    stat = path.lstat()
    if not path.is_file() or path.is_symlink() or path.resolve() != path or stat.st_size > limit:
        raise ValueError('SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT')
    return path.read_bytes()


def emit(code, **facts):
    print(json.dumps({'schema': 'df.ollama-live02-private-runner/v1', 'code': code,
                      'rawStreamsPublished': False, 'billing': 'unknown', 'CODE': 'HOLD', **facts},
                     separators=(',', ':')))


def main():
    if len(sys.argv) != 1:
        emit('SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT')
        return 2
    try:
        go = json.loads(bounded_regular(CAPSULE / 'root-execution-go.json', 16384))
        freeze_bytes = bounded_regular(CAPSULE / 'source-freeze.json', 1048576)
        freeze = json.loads(freeze_bytes)
        plan_bytes = bounded_regular(CAPSULE / 'root-plan.json', 65536)
        if not (go.get('schema') == 'df.ollama-live02-root-go/v1' and go.get('go') is True
                and go.get('onceOnly') is True and go.get('privateCommandStreams') is True
                and go.get('fixtureFreezeSha256') == digest(freeze_bytes)
                and go.get('rootPlanSha256') == digest(plan_bytes)
                and go.get('acSha256') == freeze.get('acSha256')
                and go.get('historicalAttemptsBefore') == 1 and go.get('maxAdditionalModelPOST') == 1
                and go.get('originalHostGraphVerified') is True
                and go.get('codeReview', {}).get('accepted') is True
                and go.get('designReview', {}).get('accepted') is True):
            emit('GO_NOT_GRANTED')
            return 2
        if NODE.resolve() != NODE or digest(bounded_regular(NODE, 209715200)) != freeze['node']['sha256']:
            raise ValueError('HOST_CAPABILITY_UNSUPPORTED')
        own_pin = next(item for item in freeze['files'] if item['path'].endswith('/run-private.py'))
        if digest(bounded_regular(CAPSULE / 'run-private.py', 65536)) != own_pin['sha256']:
            raise ValueError('HOST_CAPABILITY_UNSUPPORTED')
        if (CAPSULE / 'preflight-attempt.json').exists() or (CAPSULE / 'private-run').exists():
            raise ValueError('RESOURCE_LIMIT')
    except Exception:
        emit('SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT')
        return 2
    output = CAPSULE / 'private-process-output'
    try:
        output.mkdir(mode=0o700)
    except Exception:
        emit('RESOURCE_LIMIT')
        return 2
    child = None
    stop_requested = False
    signal_sent = False
    failed = False
    safe_code = 'PRIVATE_CHILD_COMPLETED'
    counts = {'stdout': 0, 'stderr': 0}
    hashes = {'stdout': hashlib.sha256(), 'stderr': hashlib.sha256()}
    files = {}
    started = time.monotonic()

    def request_stop(code):
        nonlocal stop_requested, signal_sent, failed, safe_code
        failed = True
        if safe_code == 'PRIVATE_CHILD_COMPLETED':
            safe_code = code
        stop_requested = True
        if not signal_sent and child is not None and child.poll() is None:
            signal_sent = True
            try:
                child.send_signal(signal.SIGTERM)
            except ProcessLookupError:
                pass

    def root_signal(_number, _frame):
        request_stop('ROOT_STOP_REQUESTED')

    prior_int = signal.signal(signal.SIGINT, root_signal)
    prior_term = signal.signal(signal.SIGTERM, root_signal)
    selector = selectors.DefaultSelector()
    try:
        for label in ['stdout', 'stderr']:
            descriptor = os.open(output / (label + '.bin'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            files[label] = os.fdopen(descriptor, 'wb')
        # A prior output/root-control failure cannot permit a late child spawn.
        if failed or stop_requested:
            raise ValueError('PRESPAWN_STOPPED')
        child = subprocess.Popen([str(NODE), '--no-warnings', str(CAPSULE / 'entry.mjs')],
                                 cwd=CAPSULE, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False,
                                 start_new_session=True,
                                 env={'DSH_HOME': str(CAPSULE / 'private-run' / 'home'),
                                      'XDG_CONFIG_HOME': str(CAPSULE / 'private-run' / 'xdg')})
        if stop_requested:
            request_stop(safe_code)
        for label, stream in [('stdout', child.stdout), ('stderr', child.stderr)]:
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, label)
        while selector.get_map() or child.poll() is None:
            elapsed = time.monotonic() - started
            if elapsed >= WORK_SECONDS:
                request_stop('OUTER_WINDOW_UNKNOWN')
            if elapsed >= WORK_SECONDS + DRAIN_SECONDS:
                request_stop('LOCAL_DRAIN_UNKNOWN')
                break
            for key, _events in selector.select(timeout=0.25):
                block = os.read(key.fileobj.fileno(), 8192)
                if not block:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                label = key.data
                remaining = max(0, STREAM_CAP - counts[label])
                kept = block[:remaining]
                if kept:
                    files[label].write(kept)
                    hashes[label].update(kept)
                counts[label] += len(block)
                if counts[label] > STREAM_CAP:
                    request_stop('PRIVATE_STREAM_BOUND')
        returncode = child.poll()
        if returncode is None:
            request_stop('LOCAL_DRAIN_UNKNOWN')
            # No force, process-group signal, new request, or pretend cleanup.
            # Root owns any further lifecycle disposition of this exact child.
        elif returncode != 0:
            failed = True
            if safe_code == 'PRIVATE_CHILD_COMPLETED':
                safe_code = 'PRIVATE_CHILD_HOLD'
        emit(safe_code, exitCode=returncode, childPid=child.pid,
             ownedSessionAndProcessGroup=True, processGroupId=child.pid,
             childStillAlive=returncode is None, gracefulSignalRequests=int(signal_sent),
             elapsedMs=round((time.monotonic() - started) * 1000),
             stdoutBytes=min(counts['stdout'], STREAM_CAP), stderrBytes=min(counts['stderr'], STREAM_CAP),
             stdoutTruncated=counts['stdout'] > STREAM_CAP, stderrTruncated=counts['stderr'] > STREAM_CAP,
             stdoutSha256=hashes['stdout'].hexdigest(), stderrSha256=hashes['stderr'].hexdigest())
        return 2 if failed or returncode != 0 else 0
    except Exception:
        request_stop('PRIVATE_RUNNER_FAILURE')
        emit('PRIVATE_RUNNER_FAILURE', childPid=None if child is None else child.pid,
             ownedSessionAndProcessGroup=child is not None,
             processGroupId=None if child is None else child.pid,
             childStillAlive=child is not None and child.poll() is None,
             gracefulSignalRequests=int(signal_sent))
        return 2
    finally:
        selector.close()
        for stream in files.values():
            try:
                stream.close()
            except Exception:
                pass
        signal.signal(signal.SIGINT, prior_int)
        signal.signal(signal.SIGTERM, prior_term)


if __name__ == '__main__':
    raise SystemExit(main())
