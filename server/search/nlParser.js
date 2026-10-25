import { defaults, validateCriteria, NUMBERS, FLAGS, ENUMS } from './criteria.js';

export const EXAMPLES = [
  'house in san francisco 2 beds under 600k with a <30 minute commute to work at 1 Market St, San Francisco',
  '3 bed house in Austin under $700k with a pool',
  'condo in Seattle under 500k, new listings',
  'family home in San Jose near good schools, no HOA',
  '2 bed under 600k in San Francisco, under 30 min commute to my work',
];
export const normalizeText = text => text.trim().replace(/\s+/g, ' ').toLowerCase();
export function validPlace(p) {
  return p && typeof p.label === 'string' && p.label.length <= 200 &&
    Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
}
export function partialCriteria(c) {
  const allowed = new Set([...Object.keys(defaults), ...Object.keys(NUMBERS), ...FLAGS, ...Object.keys(ENUMS), 'views', 'keywords', 'searchUrl']);
  if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !allowed.has(k))) throw new Error('Invalid or unknown search field');
  const clean = validateCriteria({ ...c, location: c.location || '__pending__' });
  if (!c.location) clean.location = '';
  return clean;
}
const amount = s => Number(s.replace(/[$,\s]/g, '').replace(/[km]$/i, '')) * (/m$/i.test(s) ? 1e6 : /k$/i.test(s) ? 1000 : 1);
const price = '\\$?\\d[\\d,]*(?:\\.\\d+)?\\s*[km]?';
const labels = { location: 'Location', minBeds: 'Min beds', maxBeds: 'Max beds', minBaths: 'Min baths', maxBaths: 'Max baths', minPrice: 'Min price', maxPrice: 'Max price', homeTypes: 'Home type', maxHoa: 'Max monthly HOA' };
export function interpretationFor(criteria, extras) {
  const result = Object.entries(criteria).filter(([k, v]) => !['limit', 'sources', 'exactBeds'].includes(k) && !(k === 'status' && v === 'sale') && v !== '' && v != null && (!Array.isArray(v) || v.length)).map(([key, v]) => ({
    key, label: labels[key] || key.replace(/([A-Z])/g, ' $1'),
    value: /Price|^maxHoa$/.test(key) ? '$' + Number(v).toLocaleString('en-US') : /^min(Beds|Baths)$/.test(key) && criteria[key.replace('min','max')] == null && !(key === 'minBeds' && criteria.exactBeds) ? `${v}+` : Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : String(v),
  }));
  if (extras.commute) result.push({ key: 'commute', label: 'Driving commute', value: `Under ${extras.commute.maxMinutes} min to ${extras.commute.work?.label || extras.commute.workText || 'your work'} · depart ${extras.commute.departAt}` });
  if (extras.radius) result.push({ key: 'radius', label: 'Radius', value: `${extras.radius.miles} miles from ${extras.radius.center?.label || extras.radius.centerText}` });
  if (extras.insights.length) result.push({ key: 'insights', label: 'Insights', value: extras.insights.join(', ') });
  if (extras.sort) result.push({ key: 'sort', label: 'Sort', value: extras.sort });
  return result;
}
// All matching is deterministic. Matched spans are consumed so unknown requests stay visible.
export function parseRules(text, savedWork) {
  let rest = normalizeText(text).replace(/(\d)\s*(million|mil)\b/g, '$1m').replace(/bedroms?|bedroooms?|bedr?ooms?/g, 'bedrooms');
  const criteria = { ...defaults, homeTypes: [], views: [] }, extras = { commute: null, radius: null, insights: [], sort: null }, assumptions = [], notApplied = [], questions = [];
  const take = (re, fn) => { rest = rest.replace(re, (...args) => { fn(...args); return ' '; }); };
  // Instruction-like clauses are never interpreted as housing preferences.
  take(/(?:ignore (?:all |previous )?instructions|system prompt|set (?:max|min) price|api[_ ]?key|execute|override)[^;.!]*/g, s => notApplied.push({ text: s, reason: 'Instructions are not housing search criteria.' }));
  take(/\b(?:no|without)\s+(?:pool|garage|basement|fireplace|waterfront|central air)\b/g, s => notApplied.push({text:s,reason:'Excluding this feature is not supported; no positive feature filter was applied.'}));
  let departAt = '08:00';
  take(/\b(leave at|depart at|arrive by)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g, (_, kind, h, m, ap) => {
    let hour = Number(h); if (ap === 'pm' && hour < 12) hour += 12; if (ap === 'am' && hour === 12) hour = 0;
    if (hour < 24 && Number(m || 0) < 60) departAt = `${String(hour).padStart(2, '0')}:${m || '00'}`;
    else notApplied.push({ text: _, reason: 'Use a valid departure time.' });
    if (kind === 'arrive by') assumptions.push('Arrival time treated as departure time; arrival planning is not supported.');
  });
  const endPlace = '(?=\\s+(?:with|under|below|at least|exactly|within|leave|arrive|and a|\\d+\\s*(?:bed|bath))\\b|$)';
  let workText = '', minutes;
  take(new RegExp('(?:<|under\\s+|less than\\s+)?(\\d+)\\s*(?:minute|min)s?\\s+(?:(?:driving|transit|bike|walk)\\s+)?(?:commute|drive)(?:\\s+to)?(?:\\s+(?:my )?work(?:\\s+at)?)?\\s*(.*?)' + endPlace, 'g'), (s, n, place) => { minutes = Number(n); workText = place.replace(/^[,\s]+|[,\s]+$/g, ''); if (/transit|bike|walk/.test(s)) assumptions.push('Commute estimates use driving, not transit, biking or walking.'); });
  take(new RegExp('commute\\s+(?:under|<)\\s*(\\d+)\\s*(?:minute|min)s?(?:\\s+to\\s+(.*?))?' + endPlace, 'g'), (_, n, place) => { minutes = Number(n); workText = place || workText; });
  take(new RegExp('(?:my )?work at\\s+(.*?)' + endPlace, 'g'), (_, place) => { workText = place; });
  if (minutes == null && workText) take(/(?:under|<)\s*(\d+)\s*(?:minute|min)s?\b/g, (_, n) => { minutes = Number(n); });
  if (minutes != null) {
    if (/\b(transit|bike|walk|walking|cycling)\b/i.test(text)) assumptions.push('Commute estimates use driving, not transit, biking or walking.');
    workText = workText.replace(/^(?:my )?work(?: at)?\s*/, '').trim();
    extras.commute = { maxMinutes: Math.min(180, Math.max(1, minutes)), workText, work: !workText && validPlace(savedWork) ? { label: savedWork.label, lat: savedWork.lat, lng: savedWork.lng } : null, departAt };
    extras.insights.push('commute');
    if (!workText && !extras.commute.work) questions.push({ field: 'work', message: 'What is your work address?', options: [] });
  } else if (workText) notApplied.push({ text: 'work at ' + workText, reason: 'Add a commute limit in minutes to filter by driving time.' });
  take(new RegExp('within\\s+(\\d+(?:\\.\\d+)?)\\s+miles?\\s+of\\s+(.*?)' + endPlace, 'g'), (_, n, centerText) => { extras.radius = { miles: Math.min(200, Math.max(0.1, Number(n))), centerText: centerText.trim(), center: null }; });
  for (const [re, module] of [[/\b(?:safe neighborhood|low crime|safety)\b/g, 'crime'], [/\b(?:near )?good schools\b/g, 'schools'], [/\b(?:close to |near )?grocery stores\b/g, 'groceries'], [/\blow flood risk\b/g, 'hazards'], [/\bshort commute\b/g, 'commute']]) take(re, () => extras.insights.push(module));
  take(/\b(cheapest|newest|biggest) first\b/g, (_, s) => { extras.sort = { cheapest: 'price-asc', newest: 'newest', biggest: 'sqft' }[s]; });
  take(/\b(?:no|without) hoa\b/g, () => { criteria.noHoa = true; });
  take(new RegExp('hoa\\s+(?:under|below|max)\\s*(' + price + ')', 'g'), (_, n) => { criteria.maxHoa = amount(n); });
  take(/\b(\d+)\s*car garage\b/g, (_, n) => { criteria.minParking = Number(n); criteria.garage = true; });
  take(/\b(?:listed in the )?last\s+(\d+)\s+days\b/g, (_, n) => { criteria.daysOnMarket = Number(n); });
  take(/\bnew listings\b/g, () => { criteria.daysOnMarket = 7; assumptions.push('New listings means listed in the last 7 days.'); });
  take(/\b(built after|built before|older than)\s+(\d{4})\b/g, (_, direction, n) => { criteria[direction === 'built after' ? 'minYearBuilt' : 'maxYearBuilt'] = Number(n); });
  take(/\b(?:(at least|min|under|below|max)\s+)?(\d+(?:\.\d+)?)\s*(sqft|sq ft|square feet|sqm|square meters)\b/g, (_, dir, n, unit) => { criteria[/under|below|max/.test(dir) ? 'maxSqft' : 'minSqft'] = Number(n) * (/sqm|meters/.test(unit) ? 10.7639 : 1); if (/sqm|meters/.test(unit)) assumptions.push('Square meters converted to square feet.'); });
  take(/\b(?:(at least|under|below|max)\s+)?(quarter|half|\d+\/\d+|\d+(?:\.\d+)?)\s*acres?(?: lot)?\b/g, (_, dir, n) => { const acres = n === 'quarter' ? .25 : n === 'half' ? .5 : n.includes('/') ? Number(n.split('/')[0]) / Number(n.split('/')[1]) : Number(n); if (Number.isFinite(acres)) criteria[/under|below|max/.test(dir) ? 'maxLotSize' : 'minLotSize'] = acres * 43560; });
  take(/\bstudio\b/g, () => { criteria.minBeds = 0; criteria.maxBeds = 0; criteria.exactBeds = true; });
  take(/\b(?:(exactly|only|at least|min(?:imum)?)\s+)?(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(?:bedrooms?|beds?|br|bathrooms?|baths?)\b/g, (s, qualifier, n, max) => {
    const field = /bath/.test(s) ? 'Baths' : 'Beds'; criteria['min' + field] = Number(n);
    if (max) criteria['max' + field] = Number(max);
    else if (/exactly|only/.test(qualifier)) { criteria['max' + field] = Number(n); if (field === 'Beds') criteria.exactBeds = true; }
    else if (!qualifier) assumptions.push(`${n} ${field.toLowerCase()} treated as ${n} or more; say 'exactly ${n} ${field.toLowerCase()}' for an exact match.`);
  });
  take(new RegExp('(?:between\\s+)?(' + price + ')\\s*(?:-|–|to|and)\\s*(' + price + ')', 'g'), (_, a, b) => { criteria.minPrice = amount(a); criteria.maxPrice = amount(b); });
  take(new RegExp('(?:under|below|max(?:imum)?|up to|over|above|around)\\s*(' + price + ')(?![\\d])', 'g'), (s, n) => { const v = amount(n); if (s.startsWith('around')) { criteria.minPrice = v * .9; criteria.maxPrice = v * 1.1; assumptions.push(`"around ${n}" treated as $${Math.round(v * .9).toLocaleString('en-US')} to $${Math.round(v * 1.1).toLocaleString('en-US')}`); } else criteria[/^(over|above)/.test(s) ? 'minPrice' : 'maxPrice'] = v; });
  for (const [re, k, v] of [
    [/\bnew construction\b/g, 'newConstruction', true], [/\bcentral air\b/g, 'ac', true], [/\bsingle stor(?:y|ey)\b/g, 'stories', 'single'], [/\bbasement\b/g, 'basement', 'has'], [/\bopen house\b/g, 'openHouse', true],  ...['pool','waterfront','fireplace','garage'].map(k => [new RegExp('\\b' + k + '\\b', 'g'), k, true]),
  ]) take(re, () => { criteria[k] = v; });
  take(/\b(coming soon|recently sold|sold|pending|under contract|contingent)\b/g, s=>notApplied.push({text:s,reason:'PropertyLens only shows homes currently for sale'}));
  take(/\b(mountain|water|park|city) view\b/g, (_, v) => criteria.views.push(v));
  take(/\b(single[ -]family|multi[ -]family|townhouse|townhome|house|condo|apartment|manufactured|land|lot)\b/g, (_, type) => criteria.homeTypes.push(({ 'single family': 'house', 'single-family': 'house', 'multi family': 'multi-family', townhouse: 'townhome', lot: 'land' })[type] || type));
  take(/\b(updated kitchen|quiet street|fixer upper)\b/g, s => { criteria.keywords = [criteria.keywords, s].filter(Boolean).join(', '); });
  // Location comes last so trailing filters cannot be swallowed by place names.
  take(/\b(?:in|near)\s+([a-z\d][a-z\d ,.'-]*?)(?=\s{2,}|\s+(?:with|and|a)\b|$)/g, (_, place) => { if (!criteria.location) criteria.location = place.replace(/[,\s]+$/g, '').trim(); else notApplied.push({ text: place, reason: 'Only one search location is supported.' }); });
  if (!criteria.location) take(/\b\d{5}\b/g, zip => { criteria.location = zip; });
  rest = rest.replace(/\b(?:a|an|the|with|and|in|near|for|please|find|me|want|looking|i|home|homes|place|family|to|my)\b/g, ' ').replace(/[,.;<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (rest) notApplied.push({ text: rest, reason: 'Not recognized as a supported filter. Try a specific field or edit the filters.' });
  extras.insights = [...new Set(extras.insights)]; criteria.homeTypes = [...new Set(criteria.homeTypes)];
  if (extras.insights.length) assumptions.push('Insights like schools and safety are shown when you open a home, not used to filter results. Explicit commute and radius limits are checked separately.');
  if (/^los\s+angeles(?:,?\s+ca)?$/i.test(criteria.location))criteria.location='Los Angeles, CA';
  if (!criteria.location) questions.push({ field: 'location', message: 'Which city, state or ZIP should we search?', options: [] });
  // Contradictory ranges need clarification instead of silently reversing intent.
  for (const key of Object.keys(NUMBERS).filter(k => k.startsWith('min'))) {
    const max = key.replace(/^min/, 'max');
    if (criteria[max] != null && criteria[key] > criteria[max]) { notApplied.push({ text: `${criteria[key]}–${criteria[max]}`, reason: 'Minimum exceeds maximum; edit these limits in filters.' }); delete criteria[key]; delete criteria[max]; }
  }
  const clean = partialCriteria(criteria);
  return { parser: 'rules', criteria: clean, extras, interpretation: interpretationFor(clean, extras), assumptions, notApplied, questions };
}
