import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
for (const name of readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('src/' + name, root))], { stdio: 'inherit' });
    if (result.status) process.exit(result.status);
}
for (const name of ['package.json', '.actor/actor.json', '.actor/input_schema.json']) JSON.parse(readFileSync(new URL(name, root), 'utf8'));
await import('../src/services.js');
console.log('JavaScript syntax, Actor JSON, and installed SDK imports passed.');
