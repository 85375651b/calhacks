# IKEA furniture finder

Describe a furniture item to find a candidate IKEA product. The Actor returns
its name, displayed price, product page, image URL, and available product
measurements. It does not generate 3D models.

```json
{"description":"small grey two-seat sofa","country":"us","language":"en"}
```

`description` is required, with a maximum of 500 characters. Country and language
default to `us` and `en`. The search uses keyword overlap, so the result must be
confirmed by the user. `matchScore` is a ranking score, not a probability or
confidence percentage.

Each dataset row and the `result` key-value record contain `query`, `name`,
`price`, `url`, `imageUrl`, `matchScore`, `searchUrl`, `widthIn`, `depthIn`,
`heightIn`, `dimensionUnit: "in"`, and `dimensionSource: "product" | "missing"`.
Missing measurements are null. The parser reads explicit product measurements
from structured data or English measurement labels, supports metric units and
fractional inches, and excludes packaging and seat-specific dimensions. Other
languages can still find products but may require manual measurements.

The image is saved as `furniture-image` when available. A failed search can save
`debug-search-page.html`. Aborting persists `state` and closes the browser.
The Actor searches one IKEA results page and inspects the selected product.
It may return missing measurements if product details are blocked.

This local revision is prepared for review. Deploy only after confirmation per
AGENTS.md. The website also enriches the existing deployed Actor's output, so its
integration does not depend on publishing this revision first.
