#!/usr/bin/env python3
"""One supervised process tree owns state; maintenance uses this same lock.
Linux-only. No daemonization or escaping the process group is supported.
"""
import argparse
import ctypes
import os
import signal
import subprocess
import sys
import time
from safe_state import gate, SafetyError


def run(lock, command, timeout=20):
    if not command or not os.path.isabs(command[0]):
        raise SafetyError('absolute executable required')
    # Adopt/reap producer grandchildren before releasing the state gate.
    if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0:
        raise SafetyError('Linux child-subreaper is required')
    with gate(lock) as lock_fd:
        # Retain the lock in the direct state owner even if this supervisor is
        # killed. Producer descendants still require service/cgroup shutdown.
        child = subprocess.Popen(command, start_new_session=True, pass_fds=(lock_fd,), env={**os.environ, 'DOTS_STATE_GATE_FD': str(lock_fd)})
        deadline = None
        def send_group(signum):
            try:
                os.killpg(child.pid, signum)
            except ProcessLookupError:
                pass
        def forward(signum, _frame):
            nonlocal deadline
            if deadline is None:
                deadline = time.monotonic() + timeout
            send_group(signum)
        old = {s: signal.signal(s, forward) for s in (signal.SIGTERM, signal.SIGINT)}
        try:
            # Do not block indefinitely in wait() when the direct owner ignores
            # TERM. Keep the lifetime gate held through bounded tree escalation.
            while child.poll() is None:
                if deadline is not None and time.monotonic() >= deadline:
                    send_group(signal.SIGKILL)
                time.sleep(0.02)
            code = child.returncode
            send_group(signal.SIGTERM)
            if deadline is None:
                deadline = time.monotonic() + timeout
            while True:
                try:
                    pid, _ = os.waitpid(-1, os.WNOHANG)
                    if pid:
                        continue
                except ChildProcessError:
                    break
                if time.monotonic() >= deadline:
                    send_group(signal.SIGKILL)
                time.sleep(0.02)
            return code
        finally:
            for s, handler in old.items():
                signal.signal(s, handler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', required=True)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        sys.exit(run(args.gate, args.command[1:] if args.command[:1] == ['--'] else args.command))
    except (SafetyError, OSError):
        print('State owner startup refused. Check private gate configuration.', file=sys.stderr)
        sys.exit(1)
