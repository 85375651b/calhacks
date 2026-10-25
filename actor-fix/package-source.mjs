import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const root = new URL('./', import.meta.url);
const main = readFileSync(new URL('src/main.ts', root), 'utf8')
  .replace(/^import .* from '\.\/public-sources\.js';\r?\n/m, '');
const helper = readFileSync(new URL('src/public-sources.ts', root), 'utf8').replace(/^export /gm, '');
const split = main.indexOf('interface Input');
const source = main.slice(0, split) + helper + '\n\n' + main.slice(split);
// Fail packaging on syntax errors rather than handing an invalid paste file to the user.
transformSync(source, { loader: 'ts', target: 'node20', format: 'esm' });
writeFileSync(new URL('main-paste.ts', root), source);
