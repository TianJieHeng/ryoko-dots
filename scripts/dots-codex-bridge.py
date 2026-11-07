#!/usr/bin/env python3
"""Narrow Unix-socket bridge from Ryoko's isolated computer to Codex delegation."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import socket
import socketserver
import stat

spec = importlib.util.spec_from_file_location('delegation', Path(__file__).with_name('dots-codex.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def dispatch(client, request):
    action = request.get('action')
    if action == 'submit' and set(request) == {'action', 'id', 'task', 'title'}:
        return client.submit(request['id'], request['task'], request['title'])
    if action in ('status', 'cancel') and set(request) == {'action', 'id'}:
        return getattr(client, action)(request['id'])
    if action == 'wait' and set(request) == {'action', 'id', 'seconds'}:
        seconds = request['seconds']
        if type(seconds) is not int or not 1 <= seconds <= 50:
            raise ValueError('Wait must be 1–50 seconds.')
        return client.wait(request['id'], seconds)
    if action == 'list' and set(request) == {'action'}:
        return {'items': [dict(r) for r in client.db.execute(
            'SELECT id,title,thread_id,submitted,created_at FROM jobs ORDER BY created_at DESC LIMIT 100')]}
    raise ValueError('Unsupported delegation request.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--socket', required=True)
    parser.add_argument('--config-dir', default=str(Path.home() / '.config/ryoko-dots'))
    args = parser.parse_args()
    os.umask(0o077)
    path = Path(args.socket)
    if path.exists():
        if not stat.S_ISSOCK(path.stat().st_mode):
            raise ValueError('Refusing to replace a non-socket path.')
        probe = socket.socket(socket.AF_UNIX)
        try:
            probe.connect(str(path))
        except ConnectionRefusedError:
            path.unlink()
        else:
            raise ValueError('Delegation bridge is already running.')
        finally:
            probe.close()

    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            self.connection.settimeout(80)
            client = None
            try:
                raw = self.rfile.readline(100001)
                if len(raw) > 100000 or not raw.endswith(b'\n'):
                    raise ValueError('Request is too large or incomplete.')
                request = json.loads(raw)
                if not isinstance(request, dict):
                    raise ValueError('Expected object.')
                agent = request.pop('agent', 'codex')
                if agent not in ('codex', 'claude', 'kimi'):
                    raise ValueError('Unsupported agent.')
                client = module.Delegator(args.config_dir, agent)
                result = dispatch(client, request)
            except Exception as error:
                result = {'error': str(error), 'instruction': 'Keep the original job ID; inspect before retrying.'}
            finally:
                if client:
                    client.db.close()
            encoded = json.dumps(result).encode()
            if len(encoded) > 24000:
                encoded = json.dumps({'error': 'Result exceeds terminal output limit; inspect the conversation in Dots.'}).encode()
            self.wfile.write(encoded + b'\n')

    with socketserver.UnixStreamServer(str(path), Handler) as server:
        os.chmod(path, 0o600)
        server.serve_forever()


if __name__ == '__main__':
    main()
