import { createParseService } from '../search/parse.js';
import { resolvePlaces } from '../search/places.js';
import { parseTrace } from '../search/parse-trace.js';

const text = process.argv.slice(2).join(' ').trim();
if (!text) {
  console.error('Usage: npm run debug:parse -- "4 bed los angeles"');
  process.exitCode = 1;
} else {
  const parse = createParseService();
  let parsed = await parse({ text, debug: true });
  if (parsed.intent !== 'address') parsed = await resolvePlaces(parsed);
  console.log(JSON.stringify(parseTrace(text, parsed), null, 2));
}
