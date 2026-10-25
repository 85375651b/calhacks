import { Actor, log } from 'apify';
import { normalizeInput } from './input.js';
import { createServices } from './services.js';
import { runJobs } from './runner.js';
import { message, VERSION } from './common.js';

await Actor.init();
let exitCode = 0;
try {
    const config = normalizeInput(await Actor.getInput());
    const env = Actor.getEnv();
    const platformTimeout = env.timeoutAt instanceof Date ? env.timeoutAt.getTime() : Infinity;
    const store = await Actor.openKeyValueStore();
    log.info('Listing image scraper configuration', { implementationVersion: VERSION, targets: config.jobs.length,
        maxConcurrency: config.maxConcurrency, downloadImages: config.downloadImages, minDomainDelaySecs: config.domainGapMs / 1000,
        maxRunSecs: config.runMs / 1000, buildNumber: env.actorBuildNumber });
    let proxyConfiguration;
    try { if (config.jobs.length) proxyConfiguration = await Actor.createProxyConfiguration(config.proxyConfiguration); }
    catch (error) {
        for (const job of config.jobs) await Actor.pushData({ inputAddress: job.address, listingUrl: job.listings[0]?.url,
            status: 'error', reason: 'Proxy configuration failed: ' + message(error), images: [], attempts: [], implementationVersion: VERSION });
        throw Error('Proxy configuration failed. Check the selected proxy groups and account access.');
    }
    const summary = await runJobs(config, createServices(Actor, config, proxyConfiguration), {
        save: (key, body, type) => store.setValue(key, body, { contentType: type }),
        write: (row) => Actor.pushData({ ...row, kvStoreId: store.id }),
    }, platformTimeout);
    await Actor.setValue('OUTPUT', { ...summary, kvStoreId: store.id, scrapedAt: new Date().toISOString() });
} catch (error) {
    exitCode = 1;
    log.error(message(error));
    await Actor.setValue('OUTPUT', { implementationVersion: VERSION, runStatus: 'error', reason: message(error), scrapedAt: new Date().toISOString() });
} finally { await Actor.exit({ exitCode, timeoutSecs: 5 }); }
