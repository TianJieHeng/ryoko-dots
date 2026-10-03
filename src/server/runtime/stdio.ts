import { verifyGitCheckout } from './source-pin.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { ConversationRpc, conversationMethods } from './conversation-rpc.js';
import type { ConversationMethod, ConversationResults } from './wire.js';
import type { RuntimeConversationCapabilities } from '../../shared/runtime/producer/wire.generated.js';
const id = z.string().min(1).max(256);
const path = z.string().max(4096).refine(isAbsolute);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const launchConfigSchema = z.strictObject({
  checkout: path,
  python: path,
  home: path,
  runtimeDirectory: path,
  ownerId: id,
  dotId: id,
  gatewayId: id,
  identity: z.strictObject({
    principal_id: id,
    profile_id: id,
    agent_id: id,
    policy_digest: digest,
    config_digest: digest,
  }),
});
export type LaunchConfig = z.infer<typeof launchConfigSchema>;
export function identityMatches(
  expected: LaunchConfig['identity'],
  actual: RuntimeConversationCapabilities['identity'],
): boolean {
  return (
    [
      'principal_id',
      'profile_id',
      'agent_id',
      'policy_digest',
      'config_digest',
    ] as const
  ).every((field) => actual[field] === expected[field]);
}
export function loadLaunchConfig(
  path: string | undefined,
): LaunchConfig | undefined {
  if (!path) return undefined;
  if (!isAbsolute(path) || statSync(path).size > 16384)
    throw new Error('Invalid server-owned Ryoko configuration.');
  return launchConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
const sha = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const pins = [
  [
    'apps/shared/src/gateway-contract.generated.ts',
    'd29c02608340ab65cb5b5f7b1b66bb8bb253a5c27bf89bab0ee4c4a193740f64',
  ],
  [
    'apps/shared/src/gateway-contract.openrpc.json',
    'c81c3c53e0bee325d172617551adb2350f463a4383a744b67fe29347c339ee29',
  ],
];
/** No shell, inherited provider secrets, Python injection flags, or browser-selected paths. */
export function childEnvironment(config: LaunchConfig): NodeJS.ProcessEnv {
  return {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    LANG: 'C.UTF-8',
    HOME: config.home,
    HERMES_HOME: config.home,
    HERMES_RUNTIME_DIR: config.runtimeDirectory,
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONUNBUFFERED: '1',
  };
}
export interface ConversationTransport {
  readonly config: LaunchConfig;
  readonly connected: boolean;
  start(): Promise<RuntimeConversationCapabilities>;
  call<M extends ConversationMethod>(
    method: M,
    params: unknown,
  ): Promise<ConversationResults[M]>;
  stop(): Promise<void>;
}
export class StdioConversationTransport implements ConversationTransport {
  readonly config: LaunchConfig;
  private process?: ChildProcessWithoutNullStreams;
  private rpc?: ConversationRpc;
  private proof?: RuntimeConversationCapabilities;
  private starting?: Promise<RuntimeConversationCapabilities>;
  private profileHash = '';
  constructor(config: LaunchConfig) {
    this.config = launchConfigSchema.parse(config);
  }
  get connected() {
    return (
      !!this.proof && !!this.rpc?.connected && this.process?.exitCode === null
    );
  }
  private checkProfile() {
    if (existsSync('/etc/hermes'))
      throw new Error(
        'Managed global Ryoko configuration requires separate qualification.',
      );
    const file = join(this.config.home, 'config.yaml');
    if (statSync(file).size > 65536)
      throw new Error('Ryoko profile exceeds the safe configuration bound.');
    const raw = readFileSync(file, 'utf8');
    if (this.profileHash && sha(raw) !== this.profileHash)
      throw new Error(
        'Ryoko profile changed; restart and verify the owner mapping.',
      );
    // BE02 is passive conversation storage. Other startup config, MCP discovery,
    // provider credentials and managed secrets require later adapter qualification.
    const profile = z
      .strictObject({
        agent_identity: z.record(z.string(), z.unknown()),
        mcp_servers: z.strictObject({}).optional(),
        model: z
          .strictObject({
            default: z.string().max(256),
            provider: z.literal('openai'),
          })
          .optional(),
      })
      .parse(JSON.parse(raw));
    const identity = profile.agent_identity;
    if (
      identity.principal_id !== this.config.identity.principal_id ||
      identity.profile_id !== this.config.identity.profile_id ||
      identity.active_agent_id !== this.config.identity.agent_id ||
      identity.primary_agent_id !== this.config.identity.agent_id
    )
      throw new Error('Ryoko launch identity mismatch.');
    const agents = identity.agents as
      Record<string, { role?: string }> | undefined;
    if (agents?.[this.config.identity.agent_id]?.role !== 'primary')
      throw new Error('Only the verified primary agent is qualified in BE02.');
    for (const root of [this.config.home, this.config.checkout])
      if (existsSync(join(root, '.env')))
        throw new Error(
          'BE02 requires an isolated profile and checkout without dotenv credentials.',
        );
    this.profileHash = sha(raw);
  }
  start(): Promise<RuntimeConversationCapabilities> {
    return (this.starting ??= this.launch());
  }
  private async launch() {
    try {
      for (const name of ['checkout', 'home', 'runtimeDirectory'] as const) {
        if (realpathSync(this.config[name]) !== this.config[name])
          throw new Error('Use canonical absolute trusted paths.');
      }
      verifyGitCheckout(
        this.config.checkout,
        '44eec9a9650414aef3e95ef6bf78eebedbb92265',
      );
      for (const [file, expected] of pins)
        if (sha(readFileSync(join(this.config.checkout, file))) !== expected)
          throw new Error('Ryoko generated contract pin mismatch.');
      this.checkProfile();
      const child = spawn(
        this.config.python,
        ['-u', '-m', 'tui_gateway.entry'],
        {
          cwd: this.config.checkout,
          env: childEnvironment(this.config),
          stdio: 'pipe',
          shell: false,
        },
      );
      this.process = child;
      this.rpc = new ConversationRpc(child.stdout, child.stdin);
      child.once('error', () => this.rpc?.close());
      child.once('exit', () => this.rpc?.close());
      // Drain but never retain or log producer diagnostics (they may contain secrets).
      child.stderr.on('data', () => {});
      const proof = await this.rpc.call('runtime.conversation.capabilities', {
        schema_version: 1,
      });
      if (
        !identityMatches(this.config.identity, proof.identity) ||
        proof.authority !== 'trusted_stdio_owner' ||
        proof.owner_scope !== 'principal_profile_agent_home' ||
        proof.transcript_format !== 'safe_transcript_v1' ||
        proof.max_page !== 100 ||
        proof.max_page_text_bytes !== 262144 ||
        conversationMethods.some((method) => !proof.methods.includes(method))
      )
        throw new Error('Ryoko capability identity or bounds mismatch.');
      this.proof = proof;
      return proof;
    } catch {
      await this.stop();
      throw new Error(
        'Ryoko startup or owner identity verification failed. Check the trusted server configuration.',
      );
    }
  }
  async call<M extends ConversationMethod>(
    method: M,
    params: unknown,
  ): Promise<ConversationResults[M]> {
    await this.start();
    this.checkProfile();
    if (!this.connected)
      throw new Error('Ryoko disconnected. Restart the service to reconnect.');
    return this.rpc!.call(method, params);
  }
  async stop() {
    this.proof = undefined;
    this.rpc?.close();
    const child = this.process;
    if (
      !child ||
      !child.pid ||
      child.exitCode !== null ||
      child.signalCode !== null
    )
      return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 2000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }
}
