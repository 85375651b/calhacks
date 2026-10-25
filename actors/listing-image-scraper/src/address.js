const ALIASES = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', lane: 'ln', boulevard: 'blvd', court: 'ct', circle: 'cir', place: 'pl', terrace: 'ter', parkway: 'pkwy', north: 'n', south: 's', east: 'e', west: 'w', apartment: 'unit', apt: 'unit', suite: 'unit' };
const STATES = 'alabama:al|alaska:ak|arizona:az|arkansas:ar|california:ca|colorado:co|connecticut:ct|delaware:de|district of columbia:dc|florida:fl|georgia:ga|hawaii:hi|idaho:id|illinois:il|indiana:in|iowa:ia|kansas:ks|kentucky:ky|louisiana:la|maine:me|maryland:md|massachusetts:ma|michigan:mi|minnesota:mn|mississippi:ms|missouri:mo|montana:mt|nebraska:ne|nevada:nv|new hampshire:nh|new jersey:nj|new mexico:nm|new york:ny|north carolina:nc|north dakota:nd|ohio:oh|oklahoma:ok|oregon:or|pennsylvania:pa|rhode island:ri|south carolina:sc|south dakota:sd|tennessee:tn|texas:tx|utah:ut|vermont:vt|virginia:va|washington:wa|west virginia:wv|wisconsin:wi|wyoming:wy';
export function addressParts(value) {
    if (typeof value !== 'string') return null;
    let text = value.toLowerCase().replace(/\s+[|–—]\s+.*$/, '').replace(/\s+-\s+.*$/, '')
        .replace(/,?\s+(usa|united states)$/, '').replace(/#/g, ' unit ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const pair of STATES.split('|').sort((a, b) => b.length - a.length)) {
        const [name, code] = pair.split(':');
        text = text.replace(new RegExp('\\b' + name + '\\b', 'g'), code);
    }
    text = text.split(' ').map((part) => ALIASES[part] ?? part).join(' ');
    const zip = /\s+(\d{5})(?:-\d{4})?$/.exec(text)?.[1] ?? '';
    if (zip) text = text.replace(/\s+\d{5}(?:-\d{4})?$/, '');
    const state = text.split(' ').at(-1);
    if (!/^\d+[a-z]?(?:-\d+)?\s/.test(text) || !STATES.split('|').some((r) => r.endsWith(':' + state)) || text.split(' ').length < 5) return null;
    return { text, zip };
}
export function matchesAddress(expected, actual) {
    const a = addressParts(expected), b = addressParts(actual);
    return !!a && !!b && a.text === b.text && (!a.zip || !b.zip || a.zip === b.zip);
}
export function objectAddress(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const a = obj.address ?? obj.streetAddress;
    if (typeof a === 'string' && addressParts(a)) return a;
    const v = a && typeof a === 'object' ? a : obj;
    const street = v.streetAddress ?? v.addressLine ?? v.streetAddressLine;
    const city = v.addressLocality ?? v.city;
    const state = v.addressRegion ?? v.state ?? v.stateCode;
    if (typeof street === 'string' && typeof city === 'string' && typeof state === 'string') return `${street}, ${city}, ${state} ${v.postalCode ?? v.zipcode ?? v.zip ?? ''}`.trim();
    return null;
}
