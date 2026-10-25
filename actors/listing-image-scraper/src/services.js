import { gotScraping } from 'got-scraping';
import { PlaywrightCrawler } from '@crawlee/playwright';
import { RequestList } from '@crawlee/core';
import { abortable, blockedPage, createPacer, imageUrl, listingIdentity, message, pause } from './common.js';
import { extractListing } from './extract.js';

export function createServices(actor, config, proxyConfiguration) {
    const pace = createPacer(), blocked = new Map(), cache = new Map();
    const proxy = async () => (await proxyConfiguration?.newUrl()) || undefined;
    async function read(url, signal, kind, referer) {
        const allowed = kind === 'image' ? (u) => !!imageUrl(u) : (u) => !!listingIdentity(u);
        for (let redirect = 0; redirect < 4; redirect++) {
            signal.throwIfAborted();
            if (!allowed(url)) throw Error('Redirect or asset URL is outside the allowed listing/photo hosts.');
            const host = new URL(url).hostname;
            if (blocked.has(host)) return { status: 429, body: Buffer.alloc(0), url, headers: {}, reason: blocked.get(host) };
            await pace(host, kind === 'image' ? 150 : config.domainGapMs, signal);
            const stream = gotScraping.stream(url, {
                proxyUrl: await proxy(), signal, followRedirect: false, throwHttpErrors: false,
                retry: { limit: 0 }, timeout: { request: config.requestMs },
                headers: referer ? { referer } : undefined,
            });
            let response;
            stream.on('response', (r) => { response = r; });
            const chunks = []; let bytes = 0;
            try {
                for await (const chunk of stream) {
                    bytes += chunk.length;
                    if (bytes > (kind === 'image' ? config.maxImageBytes : 8 * 1024 * 1024)) throw Error('Response exceeds the configured size limit.');
                    chunks.push(chunk);
                }
            } finally { stream.destroy(); }
            if (!response) throw Error('No HTTP response received.');
            const status = response.statusCode, headers = response.headers;
            if ([301, 302, 303, 307, 308].includes(status) && headers.location) { url = new URL(headers.location, url).href; continue; }
            if ([401, 403, 429].includes(status)) blocked.set(host, 'HTTP ' + status + (headers['retry-after'] ? '; Retry-After: ' + headers['retry-after'] : ''));
            return { status, headers, body: Buffer.concat(chunks), url };
        }
        throw Error('Too many redirects.');
    }
    async function render(url, signal, attempts) {
        const json = [], pending = [];
        let pageResult;
        const requestList = await RequestList.open(null, [url]);
        const crawler = new PlaywrightCrawler({
            requestList, proxyConfiguration, maxConcurrency: 1, maxRequestsPerCrawl: 1,
            maxRequestRetries: 0, maxSessionRotations: 0, useSessionPool: false, retryOnBlocked: false,
            navigationTimeoutSecs: config.requestMs / 1000, requestHandlerTimeoutSecs: config.requestMs / 1000,
            preNavigationHooks: [async ({ page }, options) => {
                options.waitUntil = 'domcontentloaded';
                await page.route('**/*', (route) => ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
                page.on('response', (response) => {
                    if (pending.length >= 12 || response.status() !== 200 || !/gdp|stingray|photos|graphql|aboveTheFold|initialInfo/i.test(response.url())) return;
                    if (!/json/i.test(response.headers()['content-type'] ?? '') || Number(response.headers()['content-length'] ?? 0) > 2 * 1024 * 1024) return;
                    pending.push(response.text().then((text) => { if (text.length < 2 * 1024 * 1024) json.push(JSON.parse(text)); }).catch(() => {}));
                });
            }],
            async requestHandler({ page, response }) {
                signal.throwIfAborted();
                let html = await page.content();
                const status = response?.status() ?? 200;
                if (!blockedPage(html, status)) {
                    const button = page.getByRole('button', { name: /^(see all photos|view all photos|see all \d+ photos|view \d+ photos)$/i }).first();
                    if (await button.count()) await button.click({ timeout: 1500 }).catch(() => {});
                    await pause(500, signal);
                    await Promise.allSettled(pending);
                    html = await page.content();
                }
                signal.throwIfAborted();
                pageResult = { html, status, url: page.url(), networkJson: json };
            },
            async failedRequestHandler({ request }) {
                const detail = request.errorMessages.join('; ').slice(0, 350);
                pageResult = { html: '', status: /403|429|blocked|captcha/i.test(detail) ? 403 : 0, url, reason: detail, networkJson: [] };
            },
        });
        const teardown = () => { void crawler.teardown().catch(() => {}); };
        signal.addEventListener('abort', teardown, { once: true });
        try {
            attempts.push({ step: 'browser-start', url });
            await abortable(signal, () => crawler.run());
            return pageResult ?? { html: '', status: 0, url, networkJson: [], reason: 'Browser returned no page.' };
        } finally { signal.removeEventListener('abort', teardown); teardown(); }
    }
    return {
        async fetchListing(listing, address, signal, attempts) {
            const cacheKey = listing.provider + ':' + listing.id;
            if (cache.has(cacheKey)) {
                const item = cache.get(cacheKey);
                attempts.push({ step: 'cache-hit', url: listing.url });
                return extractListing({ ...item, expectedAddress: address });
            }
            const host = new URL(listing.url).hostname;
            if (blocked.has(host)) return { status: 'blocked', reason: blocked.get(host), images: [] };
            let page;
            try {
                attempts.push({ step: 'http-start', url: listing.url });
                const response = await read(listing.url, signal, 'html');
                page = { html: response.body.toString('utf8'), status: response.status, url: response.url, networkJson: [] };
                attempts.push({ step: 'http', url: listing.url, status: page.status });
                if (blockedPage(page.html, page.status)) {
                    blocked.set(host, 'HTTP ' + page.status + ' / access challenge');
                    return { status: 'blocked', reason: blocked.get(host), images: [] };
                }
                if (page.status >= 200 && page.status < 300) {
                    const final = listingIdentity(page.url);
                    if (!final || final.provider !== listing.provider || final.id !== listing.id)
                        return { status: 'address_mismatch', reason: 'HTTP redirect changed the requested property ID.', images: [] };
                    const result = extractListing({ ...page, expectedAddress: address });
                    if (result.status === 'address_mismatch' || result.images.length) { if (result.images.length) cache.set(cacheKey, page); return result; }
                }
            } catch (error) { signal.throwIfAborted(); attempts.push({ step: 'http-error', url: listing.url, reason: message(error) }); }
            if (!config.useBrowserFallback) return { status: 'not_found', reason: 'No photos in the HTTP page; browser fallback disabled.', images: [] };
            await pace(host, config.domainGapMs, signal);
            page = await render(listing.url, signal, attempts);
            attempts.push({ step: 'browser', url: listing.url, status: page.status });
            if (blockedPage(page.html, page.status)) { blocked.set(host, 'Browser access challenge'); return { status: 'blocked', reason: 'Browser access challenge', images: [] }; }
            if (!page.status || page.status >= 400) return { status: 'error', reason: page.reason ?? 'Browser request failed.', images: [] };
            const final = listingIdentity(page.url);
            if (!final || final.provider !== listing.provider || final.id !== listing.id)
                return { status: 'address_mismatch', reason: 'Browser redirect changed the requested property ID.', images: [] };
            const result = extractListing({ ...page, expectedAddress: address });
            if (result.images.length) cache.set(cacheKey, page);
            return result;
        },
        async downloadImage(url, referer, signal) {
            const response = await read(url, signal, 'image', referer);
            if (response.status !== 200) throw Error('Image HTTP ' + response.status + (response.headers['retry-after'] ? '; Retry-After: ' + response.headers['retry-after'] : ''));
            const type = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
            const b = response.body;
            const valid = type === 'image/jpeg' ? b[0] === 0xff && b[1] === 0xd8
                : type === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                    : type === 'image/webp' ? b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
                        : type === 'image/avif' ? b.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(b.toString('ascii', 8, 24)) : false;
            if (!valid) throw Error('Response is not a supported JPEG, PNG, WebP or AVIF image.');
            return { body: b, contentType: type };
        },
        async discover(address, signal, attempts) {
            let runId;
            const stop = () => { if (runId) void actor.apifyClient.run(runId).abort().catch(() => {}); };
            signal.addEventListener('abort', stop, { once: true });
            try {
                attempts.push({ step: 'search-start', address });
                const query = '"' + address.replace(/["\r\n]/g, ' ') + '" (site:zillow.com/homedetails/ OR site:redfin.com)';
                const starting = actor.start('apify/google-search-scraper', { queries: query, maxPagesPerQuery: 1 }, { timeout: Math.ceil(config.searchMs / 1000) });
                void starting.then((run) => { if (signal.aborted) void actor.apifyClient.run(run.id).abort().catch(() => {}); }, () => {});
                const run = await abortable(signal, () => starting);
                runId = run.id;
                while (true) {
                    const data = await abortable(signal, () => actor.apifyClient.dataset(run.defaultDatasetId).listItems({ limit: 3 }));
                    const listings = data.items.flatMap((item) => item.organicResults ?? []).map((item) => listingIdentity(item.url)).filter(Boolean);
                    if (listings.length) { attempts.push({ step: 'search-results', count: listings.length }); return listings; }
                    const state = await abortable(signal, () => actor.apifyClient.run(run.id).get());
                    if (state && ['FAILED', 'SUCCEEDED', 'ABORTED', 'TIMED-OUT'].includes(state.status)) {
                        const last = await abortable(signal, () => actor.apifyClient.dataset(run.defaultDatasetId).listItems({ limit: 3 }));
                        return last.items.flatMap((item) => item.organicResults ?? []).map((item) => listingIdentity(item.url)).filter(Boolean);
                    }
                    await pause(500, signal);
                }
            } finally { signal.removeEventListener('abort', stop); stop(); }
        },
    };
}
