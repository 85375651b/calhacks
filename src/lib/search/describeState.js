export function handleUnrecognized(parsed, text, action) {
  if (!['ignore', 'keyword'].includes(action)) throw Error('Unknown search action');
  if (action === 'keyword' && !parsed.capabilities?.keywords) throw Error('Keywords are not supported');
  const next = structuredClone(parsed);
  next.unrecognized = (next.unrecognized || []).filter(item => item.text !== text);
  if (action === 'keyword') {
    const keywords = [next.criteria.keywords, text].filter(Boolean).join(', ');
    if (keywords.length > 200) throw Error('Keywords are too long. Edit them in filters.');
    next.criteria.keywords = keywords;
    next.assumptions.push(`Searching '${text}' as a keyword; support depends on the listing source.`);
  } else next.assumptions.push(`Ignored '${text}' at your request.`);
  return next;
}
