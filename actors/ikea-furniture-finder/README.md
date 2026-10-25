# IKEA furniture finder

Describe a furniture item to find the best matching IKEA product and its image.

## Input

```json
{"description":"small grey two seat sofa","country":"us","language":"en"}
```

A nonempty description is required. Country and language default to us and en.
Search ranking uses keyword overlap; matchScore is a ranking score, not a probability.

## Output

Each dataset row and the result key-value record contain query, name, price,
url, imageUrl, matchScore, searchUrl, and these product measurements:

```json
{"width":57.875,"length":31.125,"height":30.375,"unit":"in",
 "widthIn":57.875,"depthIn":31.125,"heightIn":30.375,
 "size":"57.875 × 31.125 × 30.375 in",
 "dimensions":["Width: 57.875 in","Length: 31.125 in","Height: 30.375 in"]}
```

width, length, and height are separate numeric measurements in inches. IKEA's
Length label is used where available; otherwise length uses Depth (front to back
for a sofa). depthIn uses Depth when present, otherwise Length. widthIn, depthIn,
and heightIn are compatibility fields for the room planner. Metric values are
converted to inches, rounded to three decimal places. Fractions are supported.

Only overall product measurements are returned. Packaging, armrest, seat, and
under-furniture measurements are excluded. Height including back cushions is used
when there is no overall Height label. Each missing axis stays null; size is null
unless all three axes are found. dimensions contains only available clean labels.
English IKEA measurement labels are supported; unavailable or blocked measurements
remain null. Price can be empty. This Actor does not generate 3D models.

The image is saved as furniture-image when available. A failed search can save
debug-search-page.html. An abort exits promptly. The original remote version 0.0
is preserved as a fallback; this revision targets version 0.1.

## Parser regression tests

With Node.js 24 or later: node --test test/product-size.test.mjs
