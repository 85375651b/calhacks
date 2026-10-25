import {
  defaults,
  validateCriteria,
  NUMBERS,
  FLAGS,
  ENUMS,
} from "./criteria.js";

export const EXAMPLES = [
  "4 bed los angeles",
  "sf condo under 1m",
  "austin tx 3/2 with pool",
  "condo in Seattle under 700k",
  "1600 Pennsylvania Ave NW",
];
export const normalizeText = (text) => normalizeWithOffsets(text).normalized;
export function validPlace(p) {
  return (
    p &&
    typeof p.label === "string" &&
    p.label.length <= 200 &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lng) <= 180
  );
}
export function partialCriteria(c) {
  const allowed = new Set([
    ...Object.keys(defaults),
    ...Object.keys(NUMBERS),
    ...FLAGS,
    ...Object.keys(ENUMS),
    "views",
    "keywords",
    "searchUrl",
  ]);
  if (
    !c ||
    typeof c !== "object" ||
    Array.isArray(c) ||
    Object.keys(c).some((k) => !allowed.has(k))
  )
    throw new Error("Invalid or unknown search field");
  const clean = validateCriteria({
    ...c,
    location: c.location || "__pending__",
  });
  if (!c.location) clean.location = "";
  return clean;
}
const labels = {
  location: "Location",
  minBeds: "Min beds",
  maxBeds: "Max beds",
  minBaths: "Min baths",
  maxBaths: "Max baths",
  minPrice: "Min price",
  maxPrice: "Max price",
  homeTypes: "Home type",
  maxHoa: "Max monthly HOA",
};
export function interpretationFor(criteria, extras) {
  const result = Object.entries(criteria)
    .filter(
      ([k, v]) =>
        !["limit", "sources", "exactBeds"].includes(k) &&
        !(k === "status" && v === "sale") &&
        v !== "" &&
        v != null &&
        (!Array.isArray(v) || v.length),
    )
    .map(([key, v]) => ({
      key,
      label: labels[key] || key.replace(/([A-Z])/g, " $1"),
      value: /Price|^maxHoa$/.test(key)
        ? "$" + Number(v).toLocaleString("en-US")
        : /^min(Beds|Baths)$/.test(key) &&
            criteria[key.replace("min", "max")] == null &&
            !(key === "minBeds" && criteria.exactBeds)
          ? `${v}+`
          : Array.isArray(v)
            ? v.join(", ")
            : v === true
              ? "Yes"
              : String(v),
    }));
  if (extras.commute)
    result.push({
      key: "commute",
      label: "Driving commute",
      value: `Under ${extras.commute.maxMinutes} min to ${extras.commute.work?.label || extras.commute.workText || "your work"} · depart ${extras.commute.departAt}`,
    });
  if (extras.radius)
    result.push({
      key: "radius",
      label: "Radius",
      value: `${extras.radius.miles} miles from ${extras.radius.center?.label || extras.radius.centerText}`,
    });
  if (extras.insights.length)
    result.push({
      key: "insights",
      label: "Insights",
      value: extras.insights.join(", "),
    });
  if (extras.sort)
    result.push({ key: "sort", label: "Sort", value: extras.sort });
  return result;
}
// Vocabulary is shared by extraction and conservative spelling correction.
export const vocabulary = {
  types: {
    "single family": "house",
    "single-family": "house",
    sfh: "house",
    sfr: "house",
    house: "house",
    houses: "house",
    condominium: "condo",
    condo: "condo",
    "co-op": "condo",
    townhouse: "townhome",
    townhome: "townhome",
    duplex: "multi-family",
    triplex: "multi-family",
    fourplex: "multi-family",
    "multi-family": "multi-family",
    multifamily: "multi-family",
    apartment: "apartment",
    manufactured: "manufactured",
    "mobile home": "manufactured",
    land: "land",
    lot: "land",
  },
  features: {
    pool: ["pool", true],
    garage: ["garage", true],
    waterfront: ["waterfront", true],
    basement: ["basement", "has"],
    "central air": ["ac", true],
    "a/c": ["ac", true],
    "single story": ["stories", "single"],
    "single storey": ["stories", "single"],
    fireplace: ["fireplace", true],
    "open house": ["openHouse", true],
    "new construction": ["newConstruction", true],
    "price drop": ["priceReduced", true],
    "price drops": ["priceReduced", true],
    reduced: ["priceReduced", true],
  },
  insights: {
    "safe neighborhood": "crime",
    "low crime": "crime",
    safety: "crime",
    safe: "crime",
    quiet: "crime",
    "quiet street": "crime",
    "good schools": "schools",
    "near grocery stores": "groceries",
    "close to grocery stores": "groceries",
    "grocery stores": "groceries",
    "near grocery": "groceries",
    walkable: "groceries",
    "low flood risk": "hazards",
    "short commute": "commute",
  },
  keywords: [
    "updated kitchen",
    "fixer upper",
    "modern",
    "adu",
    "backyard",
    "view",
  ],
};
const numberWords = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const spellings = [
  ...new Set(
    [
      ...Object.keys(vocabulary.types),
      ...Object.keys(vocabulary.features),
      ...Object.keys(vocabulary.insights),
      ...vocabulary.keywords,
      "bedrooms",
      "bedroom",
      "bathrooms",
      "bathroom",
      "construction",
      "waterfront",
      "square",
      "feet",
      "acres",
      "garage",
      "basement",
      "million",
      "thousand",
    ].flatMap((s) => s.split(/[ -]/)),
  ),
];
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] !== b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}
export function normalizeWithOffsets(text) {
  let normalized = "",
    offsets = [];
  for (let i = 0; i < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(i)),
      end = i + char.length;
    const replacement = char
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[–—−]/g, "-")
      .replace(/≤/g, "<=")
      .replace(/≥/g, ">=")
      .replace(/≈/g, "~");
    for (const c of replacement) {
      if (/\s/.test(c) && (!normalized || normalized.endsWith(" "))) continue;
      normalized += /\s/.test(c) ? " " : c;
      offsets.push({ start: i, end });
    }
    i = end;
  }
  return { normalized: normalized.trimEnd(), offsets };
}
const escapeRE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alternatives = (values) =>
  values
    .sort((a, b) => b.length - a.length)
    .map(escapeRE)
    .join("|");
