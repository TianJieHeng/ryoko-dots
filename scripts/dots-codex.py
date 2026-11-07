#!/usr/bin/env python3
"""Durable local delegation to the existing Codex Dot; no direct model credentials."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
import uuid
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Delegator:
    def __init__(self, directory, agent="codex"):
        if agent not in ("codex", "claude", "kimi"):
            raise ValueError("Unsupported agent.")
        self.agent = agent
        self.directory = Path(directory)
        key = self.directory / f'{agent}-delegation-key'
        if key.stat().st_mode & 0o077:
            raise ValueError('Delegation key must be private (chmod 600).')
        self.token = key.read_text().strip()
        self.db = sqlite3.connect(self.directory / f'{agent}-delegations.sqlite', timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.execute('''CREATE TABLE IF NOT EXISTS jobs(
            id TEXT PRIMARY KEY, task TEXT NOT NULL, title TEXT NOT NULL,
            thread_id TEXT, submitted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)''')
        self.db.commit()

    def api(self, path, body=None):
        request = Request('http://127.0.0.1:4310/api/v1' + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with build_opener(NoRedirect()).open(request, timeout=75) as response:
                return json.load(response)
        except HTTPError as error:
            raise RuntimeError(f'Dots HTTP {error.code}; retain this job ID and inspect before retrying.') from None

    def job(self, job_id):
        row = self.db.execute('SELECT * FROM jobs WHERE id=?', (str(uuid.UUID(job_id)),)).fetchone()
        if row is None:
            raise ValueError('Unknown delegation ID. Use list to recover existing jobs.')
        return dict(row)

    def submit(self, job_id, task, title):
        job_id = str(uuid.UUID(job_id))
        task, title = task.strip(), title.strip()
        if not 1 <= len(task) <= 16000 or not 1 <= len(title) <= 160:
            raise ValueError('Task must be 1–16000 characters; title must be 1–160.')
        # Commit the intent before any network mutation; same ID/input survives crashes.
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO jobs(id,task,title,created_at) VALUES(?,?,?,?)',
                            (job_id, task, title, int(time.time() * 1000)))
        row = self.job(job_id)
        if row['task'] != task or row['title'] != title:
            raise ValueError('Delegation ID already belongs to different input.')
        if not row['thread_id']:
            thread = self.api('/dots/' + self.agent + '/conversations', {
                'operationId': str(uuid.uuid5(uuid.UUID(job_id), 'conversation')),
                'title': 'Ryoko → ' + self.agent.title() + ': ' + title})
            with self.db:
                self.db.execute('UPDATE jobs SET thread_id=? WHERE id=?', (thread['id'], job_id))
            if thread['state'] != 'ready':
                raise RuntimeError('Conversation outcome uncertain; inspect in Dots, do not create a replacement job.')
            row = self.job(job_id)
        else:
            thread = self.api('/conversations/' + row['thread_id'])
            if thread['state'] != 'ready':
                raise RuntimeError('Conversation is not ready; do not replay or replace it.')
        if not row['submitted']:
            # Persist the known run ID before sending, so a lost receipt can be inspected.
            with self.db:
                self.db.execute('UPDATE jobs SET submitted=1 WHERE id=?', (job_id,))
            self.api('/conversations/' + row['thread_id'] + '/messages',
                     {'operationId': job_id, 'text': task})
        # Once a submission is attempted, subsequent submit calls only inspect it.
        return self.status(job_id)

    def status(self, job_id):
        row = self.job(job_id)
        result = {'jobId': row['id'], 'dotId': self.agent, 'conversationId': row['thread_id'],
                  'title': row['title'], 'runId': row['id'] if row['submitted'] else None}
        if not row['submitted']:
            return {**result, 'state': 'prepared', 'detail': 'No message submission attempted.'}
        run = self.api('/runs/' + row['id'])
        result.update(state=run['state'], detail=run.get('detail'))
        if run['state'] == 'completed':
            messages, cursor = [], None
            while True:
                page = self.api('/conversations/' + row['thread_id'] + '/messages' +
                                ('?' + urlencode({'cursor': cursor}) if cursor else ''))
                messages.extend(m for m in page['items'] if m['role'] == 'assistant' and m['committed'])
                cursor = page.get('nextCursor')
                if cursor is None:
                    break
            result['result'] = '\n\n'.join(m['text'] for m in messages)
        if run['state'] == 'waiting_approval':
            result['action'] = 'Owner must review the request in the target Dot. This command cannot approve it.'
        return result

    def wait(self, job_id, seconds):
        deadline = time.monotonic() + seconds
        while True:
            result = self.status(job_id)
            if result['state'] not in ('accepted', 'running') or time.monotonic() >= deadline:
                return result
            time.sleep(min(2, max(0, deadline - time.monotonic())))

    def cancel(self, job_id):
        row = self.job(job_id)
        if not row['submitted']:
            raise ValueError('No submitted run to cancel.')
        self.api('/runs/' + row['id'] + '/cancel',
                 {'operationId': str(uuid.uuid5(uuid.UUID(row['id']), 'cancel'))})
        return self.status(job_id)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--agent', choices=['codex', 'claude', 'kimi'], default='codex')
    parser.add_argument('--config-dir', default=str(Path.home() / '.config/ryoko-dots'))
    sub = parser.add_subparsers(dest='command', required=True)
    submit = sub.add_parser('submit')
    submit.add_argument('--id', required=True, help='Persist one UUID per requested task; never replace uncertain work.')
    submit.add_argument('--task-file', required=True, help='UTF-8 text file, or - to read stdin.')
    submit.add_argument('--title', required=True)
    for command in ('status', 'wait', 'cancel'):
        p = sub.add_parser(command)
        p.add_argument('id')
        if command == 'wait':
            p.add_argument('--seconds', type=int, choices=range(1, 61), default=50, metavar='1..60')
    sub.add_parser('list')
    args = parser.parse_args()
    try:
        client = Delegator(args.config_dir, args.agent)
        if args.command == 'submit':
            task = sys.stdin.read() if args.task_file == '-' else Path(args.task_file).read_text()
            result = client.submit(args.id, task, args.title)
        elif args.command == 'list':
            result = {'items': [dict(r) for r in client.db.execute(
                'SELECT id,title,thread_id,submitted,created_at FROM jobs ORDER BY created_at DESC LIMIT 100')]}
        elif args.command == 'wait':
            result = client.wait(args.id, args.seconds)
        else:
            result = getattr(client, args.command)(args.id)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error': str(error), 'instruction': 'Keep the original job ID. Do not submit a replacement task.'}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
