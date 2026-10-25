// Public-property discovery and conservative US address matching. No new dependencies.
export const PREFERRED_HOSTS = ['youriguide.com', 'aryeo.com', 'hdphotohub.com', 'homevisit.com', 'tourfactory.com'];
const PORTALS = ['zillow.com', 'redfin.com', 'realtor.com'];
export function hostIs(host: string, domain: string): boolean { return host === domain || host.endsWith('.' + domain); }
export function usableUrl(value: string, base?: string): string | null {
    try {
        const u = new URL(decodeHtml(value), base);
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
        u.hash = '';
        return u.href;
    } catch { return null; }
}
export function searchQueries(address: string): string[] {
    const quoted = '"' + address.replace(/["\r\n]/g, ' ').trim() + '"';
    // Both platform domains and photographer custom domains can appear in these results.
    const parsed = parseAddress(address);
    const local = parsed ? '"' + parsed.street + (parsed.unit ? ' unit ' + parsed.unit : '') + '" "' + parsed.city + '" "' + parsed.state + '"' : quoted;
    return [quoted + ' ("floor plan" OR floorplan OR "virtual tour")',
        local + ' (' + PREFERRED_HOSTS.map((h) => 'site:' + h).join(' OR ') + ')',
        local + ' ("floor plan" OR floorplan OR "property website")'];
}
export function sourcePriority(url: string): number {
    const host = new URL(url).hostname;
    const preferred = PREFERRED_HOSTS.findIndex((h) => hostIs(host, h));
    return preferred >= 0 ? preferred : PORTALS.some((h) => hostIs(host, h)) ? 20 : 6;
}
export function urlAddressMismatch(url: string, target: string): boolean {
    const address = parseAddress(target);
    if (!address) return false;
    const split = /^(\d+[a-z]?)\s+(.+)$/.exec(address.street);
    if (!split) return false;
    let path: string;
    try { path = canon(decodeURIComponent(new URL(url).pathname).replace(/[_/+-]/g, ' ')); }
    catch { return false; }
    const street = split[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const identity = new RegExp('(?:^| )(\\d+[a-z]?) ' + street + '(?: |$)').exec(path);
    return !!identity && identity[1] !== split[1];
}
export function decodeHtml(text: string): string {
    return text.replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, n: string) => {
        const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }).replace(/&(amp|quot|apos|nbsp|lt|gt);/gi, (_, n: string) => ({ amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>' }[n.toLowerCase()]!));
}
function plain(text: string): string { return decodeHtml(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function canon(text: string): string {
    const aliases: Record<string, string> = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', lane: 'ln',
        boulevard: 'blvd', court: 'ct', circle: 'cir', place: 'pl', terrace: 'ter', parkway: 'pkwy', highway: 'hwy',
        north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
        apartment: 'unit', apt: 'unit', suite: 'unit', ste: 'unit' };
    return plain(text).toLowerCase().replace(/#/g, ' unit ').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
        .split(' ').map((s) => aliases[s] ?? s).join(' ');
}
const STATES = 'alabama:AL|alaska:AK|arizona:AZ|arkansas:AR|california:CA|colorado:CO|connecticut:CT|delaware:DE|district of columbia:DC|florida:FL|georgia:GA|hawaii:HI|idaho:ID|illinois:IL|indiana:IN|iowa:IA|kansas:KS|kentucky:KY|louisiana:LA|maine:ME|maryland:MD|massachusetts:MA|michigan:MI|minnesota:MN|mississippi:MS|missouri:MO|montana:MT|nebraska:NE|nevada:NV|new hampshire:NH|new jersey:NJ|new mexico:NM|new york:NY|north carolina:NC|north dakota:ND|ohio:OH|oklahoma:OK|oregon:OR|pennsylvania:PA|rhode island:RI|south carolina:SC|south dakota:SD|tennessee:TN|texas:TX|utah:UT|vermont:VT|virginia:VA|washington:WA|west virginia:WV|wisconsin:WI|wyoming:WY';
function region(value: string): string {
    const v = canon(value);
    return STATES.split('|').find((s) => s.split(':')[0] === v)?.split(':')[1] ?? v.toUpperCase();
}
interface Address { street: string; unit: string; city: string; state: string; zip: string; }
function parts(street: string, city: string, state: string, zip = ''): Address | null {
    const s = canon(street);
    const m = /^(.*?)(?:\s+unit\s+([a-z0-9-]+))?$/.exec(s)!;
    const st = region(state);
    if (!/^\d+[a-z]?(?:-\d+)?\s+\S/.test(m[1]) || !city.trim() || !STATES.split('|').some((r) => r.endsWith(':' + st))) return null;
    return { street: m[1], unit: m[2] ?? '', city: canon(city), state: st, zip: zip.match(/\d{5}/)?.[0] ?? '' };
}
export function parseAddress(value: string): Address | null {
    // Full street, city, state required: a street-only input is ambiguous nationwide.
    const v = plain(value).replace(/^iGUIDE\s+(?:3D\s+)?Tour\s+for\s+/i, '')
        .replace(/\s+[|–—-]\s+.*$/, '').replace(/,?\s+(USA|United States)$/i, '')
        .replace(/,\s*((?:apt\.?|apartment|unit|suite|ste\.?|#)\s*[a-z0-9-]+),/i, ' $1,');
    const m = /^(\d[^,]+),\s*([^,]+),\s*([a-z .]+?)(?:\s+(\d{5})(?:-\d{4})?)?$/i.exec(v);
    if (m) return parts(m[1], m[2], m[3], m[4]);
    const stateNames = STATES.split('|').flatMap((s) => s.split(':')).sort((a, b) => b.length - a.length).join('|');
    const end = new RegExp('^(.*?)[,\\s]+(' + stateNames + ')(?:\\s+(\\d{5})(?:-\\d{4})?)?$', 'i').exec(v);
    if (!end) return null;
    const streetCity = /^(\d.+?\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|circle|cir|place|pl|terrace|ter|parkway|pkwy|way)\.?(?:\s+(?:unit|apt\.?|apartment|suite|ste\.?|#)\s*[a-z0-9-]+)?)[,\s]+(.+)$/i.exec(end[1]);
    return streetCity ? parts(streetCity[1], streetCity[2], end[2], end[3]) : null;
}
function equal(a: Address, b: Address): boolean {
    return a.street === b.street && a.unit === b.unit && a.city === b.city && a.state === b.state
        && (!a.zip || !b.zip || a.zip === b.zip);
}
export interface AddressEvidence { matched: boolean; reason: string; evidence?: string; }
export function verifyAddress(html: string, target: string): AddressEvidence {
    const wanted = parseAddress(target);
    if (!wanted) return { matched: false, reason: 'A full street address, city and state are required to verify a property.' };
    const identities: { value: Address; evidence: string }[] = [];
    const add = (text: string, evidence: string) => {
        // Titles may append agent branding with a pipe or dash.
        const address = parseAddress(text);
        if (address) identities.push({ value: address, evidence });
    };
    // Broker footer addresses and related-property widgets are not primary identities.
    const primary = propertyHtml(html);
    const titles = [...primary.matchAll(/<(title|h1|address)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    for (const m of titles) add(plain(m[2]), m[1].toLowerCase());
    for (const heading of primary.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
        const after = primary.slice(heading.index! + heading[0].length, heading.index! + heading[0].length + 500);
        const location = /^\s*(?:<\/(?:div|span)>\s*)*<(?:div|span|p)\b[^>]*>([\s\S]*?)<\/(?:div|span|p)>/i.exec(after);
        if (location) add(plain(heading[1]) + ', ' + plain(location[1]), 'H1 plus adjacent locality');
    }
    for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
            const visit = (node: unknown, depth = 0): void => {
                if (!node || depth > 12 || typeof node !== 'object') return;
                if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return; }
                const obj = node as Record<string, unknown>;
                const types = [obj['@type']].flat().map(String);
                if (types.some((t) => /^(Organization|RealEstateAgent|Person|ItemList|ListItem)$/.test(t))) return;
                if (typeof obj.streetAddress === 'string' && typeof obj.addressLocality === 'string' && typeof obj.addressRegion === 'string') {
                    const value = parts(obj.streetAddress, obj.addressLocality, obj.addressRegion, String(obj.postalCode ?? ''));
                    if (value) identities.push({ value, evidence: 'JSON-LD PostalAddress' });
                }
                for (const [key, value] of Object.entries(obj)) if (!['itemListElement', 'relatedLink', 'relatedTo'].includes(key)) visit(value, depth + 1);
            };
            visit(JSON.parse(m[1]));
        } catch { /* Malformed structured data is not address evidence. */ }
    }
    if (identities.some((i) => !equal(i.value, wanted))) return { matched: false, reason: 'Primary property address conflicts with the requested address or unit.' };
    const match = identities.find((i) => equal(i.value, wanted));
    return match ? { matched: true, reason: 'Street, unit, city and state match; supplied ZIPs do not conflict.', evidence: match.evidence }
        : { matched: false, reason: 'No complete matching address in the page title, heading, address element or property JSON-LD.' };
}
export function isBlocked(html: string, status = 200): boolean {
    if ([401, 403, 429].includes(status)) return true;
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
    return /captcha|access denied|just a moment|verify.*human|attention required|robot check/i.test(plain(title))
        || /(?:id|class)=["'][^"']*(?:g-recaptcha|cf-chl-|h-captcha)/i.test(html);
}

/** Remove recommendation containers and embedded script state before media extraction. */
export function propertyHtml(html: string): string {
    const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    const stack: { tag: string; skip: boolean }[] = [];
    let out = '', cursor = 0;
    const voidTags = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'embed', 'wbr']);
    for (const m of clean.matchAll(/<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi)) {
        const skipping = stack.some((s) => s.skip);
        if (!skipping) out += clean.slice(cursor, m.index);
        const tag = m[1].toLowerCase();
        if (m[0].startsWith('</')) {
            const index = stack.map((s) => s.tag).lastIndexOf(tag);
            if (!skipping) out += m[0];
            if (index >= 0) stack.length = index;
        } else {
            const skip = skipping || ['aside', 'nav', 'footer'].includes(tag)
                || /(?:id|class|aria-label)\s*=\s*["'][^"']*(?:related|recommend|similar|nearby|other-properties|more-homes)/i.test(m[0]);
            if (!skip) out += m[0];
            if (!voidTags.has(tag) && !m[0].endsWith('/>')) stack.push({ tag, skip });
        }
        cursor = m.index! + m[0].length;
    }
    if (!stack.some((s) => s.skip)) out += clean.slice(cursor);
    return out;
}
export interface PublicCandidate { url: string; sourceUrl: string; source: 'webSearch'; keywordScore: number; explicitFloorPlan: boolean; }
export function embeddedPropertyCandidates(html: string, target: string, pageUrl: string): PublicCandidate[] {
    const wanted = parseAddress(target);
    const out: PublicCandidate[] = [];
    if (!wanted) return out;
    const skip = /related|recommend|similar|nearby|agent|broker|office/i;
    const add = (value: string) => {
        const url = usableUrl(value, pageUrl);
        if (url && !out.some((c) => c.url === url)) out.push({ url, sourceUrl: pageUrl, source: 'webSearch', keywordScore: 1, explicitFloorPlan: true });
    };
    const collect = (node: unknown, floor = false, depth = 0): void => {
        if (depth > 15 || !node) return;
        if (typeof node === 'string') { if (floor || /floor[\s_-]*plan.*\.(pdf|png|jpe?g|webp)/i.test(node)) add(node); return; }
        if (Array.isArray(node)) { node.forEach((n) => collect(n, floor, depth + 1)); return; }
        if (typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        const labelled = ['caption', 'alt', 'label', 'title', 'name'].some((key) =>
            typeof record[key] === 'string' && /floor[\s_-]*plans?/i.test(record[key] as string));
        for (const [key, value] of Object.entries(record)) {
            if (skip.test(key)) continue;
            const context = floor || /floor[\s_-]*plans?/i.test(key);
            if (typeof value === 'string') {
                if ((context || labelled) && /^(url|src|href|file|imageUrl|downloadUrl)$/i.test(key)) add(value);
                else if (/floor[\s_-]*plans?/i.test(key)) collect(value, true, depth + 1);
                else if (/^(image|images|media)$/i.test(key)) collect(value, false, depth + 1);
            } else collect(value, context, depth + 1);
        }
    };
    const visit = (node: unknown, depth = 0): void => {
        if (depth > 15 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return; }
        const obj = node as Record<string, unknown>;
        const a = obj.address;
        let identity: Address | null = null;
        if (typeof a === 'string') identity = parseAddress(a);
        else if (a && typeof a === 'object') {
            const v = a as Record<string, unknown>;
            if (typeof v.streetAddress === 'string' && typeof v.addressLocality === 'string' && typeof v.addressRegion === 'string')
                identity = parts(v.streetAddress, v.addressLocality, v.addressRegion, String(v.postalCode ?? ''));
        }
        if (identity && equal(wanted, identity)) { collect(obj); return; }
        for (const [key, value] of Object.entries(obj)) if (!skip.test(key) && key !== 'itemListElement') visit(value, depth + 1);
    };
    for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try { visit(JSON.parse(script[1])); } catch { /* Never evaluate executable script contents. */ }
    }
    return out.slice(0, 30);
}
export function publicCandidates(html: string, pageUrl: string): PublicCandidate[] {
    const out: PublicCandidate[] = [];
    for (const m of html.matchAll(/<(a|img|source)\b([^>]*?)(?:>([\s\S]*?)<\/a\s*>|\/?>)/gi)) {
        const attrs: Record<string, string> = {};
        for (const attr of m[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1].toLowerCase()] = decodeHtml(attr[2] ?? attr[3]);
        const label = [attrs.alt, attrs.title, attrs['aria-label'], attrs.href, attrs.src, attrs['data-src'], attrs['data-original'], plain(m[3] ?? '')].join(' ');
        if (!/floor[\s_-]*plans?|\bplans?\.(pdf|png|jpe?g|webp)\b/i.test(label)) continue;
        const url = usableUrl(attrs.href ?? attrs['data-src'] ?? attrs['data-original'] ?? attrs.src ?? '', pageUrl);
        if (!url || (m[1].toLowerCase() === 'a' && !/\.(pdf|png|jpe?g|webp)(?:\?|$)/i.test(url))) continue;
        if (!out.some((c) => c.url === url)) out.push({ url, sourceUrl: pageUrl, source: 'webSearch', keywordScore: 1, explicitFloorPlan: true });
    }
    // iGUIDE documents these as public view-alias media URLs. Use only for a
    // property page that has already passed the caller's address verification.
    const page = new URL(pageUrl);
    const alias = page.pathname.split('/').filter(Boolean);
    if (!out.length && hostIs(page.hostname, 'youriguide.com') && alias.length === 1) {
        for (const file of ['floorplan_imperial.pdf', 'floorplan_imperial_en.pdf']) {
            out.push({ url: page.origin + '/' + alias[0] + '/doc/' + file, sourceUrl: pageUrl,
                source: 'webSearch', keywordScore: 1, explicitFloorPlan: true });
        }
    }
    return out;
}
export function tourLinks(html: string, pageUrl: string): string[] {
    const out = new Set<string>();
    for (const m of html.matchAll(/<(a|iframe)\b([^>]*?)(?:>([\s\S]*?)<\/a\s*>|\/?>)/gi)) {
        const attr = /(?:href|src)\s*=\s*["']([^"']+)["']/i.exec(m[2]);
        const url = attr && usableUrl(attr[1], pageUrl);
        if (!url) continue;
        const host = new URL(url).hostname;
        // Do not follow arbitrary same-site "other homes" links. The destination must verify its own address too.
        if (PREFERRED_HOSTS.some((h) => hostIs(host, h)) || /virtual\s*tour|property\s*website|floor\s*plans?/i.test(plain(m[3] ?? ''))) out.add(url);
    }
    return [...out].slice(0, 4);
}