export function parseRules(text, savedWork) {
  const source = normalizeWithOffsets(text),
    assumptions = [],
    understood = [],
    notApplied = [],
    questions = [];
  let work = "",
    offsets = [];
  // Correct vocabulary only; place names are left for the place resolver.
  const words = /[a-z]+/g;
  let last = 0;
  for (const m of source.normalized.matchAll(words)) {
    work += source.normalized.slice(last, m.index);
    offsets.push(...source.offsets.slice(last, m.index));
    let corrected = m[0];
    if (m[0] in numberWords) corrected = String(numberWords[m[0]]);
    else if (m[0].length >= 5 && !spellings.includes(m[0])) {
      const limit = m[0].length > 7 ? 2 : 1;
      const hits = spellings
        .filter((v) => Math.abs(v.length - m[0].length) <= limit)
        .map((v) => ({ v, d: editDistance(m[0], v) }))
        .filter((v) => v.d <= limit)
        .sort((a, b) => a.d - b.d);
      if (hits.length && (!hits[1] || hits[0].d < hits[1].d))
        corrected = hits[0].v;
      if (corrected !== m[0])
        assumptions.push(`Read '${m[0]}' as '${corrected}'.`);
    }
    work += corrected;
    offsets.push(
      ...Array.from(corrected, () => ({
        start: source.offsets[m.index].start,
        end: source.offsets[m.index + m[0].length - 1].end,
      })),
    );
    last = m.index + m[0].length;
  }
  work += source.normalized.slice(last);
  offsets.push(...source.offsets.slice(last));
  let mask = work;
  const criteria = { ...defaults, homeTypes: [], views: [] },
    extras = { commute: null, radius: null, insights: [], sort: null };
  const span = (start, end, kind, value) => {
    const a = offsets[start]?.start ?? 0,
      b = offsets[end - 1]?.end ?? text.length;
    const s = {
      start: a,
      end: b,
      text: text.slice(a, b),
      kind,
      confidence: 1,
      ...(value === undefined ? {} : { value }),
    };
    understood.push(s);
    return s;
  };
  const take = (re, kind, fn = () => {}) => {
    for (const m of [...mask.matchAll(re)]) {
      fn(m);
      span(m.index, m.index + m[0].length, kind);
      mask =
        mask.slice(0, m.index) +
        " ".repeat(m[0].length) +
        mask.slice(m.index + m[0].length);
    }
  };
  take(
    /\b(?:ignore (?:all |previous )?instructions|system prompt|set (?:max|min) price|api[_ ]?key|execute|override)[^;.!]*/g,
    "instruction",
    (m) =>
      notApplied.push({
        text: m[0],
        reason: "Instructions are not housing search criteria.",
      }),
  );
  take(
    /\b(?:no|without)\s+(?:pool|garage|basement|fireplace|waterfront|central air)\b/g,
    "unsupported",
    (m) =>
      notApplied.push({
        text: m[0],
        reason:
          "Excluding this feature is not supported; no positive feature filter was applied.",
      }),
  );
  let departAt = "08:00",
    workText = "",
    minutes;
  take(
    /\b(leave at|depart at|arrive by)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g,
    "departure",
    (m) => {
      let h = +m[2];
      if (m[4] === "pm" && h < 12) h += 12;
      if (m[4] === "am" && h === 12) h = 0;
      if (h < 24 && +(m[3] || 0) < 60)
        departAt = `${String(h).padStart(2, "0")}:${m[3] || "00"}`;
      else
        notApplied.push({ text: m[0], reason: "Use a valid departure time." });
      if (m[1] === "arrive by")
        assumptions.push(
          "Arrival time treated as departure time; arrival planning is not supported.",
        );
    },
  );
  const endPlace =
    "(?=\\s{2,}|\\s+(?:with|under|below|at least|exactly|within|leave|arrive|and a|\\d+\\s*(?:bed|bath))\\b|$)";
  take(
    new RegExp(
      "(?:<|under\\s+|less than\\s+)?(\\d+)\\s*(?:minute|min)s?\\s+(?:(?:driving|transit|bike|walk)\\s+)?(?:commute|drive)(?:\\s+to)?(?:\\s+(?:my )?work(?:\\s+at)?)?\\s*(.*?)" +
        endPlace,
      "g",
    ),
    "commute",
    (m) => {
      minutes = +m[1];
      workText = m[2].replace(/^[,\s]+|[,\s]+$/g, "");
    },
  );
  take(
    new RegExp(
      "commute\\s+(?:under|<)\\s*(\\d+)\\s*(?:minute|min)s?(?:\\s+to\\s+(.*?))?" +
        endPlace,
      "g",
    ),
    "commute",
    (m) => {
      minutes = +m[1];
      workText = m[2] || workText;
    },
  );
  take(
    new RegExp("(?:my )?work at\\s+(.*?)" + endPlace, "g"),
    "commute",
    (m) => {
      workText = m[1];
    },
  );
  if (minutes == null && workText)
    take(/(?:under|<)\s*(\d+)\s*(?:minute|min)s?\b/g, "commute", (m) => {
      minutes = +m[1];
    });
  if (minutes != null) {
    if (/\b(transit|bike|walk|walking|cycling)\b/i.test(text))
      assumptions.push(
        "Commute estimates use driving, not transit, biking or walking.",
      );
    workText = workText.replace(/^(?:my )?work(?: at)?\s*/, "").trim();
    extras.commute = {
      maxMinutes: Math.min(180, Math.max(1, minutes)),
      workText,
      work:
        !workText && validPlace(savedWork)
          ? { label: savedWork.label, lat: savedWork.lat, lng: savedWork.lng }
          : null,
      departAt,
    };
    extras.insights.push("commute");
    if (!workText && !extras.commute.work)
      questions.push({
        field: "work",
        message: "What is your work address?",
        options: [],
      });
  } else if (workText)
    notApplied.push({
      text: "work at " + workText,
      reason: "Add a commute limit in minutes to filter by driving time.",
    });
  take(
    new RegExp(
      "within\\s+(\\d+(?:\\.\\d+)?)\\s+miles?\\s+of\\s+(.*?)" + endPlace,
      "g",
    ),
    "radius",
    (m) => {
      extras.radius = {
        miles: Math.min(200, Math.max(0.1, +m[1])),
        centerText: m[2].trim(),
        center: null,
      };
    },
  );
  take(
    /\b(?:coming soon|recently sold|sold|pending|under contract|contingent)\b/g,
    "status",
    (m) =>
      notApplied.push({
        text: m[0],
        reason: "PropertyLens only shows homes currently for sale.",
      }),
  );
  for (const [phrase, module] of Object.entries(vocabulary.insights).sort(
    (a, b) => b[0].length - a[0].length,
  ))
    take(new RegExp("\\b" + escapeRE(phrase) + "\\b", "g"), "insight", () =>
      extras.insights.push(module),
    );
  take(/\b(cheapest|newest|biggest)(?: first)?\b/g, "sort", (m) => {
    extras.sort = { cheapest: "price-asc", newest: "newest", biggest: "sqft" }[
      m[1]
    ];
  });
  // Scope-specific numerals are consumed before general prices and ZIPs.
  const numeric = "\\d[\\d,]*(?:\\.\\d+)?";
  const moneyPattern =
    "\\$?" + numeric + "(?:\\s*(?:million|mil|m|thousand|k))?(?:\\s+dollars?)?";
  const amount = (s, implicitThousands = false) => {
    const n = Number(
      s
        .replace(/[$,\s]/g, "")
        .replace(/(?:million|mil|m|thousand|k|dollars?)/g, ""),
    );
    const unit = /million|mil|m\b/.test(s)
      ? 1e6
      : /thousand|k\b/.test(s)
        ? 1000
        : 1;
    if (implicitThousands && unit === 1 && n > 0 && n < 1000) {
      assumptions.push(`Read '${s.trim()}' as ${n} thousand dollars.`);
      return n * 1000;
    }
    return n * unit;
  };
  take(/\b(?:no|without) hoa\b/g, "hoa", () => {
    criteria.noHoa = true;
  });
  take(
    new RegExp("\\bhoa\\s+(?:under|below|max)\\s*(" + moneyPattern + ")", "g"),
    "hoa",
    (m) => {
      criteria.maxHoa = amount(m[1]);
    },
  );
  take(/\b(\d+)\s*[- ]?car garage\b/g, "parking", (m) => {
    criteria.minParking = +m[1];
    criteria.garage = true;
  });
  take(/\b(?:listed in the )?last\s+(\d+)\s+days\b/g, "freshness", (m) => {
    criteria.daysOnMarket = +m[1];
  });
  take(/\b(?:new listings?|just listed)\b/g, "freshness", () => {
    criteria.daysOnMarket = 7;
    assumptions.push("New listings means listed in the last 7 days.");
  });
  take(
    /\b(built after|newer than|built before|older than)\s+(\d{4})\b/g,
    "year",
    (m) => {
      criteria[/after|newer/.test(m[1]) ? "minYearBuilt" : "maxYearBuilt"] =
        +m[2];
    },
  );
  take(
    new RegExp(
      "\\b(?:(at least|min|under|below|max)\\s+)?(" +
        numeric +
        ")\\s*(k)?\\+?\\s*(sqft|sq ft|square feet|sf|sqm|square meters)(?:\\s+(lot))?\\b",
      "g",
    ),
    "area",
    (m) => {
      const value =
        amount(m[2]) *
        (m[3] ? 1000 : 1) *
        (/sqm|meters/.test(m[4]) ? 10.7639 : 1);
      criteria[
        (/under|below|max/.test(m[1]) ? "max" : "min") +
          (m[5] ? "LotSize" : "Sqft")
      ] = value;
      if (/sqm|meters/.test(m[4]))
        assumptions.push("Square meters converted to square feet.");
    },
  );
  take(
    /\b(?:(at least|under|below|max)\s+)?(quarter|half|\d+\/\d+|\d+(?:\.\d+)?)\s*acres?(?: lot)?\b/g,
    "lot",
    (m) => {
      const n = m[2],
        acres =
          n === "quarter"
            ? 0.25
            : n === "half"
              ? 0.5
              : n.includes("/")
                ? +n.split("/")[0] / +n.split("/")[1]
                : +n;
      if (Number.isFinite(acres))
        criteria[/under|below|max/.test(m[1]) ? "maxLotSize" : "minLotSize"] =
          acres * 43560;
    },
  );
  const bedValue = (n, max, qualifier, field) => {
    criteria["min" + field] = +n;
    if (max != null) criteria["max" + field] = +max;
    else if (/exactly|only/.test(qualifier)) {
      criteria["max" + field] = +n;
      if (field === "Beds") criteria.exactBeds = true;
    } else if (!qualifier)
      assumptions.push(
        `${n} ${field.toLowerCase()} treated as ${n} or more; say 'exactly ${n} ${field.toLowerCase()}' for an exact match.`,
      );
  };
  take(/\bstudio\b/g, "beds", () => {
    criteria.minBeds = 0;
    criteria.maxBeds = 0;
    criteria.exactBeds = true;
  });
  take(
    /\b(\d{1,2})\s*(?:bd|br)?\s*\/\s*(\d{1,2}(?:\.\d+)?)\s*(?:ba)?\b/g,
    "beds-baths",
    (m) => {
      bedValue(m[1], null, "", "Beds");
      bedValue(m[2], null, "", "Baths");
    },
  );
  take(
    /\b(?:(exactly|only|at least|min(?:imum)?)\s+)?(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(?:\+|or more)?\s*-?\s*(bedrooms?|beds?|bdrms?|bd|br|bathrooms?|baths?|ba)\b/g,
    "beds-baths",
    (m) =>
      bedValue(m[2], m[3], m[1], /bath|^ba$/.test(m[4]) ? "Baths" : "Beds"),
  );
  take(
    new RegExp(
      "(?:\\bbetween\\s+)?(" +
        moneyPattern +
        ")\\s*(?:-|to|and)\\s*(" +
        moneyPattern +
        ")",
      "g",
    ),
    "price",
    (m) => {
      const suffix = m[2].match(/million|mil|m\b|thousand|k\b/)?.[0];
      const a = amount(
          m[1] +
            (!/million|mil|m\b|thousand|k\b/.test(m[1]) && suffix
              ? suffix
              : ""),
          true,
        ),
        b = amount(m[2], true);
      criteria.minPrice = a;
      criteria.maxPrice = b;
    },
  );
  take(
    new RegExp(
      "(?:<=?|>=?|~|\\b(?:under|below|max(?:imum)?|up to|no more than|budget|over|above|min(?:imum)?|around))\\s*(" +
        moneyPattern +
        ")",
      "g",
    ),
    "price",
    (m) => {
      const value = amount(m[1], true);
      if (/^(?:around|~)/.test(m[0])) {
        criteria.minPrice = Math.round(value * 0.9);
        criteria.maxPrice = Math.round(value * 1.1);
        assumptions.push(
          `"around ${m[1]}" treated as $${criteria.minPrice.toLocaleString("en-US")} to $${criteria.maxPrice.toLocaleString("en-US")} (plus or minus 10%).`,
        );
      } else
        criteria[/^(?:>|over|above|min)/.test(m[0]) ? "minPrice" : "maxPrice"] =
          value;
    },
  );
  take(
    new RegExp(
      "\\$" +
        numeric +
        "(?:\\s*(?:million|mil|m|thousand|k))?(?:\\s+dollars?)?",
      "g",
    ),
    "price",
    (m) => {
      criteria.maxPrice = amount(m[0]);
    },
  );
  take(
    new RegExp(
      "\\b" + numeric + "\\s*(?:million|mil|m|thousand|k)\\b(?:\\s+dollars?)?",
      "g",
    ),
    "price",
    (m) => {
      criteria.maxPrice = amount(m[0]);
    },
  );
  for (const [phrase, [key, value]] of Object.entries(vocabulary.features).sort(
    (a, b) => b[0].length - a[0].length,
  ))
    take(new RegExp("\\b" + escapeRE(phrase) + "\\b", "g"), "feature", () => {
      criteria[key] = value;
    });
  take(/\b(ocean|water|mountain|park|city) view\b/g, "view", (m) =>
    criteria.views.push(m[1] === "ocean" ? "water" : m[1]),
  );
  take(
    new RegExp(
      "\\b(" + alternatives(Object.keys(vocabulary.types)) + ")\\b",
      "g",
    ),
    "home-type",
    (m) => criteria.homeTypes.push(vocabulary.types[m[1]]),
  );
  take(
    new RegExp("\\b(" + alternatives([...vocabulary.keywords]) + ")\\b", "g"),
    "keyword",
    (m) => {
      criteria.keywords = [criteria.keywords, m[0]].filter(Boolean).join(", ");
    },
  );
  // Record fillers as understood too, so every non-whitespace input token has an outcome.
  take(
    /\b(?:show me|looking for|i want|for sale|find|show|a|an|the|with|and|or|in|near|around|close to|by|at|for|please|me|want|looking|i|home|homes|properties|property|place|family|to|my|listings?|of)\b/g,
    "filler",
  );
  const remaining = [...mask.matchAll(/[a-z0-9$][a-z0-9$.'-]*/g)],
    leftover = [];
  for (const m of remaining) {
    const prev = leftover.at(-1);
    if (prev && !/[^\s,]/.test(work.slice(prev.workEnd, m.index))) {
      prev.workEnd = m.index + m[0].length;
    } else
      leftover.push({ workStart: m.index, workEnd: m.index + m[0].length });
  }
  const runs = leftover.map((r) => {
    const start = offsets[r.workStart].start,
      end = offsets[r.workEnd - 1].end;
    return {
      text: text.slice(start, end),
      start,
      end,
      relation: /(?:near|by|close to|around|at)\s*$/i.test(
        work.slice(0, r.workStart),
      )
        ? "near"
        : "in",
    };
  });
  const zip = runs.find((r) => /^\d{5}$/.test(r.text));
  // Pure rules expose raw place text for compatibility; the service validates it before searching.
  if (zip) criteria.location = zip.text;
  else if (runs.length === 1)
    criteria.location = runs[0].text.toLowerCase().trim();
  if (/^los\s+angeles(?:,?\s+ca)?$/i.test(criteria.location))
    criteria.location = "Los Angeles, CA";
  if (!criteria.location)
    questions.push({
      field: "location",
      message: "Where should I search?",
      options: [],
    });
  for (const key of Object.keys(NUMBERS).filter((k) => k.startsWith("min"))) {
    const max = key.replace(/^min/, "max");
    if (criteria[max] != null && criteria[key] > criteria[max]) {
      notApplied.push({
        text: `${criteria[key]}–${criteria[max]}`,
        reason: "Minimum exceeds maximum; edit these limits in filters.",
      });
      delete criteria[key];
      delete criteria[max];
    }
  }
  extras.insights = [
    "crime",
    "schools",
    "groceries",
    "hazards",
    "commute",
  ].filter((v) => extras.insights.includes(v));
  criteria.homeTypes = [...new Set(criteria.homeTypes)];
  criteria.views = [...new Set(criteria.views)];
  if (extras.insights.length)
    assumptions.push(
      "Insights like schools and safety are shown when you open a home, not used to filter results. Explicit commute and radius limits are checked separately.",
    );
  const clean = partialCriteria(criteria);
  return {
    parser: "rules",
    criteria: clean,
    extras,
    interpretation: interpretationFor(clean, extras),
    assumptions: [...new Set(assumptions)],
    notApplied,
    questions,
    understood: understood.sort((a, b) => a.start - b.start),
    leftover: runs,
    unrecognized: runs.map((r) => ({
      text: r.text,
      suggestions: ["Choose a place", "Edit in filters"],
    })),
    tokens: [...text.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)].map((m) => ({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      kind:
        understood.find(
          (s) => s.start <= m.index && s.end >= m.index + m[0].length,
        )?.kind || "leftover",
    })),
  };
}
