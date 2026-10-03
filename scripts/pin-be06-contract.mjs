#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import process from 'node:process';
import ts from 'typescript';
const root = process.argv[2];
if (!root) throw new Error('Provide the reviewed producer checkout path.');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const source = readFileSync(
  resolve(root, 'apps/shared/src/gateway-contract.generated.ts'),
  'utf8',
);
const raw = readFileSync(
  resolve(root, 'apps/shared/src/gateway-contract.openrpc.json'),
  'utf8',
);
if (
  hash(source) !==
    '19fdf11f4aa587d7bcdd58927c0cdbbdec463cfdeaa90003e0ac6284266539d2' ||
  hash(raw) !==
    'fa7b08c3edd56190daadeef533928685113fd70a2ae8959b2fb7b61aee5051b2'
)
  throw new Error('Producer pin changed; explicit review required.');
const rpc = JSON.parse(raw);
const names = [
  'runtime.mission.create',
  'runtime.project.grants.set',
  'runtime.artifact.cancel',
  'runtime.artifact.status',
  'runtime.artifact.get',
  'runtime.agent.list',
  'runtime.agent.get',
  'runtime.agent.create',
  'runtime.agent.update',
  'runtime.agent.archive',
  'runtime.agent.session.get',
  'runtime.memory.status',
  'runtime.memory.record.get',
  'runtime.memory.records.list',
  'runtime.memory.record.write',
  'runtime.memory.record.delete',
  'runtime.memory.export',
  'runtime.memory.scope.set',
  'runtime.specialist.catalog',
  'runtime.specialist.preview',
  'runtime.specialist.handoff',
  'runtime.specialist.status',
  'runtime.evidence.create',
  'runtime.evidence.get',
  'runtime.evidence.list',
  'runtime.workflow.create',
  'runtime.workflow.get',
  'runtime.workflow.list',
  'runtime.workflow.template.create',
  'runtime.workflow.evaluate',
  'runtime.workflow.decision.prepare',
  'runtime.workflow.decision.commit',
  'runtime.workflow.feedback',
  'runtime.workflow.run.prepare',
  'runtime.workflow.run.publish',
  'runtime.workflow.runs',
  'runtime.workflow.delivery.prepare',
  'runtime.workflow.delivery.commit',
  'runtime.workflow.delivery.list',
  'runtime.approval.resolve',
];
const methods = rpc.methods.filter((m) => names.includes(m.name));
if (names.some((name) => !methods.some((method) => method.name === name)))
  throw new Error('A required qualified producer method is absent.');
const schemas = {};
function collect(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    const name = value.$ref.replace('#/components/schemas/', '');
    if (!schemas[name]) {
      if (!rpc.components.schemas[name])
        throw new Error(`Missing schema ${name}`);
      schemas[name] = rpc.components.schemas[name];
      collect(schemas[name]);
    }
  }
  Object.values(value).forEach(collect);
}
collect(methods);
const parsed = ts.createSourceFile(
  'wire.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
);
const declarations = new Map(
  parsed.statements.filter((s) => s.name).map((s) => [s.name.text, s]),
);
const selected = new Map();
function type(name) {
  if (selected.has(name)) return;
  const node = declarations.get(name);
  if (!node) throw new Error(`Missing generated type ${name}`);
  selected.set(name, node.getText(parsed));
  function walk(child) {
    if (
      ts.isTypeReferenceNode(child) &&
      ts.isIdentifier(child.typeName) &&
      declarations.has(child.typeName.text)
    )
      type(child.typeName.text);
    ts.forEachChild(child, walk);
  }
  walk(node);
}
Object.keys(schemas).forEach(type);
const header =
  '// GENERATED exact subset of pinned producer. DO NOT EDIT.\n// Regenerate: node scripts/pin-be06-contract.mjs /path/to/ryoko-agent\n';
writeFileSync(
  'src/shared/runtime/be06-producer/wire.generated.ts',
  header + [...selected.values()].join('\n') + '\n',
);
writeFileSync(
  'src/shared/runtime/be06-producer/schema.generated.ts',
  header +
    `export const producerSchema = ${JSON.stringify({ methods, components: { schemas } }, null, 2)};\n`,
);
writeFileSync(
  'src/shared/runtime/be06-producer/provenance.json',
  JSON.stringify(
    {
      repository: 'TianJieHeng/ryoko-agent',
      commit: '98b9eeb7d2afc02d0e0393fea285f010000a0378',
      typescriptSha256: hash(source),
      openrpcSha256: hash(raw),
      methods: names,
      status: 'owner_scoped_identity_memory_workflow_stdio_subset',
    },
    null,
    2,
  ) + '\n',
);

const refName = (ref) => ref.replace('#/components/schemas/', '');
writeFileSync(
  'src/shared/runtime/be06-producer/methods.generated.ts',
  header +
    'import type * as Wire from "./wire.generated.js";\n' +
    'export interface Be06Params {\n' +
    methods
      .map((m) => `  '${m.name}': Wire.${refName(m.params[0].schema.$ref)};`)
      .join('\n') +
    '\n}\n' +
    'export interface Be06Results {\n' +
    methods
      .map((m) => `  '${m.name}': Wire.${refName(m.result.schema.$ref)};`)
      .join('\n') +
    '\n}\n',
);
