import ts from 'typescript';
import {
  readdir,
  readFile,
  mkdir,
  writeFile,
  rm,
  rename,
} from 'node:fs/promises';
import { join, relative, dirname, resolve } from 'node:path';
// Emit independently to avoid loading the entire SDK declaration graph into one
// compiler process. This is transpilation, not a replacement for type checking.
const target = process.argv[2];
if (!['server', 'computer'].includes(target))
  throw Error('Use build-runtime.mjs server|computer');
const roots =
  target === 'server'
    ? ['server', 'browser', 'shared', 'computer']
    : ['computer', 'shared'];
const output = resolve('dist', target),
  stage = output + '.next';
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
let count = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.tsx?$/.test(path) && !path.endsWith('.d.ts')) {
      const source = await readFile(path, 'utf8');
      const result = ts.transpileModule(source, {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
          isolatedModules: true,
        },
      });
      const errors =
        result.diagnostics?.filter(
          (d) => d.category === ts.DiagnosticCategory.Error,
        ) ?? [];
      if (errors.length)
        throw Error(
          ts.formatDiagnostics(errors, {
            getCanonicalFileName: (p) => p,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => '\n',
          }),
        );
      const destination = join(
        stage,
        relative('src', path).replace(/\.tsx?$/, '.js'),
      );
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, result.outputText);
      count++;
    }
  }
}
try {
  for (const root of roots) await walk(join('src', root));
  await rm(output + '.previous', { recursive: true, force: true });
  await rename(output, output + '.previous').catch((e) => {
    if (e.code !== 'ENOENT') throw e;
  });
  await rename(stage, output);
  console.log(
    `Emitted ${count} ${target} modules; type checking is a separate check.`,
  );
} catch (error) {
  await rm(stage, { recursive: true, force: true });
  throw error;
}
