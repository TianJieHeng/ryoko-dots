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
    '418386827d1d1a12e8c20c1b8e7d3081a6f317aea270da52262cec5f52fc12ca' ||
  hash(raw) !==
    '1bf4ab3a304834538db5e379a06ce7e3b37acd53c8e0b193808d10a4fd5b447a'
)
  throw new Error('Producer pin changed; explicit review required.');
const rpc = JSON.parse(raw);
const names = [
  'runtime.capabilities',
  'runtime.snapshot',
  'runtime.events.since',
  ...[
    'capabilities',
    'create',
    'bind',
    'operation.get',
    'command.receipt',
    'list',
    'rename',
    'archive',
    'history',
    'export',
  ].map((name) => `runtime.conversation.${name}`),
  'runtime.command.receipt',
  'runtime.command',
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
  '// GENERATED exact subset of pinned producer. DO NOT EDIT.\n// Regenerate: node scripts/pin-producer-contract.mjs /path/to/ryoko-agent\n';
writeFileSync(
  'src/shared/runtime/producer/wire.generated.ts',
  header + [...selected.values()].join('\n') + '\n',
);
writeFileSync(
  'src/shared/runtime/producer/schema.generated.ts',
  header +
    `export const producerSchema = ${JSON.stringify({ methods, components: { schemas } }, null, 2)};\n`,
);
writeFileSync(
  'src/shared/runtime/producer/provenance.json',
  JSON.stringify(
    {
      repository: 'TianJieHeng/ryoko-agent',
      commit: '9c39b3cbc7d23c65782e0f73f8c8102d07955e2e',
      typescriptSha256: hash(source),
      openrpcSha256: hash(raw),
      methods: names,
      status: 'canonical_command_stdio_subset',
    },
    null,
    2,
  ) + '\n',
);
