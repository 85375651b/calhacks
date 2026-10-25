import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const ts = require('./validation/typescript.cjs');
const files = process.argv.slice(2);
if (!files.length) files.push('actor-fix/src/main.ts', 'actor-fix/src/public-sources.ts', 'actor-fix/main-paste.ts');
let failed = false;
for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const transpiled = ts.transpileModule(source, {
        fileName: file, reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, isolatedModules: true },
    });
    const errors = [...parsed.parseDiagnostics, ...(transpiled.diagnostics ?? [])].filter((d) => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
        failed = true;
        for (const d of errors) {
            const point = parsed.getLineAndCharacterOfPosition(d.start ?? 0);
            console.error(`${file}:${point.line + 1}:${point.character + 1} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
        }
    } else console.log(JSON.stringify({ file, typescriptVersion: ts.version, syntaxErrors: 0,
        lines: source.split('\n').length, sha256: createHash('sha256').update(source).digest('hex') }));
}
if (failed) process.exitCode = 1;
