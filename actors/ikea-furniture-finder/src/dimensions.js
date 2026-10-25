// Conservative extraction: only labeled product measurements, never size guesses,
// unlabeled triples, mattress sizes, or dimensions in package details.
const axes = ["width", "depth", "height"];
const unitFactors = { in:1, inch:1, inches:1, '"':1, cm:1/2.54, mm:1/25.4, m:100/2.54, ft:12 };
function amount(value) {
  if (typeof value === "number") return value;
  const s = String(value).trim();
  const m = s.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  return m ? Number(m[1] || 0) + Number(m[2])/Number(m[3]) : /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN;
}
function inches(value, unit) {
  const factor = unitFactors[String(unit).toLowerCase()];
  const n = amount(value)*factor;
  return Number.isFinite(n) && n >= .1 && n <= 600 ? Math.round(n*1000)/1000 : null;
}
function quantity(v) {
  if (!v) return null;
  if (typeof v === "object") {
    const unit = {INH:"in",CMT:"cm",MMT:"mm",MTR:"m",FOT:"ft"}[v.unitCode] || v.unitText;
    return unit ? inches(v.value,unit) : typeof v.value === "string" ? quantity(v.value) : null;
  }
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(inches|inch|in|cm|mm|ft|m|")$/i);
  return m ? inches(m[1],m[2]) : null;
}
export function extractIkeaDimensions(html) {
  if (typeof html !== "string" || html.length > 2000000) return {widthIn:null,depthIn:null,heightIn:null};
  const found = {widthIn:null,depthIn:null,heightIn:null};
  const products = [];
  function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if ([v['@type']].flat().includes('Product')) products.push(v);
      if (v['@graph']) walk(v['@graph']);
    }
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])); } catch {}
  }
  // The primary Product only: recommendations can carry unrelated dimensions.
  const product = products[0];
  if (product) for (const axis of axes) {
    let value = quantity(product[axis]);
    for (const prop of [product.additionalProperty || []].flat())
      if (String(prop?.name).trim().toLowerCase() === axis) value = quantity(prop) ?? value;
    found[axis+'In'] = value;
  }
  let text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&quot;|&#34;|[″“”]/g,'"')
    .replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ');
  const start = text.search(/\b(?:Measurements|Product dimensions)\b/i);
  // Product pages often place an earlier "Measurements" navigation link before
  // the body. Restrict to the final section before Package details where possible.
  const packaging = text.search(/\b(?:Package details|Packaging)\b/i);
  if (packaging >= 0) text = text.slice(0,packaging);
  if (start >= 0) text = text.slice(Math.min(start,text.length));
  // Require a product measurement section or known IKEA measurement markup.
  if (start >= 0 || /pip-product-dimensions__measurement/i.test(html)) {
    const re = /\b(Width|Depth|Height)\s*:\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(inches|inch|in\b|cm\b|mm\b|ft\b|m\b|")/gi;
    for (const m of text.matchAll(re)) {
      if (/\b(?:seat|backrest|armrest|mattress|bed|leg|package)\s*$/i.test(text.slice(Math.max(0,m.index-40),m.index))) continue;
      const key = m[1].toLowerCase()+'In';
      found[key] ??= inches(m[2],m[3]);
    }
  }
  return found;
}
