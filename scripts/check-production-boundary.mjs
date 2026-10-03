#!/usr/bin/env node
import ts from 'typescript';
import process from 'node:process';
import { log } from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
// AST-based transitive source check. Type-only imports keep legacy tests buildable
// but do not justify shipping managed dependencies in the runtime image.
const root = path.resolve(process.argv[2] ?? '.');
const banned =
  /^(?:@copilotkit\/|@tanstack\/ai(?:-|$)|@ag-ui\/(?:client|core)$|rxjs$)/;
const visited = new Set();
const packages = new Set();
const failures = [];
function visit(file) {
  file = path.resolve(file);
  if (visited.has(file)) return;
  visited.add(file);
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function inspect(node) {
    let value;
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly) return;
      const bindings = node.importClause?.namedBindings;
      if (
        !node.importClause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length &&
        bindings.elements.every((item) => item.isTypeOnly)
      )
        return;
      value = node.moduleSpecifier.text;
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      !node.isTypeOnly
    ) {
      value = node.moduleSpecifier.text;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      if (
        node.arguments.length !== 1 ||
        !ts.isStringLiteral(node.arguments[0])
      ) {
        failures.push(
          'Unresolved dynamic import in ' + path.relative(root, file),
        );
        return;
      }
      value = node.arguments[0].text;
    }
    if (value) {
      if (value.startsWith('.')) {
        let local = path
          .resolve(path.dirname(file), value)
          .replace(/\.js$/, '.ts');
        if (!fs.existsSync(local)) local = local.replace(/\.ts$/, '.tsx');
        visit(local);
      } else if (!value.startsWith('node:')) {
        packages.add(value);
        if (banned.test(value))
          failures.push('Managed/legacy execution import: ' + value);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source);
}
visit(path.join(root, 'src/server/index.ts'));
log(
  JSON.stringify(
    {
      entry: 'src/server/index.ts',
      files: visited.size,
      externalImports: [...packages].sort(),
      passed: !failures.length,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
