import { PageEffectError } from './runtime/page-effect-service.js';
import {
  nativePageSaveSchema,
  nativePagePublishSchema,
} from './runtime/page-runtime-service.js';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { stream } from 'hono/streaming';
import { z } from 'zod';
import { commandIntentSchema } from '../shared/runtime/contracts.js';
import { OwnerAuth, requireOwner } from './owner-auth.js';
import { SelfHostedPlatform } from './self-hosted-platform.js';
import { browserDeliveryAcknowledgmentSchema } from './runtime/delivery-service.js';
import { controlActionSchema } from './runtime/control-service.js';
import { ConversationError } from './runtime/conversation-ledger.js';
import { PageError, pageInput, pagePatch } from './pages.js';
import type { Store } from './store.js';
const id = z.string().min(1).max(256);
const cursor = z.string().min(1).max(2048);
const create = z.strictObject({
  operationId: z.uuid(),
  dotId: id,
  title: z.string().trim().min(1).max(200),
});
const listQuery = z.strictObject({
  dotId: id,
  cursor: cursor.optional(),
  query: z.string().max(200).default(''),
  archived: z.enum(['true', 'false']).default('false'),
});
const readQuery = z.strictObject({ cursor: cursor.optional() });
const mutation = z.strictObject({
  operationId: z.uuid(),
  expectedRevision: z.number().int().min(1),
});
function query(c: Context) {
  const params = new URL(c.req.url).searchParams;
  const keys = [...params.keys()];
  if (keys.length !== new Set(keys).size)
    throw new ConversationError(
      'Duplicate query parameters are not permitted.',
      400,
    );
  return Object.fromEntries(params);
}
function guard(c: Context, platform: SelfHostedPlatform) {
  const owner = requireOwner(c);
  if (owner.ownerId !== platform.workspace.ownerId)
    throw new ConversationError('Workspace owner mismatch.', 403);
  return owner.assertCurrent;
}
export function createSelfHostedApp({
  auth,
  platform,
  store,
}: {
  auth: OwnerAuth;
  platform: SelfHostedPlatform;
  store: Store;
}) {
  const app = new Hono();
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 1_000_000,
      onError: (c) => c.json({ error: 'Request is too large.' }, 413),
    }),
  );
  app.use('/api/*', auth.middleware());
  app.get('/api/runtime/setup', async (c) => {
    const current = guard(c, platform);
    const { dotId } = z
      .strictObject({ dotId: z.string().max(256).default('') })
      .parse(query(c));
    const value = await platform.setup(dotId);
    current();
    return c.json(value);
  });
  app.get('/api/runtime/conversations', async (c) => {
    const input = listQuery.parse(query(c));
    return c.json(
      await platform.list(
        input.dotId,
        input.cursor,
        input.query,
        input.archived === 'true',
        guard(c, platform),
      ),
    );
  });
  app.get('/api/runtime/conversations/search', async (c) => {
    const input = listQuery.parse(query(c));
    return c.json(
      await platform.list(
        input.dotId,
        input.cursor,
        input.query,
        input.archived === 'true',
        guard(c, platform),
      ),
    );
  });
  app.post('/api/runtime/conversations', async (c) => {
    const input = create.parse(await c.req.json());
    return c.json(
      await platform.create(
        input.operationId,
        { dotId: input.dotId, title: input.title, pageId: null, spaceId: null },
        guard(c, platform),
      ),
      201,
    );
  });
  app.post('/api/runtime/pages/:id/conversation', async (c) => {
    const input = create.extend({ spaceId: id }).parse(await c.req.json());
    return c.json(
      await platform.create(
        input.operationId,
        {
          dotId: input.dotId,
          title: input.title,
          pageId: id.parse(c.req.param('id')),
          spaceId: input.spaceId,
        },
        guard(c, platform),
      ),
      201,
    );
  });
  app.get('/api/runtime/operations/:id', async (c) => {
    z.strictObject({}).parse(query(c));
    const operationId = z.uuid().parse(c.req.param('id'));
    return c.json(
      platform.controls?.has(operationId)
        ? await platform.controls.inspect(operationId, guard(c, platform))
        : await platform.recover(operationId, guard(c, platform)),
    );
  });
  app.get('/api/runtime/conversations/:id/results/:commandId', async (c) => {
    z.strictObject({}).parse(query(c));
    if (!platform.delivery)
      throw new ConversationError(
        'Runtime result delivery is unavailable.',
        503,
      );
    return c.json(
      await platform.delivery.readResult(
        id.parse(c.req.param('id')),
        id.parse(c.req.param('commandId')),
        guard(c, platform),
      ),
    );
  });
  app.post(
    '/api/runtime/conversations/:id/deliveries/:deliveryId/ack',
    async (c) => {
      z.strictObject({}).parse(query(c));
      if (!platform.delivery)
        throw new ConversationError(
          'Runtime result delivery is unavailable.',
          503,
        );
      const claim = browserDeliveryAcknowledgmentSchema.parse(
        await c.req.json(),
      );
      return c.json(
        await platform.delivery.acknowledge(
          id.parse(c.req.param('id')),
          id.parse(c.req.param('deliveryId')),
          claim,
          guard(c, platform),
        ),
      );
    },
  );
  const controls = () => {
    if (!platform.controls)
      throw new ConversationError('Runtime controls are unavailable.', 503);
    return platform.controls;
  };
  for (const name of ['control', 'missions', 'effects', 'reviews'] as const)
    app.get(`/api/runtime/conversations/:id/${name}`, async (c) => {
      z.strictObject({}).parse(query(c));
      const conversationId = id.parse(c.req.param('id')),
        auth = guard(c, platform),
        service = controls();
      return c.json(
        await {
          control: () => service.readControl(conversationId, auth),
          missions: () => service.readMissions(conversationId, auth),
          effects: () => service.readEffects(conversationId, auth),
          reviews: () => service.readReviews(conversationId, auth),
        }[name](),
      );
    });
  app.get('/api/runtime/conversations/:id/reviews/:reviewId', async (c) => {
    z.strictObject({}).parse(query(c));
    return c.json(
      await controls().readReview(
        id.parse(c.req.param('id')),
        id.parse(c.req.param('reviewId')),
        guard(c, platform),
      ),
    );
  });
  app.get(
    '/api/runtime/conversations/:id/deliveries/:deliveryId',
    async (c) => {
      z.strictObject({}).parse(query(c));
      return c.json(
        await controls().readDelivery(
          id.parse(c.req.param('id')),
          id.parse(c.req.param('deliveryId')),
          guard(c, platform),
        ),
      );
    },
  );
  for (const route of [
    '/control',
    '/missions/:missionId/actions',
    '/reviews/:reviewId/decision',
    '/deliveries/:deliveryId/actions',
  ])
    app.post('/api/runtime/conversations/:id' + route, async (c) => {
      z.strictObject({}).parse(query(c));
      const input = controlActionSchema.parse(await c.req.json());
      const path = new URL(c.req.url).pathname.slice('/api'.length);
      return c.json(
        await controls().admit(
          id.parse(c.req.param('id')),
          path,
          input,
          guard(c, platform),
        ),
      );
    });
  app.post('/api/runtime/conversations/:id/connect', async (c) => {
    z.strictObject({}).parse(await c.req.json());
    if (!platform.commands)
      throw new ConversationError(
        'Runtime command adapter is unavailable.',
        503,
      );
    const executable = await platform.commands.connect(
      id.parse(c.req.param('id')),
      guard(c, platform),
    );
    if (platform.transport?.config.nativePages)
      await platform.nativePages?.connect(
        c.req.param('id'),
        guard(c, platform),
      );
    const bound = platform.workspace.runtimeBindings.resolveConversation(
      c.req.param('id'),
    );
    const setup = await platform.setup(bound.dotId);
    if (!executable)
      setup.features.commands = {
        state: 'unsupported',
        reason:
          'This selected conversation provider does not support durable execution.',
      };
    return c.json(setup);
  });
  const pages = () => {
    if (!platform.nativePages)
      throw new ConversationError('Native page adapter is unavailable.', 503);
    return platform.nativePages;
  };
  app.get('/api/runtime/artifacts', (c) => {
    const input = z.strictObject({ dotId: id }).parse(query(c));
    return c.json(pages().artifacts(input.dotId, guard(c, platform)));
  });
  app.get('/api/runtime/artifacts/:id/versions/:version/content', (c) => {
    const input = z.strictObject({ dotId: id }).parse(query(c));
    const revision = z
      .string()
      .regex(/^[1-9][0-9]{0,15}$/)
      .transform(Number)
      .refine(Number.isSafeInteger)
      .parse(c.req.param('version'));
    const result = pages().artifact(
      input.dotId,
      id.parse(c.req.param('id')),
      revision,
      guard(c, platform),
    );
    c.header('Content-Type', result.metadata.mime);
    c.header('Content-Length', String(result.metadata.size));
    c.header(
      'Content-Disposition',
      `attachment; filename="${result.metadata.filename}"`,
    );
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Cache-Control', 'private, no-store');
    c.header('ETag', `"${result.metadata.sha256}"`);
    return stream(c, async (output) => {
      for (let offset = 0; offset < result.bytes.length; offset += 16384) {
        if (c.req.raw.signal.aborted || output.aborted) return;
        result.guard();
        await output.write(result.bytes.subarray(offset, offset + 16384));
      }
    });
  });
  app.post(
    '/api/runtime/conversations/:id/page-effects/:effectId/inspect',
    async (c) => {
      z.strictObject({}).parse(query(c));
      z.strictObject({}).parse(await c.req.json());
      return c.json(
        await pages().inspectEffect(
          id.parse(c.req.param('id')),
          id.parse(c.req.param('effectId')),
          guard(c, platform),
        ),
      );
    },
  );
  app.get('/api/runtime/conversations/:id/page-saves', (c) => {
    z.strictObject({}).parse(query(c));
    return c.json(
      pages().list(id.parse(c.req.param('id')), guard(c, platform)),
    );
  });
  app.post('/api/runtime/conversations/:id/page-saves', async (c) => {
    z.strictObject({}).parse(query(c));
    return c.json(
      await pages().prepare(
        id.parse(c.req.param('id')),
        nativePageSaveSchema.parse(await c.req.json()),
        guard(c, platform),
      ),
    );
  });
  app.get(
    '/api/runtime/conversations/:id/page-saves/:operationId',
    async (c) => {
      z.strictObject({}).parse(query(c));
      return c.json(
        await pages().inspect(
          id.parse(c.req.param('id')),
          z.uuid().parse(c.req.param('operationId')),
          guard(c, platform),
        ),
      );
    },
  );
  app.post(
    '/api/runtime/conversations/:id/page-saves/:operationId/publish',
    async (c) => {
      z.strictObject({}).parse(query(c));
      return c.json(
        await pages().publish(
          id.parse(c.req.param('id')),
          z.uuid().parse(c.req.param('operationId')),
          nativePagePublishSchema.parse(await c.req.json()),
          guard(c, platform),
        ),
      );
    },
  );
  app.get('/api/runtime/conversations/:id/commands', async (c) => {
    const input = z
      .strictObject({
        cursor: z
          .string()
          .regex(/^[1-9][0-9]{0,15}$/)
          .refine((value) => Number.isSafeInteger(Number(value)))
          .optional(),
      })
      .parse(query(c));
    if (!platform.commands)
      throw new ConversationError(
        'Runtime command adapter is unavailable.',
        503,
      );
    return c.json(
      await platform.commands.list(
        id.parse(c.req.param('id')),
        input.cursor,
        guard(c, platform),
      ),
    );
  });
  app.post('/api/runtime/conversations/:id/commands', async (c) => {
    const input = z
      .strictObject({
        operationId: z.uuid(),
        intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
        intent: commandIntentSchema,
        expectedGeneration: z.number().int().nonnegative(),
      })
      .parse(await c.req.json());
    if (input.intent.conversationId !== id.parse(c.req.param('id')))
      throw new ConversationError('Command conversation mismatch.', 400);
    if (!platform.commands)
      throw new ConversationError(
        'Runtime command adapter is unavailable.',
        503,
      );
    return c.json(
      await platform.commands.admit(
        input.operationId,
        input.intentDigest,
        input.intent,
        input.expectedGeneration,
        guard(c, platform),
      ),
    );
  });
  app.get('/api/runtime/commands/:id', async (c) => {
    z.strictObject({}).parse(query(c));
    if (!platform.commands)
      throw new ConversationError(
        'Runtime command adapter is unavailable.',
        503,
      );
    return c.json(
      await platform.commands.inspect(
        z.uuid().parse(c.req.param('id')),
        guard(c, platform),
      ),
    );
  });
  app.get('/api/runtime/conversations/:id/events', async (c) => {
    const input = readQuery.parse(query(c));
    if (!platform.commands)
      throw new ConversationError(
        'Runtime command adapter is unavailable.',
        503,
      );
    return c.json(
      await platform.commands.events(
        id.parse(c.req.param('id')),
        input.cursor,
        guard(c, platform),
      ),
    );
  });
  app.get('/api/runtime/conversations/:id/history', async (c) => {
    const input = readQuery.parse(query(c));
    return c.json(
      await platform.history(
        id.parse(c.req.param('id')),
        input.cursor,
        guard(c, platform),
      ),
    );
  });
  app.post('/api/runtime/conversations/:id/rename', async (c) => {
    const input = mutation
      .extend({ title: z.string().trim().min(1).max(200) })
      .parse(await c.req.json());
    return c.json(
      await platform.change(
        input.operationId,
        id.parse(c.req.param('id')),
        input.expectedRevision,
        { title: input.title },
        guard(c, platform),
      ),
    );
  });
  app.post('/api/runtime/conversations/:id/archive', async (c) => {
    const input = mutation
      .extend({ archived: z.boolean() })
      .parse(await c.req.json());
    return c.json(
      await platform.change(
        input.operationId,
        id.parse(c.req.param('id')),
        input.expectedRevision,
        { archived: input.archived },
        guard(c, platform),
      ),
    );
  });
  app.get('/api/runtime/conversations/:id/export', async (c) => {
    z.strictObject({}).parse(query(c));
    const current = guard(c, platform);
    const conversationId = id.parse(c.req.param('id'));
    // Authorize before sending headers, then recheck per producer page and write.
    await platform.authorizeDownload(conversationId, current);
    c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    c.header(
      'Content-Disposition',
      'attachment; filename="conversation-safe-text.ndjson"',
    );
    return stream(c, async (output) => {
      const detached = new AbortController();
      output.onAbort(() => detached.abort());
      const signal = AbortSignal.any([c.req.raw.signal, detached.signal]);
      try {
        for await (const chunk of platform.export(
          conversationId,
          current,
          signal,
        )) {
          current();
          await output.write(chunk);
        }
      } catch {
        if (signal.aborted) return;
        current();
        await output.write(
          JSON.stringify({
            complete: false,
            error:
              'Export interrupted; the file is incomplete. Retry from the beginning.',
          }) + '\n',
        );
      }
    });
  });
  app.get('/api/workspace', (c) => {
    guard(c, platform)();
    return c.json({
      spaces: platform.workspace.spaces(),
      dots: platform.workspace.dots(),
      conversations: [],
      calls: [],
      setup: {
        intelligence: false,
        model: false,
        browser: false,
        voice: false,
        slack: 'unsupported',
        missing: [],
      },
    });
  });
  app.get('/api/state', (c) => {
    guard(c, platform)();
    return c.json({
      settings: store.settings(),
      tasks: store.tasks(),
      memories: [],
      mode: 'live',
      configured: false,
    });
  });
  app.get('/api/conversations/:id/reviewed-page/:toolCallId', (c) => {
    guard(c, platform)();
    const conversationId = id.parse(c.req.param('id'));
    const toolCallId = z
      .string()
      .min(1)
      .max(200)
      .parse(c.req.param('toolCallId'));
    const dotId = platform.workspace.runtimeBindings.hasConversation(
      conversationId,
    )
      ? platform.workspace.runtimeBindings.resolveConversation(
          conversationId,
          'read',
        ).dotId
      : platform.workspace.requireThread(conversationId).dotId;
    const receipt = platform.workspace.pages.reviewReceipt(
      conversationId,
      toolCallId,
    );
    if (!receipt) return c.json(null);
    if (!platform.workspace.canAccessSpace(dotId, receipt.spaceId))
      throw new ConversationError(
        'Legacy page receipt Space access revoked.',
        403,
      );
    return c.json(
      platform.workspace.pages.get(receipt.spaceId, receipt.pageId),
    );
  });
  app.get('/api/spaces/:spaceId/pages', (c) => {
    guard(c, platform)();
    return c.json(
      platform.workspace.pages.list(id.parse(c.req.param('spaceId'))),
    );
  });
  app.get('/api/spaces/:spaceId/pages/:id', (c) => {
    guard(c, platform)();
    return c.json(
      platform.workspace.pages.get(
        id.parse(c.req.param('spaceId')),
        id.parse(c.req.param('id')),
      ),
    );
  });
  app.post('/api/spaces/:spaceId/pages', async (c) => {
    const input = pageInput.parse(await c.req.json());
    guard(c, platform)();
    return c.json(
      platform.workspace.pages.create(id.parse(c.req.param('spaceId')), input),
      201,
    );
  });
  app.patch('/api/spaces/:spaceId/pages/:id', async (c) => {
    const input = pagePatch.parse(await c.req.json());
    guard(c, platform)();
    return c.json(
      platform.workspace.pages.update(
        id.parse(c.req.param('spaceId')),
        id.parse(c.req.param('id')),
        input,
      ),
    );
  });
  // Explicit retirement seam: no wildcard proxy, legacy SDK, timer or model fallback.
  app.all('/api/runtime/*', (c) =>
    c.json(
      {
        error:
          'This runtime adapter is not yet qualified. No work was dispatched.',
      },
      501,
    ),
  );
  app.all('/api/*', (c) =>
    c.json(
      {
        error:
          'This legacy capability is unavailable during the self-hosted migration.',
      },
      501,
    ),
  );
  app.onError((error, c) => {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return c.json(
        { error: 'Invalid request: use only the documented bounded fields.' },
        400,
      );
    if (
      error instanceof ConversationError ||
      error instanceof PageError ||
      error instanceof PageEffectError
    )
      return c.json({ error: error.message }, error.status);
    return c.json(
      {
        error:
          'The self-hosted runtime request could not complete. No fallback execution was started.',
      },
      503,
    );
  });
  return app;
}
