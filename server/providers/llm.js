import OpenAI from 'openai';
import Ajv from 'ajv';
import { join } from 'node:path';
import { config, serverDirectory } from '../config.js';
import { createRunGuard } from './actor.js';

const ajv = new Ajv({ allErrors: false, strict: true });
const validators = new WeakMap();
export function validateStructured(value, schema) {
  let validate = validators.get(schema);
  if (!validate) { validate = ajv.compile(schema); validators.set(schema, validate); }
  if (!validate(value)) throw new Error('Invalid structured response');
  return value;
}
const claim = createRunGuard(join(serverDirectory, '.cache', 'openai-budget.json'), {
  max: () => Math.max(0, Math.min(1000, Number(process.env.OPENAI_MAX_CALLS_PER_HOUR ?? 30) || 0)),
});
export function createStructuredExtractor({
  clientFactory = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 8000 }),
  claimCall = claim,
  enabled = () => !config.useFixtures && Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_key_here'),
} = {}) {
  let active = 0;
  return async function extractStructured({ system, user, schemaName, schema }) {
    if (!enabled() || active >= 2) throw new Error('Language parsing unavailable');
    active++;
    try {
      await claimCall(); // Failed calls count too. SDK retries are disabled.
      const response = await clientFactory().responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        store: false,
        max_output_tokens: 800,
        instructions: system,
        input: [{ role: 'user', content: String(user).slice(0, 6500) }],
        text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
      }, { signal: AbortSignal.timeout(8000) });
      if (response.status !== 'completed' || !response.output_text) throw new Error('Incomplete response');
      return validateStructured(JSON.parse(response.output_text), schema);
    } catch {
      // Never surface SDK messages, request headers, or user text in errors/logs.
      throw new Error('Language parsing unavailable');
    } finally { active--; }
  };
}
export const extractStructured = createStructuredExtractor();
