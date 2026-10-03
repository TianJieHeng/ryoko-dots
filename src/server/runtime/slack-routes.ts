import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { OwnerAuth, requireOwner } from '../owner-auth.js';
import {
  browserScope,
  type SelfHostedPlatform,
} from '../self-hosted-platform.js';
import { SelfHostedSlack } from './slack-service.js';
import { SlackFailure, identifier } from './slack-types.js';

/** Mount once on the self-hosted server. No managed SDK or separate agent route. */
export function createSelfHostedSlackApp(options: {
  service: SelfHostedSlack;
  auth: OwnerAuth;
  platform: SelfHostedPlatform;
}) {
  const { service, auth, platform } = options;
  const app = new Hono();
  app.use(
    '/slack/events',
    bodyLimit({
      maxSize: 65536,
      onError: (c) => c.json({ error: 'Slack event too large.' }, 413),
    }),
  );
  app.post('/slack/events', (c) => service.handle(c.req.raw));
  app.use('/api/*', auth.middleware());
  const scope = async (c: Context, conversationId?: string) => {
    const owner = requireOwner(c);
    owner.assertCurrent();
    if (
      owner.ownerId !== service.config.ownerId ||
      owner.ownerId !== platform.workspace.ownerId
    )
      throw new SlackFailure('denied');
    const result = await platform.scope(service.config.dotId);
    owner.assertCurrent();
    if (conversationId) {
      if (!identifier(conversationId)) throw new SlackFailure('invalid');
      const bound = platform.workspace.runtimeBindings.resolveConversation(
        conversationId,
        'read',
      );
      if (bound.dotId !== service.config.dotId)
        throw new SlackFailure('denied');
    }
    return browserScope(result);
  };
  app.get('/api/runtime/channels/slack', async (c) =>
    c.json(service.status(await scope(c))),
  );
  app.get('/api/runtime/conversations/:id/provenance', async (c) => {
    const id = c.req.param('id');
    return c.json(service.provenance(id, await scope(c, id)));
  });
  app.get('/api/runtime/channel-deliveries', async (c) =>
    c.json(service.deliveries(undefined, await scope(c))),
  );
  // Explicit inspect is read-only at Slack. No endpoint can retry an unknown send.
  app.post('/api/runtime/channel-deliveries/:id/inspect', async (c) => {
    const verified = await scope(c);
    const id = c.req.param('id');
    if (!identifier(id)) throw new SlackFailure('invalid');
    const row = await service.inspectDelivery(id);
    requireOwner(c).assertCurrent();
    return c.json(service.deliveries(row.conversationId, verified));
  });
  app.onError((error, c) => {
    const status =
      error instanceof SlackFailure
        ? error.code === 'denied'
          ? 403
          : error.code === 'invalid'
            ? 400
            : error.code === 'conflict'
              ? 409
              : 503
        : 503;
    return c.json(
      { error: 'Slack adapter unavailable or access denied.' },
      status,
    );
  });
  return app;
}
