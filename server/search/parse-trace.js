import { classifyIntent } from '../../src/lib/search/intent.js';
import { normalizeText } from './nlParser.js';

// Explicit fields only: never include environment, SDK requests, headers or credentials.
export function parseTrace(text, parsed) {
  return {
    normalizedText: normalizeText(text),
    intent: classifyIntent(text),
    tokens: parsed.tokens || [...text.matchAll(/\S+/g)].map(m => ({ text: m[0], start: m.index, end: m.index + m[0].length })),
    understood: parsed.understood || [],
    leftover: parsed.leftover || parsed.unrecognized || parsed.notApplied || [],
    places: parsed.placeTrace || [],
    chatgpt: parsed.llmTrace || { called: parsed.parser === 'openai', reason: 'Legacy confidence-based selection' },
    merge: parsed.mergeTrace || [],
    criteria: parsed.criteria,
    extras: parsed.extras,
    assumptions: parsed.assumptions || [],
    unrecognized: parsed.unrecognized || [],
    questions: parsed.questions || [],
  };
}
