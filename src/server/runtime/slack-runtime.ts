import type { OwnerAuth } from '../owner-auth.js';
import type { SelfHostedPlatform } from '../self-hosted-platform.js';
import { SlackWebApi } from './slack-api.js';
import { CommandServiceSlackBridge } from './slack-bridge.js';
import { currentSlackPolicy, loadSlackConfig } from './slack-config.js';
import { SelfHostedSlack } from './slack-service.js';
import { SlackFailure, qualified } from './slack-types.js';

/** The production entrypoint constructs precisely one signed-events adapter. */
export function createSlackRuntime(options: {
  database: string;
  auth: OwnerAuth;
  platform: SelfHostedPlatform;
  env: NodeJS.ProcessEnv;
  locallyPaused?: () => boolean;
}) {
  const { database, auth, platform, env } = options;
  const config = loadSlackConfig(env.DOTS_SLACK_CONFIG_PATH);
  if (!config) return undefined;
  if (
    config.ownerId !== platform.workspace.ownerId ||
    config.dotId !== platform.transport?.config.dotId ||
    config.appOrigin !== auth.origin ||
    !platform.workspace.dot(config.dotId)
  )
    throw new SlackFailure('denied');
  const competing = !!(
    env.SLACK_CHANNEL_NAME ||
    env.RYOKO_SLACK_ENABLED === '1' ||
    env.SLACK_SOCKET_MODE === '1'
  );
  const filePolicy = currentSlackPolicy(env.DOTS_SLACK_CONFIG_PATH!, config);
  const policy = () => {
    filePolicy();
    if (options.locallyPaused?.()) throw new SlackFailure('denied');
  };
  const bridge = new CommandServiceSlackBridge(platform, config, policy);
  const api = new SlackWebApi(() => env.DOTS_SLACK_BOT_TOKEN ?? '', {
    ...(env.DOTS_SLACK_RECOVERY_TOKEN
      ? { recoveryToken: () => env.DOTS_SLACK_RECOVERY_TOKEN! }
      : {}),
  });
  const service = new SelfHostedSlack(
    config,
    database,
    () => env.DOTS_SLACK_SIGNING_SECRET ?? '',
    bridge,
    api,
    Date.now,
    competing,
  );
  platform.conversationOrigin = (id) =>
    service.ledger.origins(id).length ? 'slack' : undefined;
  return service;
}
export async function startSlackRuntime(service: SelfHostedSlack | undefined) {
  // Disabled/unqualified installations do not probe credentials or activate providers.
  if (service?.config.enabled && qualified(service.config))
    await service.start();
}
