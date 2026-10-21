import { CodexAdapter } from './codex.js';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { OwnerAuth, requireOwner } from '../owner-auth.js';
import { ApiCredentials } from './credentials.js';
import { DotHub } from './service.js';
declare module 'hono' {
  interface ContextVariableMap {
    apiPrincipal: ReturnType<ApiCredentials['authenticate']> | undefined;
  }
}
const id = z.string().min(1).max(256);
const operation = z.uuid();
const cursor = (c: Context) =>
  z.string().max(2048).optional().parse(c.req.query('cursor'));
export function hubRoutes(
  hub: DotHub,
  credentials: ApiCredentials,
  auth: OwnerAuth,
) {
  const app = new Hono();
  const rates = new Map<string, { at: number; n: number }>();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const bearer = c.req.header('authorization');
    if (!bearer) return auth.middleware()(c, next);
    if (
      new URL(c.req.url).host !== new URL(auth.origin).host ||
      (c.req.header('origin') && c.req.header('origin') !== auth.origin)
    )
      throw new HTTPException(403, { message: 'API origin mismatch.' });
    if (!bearer.startsWith('Bearer '))
      throw new HTTPException(401, { message: 'Use a bearer API credential.' });
    const principal = credentials.authenticate(bearer.slice(7));
    if (
      !['GET', 'HEAD'].includes(c.req.method) &&
      c.req.header('content-type')?.split(';')[0] !== 'application/json'
    )
      throw new HTTPException(415, { message: 'Use application/json.' });
    const now = Date.now();
    if (rates.size > 1000)
      for (const [key, r] of rates) if (now - r.at > 60000) rates.delete(key);
    const rate = rates.get(principal.id);
    if (rate && now - rate.at < 60000) {
      if (++rate.n > 240)
        throw new HTTPException(429, { message: 'API rate limit reached.' });
    } else rates.set(principal.id, { at: now, n: 1 });
    c.set('apiPrincipal', principal);
    await next();
    principal.assertCurrent();
  });
  function authorize(c: Context, dotId?: string, write = false, admin = false) {
    const p = c.get('apiPrincipal') as
      ReturnType<ApiCredentials['authenticate']> | undefined;
    if (p) {
      if (admin || (dotId && !p.dots.includes(dotId)) || (write && !p.write))
        throw new HTTPException(403, {
          message: 'Credential does not permit this operation.',
        });
      p.assertCurrent();
      return p.assertCurrent;
    }
    return requireOwner(c).assertCurrent;
  }
  const threadGuard = (c: Context, write = false) =>
    authorize(c, hub.thread(id.parse(c.req.param('id'))).dotId, write);
  const runGuard = (c: Context, write = false) =>
    authorize(
      c,
      hub.thread(hub.run(id.parse(c.req.param('id'))).threadId).dotId,
      write,
    );
  app.get('/runtime-templates', (c) => {
    authorize(c, undefined, false, true);
    return c.json({ items: hub.templates });
  });
  app.post('/dots', async (c) => {
    authorize(c, undefined, true, true);
    const input = z
      .strictObject({ templateId: id, name: z.string().trim().min(1).max(80) })
      .parse(await c.req.json());
    if (!hub.enroll)
      throw new HTTPException(503, {
        message: 'Runtime enrollment is unavailable.',
      });
    return c.json(hub.enroll(input.templateId, input.name), 201);
  });
  app.get('/dots', (c) => {
    authorize(c);
    const p = c.get('apiPrincipal') as
      ReturnType<ApiCredentials['authenticate']> | undefined;
    return c.json(hub.dots(cursor(c), p?.dots));
  });
  app.get('/dots/:id', (c) => {
    authorize(c, c.req.param('id'));
    return c.json(hub.dot(c.req.param('id')));
  });
  app.patch('/dots/:id', async (c) => {
    authorize(c, c.req.param('id'), true, true);
    return c.json(
      hub.update(
        c.req.param('id'),
        z
          .strictObject({
            name: z.string().trim().min(1).max(80).optional(),
            archived: z.boolean().optional(),
            isDefault: z.literal(true).optional(),
          })
          .parse(await c.req.json()),
      ),
    );
  });
  app.post('/dots/:id/conversations', async (c) => {
    const guard = authorize(c, c.req.param('id'), true);
    const input = z
      .strictObject({
        operationId: operation,
        title: z.string().trim().min(1).max(200),
      })
      .parse(await c.req.json());
    const r = await hub.create(
      c.req.param('id'),
      input.operationId,
      input.title,
      guard,
    );
    guard();
    return c.json(r, 201);
  });
  app.get('/dots/:id/conversations', async (c) => {
    const guard = authorize(c, c.req.param('id'));
    const r = await hub.threads(c.req.param('id'), cursor(c), guard);
    guard();
    return c.json(r);
  });
  app.get('/conversations/:id', (c) => {
    threadGuard(c);
    return c.json(hub.thread(c.req.param('id')));
  });
  app.get('/conversations/:id/messages', async (c) => {
    const guard = threadGuard(c);
    const r = await hub.messages(c.req.param('id'), cursor(c), guard);
    guard();
    return c.json(r);
  });
  app.post('/conversations/:id/messages', async (c) => {
    const guard = threadGuard(c, true);
    const input = z
      .strictObject({
        operationId: operation,
        text: z.string().trim().min(1).max(16000),
      })
      .parse(await c.req.json());
    const r = await hub.submit(
      c.req.param('id'),
      input.operationId,
      input.text,
      guard,
    );
    guard();
    return c.json(r, 202);
  });
  app.get('/conversations/:id/runs', (c) => {
    threadGuard(c);
    return c.json({ items: hub.runs(c.req.param('id')) });
  });
  app.get('/runs', (c) => {
    authorize(c);
    return c.json(hub.activity(cursor(c), c.get('apiPrincipal')?.dots));
  });
  app.get('/runs/:id', async (c) => {
    const guard = runGuard(c);
    return c.json(await hub.inspect(c.req.param('id'), guard));
  });
  app.get('/runs/:id/events', async (c) => {
    const guard = runGuard(c);
    await hub.inspect(c.req.param('id'), guard);
    const n = z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .parse(c.req.query('cursor') ?? 0);
    return c.json(hub.events(c.req.param('id'), n));
  });
  app.get('/runs/:id/children', async (c) =>
    c.json(await hub.children(c.req.param('id'), runGuard(c))),
  );
  app.post('/runs/:id/cancel', async (c) => {
    const guard = runGuard(c, true);
    const input = z
      .strictObject({ operationId: operation })
      .parse(await c.req.json());
    return c.json(
      await hub.cancel(c.req.param('id'), input.operationId, guard),
    );
  });
  app.get('/conversations/:id/approvals', (c) => {
    threadGuard(c);
    const t = hub.thread(c.req.param('id'));
    const a = hub.adapter(t.dotId);
    return c.json({
      items:
        a instanceof CodexAdapter && t.nativeId
          ? a.pendingApprovals(t.nativeId)
          : [],
    });
  });
  app.post('/conversations/:id/approvals/:approvalId', async (c) => {
    const guard = threadGuard(c, true);
    authorize(c, undefined, true, true);
    const input = z
      .strictObject({ accept: z.boolean() })
      .parse(await c.req.json());
    const t = hub.thread(c.req.param('id'));
    const a = hub.adapter(t.dotId);
    if (!(a instanceof CodexAdapter) || !t.nativeId)
      throw new HTTPException(409, { message: 'Approvals unavailable.' });
    a.approve(t.nativeId, c.req.param('approvalId'), input.accept, guard);
    return c.json({ resolved: true });
  });
  app.get('/credentials', (c) => {
    authorize(c, undefined, false, true);
    return c.json({ items: credentials.list() });
  });
  app.post('/credentials', async (c) => {
    authorize(c, undefined, true, true);
    const input = z
      .strictObject({
        name: z.string().trim().min(1).max(80),
        dots: z.array(id).min(1).max(100),
        write: z.boolean(),
        lifetimeDays: z.number().int().min(1).max(365),
      })
      .parse(await c.req.json());
    input.dots.forEach((d) => hub.dot(d));
    return c.json(
      credentials.create(
        input.name,
        input.dots,
        input.write,
        input.lifetimeDays,
      ),
      201,
    );
  });
  app.post('/credentials/:id/revoke', (c) => {
    authorize(c, undefined, true, true);
    credentials.revoke(c.req.param('id'));
    return c.json({ revoked: true });
  });
  app.get('/openapi.json', (c) => {
    authorize(c);
    return c.json(openapi);
  });
  app.onError((e, c) => {
    if (e instanceof HTTPException)
      return c.json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return c.json(
        {
          error: 'Invalid request.',
          issues: e.issues.map((i) => ({ path: i.path, message: i.message })),
        },
        400,
      );
    return c.json(
      { error: 'Runtime unavailable. Inspect existing work before retrying.' },
      503,
    );
  });
  return app;
}
const operationId = { type: 'string', format: 'uuid' };
const response = {
  description: 'JSON result; acceptance is distinct from completion.',
  content: {
    'application/json': {
      schema: { type: 'object', additionalProperties: true },
    },
  },
};
const param = (name: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
});
const body = (properties: object, required: string[]) => ({
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  },
});
export const openapi = {
  openapi: '3.1.0',
  info: { title: 'Dots API', version: '1.0.0' },
  servers: [{ url: '/api/v1' }],
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: { apiKey: { type: 'http', scheme: 'bearer' } },
  },
  paths: {
    '/dots': {
      get: {
        summary: 'List accessible Dots; cursor pagination',
        responses: { 200: response },
      },
    },
    '/dots/{dotId}': {
      get: { parameters: [param('dotId')], responses: { 200: response } },
    },
    '/dots/{dotId}/conversations': {
      get: { parameters: [param('dotId')], responses: { 200: response } },
      post: {
        parameters: [param('dotId')],
        requestBody: body({ operationId, title: { type: 'string' } }, [
          'operationId',
          'title',
        ]),
        responses: { 201: response },
      },
    },
    '/conversations/{conversationId}/messages': {
      get: {
        parameters: [param('conversationId')],
        responses: { 200: response },
      },
      post: {
        parameters: [param('conversationId')],
        requestBody: body(
          { operationId, text: { type: 'string', maxLength: 16000 } },
          ['operationId', 'text'],
        ),
        responses: { 202: response },
      },
    },
    '/runs/{runId}': {
      get: { parameters: [param('runId')], responses: { 200: response } },
    },
    '/runs/{runId}/events': {
      get: {
        parameters: [
          param('runId'),
          {
            name: 'cursor',
            in: 'query',
            schema: { type: 'integer', minimum: 0 },
          },
        ],
        responses: { 200: response },
      },
    },
    '/runs/{runId}/children': {
      get: { parameters: [param('runId')], responses: { 200: response } },
    },
    '/runs/{runId}/cancel': {
      post: {
        parameters: [param('runId')],
        requestBody: body({ operationId }, ['operationId']),
        responses: { 200: response },
      },
    },
  },
};
