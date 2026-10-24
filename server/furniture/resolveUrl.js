import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import https from "node:https";
import {
  parseDimensions,
  toInches,
  resolveName,
} from "../../src/lib/planner/catalog.js";
const block = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
])
  block.addSubnet(ip, prefix, "ipv4");
export function publicIp(address) {
  const family = isIP(address);
  if (family === 4) return !block.check(address, "ipv4");
  if (family === 6)
    return (
      /^[23][\da-f]{3}:/i.test(address) &&
      !/^2001:(?:0*:|db8:|[12][0-9a-f]:)/i.test(address) &&
      !/^2002:/i.test(address)
    );
  return false;
}
export function safeUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw Object.assign(new Error("Enter a valid HTTPS product URL."), {
      code: "invalid_url",
    });
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    u.hostname.endsWith(".") ||
    u.href.length > 2000
  )
    throw Object.assign(
      new Error("Only public HTTPS URLs with default ports are supported."),
      { code: "invalid_url" },
    );
  u.hash = "";
  return u;
}
export async function validateUrl(value, dns = lookup) {
  const u = safeUrl(value),
    host = u.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try {
    addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await dns(host, { all: true, verbatim: true });
  } catch {
    throw Object.assign(new Error("The product host could not be resolved."), {
      code: "blocked",
    });
  }
  if (!addresses.length || addresses.some((a) => !publicIp(a.address)))
    throw Object.assign(new Error("Private and local addresses are blocked."), {
      code: "blocked",
      unsafe: true,
    });
  return { url: u, address: addresses[0] };
}
export async function fetchPage(
  value,
  { dns = lookup, request = https.request } = {},
) {
  const deadline = Date.now() + 10000;
  let current = value;
  for (let hop = 0; hop <= 5; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw Object.assign(new Error("Product page timed out."), {
        code: "timeout",
      });
    let timer;
    const { url, address } = await Promise.race([
      validateUrl(current, dns),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(new Error("Product host timed out."), {
                code: "timeout",
              }),
            ),
          remaining,
        );
      }),
    ]).finally(() => clearTimeout(timer));
    const result = await new Promise((resolve, reject) => {
      // Pin the validated address, preventing DNS rebinding between check and fetch.
      const req = request(
        url,
        {
          headers: { Accept: "text/html", "User-Agent": "PropertyLens/1.0" },
          lookup: (_host, options, cb) =>
            options.all
              ? cb(null, [address])
              : cb(null, address.address, address.family),
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            res.resume();
            return resolve({ redirect: res.headers.location });
          }
          if (
            res.statusCode !== 200 ||
            !/^text\/html(?:;|$)/i.test(res.headers["content-type"] || "")
          ) {
            res.resume();
            return reject(
              Object.assign(new Error("Product page is unavailable."), {
                code: "blocked",
              }),
            );
          }
          let bytes = 0;
          const chunks = [];
          res.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > 2 * 1024 * 1024) {
              req.destroy(
                Object.assign(new Error("Product page is too large."), {
                  code: "blocked",
                }),
              );
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({
              html: Buffer.concat(chunks).toString("utf8"),
              url: url.href,
            }),
          );
          res.on("error", reject);
        },
      );
      const t = setTimeout(
        () =>
          req.destroy(
            Object.assign(new Error("Product page timed out."), {
              code: "timeout",
            }),
          ),
        Math.max(1, deadline - Date.now()),
      );
      req.on("close", () => clearTimeout(t));
      req.on("error", reject);
      req.end();
    });
    if (result.html != null) return result;
    if (!result.redirect || hop === 5)
      throw Object.assign(new Error("Too many product redirects."), {
        code: "blocked",
      });
    current = new URL(result.redirect, current).href;
  }
}
const strip = (s) =>
  String(s)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
function quantity(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const m = value.match(/([\d.]+)\s*(inches|in|cm|mm|ft)?/i);
    return m ? toInches(m[1], m[2] || "in") : null;
  }
  const unit =
    { INH: "in", CMT: "cm", MMT: "mm", FOT: "ft" }[value.unitCode] ||
    value.unitText ||
    "in";
  return toInches(value.value, unit);
}
export function extractProduct(html, url) {
  const products = [];
  function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if ([v["@type"]].flat().includes("Product")) products.push(v);
      if (v["@graph"]) walk(v["@graph"]);
    }
  }
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ))
    try {
      walk(JSON.parse(m[1]));
    } catch {}
  const product = products[0] || {},
    meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const a of m[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))
      attrs[a[1].toLowerCase()] = a[2];
    meta[attrs.property || attrs.name] = attrs.content;
  }
  const name = strip(
      product.name ||
        meta["og:title"] ||
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
        "Product",
    ),
    base = resolveName(name),
    dimensions = {};
  for (const key of ["width", "depth", "height"]) {
    let v = quantity(product[key]);
    for (const p of [product.additionalProperty || []].flat())
      if (String(p.name).toLowerCase() === key) v = quantity(p);
    if (Number.isFinite(v) && v > 0 && v < 600) dimensions[key + "In"] = v;
  }
  const plain = strip(html),
    snippets = (
      plain.match(/.{0,80}(?:dimensions|overall|\d\s*[x×]\s*\d).{0,200}/gi) ||
      []
    )
      .slice(0, 15)
      .join("\n"),
    parsed = parseDimensions(snippets),
    complete = dimensions.widthIn && dimensions.depthIn && dimensions.heightIn,
    image = [product.image].flat()[0];
  return {
    ...base,
    ...parsed,
    ...dimensions,
    name: name.slice(0, 160),
    imageUrl:
      typeof image === "string"
        ? image
        : image?.url || meta["og:image"] || null,
    sourceUrl: url,
    source: complete ? "json-ld" : "heuristic",
    estimated: !complete,
    confidence: complete ? 0.9 : parsed ? 0.7 : 0.2,
    notes: complete
      ? "Read from product structured data. Verify dimensions on the retailer site."
      : parsed
        ? "Read from dimension text; verify axis order and units."
        : "No complete dimensions found. Typical sizes are prefilled for correction.",
    bundle: JSON.stringify({ title: name, product, snippets }).slice(0, 6000),
  };
}
