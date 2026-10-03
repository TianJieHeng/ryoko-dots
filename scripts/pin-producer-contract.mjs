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
    'd29c02608340ab65cb5b5f7b1b66bb8bb253a5c27bf89bab0ee4c4a193740f64' ||
  hash(raw) !==
    'c81c3c53e0bee325d172617551adb2350f463a4383a744b67fe29347c339ee29'
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
    'operation.get',
    'list',
    'rename',
    'archive',
    'history',
    'export',
  ].map((name) => `runtime.conversation.${name}`),
  'runtime.command.receipt',
];
const methods = rpc.methods.filter((m) => names.includes(m.name));
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
  '// GENERATED exact subset of pinned producer. DO NOT EDIT.\n// Regenerate: node scripts/pin-producer-contract.mjs /path/to/ryoko-agent\n/* eslint-disable */\n';
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
      commit: '44eec9a9650414aef3e95ef6bf78eebedbb92265',
      typescriptSha256: hash(source),
      openrpcSha256: hash(raw),
      methods: names,
      status: 'canonical_conversation_stdio_subset',
    },
    null,
    2,
  ) + '\n',
);
