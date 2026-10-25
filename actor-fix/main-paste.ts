// Entry point: reads input, processes each address, writes KV files and dataset rows.
import { Actor, log, Dataset } from 'apify';
import { PlaywrightCrawler, RequestList } from 'crawlee';
import { normalizeAddress } from './address.js';
import { extractFromHtml } from './extract.js';
import { fetchPage } from './http.js';
import {
    combinePdf, downloadCandidate, type Downloaded, hammingDistance, heuristicImageScore,
    imageSignals, perceptualHash, pdfInfo, pdfText, toPng,
} from './images.js';
import { runOcr, stopOcr, visionCheck } from './ocr-vision.js';
import type { AddressResult, AttemptRecord, FloorPlanRecord, SourceName, ListingFacts } from './types.js';

import { createHash } from 'node:crypto';

// Public-property discovery and conservative US address matching. No new dependencies.
const PREFERRED_HOSTS = ['youriguide.com', 'aryeo.com', 'hdphotohub.com', 'homevisit.com', 'tourfactory.com'];
const PORTALS = ['zillow.com', 'redfin.com', 'realtor.com'];
function hostIs(host: string, domain: string): boolean { return host === domain || host.endsWith('.' + domain); }
function usableUrl(value: string, base?: string): string | null {
    try {
        const u = new URL(decodeHtml(value), base);
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
        u.hash = '';
        return u.href;
    } catch { return null; }
}
function searchQueries(address: string): string[] {
    const quoted = '"' + address.replace(/["\r\n]/g, ' ').trim() + '"';
    // Both platform domains and photographer custom domains can appear in these results.
    const parsed = parseAddress(address);
    const local = parsed ? '"' + parsed.street + (parsed.unit ? ' unit ' + parsed.unit : '') + '" "' + parsed.city + '" "' + parsed.state + '"' : quoted;
    return [quoted + ' ("floor plan" OR floorplan OR "virtual tour")',
        local + ' (' + PREFERRED_HOSTS.map((h) => 'site:' + h).join(' OR ') + ')',
        local + ' ("floor plan" OR floorplan OR "property website")'];
}
function sourcePriority(url: string): number {
    const host = new URL(url).hostname;
    const preferred = PREFERRED_HOSTS.findIndex((h) => hostIs(host, h));
    return preferred >= 0 ? preferred : PORTALS.some((h) => hostIs(host, h)) ? 20 : 6;
}
function urlAddressMismatch(url: string, target: string): boolean {
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
function decodeHtml(text: string): string {
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
function parseAddress(value: string): Address | null {
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
interface AddressEvidence { matched: boolean; reason: string; evidence?: string; }
function verifyAddress(html: string, target: string): AddressEvidence {
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
function isBlocked(html: string, status = 200): boolean {
    if ([401, 403, 429].includes(status)) return true;
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
    return /captcha|access denied|just a moment|verify.*human|attention required|robot check/i.test(plain(title))
        || /(?:id|class)=["'][^"']*(?:g-recaptcha|cf-chl-|h-captcha)/i.test(html);
}

/** Remove recommendation containers and embedded script state before media extraction. */
function propertyHtml(html: string): string {
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
interface PublicCandidate { url: string; sourceUrl: string; source: 'webSearch'; keywordScore: number; explicitFloorPlan: boolean; }
function embeddedPropertyCandidates(html: string, target: string, pageUrl: string): PublicCandidate[] {
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
function publicCandidates(html: string, pageUrl: string): PublicCandidate[] {
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
function tourLinks(html: string, pageUrl: string): string[] {
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


interface Input {
    addresses?: unknown;
    listingUrls?: unknown;
    enabledSources?: SourceName[];
    maxFloorPlansPerAddress?: number;
    minConfidence?: number;
    includeLowConfidence?: boolean;
    outputImageFormat?: 'original' | 'png';
    combineIntoPdf?: boolean;
    includeListingFacts?: boolean;
    runOcr?: boolean;
    ocrMaxImages?: number;
    useVisionCheck?: boolean;
    openaiApiKey?: string;
    proxyConfiguration?: { useApifyProxy?: boolean; proxyUrls?: string[]; apifyProxyGroups?: string[] };
    maxConcurrency?: number;
    perAddressTimeoutSecs?: number;
    requestTimeoutSecs?: number;
    maxRunSecs?: number;
    debugMode?: boolean;
    maxSitesPerAddress?: number;
    perSiteTimeoutSecs?: number;
    searchTimeoutSecs?: number;
}


/** Accepts a string, an object with address/street/value, or anything else (skipped). */
function toAddressStrings(v: unknown): string[] {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n|;/) : v && typeof v === 'object' ? [v] : [];
    const out: string[] = [];
    for (const item of list) {
        if (typeof item === 'string') out.push(item.trim());
        else if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>;
            const s = o.address ?? o.street ?? o.value;
            if (typeof s === 'string') out.push(s.trim());
        }
    }
    return out.filter((s) => s.length > 0);
}

/** Accepts a listing URL as a string or as {url, address}. */
function toListingEntries(v: unknown): { url: string; address?: string }[] {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n/) : v && typeof v === 'object' ? [v] : [];
    const out: { url: string; address?: string }[] = [];
    for (const item of list) {
        if (typeof item === 'string' && item.trim()) out.push({ url: item.trim() });
        else if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>;
            if (typeof o.url === 'string' && o.url.trim()) {
                out.push({ url: o.url.trim(), address: typeof o.address === 'string' ? o.address.trim() : undefined });
            }
        }
    }
    return out.filter((entry) => {
        try {
            const url = new URL(entry.url);
            return ['http:', 'https:'].includes(url.protocol) && !!url.hostname;
        } catch { return false; }
    });
}


/** Records a full, valid result for one address. */
async function processAddress(p: Pending, job: Job): Promise<AddressResult> {
    const result: AddressResult = {
        inputAddress: p.inputAddress,
        normalizedAddress: p.normalized,
        status: 'not_found',
        listingUrls: p.listingUrls.map((l) => l.url),
        floorPlans: [],
        attempts: p.attempts,
        scrapedAt: new Date().toISOString(),
    };

    const scored: { d: Downloaded; conf: number; signals: FloorPlanRecord['signals']; ocrRoomWords?: number; floors?: number | null }[] = [];
    const seenHashes: string[] = [];
    let ocrUsed = 0;
    let facts: ListingFacts | undefined;

    for await (const pg of listingPages(p, job)) {
        check(job);
        // Both the source page and the media's page association are checked before download.
        const extracted = extractFromHtml(pg.html, pg.url, pg.source);
        const candidates = [...extracted.candidates, ...[...publicCandidates(pg.html, pg.url), ...pg.embeddedCandidates] as typeof extracted.candidates]
            .filter((c, i, all) => all.findIndex((other) => other.url === c.url) === i);
        p.attempts.push({ source: pg.source as SourceName, step: pg.rendered ? 'browser-extract' : 'extract', url: pg.url, ok: candidates.length > 0, detail: `${candidates.length} candidate(s)` });
        if (!facts && extracted.facts) facts = extracted.facts;

        for (const candidate of candidates.slice(0, maxPlans * 3)) {
            if (scored.length >= maxPlans) break;
            check(job);
            try {
                const assetUrl = usableUrl(candidate.url, pg.url);
                if (!assetUrl || (candidate.sourceUrl && usableUrl(candidate.sourceUrl, pg.url) !== pg.url)) {
                    p.attempts.push({ source: 'extract', step: 'asset-association', url: candidate.url, ok: false, detail: 'Candidate is associated with a different property page.' });
                    continue;
                }
                const cand = { ...candidate, url: assetUrl, sourceUrl: pg.url };
                const dl = await step(job, 'download', () => downloadCandidate(cand, fetchOpts));
                if ('error' in dl) { p.attempts.push({ source: 'download', step: 'download', url: cand.url, ok: false, detail: dl.error }); continue; }
    
                let signalCandidate = dl;
                let signals: FloorPlanRecord['signals'] = { keyword: cand.keywordScore, explicit: !!cand.explicitFloorPlan };
                Object.assign(signals, { addressVerified: true, matchedAddress: job.raw,
                    addressEvidence: pg.addressEvidence.evidence, providerHost: new URL(pg.url).hostname });
                let conf = 0;
                let ocrRoomWords: number | undefined;
                let floors: number | null | undefined;
    
                if (dl.contentType === 'application/pdf') {
                    const info = await step(job, 'pdfInfo', () => pdfInfo(dl.body));
                    const text = await step(job, 'pdfText', () => pdfText(dl.body));
                    const pdfHit = /floor\s*plan/i.test(text);
                    signals = { ...signals, pdfValid: info.isValid, pdfPages: info.pages, pdfTextHit: pdfHit };
                    conf = 0.25 + (cand.keywordScore > 0 ? 0.2 : 0) + (cand.explicitFloorPlan ? 0.2 : 0) + (pdfHit ? 0.35 : 0);
                    if (!info.isValid) conf = 0;
                } else {
                    const img = dl.body;
                    const sig = await step(job, 'imageSignals', () => imageSignals(img));
                    const heur = heuristicImageScore(sig);
                    const phash = await step(job, 'hash', () => perceptualHash(img));
                    if (seenHashes.some((h) => hammingDistance(h, phash) <= 5)) {
                        p.attempts.push({ source: 'download', step: 'dedupe', url: cand.url, ok: false, detail: 'perceptual duplicate' });
                        continue;
                    }
                    seenHashes.push(phash);
                    signals = { ...signals, lightness: +sig.lightness.toFixed(3), saturation: +sig.saturation.toFixed(3), edgeDensity: +sig.edgeDensity.toFixed(3), heuristic: +heur.toFixed(3) };
                    (signals as Record<string, unknown>).phash = phash;
                    conf = heur * 0.6 + (cand.keywordScore > 0 ? 0.2 : 0) + (cand.explicitFloorPlan ? 0.2 : 0);
    
                    if (doOcr && ocrUsed < ocrMax) {
                        ocrUsed++;
                        const ocr = await step(job, 'ocr', () => runOcr(img));
                        ocrRoomWords = ocr.roomWordHits;
                        signals.ocrRoomWords = ocr.roomWordHits;
                        signals.ocrDimensions = ocr.hasDimensions;
                        conf += Math.min(0.2, ocr.roomWordHits * 0.05) + (ocr.hasDimensions ? 0.1 : 0);
                    }
                    if (doVision) {
                        const v = await step(job, 'vision', () => visionCheck(img, dl.contentType, rawInput.openaiApiKey!));
                        if (v) {
                            floors = v.floors;
                            signals.visionFloorPlan = v.isFloorPlan;
                            signals.visionConfidence = v.confidence;
                            conf = v.isFloorPlan ? Math.max(conf, v.confidence) : Math.min(conf, 0.2);
                        }
                    }
                    if (toPngOut && dl.contentType !== 'image/png') {
                        signalCandidate = { ...dl, body: await step(job, 'png', () => toPng(img)), contentType: 'image/png' };
                    }
                }
    
                conf = Math.max(0, Math.min(1, conf));
                const keep = includeLow || conf >= minConf;
                if (!keep) { p.attempts.push({ source: 'extract', step: 'score', url: cand.url, ok: false, detail: `low confidence ${conf.toFixed(2)}` }); continue; }
                scored.push({ d: signalCandidate, conf, signals, ocrRoomWords, floors });
            } catch (err) {
                check(job);
                p.attempts.push({ source: 'extract', step: 'candidate-error', url: candidate.url, ok: false, detail: message(err) });
            }
        }
        // A page can supply several floors. Once it yields accepted plans, persist
        // them before unrelated source probes can consume the remaining deadline.
        if (scored.length > 0) break;
    }

    // Persist files to KV store and build records.
    const slugBase = (p.normalized || p.inputAddress).replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 80) + `_${job.id}`;
    const records: FloorPlanRecord[] = [];
    scored.sort((a, b) => b.conf - a.conf);
    for (const [i, s] of scored.entries()) {
        const ext = s.d.contentType === 'application/pdf' ? 'pdf' : s.d.contentType === 'image/png' ? 'png' : s.d.contentType === 'image/webp' ? 'webp' : 'jpg';
        const key = `${slugBase}__plan_${String(i + 1).padStart(2, '0')}.${ext}`;
        await step(job, 'persistFiles', () => Actor.setValue(key, s.d.body, { contentType: s.d.contentType }));
        records.push({
            key, kvKey: key, url: s.d.candidate.url, sourceUrl: s.d.candidate.sourceUrl, sourcePageUrl: s.d.candidate.sourceUrl,
            source: s.d.candidate.source, sourceName: s.d.candidate.source,
            contentType: s.d.contentType, bytes: s.d.body.length, sha256: createHash('sha256').update(s.d.body).digest('hex'), confidence: +s.conf.toFixed(3),
            signals: s.signals, floors: s.floors, ocrRoomWords: s.ocrRoomWords,
        });
    }
    result.floorPlans = records;

    if (doCombine && scored.length > 0) {
        const pdf = await step(job, 'combinePdf', () => combinePdf(scored.map((s) => s.d)));
        const key = `${slugBase}__combined.pdf`;
        await step(job, 'persistFiles', () => Actor.setValue(key, pdf, { contentType: 'application/pdf' }));
        result.combinedPdfKey = key;
    }

    // Discovery is lazy, so include sites added while attempting fallback.
    result.listingUrls = p.listingUrls.map((l) => l.url);
    if (records.length > 0) result.status = 'found';
    else if (!p.listingUrls.length && p.attempts.some((a) => !a.ok && /Search exceeded its time budget|TIMED-OUT/.test(a.detail ?? ''))) {
        result.status = 'timeout';
        result.reason = 'Discovery timed out before any property URLs were available; no conclusion about floor-plan availability can be made.';
    }
    else if (p.attempts.some((a) => !a.ok && /403|429|blocked|captcha/i.test(a.detail ?? ''))) {
        result.status = 'blocked';
        result.reason = `Some sites blocked retrieval (${[...job.blockedHosts].join(', ') || 'see attempts'}); no address-verified plan was found on the other sites tried.`;
    } else if (p.listingUrls.length > 0) {
        result.status = 'listing_found_no_floor_plan';
    } else {
        result.status = 'no_listing_found';
    }
    if (!records.length && !result.reason) result.reason = 'No floor plan could be verified for this exact address; see attempts for skipped sites and address mismatches.';
    if (rawInput.includeListingFacts !== false && facts) result.facts = facts;
    return result;
}


const ALL_SOURCES: SourceName[] = ['zillow', 'redfin', 'realtor', 'compass', 'webSearch'];
const IMPLEMENTATION_VERSION = 'public-fallback-0.2.3-streaming-search';
const RUN_START = Date.now();
await Actor.init();
const suppliedInput = await Actor.getInput<Input>();
const rawInput: Input = suppliedInput && typeof suppliedInput === 'object' && !Array.isArray(suppliedInput) ? suppliedInput : {};
function bounded(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
const addresses = [...new Set(toAddressStrings(rawInput.addresses))].slice(0, 25);
const listingUrls = toListingEntries(rawInput.listingUrls).slice(0, 100);
const enabled = Array.isArray(rawInput.enabledSources) && rawInput.enabledSources.length
    ? rawInput.enabledSources.filter((s) => ALL_SOURCES.includes(s)) : ALL_SOURCES;
const maxPlans = Math.floor(bounded(rawInput.maxFloorPlansPerAddress, 6, 1, 20));
const minConf = bounded(rawInput.minConfidence, 0.5, 0, 1);
const includeLow = rawInput.includeLowConfidence === true;
const toPngOut = rawInput.outputImageFormat !== 'original';
const doCombine = rawInput.combineIntoPdf === true;
const doOcr = rawInput.runOcr !== false;
const ocrMax = Math.floor(bounded(rawInput.ocrMaxImages, 4, 0, 20));
const doVision = rawInput.useVisionCheck === true && !!rawInput.openaiApiKey;
const requestTimeout = bounded(rawInput.requestTimeoutSecs, 20, 1, 60);
const maxSites = Math.floor(bounded(rawInput.maxSitesPerAddress, 8, 1, 20));
const perSiteTimeoutMs = bounded(rawInput.perSiteTimeoutSecs, 12, 0.01, 30) * 1000;
const searchTimeoutSecs = bounded(rawInput.searchTimeoutSecs, 20, 0.01, 30);
const maxRunSecs = bounded(rawInput.maxRunSecs, 120, 1, 3600);
const perAddressTimeoutMs = bounded(rawInput.perAddressTimeoutSecs, 90, 0.01, 3600) * 1000;
const maxConcurrency = Math.floor(bounded(rawInput.maxConcurrency, 2, 1, 5));
const debugMode = rawInput.debugMode === true;
const phaseMs: Record<string, number> = { setup: 0, discovery: 0, fetch: 0, browser: 0, process: 0, persistRows: 0 };
const env = Actor.getEnv();
const timeoutAt = env.timeoutAt instanceof Date ? env.timeoutAt.getTime() : Date.parse(String(env.timeoutAt));
const platformTimeout = Number.isFinite(timeoutAt) ? timeoutAt : Infinity;
// The work deadline leaves storage/shutdown time before the platform kills the container.
const workDeadline = Math.min(RUN_START + maxRunSecs * 1000, platformTimeout - 10000);
const runController = new AbortController();
let deadlineHit = false;
const deadlineTimer = setTimeout(() => {
    deadlineHit = true;
    runController.abort(new Error('Run work deadline reached'));
}, Math.max(0, workDeadline - Date.now()));
const proxyInput = rawInput.proxyConfiguration ?? { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] };
let proxyConf: Awaited<ReturnType<typeof Actor.createProxyConfiguration>>;
let fetchOpts: { proxyUrl?: string; timeoutSecs: number } = { timeoutSecs: requestTimeout };
const proxyMode = proxyInput.proxyUrls?.length ? 'custom-proxy'
    : proxyInput.useApifyProxy === false ? 'direct'
    : proxyInput.apifyProxyGroups?.length ? 'apify-proxy:' + proxyInput.apifyProxyGroups.join(',') : 'apify-proxy:auto';
// Log an allowlist, never raw input/proxy URLs/API keys.
const effectiveInput = { addresses, listingUrls: listingUrls.map((l) => ({ address: l.address, host: new URL(l.url).hostname })),
    implementationVersion: IMPLEMENTATION_VERSION,
    enabledSources: enabled, maxRunSecs, perAddressTimeoutSecs: perAddressTimeoutMs / 1000, requestTimeoutSecs: requestTimeout,
    maxConcurrency, proxyMode, maxSitesPerAddress: maxSites, perSiteTimeoutSecs: perSiteTimeoutMs / 1000,
    searchTimeoutSecs, discoveryMode: 'exact-address-public-sites',
    runOcr: doOcr, useVisionCheck: doVision, buildNumber: env.actorBuildNumber ?? null };
log.info('Effective configuration', effectiveInput);
interface Pending { inputAddress: string; normalized: string; listingUrls: { url: string; source: string }[]; attempts: AttemptRecord[]; }
interface Job {
    id: number; raw: string; normalized: string; valid: boolean; invalidReason?: string;
    supplied: { url: string; source: string }[]; pending: Pending;
    signal: AbortSignal; startedAt?: number; phaseMs: Record<string, number>; result?: AddressResult;
    blockedHosts: Set<string>;
}
function message(err: unknown): string { return (err instanceof Error ? err.message : String(err)).slice(0, 300); }
function check(job: Job): void {
    if (job.signal.aborted) throw job.signal.reason ?? new Error('Timeout');
    if (Date.now() >= workDeadline) {
        deadlineHit = true;
        runController.abort(new Error('Run work deadline reached'));
        throw runController.signal.reason;
    }
}
async function untilAbort<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw signal.reason;
    let onAbort: () => void = () => undefined;
    const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason ?? new Error('Timeout'));
        signal.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([Promise.resolve().then(() => {
        if (signal.aborted) throw signal.reason;
        return fn();
    }), aborted]); }
    finally { signal.removeEventListener('abort', onAbort); }
}
async function step<T>(job: Job, phase: string, fn: () => Promise<T>): Promise<T> {
    check(job);
    const start = Date.now();
    try {
        const result = await untilAbort(job.signal, fn);
        check(job);
        return result;
    } finally {
        const ms = Date.now() - start;
        phaseMs[phase] = (phaseMs[phase] ?? 0) + ms;
        job.phaseMs[phase] = (job.phaseMs[phase] ?? 0) + ms;
    }
}
async function budget<T>(job: Job, ms: number, label: string, fn: (child: Job) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort(job.signal.reason);
    job.signal.addEventListener('abort', abort, { once: true });
    if (job.signal.aborted) abort();
    const timer = setTimeout(() => controller.abort(new Error(label + ' exceeded its time budget; trying another site')), ms);
    const child = { ...job, signal: controller.signal };
    try { return await untilAbort(child.signal, () => fn(child)); }
    finally { clearTimeout(timer); job.signal.removeEventListener('abort', abort); }
}
function sourceFromUrl(url: string): SourceName {
    const host = new URL(url).hostname;
    for (const name of ['zillow', 'redfin', 'realtor', 'compass'] as const)
        if (host === name + '.com' || host.endsWith('.' + name + '.com')) return name;
    return 'webSearch';
}
const jobs: Job[] = [];
const byAddress = new Map<string, Job>();
function addJob(raw: string, url?: string): void {
    const norm = normalizeAddress(raw);
    const key = (norm.valid ? norm.normalized : raw).toLowerCase();
    let job = byAddress.get(key);
    if (!job) {
        const normalized = norm.valid ? norm.normalized : raw;
        job = { id: jobs.length + 1, raw, normalized, valid: norm.valid || !!url, invalidReason: norm.reason,
            supplied: [], pending: { inputAddress: raw, normalized, listingUrls: [], attempts: [] },
            signal: runController.signal, phaseMs: {}, blockedHosts: new Set() };
        jobs.push(job); byAddress.set(key, job);
    }
    if (url && !job.supplied.some((l) => l.url === url)) {
        job.supplied.push({ url, source: sourceFromUrl(url) });
        job.valid = true;
    }
}
for (const raw of addresses) addJob(raw);
for (const entry of listingUrls) addJob(entry.address || entry.url, entry.url);

async function webSearchStep(queries: string[], job: Job): Promise<{ url: string; title: string }[]> {
    let childRunId: string | undefined;
    let childFinished = false;
    const abortChild = async (id: string): Promise<void> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([Actor.apifyClient.run(id).abort(), new Promise<void>((resolve) => { timer = setTimeout(resolve, 500); })]);
        } catch { /* Remote run timeout remains a backstop if abort fails. */ }
        finally { clearTimeout(timer); }
    };
    try {
        const remaining = Math.max(1, Math.floor((workDeadline - Date.now()) / 1000));
        job.pending.attempts.push({ source: 'webSearch', step: 'search-start', ok: true,
            detail: 'Starting bounded search; read the first available dataset batch without waiting for all queries.' });
        const starting = Actor.start('apify/google-search-scraper', {
            queries: queries.join('\n'), maxPagesPerQuery: 1, languageCode: 'en', countryCode: 'us',
        }, { timeout: Math.max(1, Math.floor(Math.min(searchTimeoutSecs, remaining, perAddressTimeoutMs / 1000))) });
        // If a slow start API response arrives after our local deadline, clean up that run too.
        void starting.then((run) => { if (job.signal.aborted) void abortChild(run.id); }, () => undefined);
        const run = await step(job, 'search', () => starting);
        childRunId = run.id;
        job.pending.attempts.push({ source: 'webSearch', step: 'search-run-started', ok: true, detail: 'Child run ' + run.id });
        while (true) {
            check(job);
            const ds = await step(job, 'searchResults', () => Actor.apifyClient.dataset(run.defaultDatasetId).listItems({ limit: 10 }));
            const out: { url: string; title: string }[] = [];
            for (const item of ds.items as { organicResults?: { url: string; title: string }[] }[])
                for (const r of item.organicResults ?? []) if (typeof r.url === 'string') out.push({ url: r.url, title: r.title ?? '' });
            if (out.length) {
                job.pending.attempts.push({ source: 'webSearch', step: 'search-results', ok: true, detail: out.length + ' URLs available; proceeding to property retrieval.' });
                return out;
            }
            const state = await step(job, 'searchStatus', () => Actor.apifyClient.run(run.id).get());
            if (state && ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(state.status)) {
                childFinished = true;
                // The run may finish between reading its dataset and checking its status.
                const final = await step(job, 'searchResults', () => Actor.apifyClient.dataset(run.defaultDatasetId).listItems({ limit: 10 }));
                for (const item of final.items as { organicResults?: { url: string; title: string }[] }[])
                    for (const r of item.organicResults ?? []) if (typeof r.url === 'string') out.push({ url: r.url, title: r.title ?? '' });
                job.pending.attempts.push({ source: 'webSearch', step: 'search-finished', ok: state.status === 'SUCCEEDED',
                    detail: state.status + '; ' + out.length + ' URLs' });
                return out;
            }
            await step(job, 'searchWait', () => new Promise<void>((resolve) => setTimeout(resolve, 500)));
        }
    } catch (err) {
        check(job);
        job.pending.attempts.push({ source: 'webSearch', step: 'search', ok: false, detail: message(err) });
        return [];
    } finally {
        if (childRunId && !childFinished) await abortChild(childRunId);
    }
}

type Page = { url: string; source: string; html: string; rendered: boolean; addressEvidence: AddressEvidence;
    embeddedCandidates: ReturnType<typeof embeddedPropertyCandidates> };
async function* listingPages(p: Pending, job: Job): AsyncGenerator<Page> {
    const seen = new Set<string>();
    const queue = [...p.listingUrls];
    let searched = false;
    while (seen.size < maxSites) {
        check(job);
        if (!queue.length) {
            if (searched) break;
            searched = true;
            try {
                // Even a large input value cannot let discovery consume the work budget.
                const addressRemaining = (job.startedAt ?? Date.now()) + perAddressTimeoutMs - Date.now();
                const searchBudget = Math.max(1, Math.min(searchTimeoutSecs * 1000,
                    (workDeadline - Date.now()) * 0.3, addressRemaining * 0.3));
                p.attempts.push({ source: 'webSearch', step: 'discovery-budget', ok: true,
                    detail: 'Search capped at ' + Math.round(searchBudget) + 'ms; remaining time reserved for retrieval.' });
                const found = await budget(job, searchBudget, 'Search', (child) =>
                    step(child, 'discovery', () => webSearchStep(searchQueries(job.raw), child)));
                const urls = found.map((r) => usableUrl(r.url)).filter((u): u is string => !!u)
                    .filter((u) => enabled.includes(sourceFromUrl(u)))
                    .sort((a, b) => sourcePriority(a) - sourcePriority(b));
                for (const url of [...new Set(urls)]) {
                    if (seen.has(url)) continue;
                    queue.push({ url, source: sourceFromUrl(url) });
                    if (!p.listingUrls.some((l) => l.url === url)) p.listingUrls.push({ url, source: sourceFromUrl(url) });
                }
            } catch (err) {
                check(job);
                p.attempts.push({ source: 'webSearch', step: 'discovery', ok: false, detail: message(err) });
            }
            if (!queue.length) break;
        }
        const listing = queue.shift()!;
        if (seen.has(listing.url)) continue;
        if (urlAddressMismatch(listing.url, job.raw)) {
            p.attempts.push({ source: sourceFromUrl(listing.url), step: 'url-address-filter', url: listing.url,
                ok: false, detail: 'URL identifies a different house number on this street; skipped before fetching.' });
            continue;
        }
        seen.add(listing.url);
        const source = listing.source as SourceName;
        const host = new URL(listing.url).hostname.replace(/^www\./, '');
        if (job.blockedHosts.has(host)) {
            p.attempts.push({ source, step: 'site-skipped', url: listing.url, ok: false, detail: 'Host was already blocked; trying another site.' });
            continue;
        }
        p.attempts.push({ source, step: 'site-start', url: listing.url, ok: true, detail: 'Starting HTTP/browser retrieval with a bounded site budget.' });
        try {
            const pages = await budget(job, perSiteTimeoutMs, host, async (site) => {
                let html: string | null = null;
                let finalUrl = listing.url;
                try {
                    const response = await step(site, 'fetch', () => fetchPage(listing.url,
                        { ...fetchOpts, timeoutSecs: Math.max(1, Math.min(requestTimeout, perSiteTimeoutMs / 1000)) }));
                    const blocked = isBlocked(response.body ?? '', response.status);
                    p.attempts.push({ source, step: 'fetch', url: listing.url, ok: response.ok && !blocked,
                        detail: blocked ? 'blocked HTTP ' + response.status + '; switching site'
                            : ('HTTP ' + response.status + ' ' + (response.error ?? '')).trim() });
                    if (blocked) { job.blockedHosts.add(host); return []; }
                    if (response.ok) {
                        html = response.body;
                        finalUrl = usableUrl((response as { url?: string }).url ?? listing.url) ?? listing.url;
                    }
                } catch (err) {
                    check(site);
                    p.attempts.push({ source, step: 'fetch', url: listing.url, ok: false, detail: message(err) });
                }
                const verify = (body: string, url: string, rendered: boolean): Page | null => {
                    const evidence = verifyAddress(body, job.raw);
                    p.attempts.push({ source, step: 'address-match', url, ok: evidence.matched, detail: evidence.reason });
                    return evidence.matched ? { url, source, html: propertyHtml(body), rendered, addressEvidence: evidence,
                        embeddedCandidates: embeddedPropertyCandidates(body, job.raw, url) } : null;
                };
                const verified = html ? verify(html, finalUrl, false) : null;
                if (verified) {
                    // Only a verified property's links can seed linked-tour traversal.
                    for (const link of tourLinks(verified.html, finalUrl)) {
                        if (!seen.has(link) && !queue.some((q) => q.url === link)) {
                            queue.push({ url: link, source: sourceFromUrl(link) });
                            if (!p.listingUrls.some((l) => l.url === link)) p.listingUrls.push({ url: link, source: sourceFromUrl(link) });
                        }
                    }
                    const candidates = [...extractFromHtml(verified.html, finalUrl, source).candidates, ...publicCandidates(verified.html, finalUrl), ...verified.embeddedCandidates];
                    if (candidates.length) return [verified];
                }
                // A known different address will not become the requested house by rendering.
                if (html && verifyAddress(html, job.raw).reason.includes('conflicts')) return [];
                const rendered = await renderWithBrowser(listing.url, source, site);
                if (!rendered) return verified ? [verified] : [];
                const browserPage = verify(rendered.html, rendered.url, true);
                if (browserPage) {
                    for (const link of tourLinks(browserPage.html, browserPage.url)) {
                        if (!seen.has(link) && !queue.some((q) => q.url === link)) {
                            queue.push({ url: link, source: sourceFromUrl(link) });
                            if (!p.listingUrls.some((l) => l.url === link)) p.listingUrls.push({ url: link, source: sourceFromUrl(link) });
                        }
                    }
                }
                return browserPage ? [browserPage] : verified ? [verified] : [];
            });
            for (const page of pages) yield page;
        } catch (err) {
            check(job);
            p.attempts.push({ source, step: 'site-fallback', url: listing.url, ok: false, detail: message(err) });
        }
    }
}

async function renderWithBrowser(url: string, source: SourceName, job: Job): Promise<{ html: string; url: string } | null> {
    check(job);
    let html: string | null = null;
    let finalUrl = url;
    // An isolated in-memory request list avoids reusing the default queue across fallback crawlers.
    const requestList = await step(job, 'browserSetup', () => RequestList.open(null, [url]));
    const crawler = new PlaywrightCrawler({
        requestList, proxyConfiguration: proxyConf, maxConcurrency: 1, maxRequestRetries: 0,
        navigationTimeoutSecs: Math.min(requestTimeout, 12), requestHandlerTimeoutSecs: Math.min(requestTimeout, 12),
        async requestHandler({ page, response }) {
            check(job);
            const status = response?.status() ?? 0;
            html = await page.content();
            finalUrl = page.url();
            const blocked = isBlocked(html, status) || /captcha|verify you are human|access denied|just a moment/i.test(await page.title());
            job.pending.attempts.push({ source, step: 'browser', url, ok: !blocked && status < 400,
                detail: blocked ? 'blocked HTTP ' + status : 'HTTP ' + status });
            if (blocked) job.blockedHosts.add(new URL(url).hostname.replace(/^www\./, ''));
            if (blocked || status >= 400) html = null;
        },
        async failedRequestHandler({ request }) {
            job.pending.attempts.push({ source, step: 'browser', url, ok: false, detail: request.errorMessages.join('; ').slice(0, 300) });
        },
    });
    const teardown = () => { void crawler.teardown().catch(() => undefined); };
    job.signal.addEventListener('abort', teardown, { once: true });
    try {
        await step(job, 'browser', () => crawler.run());
        return html ? { html, url: finalUrl } : null;
    } catch (err) {
        check(job);
        job.pending.attempts.push({ source, step: 'browser', url, ok: false, detail: message(err) });
        return null;
    } finally { job.signal.removeEventListener('abort', teardown); teardown(); }
}

async function handleOne(job: Job): Promise<AddressResult> {
    check(job);
    if (!job.valid) return resultFor(job, 'invalid_address', job.invalidReason);
    if (!parseAddress(job.raw)) return resultFor(job, 'invalid_address', 'Provide a full street address, city and state so the floor plan can be matched to a specific property. URL-only inputs need an address field.');
    const p = job.pending;
    if (job.supplied.length) {
        p.listingUrls = [...job.supplied];
        p.attempts.push({ source: 'extract', step: 'listing-provided', ok: true, detail: 'skipped discovery' });
    }
    return step(job, 'process', () => processAddress(p, job));
}
function resultFor(job: Job, status: AddressResult['status'], reason?: string): AddressResult {
    return { inputAddress: job.raw, normalizedAddress: job.normalized, status, reason,
        listingUrls: job.pending.listingUrls.map((l) => l.url), floorPlans: [],
        attempts: [...job.pending.attempts], scrapedAt: new Date().toISOString() };
}
const written = new Set<number>();
async function emit(job: Job, result: AddressResult): Promise<void> {
    // Called only once per job by a worker. A failed push must fail the run, never count as written.
    const start = Date.now();
    await Dataset.pushData({ ...result, address: result.normalizedAddress || result.inputAddress,
        implementationVersion: IMPLEMENTATION_VERSION, phaseMs: { ...job.phaseMs } });
    phaseMs.persistRows += Date.now() - start;
    written.add(job.id);
    job.result = result;
}
async function runJob(job: Job, setupError?: unknown): Promise<void> {
    const controller = new AbortController();
    const abortRun = () => controller.abort(runController.signal.reason);
    runController.signal.addEventListener('abort', abortRun, { once: true });
    if (runController.signal.aborted) abortRun();
    job.signal = controller.signal;
    job.startedAt = Date.now();
    const timer = setTimeout(() => controller.abort(new Error('Address timeout including discovery')), perAddressTimeoutMs);
    let result: AddressResult;
    try {
        check(job);
        if (setupError) throw setupError;
        result = await handleOne(job);
    } catch (err) {
        result = resultFor(job, controller.signal.aborted ? 'timeout' : 'error', message(err));
    } finally {
        clearTimeout(timer);
        runController.signal.removeEventListener('abort', abortRun);
        job.phaseMs.total = Date.now() - job.startedAt;
    }
    await emit(job, result);
}

let setupError: unknown;
const setupStart = Date.now();
try {
    if (jobs.length) {
        proxyConf = await untilAbort(runController.signal, () => Actor.createProxyConfiguration(proxyInput));
        const proxyUrl = await untilAbort(runController.signal, async () => (await proxyConf?.newUrl()) ?? undefined);
        fetchOpts = { proxyUrl, timeoutSecs: requestTimeout };
    }
} catch (err) { setupError = err; }
finally { phaseMs.setup = Date.now() - setupStart; }

let cursor = 0;
async function worker(): Promise<void> {
    while (cursor < jobs.length) {
        const job = jobs[cursor++];
        await runJob(job, setupError);
    }
}
let exitCode = 0;
let runStatus = 'completed';
try {
    if (!jobs.length) {
        runStatus = 'invalid_input';
        await Dataset.pushData({ inputAddress: null, address: null, status: 'invalid_input',
            reason: 'Provide at least one address or HTTP(S) listing URL.', listingUrls: [], floorPlans: [], attempts: [], scrapedAt: new Date().toISOString() });
    } else {
        const workers = await Promise.allSettled(Array.from({ length: Math.min(maxConcurrency, jobs.length) }, () => worker()));
        const failure = workers.find((r) => r.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        runStatus = deadlineHit ? 'partial_timeout' : jobs.some((j) => j.result?.status === 'timeout') ? 'partial_timeout'
            : setupError ? 'setup_error' : 'completed';
        if (setupError && !deadlineHit) exitCode = 1;
    }
} catch (err) {
    exitCode = 1;
    runStatus = 'storage_error';
    log.error('Could not persist every address result: ' + message(err));
} finally {
    clearTimeout(deadlineTimer);
    runController.abort(new Error('Run finished'));
    phaseMs.total = Date.now() - RUN_START;
    await Actor.setValue('OUTPUT', { runStatus, implementationVersion: IMPLEMENTATION_VERSION, addressesRequested: jobs.length, addressesWritten: written.size,
        elapsedMs: phaseMs.total, phaseMs, effectiveInput, proxyMode, maxRunSecs, memoryMbytes: env.memoryMbytes ?? null,
        scrapedAt: new Date().toISOString() });
    if (debugMode) await Actor.setValue('DEBUG_REPORT', { effectiveInput, records: jobs.map((j) => ({
        address: j.raw, status: j.result?.status, attempts: j.result?.attempts, phaseMs: j.phaseMs })) });
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([stopOcr().catch(() => undefined), new Promise<void>((resolve) => { cleanupTimer = setTimeout(resolve, 1000); })]);
    clearTimeout(cleanupTimer);
    await Actor.exit({ exitCode, timeoutSecs: 5 });
}
