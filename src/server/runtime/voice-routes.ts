import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Guard } from '../self-hosted-platform.js';
import type { VerifiedRuntimeScope } from './bindings.js';
import { ConversationError } from './conversation-ledger.js';
import type { RuntimeVoiceService } from './voice-service.js';

/** Mount beneath /api after owner authentication/body limits; parent owns error handling. */
export function runtimeVoiceRoutes(
  voice: RuntimeVoiceService,
  guard: (context: Context) => Guard,
  profileScope: (
    context: Context,
    auth: Guard,
  ) => Promise<VerifiedRuntimeScope>,
) {
  const app = new Hono();
  const id = z.string().min(1).max(256);
  const noQuery = (c: Context) => {
    if (new URL(c.req.url).search)
      throw new ConversationError('Unexpected voice query parameters.', 400);
  };
  app.get('/runtime/voice', async (c) => {
    noQuery(c);
    const auth = guard(c);
    const scope = await profileScope(c, auth);
    auth();
    return c.json(voice.profile(scope));
  });
  app.get('/runtime/voice/health', (c) => {
    noQuery(c);
    guard(c)();
    return c.json(voice.health());
  });
  app.post('/runtime/voice/calls', async (c) => {
    noQuery(c);
    return c.json(
      await voice.begin(await c.req.json(), guard(c), c.req.raw.signal),
    );
  });
  app.get('/runtime/voice/operations/:id', async (c) => {
    noQuery(c);
    return c.json(
      await voice.inspectAdmission(z.uuid().parse(c.req.param('id')), guard(c)),
    );
  });
  app.get('/runtime/voice/calls/:id', async (c) => {
    noQuery(c);
    return c.json(await voice.call(id.parse(c.req.param('id')), guard(c)));
  });
  app.get('/runtime/conversations/:id/calls', async (c) => {
    noQuery(c);
    return c.json(await voice.list(id.parse(c.req.param('id')), guard(c)));
  });
  app.post('/runtime/voice/calls/:id/compute', async (c) => {
    noQuery(c);
    return c.json(
      await voice.compute(
        id.parse(c.req.param('id')),
        await c.req.json(),
        guard(c),
      ),
    );
  });
  app.get('/runtime/voice/compute/operations/:id', async (c) => {
    noQuery(c);
    return c.json(
      await voice.inspectCompute(z.uuid().parse(c.req.param('id')), guard(c)),
    );
  });
  app.post('/runtime/voice/calls/:id/control', async (c) => {
    noQuery(c);
    return c.json(
      await voice.control(
        id.parse(c.req.param('id')),
        await c.req.json(),
        guard(c),
      ),
    );
  });
  app.post('/runtime/voice/calls/:id/transcript', async (c) => {
    noQuery(c);
    return c.json(
      await voice.transcript(
        id.parse(c.req.param('id')),
        await c.req.json(),
        guard(c),
      ),
    );
  });
  return app;
}
