import { createHash } from 'node:crypto';
import { abortable, message, scope, VERSION } from './common.js';
import { addressParts } from './address.js';

export async function runJobs(config, services, storage, platformTimeout = Infinity) {
    const started = Date.now(), controller = new AbortController();
    const deadline = Math.min(started + config.runMs, platformTimeout - 10000);
    const timer = setTimeout(() => controller.abort(Error('Run work deadline reached')), Math.max(0, deadline - started));
    const rows = [], counts = {};
    let cursor = 0;
    async function processJob(job) {
        const startedAt = Date.now();
        const work = scope(controller.signal, config.listingMs, 'Property work deadline reached');
        const { signal } = work;
        const row = { inputAddress: job.address, listingUrl: job.listings[0]?.url ?? null, address: job.address,
            status: 'not_found', images: [], attempts: [], implementationVersion: VERSION, scrapedAt: new Date().toISOString() };
        const attempt = (value) => row.attempts.push({ ...value, elapsedMs: Date.now() - startedAt });
        const known = new Set(), blockedProviders = new Set();
        async function execute() {
            signal.throwIfAborted();
            if (job.error || (job.address && !addressParts(job.address))) { row.status = 'invalid_input'; row.reason = job.error ?? 'Use a full street address, city and state.'; return; }
            const queue = [...job.listings]; let searched = false;
            while (known.size < 6) {
                signal.throwIfAborted();
                if (!queue.length) {
                    if (searched || !job.address || !config.allowAddressSearch) break;
                    searched = true;
                    const budgetMs = Math.min(config.searchMs, Math.max(1, (deadline - Date.now()) * 0.25), Math.max(1, (startedAt + config.listingMs - Date.now()) * 0.25));
                    const search = scope(signal, budgetMs, 'Address discovery time budget reached');
                    try {
                        const found = await abortable(search.signal, () => services.discover(job.address, search.signal, row.attempts));
                        queue.push(...found);
                    } catch (error) {
                        signal.throwIfAborted();
                        attempt({ step: 'search-error', reason: message(error) });
                        if (!known.size && search.signal.aborted) row.status = 'timeout';
                    } finally { search.close(); }
                    if (!queue.length) break;
                }
                const listing = queue.shift(), key = listing.provider + ':' + listing.id;
                if (known.has(key) || !config.enabledSources.includes(listing.provider) || blockedProviders.has(listing.provider)) continue;
                known.add(key);
                row.listingUrl = listing.url;
                attempt({ step: 'listing-start', provider: listing.provider, url: listing.url });
                let result;
                const requestScope = scope(signal, Math.min(config.requestMs * 2 + config.domainGapMs, 35000), 'Listing retrieval time budget reached');
                try {
                    result = await abortable(requestScope.signal, () => services.fetchListing(listing, job.address, requestScope.signal, row.attempts));
                } catch (error) {
                    signal.throwIfAborted();
                    attempt({ step: 'listing-error', url: listing.url, reason: message(error) });
                    row.status = requestScope.signal.aborted ? 'timeout' : 'error'; row.reason = message(error);
                    continue;
                } finally { requestScope.close(); }
                attempt({ step: 'extraction', url: listing.url, status: result.status, imageCount: result.images.length, reason: result.reason });
                row.status = result.status;
                row.reason = result.reason;
                if (result.status === 'blocked') { blockedProviders.add(listing.provider); continue; }
                if (!result.images.length) continue;
                Object.assign(row, { status: 'found', provider: result.provider ?? listing.provider, propertyId: result.propertyId ?? listing.id,
                    listingUrl: result.listingUrl ?? listing.url, address: result.address ?? job.address,
                    addressVerified: result.addressVerified ?? false, galleryComplete: false });
                row.images = result.images.slice(0, config.maxImages).map((image, i) => ({ index: i + 1, ...image, downloadStatus: config.downloadImages ? 'pending' : 'not_requested' }));
                row.availableImageCount = result.images.length;
                row.truncated = result.images.length > config.maxImages;
                row.declaredImageCount = result.declaredImageCount ?? null;
                row.galleryComplete = !!result.declaredImageCount && !row.truncated && row.images.length >= result.declaredImageCount;
                if (!config.downloadImages) return;
                const bytesSeen = new Map();
                for (const image of row.images) {
                    signal.throwIfAborted();
                    try {
                        const download = await abortable(signal, () => services.downloadImage(image.url, row.listingUrl, signal));
                        signal.throwIfAborted();
                        if (download.body.length > config.maxImageBytes) throw Error('Image exceeds configured size limit.');
                        const hash = createHash('sha256').update(download.body).digest('hex');
                        let key = bytesSeen.get(hash);
                        if (!key) {
                            const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[download.contentType];
                            if (!ext) throw Error('Unsupported image content type.');
                            key = `${job.index}_${row.provider}_${row.propertyId}_${String(image.index).padStart(3, '0')}.${ext}`;
                            await abortable(signal, () => storage.save(key, download.body, download.contentType));
                            signal.throwIfAborted();
                            bytesSeen.set(hash, key);
                        }
                        Object.assign(image, { downloadStatus: 'saved', kvKey: key, contentType: download.contentType, bytes: download.body.length, sha256: hash });
                    } catch (error) {
                        signal.throwIfAborted();
                        image.downloadStatus = 'failed'; image.reason = message(error);
                    }
                }
                if (row.images.some((i) => i.downloadStatus !== 'saved')) { row.status = 'partial'; row.reason = 'Photo URLs found; some files could not be saved.'; }
                return;
            }
            row.reason ??= 'No matching listing gallery was accessible from the sources tried.';
        }
        try { await abortable(signal, execute); }
        catch (error) {
            row.status = signal.aborted ? row.images.length ? 'partial' : 'timeout' : 'error';
            row.reason = message(error);
        } finally { work.close(); }
        for (const image of row.images) if (image.downloadStatus === 'pending') image.downloadStatus = 'skipped_timeout';
        row.imageCount = row.images.length;
        row.savedImageCount = row.images.filter((i) => i.downloadStatus === 'saved').length;
        row.elapsedMs = Date.now() - startedAt;
        // Persist only here, once per target. Failed writes are not counted as successful output.
        await storage.write(row);
        rows.push(row);
        counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    async function worker() { while (cursor < config.jobs.length) await processJob(config.jobs[cursor++]); }
    try {
        if (!config.jobs.length) {
            const row = { status: 'invalid_input', reason: 'Provide listingUrls or addresses.', images: [], attempts: [], imageCount: 0, savedImageCount: 0, implementationVersion: VERSION };
            await storage.write(row);
            rows.push(row); counts.invalid_input = 1;
        }
        const results = await Promise.allSettled(Array.from({ length: Math.min(config.maxConcurrency, config.jobs.length) }, worker));
        const failed = results.find((r) => r.status === 'rejected');
        if (failed) throw failed.reason;
        return { implementationVersion: VERSION, runStatus: rows.some((r) => r.status === 'timeout' || r.status === 'partial') ? 'partial' : config.jobs.length ? 'completed' : 'invalid_input',
            requested: config.jobs.length, written: rows.length, counts, elapsedMs: Date.now() - started, truncatedInputs: config.truncatedInputs };
    } finally { clearTimeout(timer); controller.abort(Error('Run finished')); }
}
