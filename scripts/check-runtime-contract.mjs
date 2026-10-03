#!/usr/bin/env node
/** FE00 local-source pin check. This never contacts a gateway or a remote repository. */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(
  project,
  'tests/fixtures/runtime/producer-baseline.json',
);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const evidenceHash = (value) => digest(JSON.stringify(canonical(value)));
const generatedPaths = [
  'apps/shared/src/gateway-contract.generated.ts',
  'apps/shared/src/gateway-contract.openrpc.json',
];
const sourcePaths = [
  'tui_gateway/methods_runtime.py',
  'tui_gateway/contracts/runtime_v1.py',
  'tui_gateway/contracts/runtime_effects.py',
  'tests/tui_gateway/test_runtime_rpc.py',
  'tui_gateway/server.py',
];

// Reuses the producer's REAL dispatcher/ownership/SQLite fixture. The mocked
// provider worker is never invoked: these cases admit no executable commands.
// This is isolated synthetic producer evidence, NOT a Dots transport test.
const captureProgram = String.raw`
import contextlib, importlib.util, io, json, os, pathlib, sys, tempfile
root = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
if len(sys.argv) > 2 and sys.argv[2]:
    sys.path.append(str(pathlib.Path(sys.argv[2]).resolve()))
with tempfile.TemporaryDirectory(prefix="dots-fe00-") as temporary:
    os.environ["HERMES_HOME"] = temporary
    with contextlib.redirect_stdout(io.StringIO()):
        import pytest, pydantic, openai, httpx
        spec = importlib.util.spec_from_file_location("producer_runtime_fixture", root / "tests/tui_gateway/test_runtime_rpc.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        patch = pytest.MonkeyPatch()
        generator = module.runtime.__wrapped__(pathlib.Path(temporary), patch)
        runtime = next(generator)
        fixtures = {}
        def capture(name, method, arrangement="owned live-a transport; empty synthetic SQLite store", via=None, **params):
            full = {"session_id": "live-a"}
            if method != "runtime.capabilities": full["schema_version"] = 1
            full.update(params)
            request = {"jsonrpc": "2.0", "id": "fixture-rpc", "method": method, "params": full}
            response = runtime.server.dispatch(request, transport=via or runtime.peers["a"])
            fixtures[name] = {"arrangement": arrangement, "request": request, "response": response}
        try:
            capture("approvalRejected", "runtime.command", command_id="fe00-approval-rejected", idempotency_key="fe00-approval-rejected", expected_revision=None, operation="approval", payload={"approval_id": "unknown", "decision": "approve"})
            capture("idleSnapshot", "runtime.snapshot")
            capture("incompatibleSchema", "runtime.snapshot", schema_version=2)
            capture("unknownField", "runtime.snapshot", principal_id="forged-owner")
            capture("foreignSession", "runtime.snapshot", arrangement="live-b transport attempting live-a in isolated fixture; ownership denial, not a public auth test", via=runtime.peers["b"])
            original_client = runtime.agents["a"].client
            runtime.agents["a"].client = object()
            try:
                capture("unconfiguredCapabilities", "runtime.capabilities", arrangement="bound identity/store with unsupported opaque provider client; NOT missing credentials or a deployed provider")
            finally:
                runtime.agents["a"].client = original_client
            assert runtime.dispatched == [], "Fixture must not dispatch work"
            assert runtime.agents["a"]._session_db.read_runtime_snapshot(runtime.agents["a"].session_id)["revision"] == 0
        finally:
            try: next(generator)
            except StopIteration: pass
            patch.undo()
    print(json.dumps({"fixtures": fixtures, "execution": {"python": sys.version.split()[0], "pytest": pytest.__version__, "pydantic": pydantic.__version__, "openai": openai.__version__, "httpx": httpx.__version__, "providerDispatches": 0, "runtimeRevisionAfter": 0}}))
`;

