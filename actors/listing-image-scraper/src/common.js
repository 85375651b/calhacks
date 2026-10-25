export const VERSION = 'listing-images-0.1.0';
export const message = (error) => (error instanceof Error ? error.message : String(error)).slice(0, 350);
export function listingIdentity(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        const host = url.hostname.toLowerCase();
        const provider = /^(www\.)?zillow\.com$/.test(host) ? 'zillow' : /^(www\.)?redfin\.com$/.test(host) ? 'redfin' : null;
        const id = provider === 'zillow' ? /\/homedetails\/[^/]+\/(\d+)_zpid\/?$/.exec(url.pathname)?.[1]
            : provider === 'redfin' ? /\/home\/(\d+)\/?$/.exec(url.pathname)?.[1] : null;
        if (!id) return null;
        url.hash = ''; url.search = '';
        return { provider, id, url: url.href };
    } catch { return null; }
}
export function imageUrl(value, base) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value.replace(/&amp;/g, '&'), base);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        const zillow = url.hostname === 'photos.zillowstatic.com';
        const redfin = (url.hostname === 'ssl.cdn-redfin.com' || url.hostname.endsWith('.cdn-redfin.com')) && url.pathname.includes('/photo/');
        if (!zillow && !redfin) return null;
        if (/logo|avatar|agent|map|staticmap|streetview/i.test(url.pathname)) return null;
        url.hash = '';
        return url.href;
    } catch { return null; }
}
export function canonicalPhoto(url) {
    const u = new URL(url);
    const hash = /\/fp\/([a-f\d]{12,})-/i.exec(u.pathname)?.[1];
    if (hash) return 'zillow:' + hash;
    return u.hostname + u.pathname.replace(/\/(bigphoto|mbphoto|genMid|genBcs|islphotov2)\//i, '/size/');
}
export function blockedPage(html = '', status = 200) {
    return [401, 403, 429].includes(status) || /<title[^>]*>[^<]*(captcha|access denied|just a moment|robot|verify.*human)/i.test(html)
        || /(?:id|class)=["'][^"']*(?:cf-chl-|g-recaptcha|h-captcha)/i.test(html);
}
export function abortable(signal, fn) {
    if (signal.aborted) return Promise.reject(signal.reason);
    let abort;
    const interrupted = new Promise((_, reject) => { abort = () => reject(signal.reason ?? Error('Timeout')); signal.addEventListener('abort', abort, { once: true }); });
    return Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return fn(); }), interrupted])
        .finally(() => signal.removeEventListener('abort', abort));
}
export function scope(parent, ms, reason) {
    const controller = new AbortController();
    const forward = () => controller.abort(parent.reason);
    parent.addEventListener('abort', forward, { once: true });
    if (parent.aborted) forward();
    const timer = setTimeout(() => controller.abort(Error(reason)), Math.max(0, ms));
    return { signal: controller.signal, close() { clearTimeout(timer); parent.removeEventListener('abort', forward); } };
}
export function pause(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(signal.reason); return; }
        const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
        const timer = setTimeout(finish, Math.max(0, ms));
        const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
    });
}
export function createPacer() {
    const next = new Map();
    return async (host, gapMs, signal) => {
        const slot = Math.max(Date.now(), next.get(host) ?? 0);
        next.set(host, slot + gapMs);
        await pause(slot - Date.now(), signal);
    };
}
