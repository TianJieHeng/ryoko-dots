#!/usr/bin/python3
"""Codex delegation client for the isolated Dots computer; no secrets needed."""
import argparse
import json
from pathlib import Path
import socket
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--agent', choices=['codex', 'claude', 'kimi'], default='codex')
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('submit')
    p.add_argument('--id', required=True)
    p.add_argument('--title', required=True)
    p.add_argument('--task-file', required=True)
    for action in ('status', 'wait', 'cancel'):
        p = sub.add_parser(action)
        p.add_argument('id')
        if action == 'wait':
            p.add_argument('--seconds', type=int, default=10, choices=range(1,51), metavar='1..50')
    sub.add_parser('list')
    request = vars(parser.parse_args())
    if request['action'] == 'submit':
        file = request.pop('task_file')
        request['task'] = sys.stdin.read() if file == '-' else Path(file).read_text()
    # Adjacent socket works both on the host and inside the /workspace bind mount.
    path = str(Path(__file__).resolve().with_name('.dots-codex.sock'))
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(80)
        connection.connect(path)
        connection.sendall(json.dumps(request).encode() + b'\n')
        with connection.makefile('rb') as stream:
            result = json.loads(stream.readline(100000))
    print(json.dumps(result, ensure_ascii=False))
    return 1 if 'error' in result else 0


if __name__ == '__main__':
    sys.exit(main())