function parseArgs(argv) {
  const options = {
    root: undefined,
    python: process.env.PYTHON || 'python3',
    site: '',
    capture: false,
    replay: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (
      ['--producer-root', '--python', '--python-site-packages'].includes(arg)
    ) {
      assert(
        argv[i + 1] && !argv[i + 1].startsWith('--'),
        `${arg} needs a value`,
      );
      options[
        {
          '--producer-root': 'root',
          '--python': 'python',
          '--python-site-packages': 'site',
        }[arg]
      ] = argv[++i];
    } else if (arg === '--capture') options.capture = true;
    else if (arg === '--replay') options.replay = true;
    else if (!arg.startsWith('-') && !options.root) options.root = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  assert(!(options.capture && options.replay), 'Choose --capture or --replay');
  assert(
    !(options.capture || options.replay) || options.root,
    'Capture/replay needs an explicit local producer root',
  );
  if (options.root) options.root = resolve(options.root);
  return options;
}
function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, `Local Git read failed: ${result.stderr}`);
  return result.stdout.trim();
}
function sourceFile(root, path) {
  assert(
    !isAbsolute(path) && !path.split('/').includes('..'),
    `Invalid source path: ${path}`,
  );
  return readFileSync(resolve(root, path));
}
function capture(options) {
  const result = spawnSync(
    options.python,
    ['-c', captureProgram, options.root, options.site],
    {
      cwd: project,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      timeout: 90_000,
    },
  );
  assert.equal(
    result.status,
    0,
    `Synthetic producer capture failed (no live integration was attempted): ${result.stderr || result.error || result.stdout}`,
  );
  return JSON.parse(result.stdout);
}
function verifyFixture(fixture) {
  assert.equal(fixture.fixtureVersion, 1);
  assert.equal(fixture.evidenceKind, 'producer_dispatcher_isolated_synthetic');
  assert.equal(fixture.qualification.dotsTransport, 'not_run');
  assert.equal(fixture.qualification.liveIntegration, 'not_run');
  assert.equal(fixture.qualification.productionReady, false);
  assert.equal(
    fixture.consumerContracts.status,
    'frontend_candidate_only_backend_unimplemented_unqualified',
  );
  assert.match(fixture.producer.commit, /^[a-f0-9]{40}$/);
  assert.equal(fixture.provenance.captureProgramSha256, digest(captureProgram));
  assert.equal(
    fixture.provenance.evidenceSha256,
    evidenceHash(fixture.fixtures),
  );
  for (const [files, expected] of [
    [fixture.producer.generatedFiles, generatedPaths],
    [fixture.producer.sourceFiles, sourcePaths],
  ]) {
    assert.deepEqual(
      files.map((entry) => entry.path),
      expected,
    );
    for (const file of files) assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
  const cases = fixture.fixtures;
  assert.deepEqual(
    Object.keys(cases).sort(),
    [
      'approvalRejected',
      'foreignSession',
      'idleSnapshot',
      'incompatibleSchema',
      'unconfiguredCapabilities',
      'unknownField',
    ].sort(),
  );
  const rejection = cases.approvalRejected;
  assert.equal(rejection.request.method, 'runtime.command');
  assert.equal(rejection.request.params.operation, 'approval');
  assert.deepEqual(rejection.response, {
    jsonrpc: '2.0',
    id: 'fixture-rpc',
    result: {
      schema_version: 1,
      command_id: 'fe00-approval-rejected',
      status: 'rejected',
      durable_revision: 0,
      run_id: null,
      conflict: {
        code: 'operation_not_supported',
        message: 'Approval authorization requires BE05/BE06',
      },
    },
  });
  assert.equal(
    cases.incompatibleSchema.response.error.data.code,
    'unsupported_schema',
  );
  assert.equal(cases.unknownField.response.error.code, 4000);
  assert.match(
    cases.unknownField.response.error.message,
    /principal_id: Extra inputs are not permitted/,
  );
  assert.equal(cases.foreignSession.response.error.code, 4001);
  assert.equal(cases.idleSnapshot.response.result.revision, 0);
  assert.equal(
    cases.unconfiguredCapabilities.response.result.provider.durable_execution,
    false,
  );
  for (const capability of cases.unconfiguredCapabilities.response.result
    .operations) {
    assert.equal(capability.accepts_commands, false);
    assert.equal(capability.executes, false);
    assert.equal(capability.effects_enabled, false);
  }
  for (const entry of Object.values(cases)) {
    assert.equal(entry.request.jsonrpc, '2.0');
    assert.equal(entry.response.jsonrpc, '2.0');
    assert.equal(entry.request.id, entry.response.id);
    assert(
      !/private-fixture|PROFILE_ONLY_SECRET/.test(
        JSON.stringify(entry.response),
      ),
      'Fixture leaked provider/private fixture data',
    );
  }
  assert.equal(fixture.provenance.execution.providerDispatches, 0);
  assert.equal(fixture.provenance.execution.runtimeRevisionAfter, 0);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.capture) {
    const captured = capture(options);
    const files = (paths) =>
      paths.map((path) => ({
        path,
        sha256: digest(sourceFile(options.root, path)),
      }));
    const fixture = {
      fixtureVersion: 1,
      evidenceKind: 'producer_dispatcher_isolated_synthetic',
      capturedAt: new Date().toISOString(),
      producer: {
        repository: 'TianJieHeng/ryoko-agent',
        commit: git(options.root, 'rev-parse', 'HEAD'),
        generatedFiles: files(generatedPaths),
        sourceFiles: files(sourcePaths),
      },
      consumer: {
        baselineCommit: git(project, 'rev-parse', 'HEAD'),
        inventory: 'docs/runtime/parity-inventory.md',
      },
      provenance: {
        handler: 'tui_gateway/methods_runtime.py::_runtime_command',
        fixtureFactory:
          'tests/tui_gateway/test_runtime_rpc.py::runtime.__wrapped__',
        producerAssertion:
          'tests/tui_gateway/test_runtime_rpc.py::test_command_receipt_is_idempotent_restart_replay_and_protocol_freshness',
        captureProgramSha256: digest(captureProgram),
        evidenceSha256: evidenceHash(captured.fixtures),
        reproduction:
          'node scripts/check-runtime-contract.mjs --producer-root /path/to/ryoko-agent --replay [--python /path/to/python] [--python-site-packages /path/to/site-packages]',
        execution: captured.execution,
        limitations: [
          'Real producer dispatch, profile ownership checks, Pydantic validation and temporary SQLite; provider worker from producer fixture is mocked and never invoked.',
          'The unconfigured fixture substitutes an unsupported opaque client; it is not a live missing-credentials, speech, Slack, computer or personal-harness probe.',
          'The historical rejection message mentions producer BE05/BE06; those labels are not the Dots plan phase numbers.',
          'Hashes and Git identity are local observations; no remote publication, authenticated Dots transport, process restart, external provider or target-host qualification was run.',
        ],
      },
      qualification: {
        dotsTransport: 'not_run',
        liveIntegration: 'not_run',
        externalProviders: 'not_run',
        producerReleaseGates: 'unqualified',
        productionReady: false,
      },
      consumerContracts: {
        status: 'frontend_candidate_only_backend_unimplemented_unqualified',
        backendDependencies: Array.from(
          { length: 13 },
          (_, index) => `BE${String(index).padStart(2, '0')}`,
        ),
        routesShipped: false,
      },
      fixtures: captured.fixtures,
    };
    verifyFixture(fixture);
    process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
  } else {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    verifyFixture(fixture);
    const report = {
      fixtureProvenance:
        'passed_internal_integrity_and_explicit_source_metadata',
      producerSource: 'not_run_no_local_producer_root',
      syntheticDispatcherReplay: 'not_run',
      dotsTransport: 'not_run',
      liveIntegration: 'not_run',
      remotePublication: 'not_run',
      productionReady: false,
    };
    if (options.root) {
      for (const file of [
        ...fixture.producer.generatedFiles,
        ...fixture.producer.sourceFiles,
      ]) {
        assert.equal(
          digest(sourceFile(options.root, file.path)),
          file.sha256,
          `Producer source drift: ${file.path}`,
        );
      }
      assert.equal(
        git(options.root, 'rev-parse', 'HEAD'),
        fixture.producer.commit,
        'Producer commit differs; explicitly review and re-pin',
      );
      const rpc = JSON.parse(sourceFile(options.root, generatedPaths[1]));
      for (const name of [
        'runtime.command',
        'runtime.capabilities',
        'runtime.snapshot',
        'runtime.events.since',
        'runtime.approval.resolve',
      ]) {
        assert(
          rpc.methods.some((method) => method.name === name),
          `Missing generated method: ${name}`,
        );
      }
      assert.deepEqual(
        rpc.components.schemas.RuntimeCommandParams.properties.operation.enum,
        ['submit', 'steer', 'cancel', 'approval'],
      );
      assert.deepEqual(
        rpc.components.schemas.RuntimeApprovalResolveParams.properties.choice
          .enum,
        ['once', 'deny'],
      );
      const handler = sourceFile(options.root, sourcePaths[0]).toString();
      assert(handler.includes('if request.operation == "approval":'));
      assert(handler.includes('"code": "operation_not_supported"'));
      report.producerSource =
        'passed_local_commit_generated_hashes_and_provenance_source_hashes';
      report.producerCommit = fixture.producer.commit;
    }
    if (options.replay) {
      const replay = capture(options);
      for (const name of [
        'approvalRejected',
        'incompatibleSchema',
        'unknownField',
        'foreignSession',
        'unconfiguredCapabilities',
      ]) {
        assert.deepEqual(
          replay.fixtures[name],
          fixture.fixtures[name],
          `Synthetic fixture changed: ${name}`,
        );
      }
      // Empty-store cursors include generated epochs. Compare projection facts,
      // not one temporary store's opaque cursor to a different temporary store.
      const normalize = (value) => ({
        ...value,
        last_cursor: '<opaque-store-cursor>',
      });
      assert.deepEqual(
        normalize(replay.fixtures.idleSnapshot.response.result),
        normalize(fixture.fixtures.idleSnapshot.response.result),
      );
      assert.equal(replay.execution.providerDispatches, 0);
      report.syntheticDispatcherReplay =
        'passed_isolated_real_dispatch_no_provider_execution';
    }
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        contractCheck: 'failed',
        reason: error.message,
        liveIntegration: 'not_run',
        productionReady: false,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
