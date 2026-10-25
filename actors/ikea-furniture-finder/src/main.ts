import { Actor, log } from 'apify';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { extractIkeaDimensions } from './dimensions.js';

interface Input {
    description: string;
    country?: string;
    language?: string;
}

interface Candidate {
    name: string;
    price: string;
    url: string;
    imageUrl: string | null;
}

const STOPWORDS = new Set(['a', 'an', 'the', 'with', 'and', 'or', 'for', 'of', 'in', 'to']);

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function scoreCandidate(query: string[], candidate: Candidate): number {
    const haystack = new Set(tokenize(`${candidate.name} ${candidate.url}`));
    let overlap = 0;
    for (const token of query) {
        if (haystack.has(token)) overlap++;
    }
    const ratio = query.length ? overlap / query.length : 0;
    return ratio + (candidate.imageUrl ? 0.5 : 0);
}

function absolutize(href: string, base: string): string {
    return new URL(href, base).toString();
}

function parseSearchResults(html: string, pageUrl: string): Candidate[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const candidates: Candidate[] = [];

    $('a[href*="/p/"]').each((_, el) => {
        const anchor = $(el);
        const href = anchor.attr('href');
        if (!href) return;
        const url = absolutize(href, pageUrl).split('?')[0];
        if (!['www.ikea.com', 'ikea.com'].includes(new URL(url).hostname)) return;
        if (seen.has(url)) return;

        const card = anchor.closest('[class*="product"], article, li, div');
        const name =
            card.find('[class*="name"], [class*="title"], h2, h3').first().text().trim() ||
            anchor.attr('aria-label')?.trim() ||
            anchor.text().trim();
        if (!name) return;

        const price = card.find('[class*="price"]').first().text().replace(/\s+/g, ' ').trim();
        const img = card.find('img').first();
        const imageUrl = img.attr('src') || img.attr('data-src') || null;

        seen.add(url);
        candidates.push({
            name,
            price,
            url,
            imageUrl: imageUrl ? absolutize(imageUrl, pageUrl) : null,
        });
    });

    return candidates;
}

await Actor.init();

try {
    const input = (await Actor.getInput<Input>()) ?? { description: '' };
    if (!input.description?.trim()) {
        throw new Error('The "description" input is required.');
    }

    const country = (input.country || 'us').toLowerCase();
    const language = (input.language || 'en').toLowerCase();
    if (!/^[a-z]{2}$/.test(country) || !/^[a-z]{2}$/.test(language) || input.description.trim().length > 500) {
        throw new Error('Use a description up to 500 characters and two-letter country/language codes.');
    }
    const query = input.description.trim();
    const searchUrl = `https://www.ikea.com/${country}/${language}/search/?q=${encodeURIComponent(query)}`;
    const queryTokens = tokenize(query);

    const browser = await chromium.launch({ headless: true });
    Actor.on('aborting', async () => {
        await Actor.setValue('state', { status: 'aborted' });
        await browser.close();
        await Actor.exit();
    });
    let best: (Candidate & { matchScore: number }) | null = null;
    let debugHtml: string | null = null;
    let dimensions = { widthIn: null as number | null, depthIn: null as number | null, heightIn: null as number | null };

    try {
        const page = await browser.newPage();
        log.info(`Loading ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForSelector('a[href*="/p/"]', { timeout: 15_000 }).catch(() => undefined);
        const html = await page.content();
        const candidates = parseSearchResults(html, searchUrl);
        log.info(`Found ${candidates.length} product candidates`);

        const scored = candidates
            .map((c) => ({ ...c, matchScore: scoreCandidate(queryTokens, c) }))
            .sort((a, b) => b.matchScore - a.matchScore);

        const top = scored[0];
        if (top) {
            try {
                await page.goto(top.url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                dimensions = extractIkeaDimensions(await page.content());
                if (!top.imageUrl) {
                    const og = await page.locator('meta[property="og:image"]').first().getAttribute('content').catch(() => null);
                    if (og) top.imageUrl = og;
                }
            } catch {
                log.warning('Product details unavailable. Returning the match with missing measurements.');
            }
        }

        if (scored.length === 0) {
            debugHtml = html;
        } else {
            best = scored[0];
        }
    } finally {
        await browser.close();
    }

    if (!best) {
        if (debugHtml) {
            await Actor.setValue('debug-search-page.html', debugHtml, { contentType: 'text/html' });
        }
        throw new Error(`No IKEA products found for "${query}". Debug HTML saved to key-value store.`);
    }

    const result = best as Candidate & { matchScore: number };
    let imageRecordKey: string | null = null;

    if (result.imageUrl) {
        try {
            const imageUrl = new URL(result.imageUrl);
            if (imageUrl.protocol !== 'https:' || !['www.ikea.com', 'ikea.com'].includes(imageUrl.hostname)) throw new Error('Image host unavailable');
            const response = await fetch(imageUrl, { signal: AbortSignal.timeout(8_000), redirect: 'error' });
            if (response.ok) {
                const contentType = response.headers.get('content-type') ?? 'image/jpeg';
                const buffer = Buffer.from(await response.arrayBuffer());
                if (buffer.length > 10 * 1024 * 1024) throw new Error('Image too large');
                imageRecordKey = 'furniture-image';
                await Actor.setValue(imageRecordKey, buffer, { contentType });
            }
        } catch (err) {
            log.warning('Could not download product image. The image URL is retained.');
        }
    }

    const output = {
        query,
        name: result.name,
        price: result.price,
        url: result.url,
        imageUrl: result.imageUrl,
        matchScore: Number(result.matchScore.toFixed(2)),
        searchUrl,
        ...dimensions,
        dimensionUnit: 'in',
        dimensionSource: Object.values(dimensions).every(v => v !== null) ? 'product' : 'missing',
    };

    await Actor.pushData(output);
    await Actor.setValue('result', output);
    log.info(`Best match: ${output.name} (${output.url})`);
} finally {
    await Actor.exit();
}
