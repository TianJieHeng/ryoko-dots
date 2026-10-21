/* global process, fetch, console, setTimeout */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const base = process.env.DOTS_API_URL || 'http://127.0.0.1:4310/api/v1';
if (!process.env.DOTS_API_CREDENTIAL_FILE)
  throw Error('Set DOTS_API_CREDENTIAL_FILE to a private credential file.');
const token = readFileSync(process.env.DOTS_API_CREDENTIAL_FILE, 'utf8').trim();
const [dotId, ...words] = process.argv.slice(2);
if (!dotId || !words.length)
  throw Error('Usage: node scripts/dots-chat.mjs DOT_ID message');
async function call(path, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
const t = await call(`/dots/${encodeURIComponent(dotId)}/conversations`, {
  operationId: randomUUID(),
  title: words.join(' ').slice(0, 100),
});
if (t.state !== 'ready')
  throw Error('Conversation outcome is uncertain; inspect it before retrying.');
let run = await call(`/conversations/${t.id}/messages`, {
  operationId: randomUUID(),
  text: words.join(' '),
});
console.log('Message received. Run:', run.id);
while (['accepted', 'running'].includes(run.state)) {
  await new Promise((r) => setTimeout(r, 2000));
  run = await call(`/runs/${run.id}`);
}
if (run.state !== 'completed')
  throw Error(
    `Run state: ${run.state}. Inspect it in Dots; do not automatically resend.`,
  );
let cursor;
do {
  const page = await call(
    `/conversations/${t.id}/messages${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
  );
  for (const m of page.items) if (m.role === 'assistant') console.log(m.text);
  cursor = page.nextCursor;
} while (cursor);
