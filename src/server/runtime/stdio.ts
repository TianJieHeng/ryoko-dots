import { BE06_PRODUCER_COMMIT, type Be06Transport } from './be06-service.js';
import { be06Methods } from './be06-wire.js';
import { verifyGitCheckout } from './source-pin.js';
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { ConversationRpc, conversationMethods } from './conversation-rpc.js';
import type {
  ConversationMethod,
  ConversationResults,
  NativeHandler,
} from './wire.js';
import type { RuntimeConversationCapabilities } from '../../shared/runtime/producer/wire.generated.js';
const id = z.string().min(1).max(256);
const path = z.string().max(4096).refine(isAbsolute);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const endpoint = z
  .url()
  .max(4096)
  .refine((value) => {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  });
export const launchConfigSchema = z.strictObject({
  checkout: path,
  python: path,
  home: path,
  runtimeDirectory: path,
  ownerId: id,
  dotId: id,
  gatewayId: id,
  providerEnvironment: z
    .strictObject({
      OPENAI_API_KEY: z.string().min(1).max(8192).optional(),
      OPENAI_BASE_URL: endpoint.optional(),
    })
    .optional(),
  identityProjects: z
    .array(z.strictObject({ spaceId: id, projectId: id }))
    .max(100)
    .optional(),
  nativePages: z
    .strictObject({
      adapterId: id,
      projects: z
        .array(z.strictObject({ spaceId: id, projectId: id }))
        .min(1)
        .max(100),
    })
    .optional(),
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
  actual: Pick<
    RuntimeConversationCapabilities['identity'],
    keyof LaunchConfig['identity']
  >,
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
    '418386827d1d1a12e8c20c1b8e7d3081a6f317aea270da52262cec5f52fc12ca',
  ],
  [
    'apps/shared/src/gateway-contract.openrpc.json',
    '1bf4ab3a304834538db5e379a06ce7e3b37acd53c8e0b193808d10a4fd5b447a',
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
    ...config.providerEnvironment,
  };
}
export function verifyProviderScope(config: LaunchConfig) {
  // Strict Ryoko identities resolve credentials from their profile scope, not
  // process environment. Admit only an exact server-configured scope file;
  // never import arbitrary dotenv settings or write credentials ourselves.
  if (existsSync(join(config.checkout, '.env')))
    throw new Error('Checkout dotenv configuration is not permitted.');
  const scopeFile = join(config.home, '.env');
  const scoped = Object.entries(config.providerEnvironment ?? {})
    .map(([key, value]) => `${key}=${JSON.stringify(value)}\n`)
    .join('');
  const actual = existsSync(scopeFile) ? readFileSync(scopeFile, 'utf8') : '';
  if (actual !== scoped)
    throw new Error(
      'Profile credential scope must exactly match the reviewed provider configuration.',
    );
}
export interface ConversationTransport {
  readonly be06Qualification?: Be06Transport['be06Qualification'];
  readonly config: LaunchConfig;
  readonly connected: boolean;
  readonly epoch?: number;
  start(): Promise<RuntimeConversationCapabilities>;
  call<M extends ConversationMethod>(
    method: M,
    params: unknown,
  ): Promise<ConversationResults[M]>;
  stop(): Promise<void>;
  setNativeHandler?(handler: NativeHandler): () => void;
  subscribeResultAvailable?(
    listener: (notification: unknown, epoch: number) => void,
  ): () => void;
}
export class StdioConversationTransport implements ConversationTransport {
  readonly config: LaunchConfig;
  private process?: ChildProcessWithoutNullStreams;
  private rpc?: ConversationRpc;
  private proof?: RuntimeConversationCapabilities;
  private starting?: Promise<RuntimeConversationCapabilities>;
  private profileHash = '';
  epoch = 0;
  private nativeHandler?: NativeHandler;
  setNativeHandler(handler: NativeHandler) {
    if (this.nativeHandler)
      throw new Error('Native handler already registered.');
    this.nativeHandler = handler;
    return () => {
      if (this.nativeHandler === handler) this.nativeHandler = undefined;
    };
  }
  private resultListeners = new Set<
    (notification: unknown, epoch: number) => void
  >();
  subscribeResultAvailable(
    listener: (notification: unknown, epoch: number) => void,
  ) {
    if (this.resultListeners.size >= 4)
      throw new Error('Result observer bound exceeded.');
    this.resultListeners.add(listener);
    return () => {
      this.resultListeners.delete(listener);
    };
  }
  constructor(config: LaunchConfig) {
    this.config = launchConfigSchema.parse(config);
  }
  get be06Qualification() {
    return this.connected
      ? {
          producerCommit: BE06_PRODUCER_COMMIT,
          methods: be06Methods,
          specialistSessions: true,
        }
      : undefined;
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
    verifyProviderScope(this.config);
    // BE03 permits a reviewed provider configuration, never arbitrary inherited secrets.
    if (this.profileHash) return;
    const parsed = spawnSync(
      this.config.python,
      [
        '-I',
        '-c',
        'import json,sys; from ruamel.yaml import YAML; reader=YAML(typ="safe",pure=True); reader.version=(1,1); print(json.dumps(reader.load(sys.stdin.read())))',
      ],
      {
        input: raw,
        encoding: 'utf8',
        env: childEnvironment(this.config),
        timeout: 5000,
        maxBuffer: 262144,
      },
    );
    if (parsed.status !== 0) throw new Error('Invalid trusted YAML profile.');
    // Unknown startup integrations remain unavailable until their typed adapters are qualified.
    const profile = z
      .strictObject({
        agent_identity: z.record(z.string(), z.unknown()),
        mcp_servers: z.strictObject({}).optional(),
        delegation: z
          .strictObject({
            specialists: z.record(z.string(), z.unknown()).optional(),
            durable: z
              .strictObject({
                enabled: z.boolean(),
                limits: z.strictObject({
                  max_depth: z.number().int().positive(),
                  max_total_children: z.number().int().positive(),
                  max_concurrent_children: z.literal(1),
                }),
              })
              .optional(),
            max_iterations: z.number().int().positive().optional(),
            max_concurrent_children: z.literal(1).optional(),
          })
          .optional(),
        runtime_budget: z.record(z.string(), z.unknown()).optional(),
        onboarding: z
          .strictObject({
            seen: z.strictObject({ profile_build_offered: z.boolean() }),
          })
          .optional(),
        model: z
          .strictObject({
            default: z.string().max(256),
            provider: z.enum(['openai', 'custom']),
            base_url: endpoint.optional(),
            api_mode: z.literal('chat_completions').optional(),
          })
          .optional(),
      })
      .parse(JSON.parse(parsed.stdout));
    if (
      this.config.providerEnvironment &&
      profile.onboarding?.seen.profile_build_offered !== true
    )
      throw new Error(
        'Reviewed command profiles must explicitly disable the interactive profile-build prompt.',
      );
    const identity = profile.agent_identity;
    if (
      identity.principal_id !== this.config.identity.principal_id ||
      identity.profile_id !== this.config.identity.profile_id ||
      identity.active_agent_id !== this.config.identity.agent_id ||
      identity.primary_agent_id !== this.config.identity.agent_id
    )
      throw new Error('Ryoko launch identity mismatch.');
    const agents = identity.agents as
      | Record<
          string,
          { role?: string; allowed_tools?: string[]; project_grants?: string[] }
        >
      | undefined;
    if (agents?.[this.config.identity.agent_id]?.role !== 'primary')
      throw new Error(
        'Only the verified primary agent is qualified for this command adapter.',
      );

    if (this.config.nativePages) {
      const policy = agents?.[this.config.identity.agent_id];
      if (
        !['dots_page_read', 'dots_page_propose'].every((tool) =>
          policy?.allowed_tools?.includes(tool),
        ) ||
        !this.config.nativePages.projects.every((project) =>
          policy?.project_grants?.includes(project.projectId),
        )
      )
        throw new Error(
          'Native pages need exact reviewed tool and project grants.',
        );
      if (
        new Set(this.config.nativePages.projects.map((p) => p.spaceId)).size !==
          this.config.nativePages.projects.length ||
        new Set(this.config.nativePages.projects.map((p) => p.projectId))
          .size !== this.config.nativePages.projects.length
      )
        throw new Error('Native page project mappings must be one-to-one.');
    }
    this.profileHash = sha(raw);
  }
  start(): Promise<RuntimeConversationCapabilities> {
    if (this.connected) {
      this.checkProfile();
      return Promise.resolve(this.proof!);
    }
    return (this.starting ??= this.launch().finally(() => {
      this.starting = undefined;
    }));
  }
  private async launch() {
    // A failed pipe cannot leave a second owning stdio process running.
    await this.stop();
    let stage = 'trusted_paths';
    try {
      for (const name of ['checkout', 'home', 'runtimeDirectory'] as const) {
        if (realpathSync(this.config[name]) !== this.config[name])
          throw new Error('Use canonical absolute trusted paths.');
      }
      stage = 'source_pin';
      verifyGitCheckout(
        this.config.checkout,
        '3453afefce2b21947390fac0e03d9eaa67f326e9',
      );
      for (const [file, expected] of pins)
        if (sha(readFileSync(join(this.config.checkout, file))) !== expected)
          throw new Error('Ryoko generated contract pin mismatch.');
      stage = 'profile_configuration';
      this.checkProfile();
      stage = 'stdio_capability_read';
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
      const launchEpoch = this.epoch + 1;
      const rpc = new ConversationRpc(
        child.stdout,
        child.stdin,
        undefined,
        (notification) => {
          if (this.process !== child || this.epoch !== launchEpoch) return;
          for (const listener of this.resultListeners)
            listener(notification, launchEpoch);
        },
        async (method, params, signal) => {
          if (
            this.process !== child ||
            this.epoch !== launchEpoch ||
            !this.nativeHandler ||
            !this.config.nativePages
          )
            throw new Error('Native callback binding unavailable.');
          return this.nativeHandler(method, params, signal);
        },
      );
      this.rpc = rpc;
      child.once('error', rpc.close);
      child.once('exit', rpc.close);
      // Drain but never retain or log producer diagnostics (they may contain secrets).
      child.stderr.on('data', () => {});
      const proof = await this.rpc.call('runtime.conversation.capabilities', {
        schema_version: 1,
      });
      stage = 'owner_identity';
      if (
        !identityMatches(this.config.identity, proof.identity) ||
        proof.identity.role !== 'primary' ||
        proof.identity.memory_backend !== 'personal_mcp' ||
        proof.authority !== 'trusted_stdio_owner' ||
        proof.owner_scope !== 'principal_profile_agent_home' ||
        proof.transcript_format !== 'safe_transcript_v1' ||
        proof.max_page !== 100 ||
        proof.max_page_text_bytes !== 262144 ||
        conversationMethods
          .filter(
            (method) =>
              method.startsWith('runtime.conversation.') ||
              method === 'runtime.command.receipt',
          )
          .some((method) => !proof.methods.includes(method))
      )
        throw new Error('Ryoko capability identity or bounds mismatch.');
      if (this.config.nativePages) {
        if (!this.nativeHandler)
          throw new Error('Native page callbacks are not installed.');
        const native = await rpc.call('client.capabilities', {
          server_requests: true,
          dots_native: true,
        });
        if (
          ![
            'dots.effect.dispatch',
            'dots.effect.inspect',
            'dots.page.read',
            'dots.approval',
          ].every((method) => native.server_requests.includes(method))
        )
          throw new Error('Native page callbacks are not supported.');
      }
      this.proof = proof;
      this.epoch++;
      return proof;
    } catch {
      await this.stop();
      throw new Error(
        `Ryoko startup or owner identity verification failed (${stage}). Check the trusted server configuration.`,
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
      throw new Error('Ryoko disconnected. Recovery remains read-only.');
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
