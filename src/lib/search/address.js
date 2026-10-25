const expansions = {st:'street',ave:'avenue',ln:'lane',rd:'road',dr:'drive',blvd:'boulevard',ct:'court',cir:'circle',pkwy:'parkway',hwy:'highway',trl:'trail',pl:'place',ter:'terrace',n:'north',s:'south',e:'east',w:'west',ne:'northeast',nw:'northwest',se:'southeast',sw:'southwest'};
export function splitAddress(value='') {
  const clean=String(value).trim().replace(/\s+/g,' ');
  const match=clean.match(/(?:\b(?:apartment|apt|unit|suite|ste)\.?\s*|#\s*)([a-z0-9-]+)/i);
  return {base:(match?clean.replace(match[0],''):clean).replace(/\s+,/g,',').trim(),unit:match?.[1]?.toLowerCase()||''};
}
export function normalizeAddress(value='') {
  return String(value).toLowerCase().replace(/[.,]/g,' ').replace(/[^a-z0-9\s-]/g,' ').replace(/\b[a-z]+\b/g,s=>expansions[s]||s).replace(/\s+/g,' ').trim();
}
export function addressParts(p) {
  const {base,unit}=splitAddress(p.line1||p.street||p.address||'');
  return {street:normalizeAddress(base.split(',')[0]),unit,zip:String(p.zip||p.zipCode||'').slice(0,5)};
}
export function exactAddress(candidate, listing) {
  const a=addressParts(candidate),b=addressParts(listing);
  return Boolean(a.street && a.zip && a.street===b.street && a.zip===b.zip && (!a.unit||a.unit===b.unit));
}
export const addressLabel=p=>[p.line1||p.street,[p.city,p.state].filter(Boolean).join(', ')+(p.zip?' '+p.zip:'')].filter(Boolean).join(', ');
export const validBias=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
