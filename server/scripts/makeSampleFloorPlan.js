// Our own synthetic artwork, generated locally; no downloaded floor plan content.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
<rect width="1200" height="900" fill="white"/><g fill="none" stroke="#273c32" stroke-width="10">
<path d="M60 60 H1140 V840 H60 Z M620 60 V590 M60 590 H1140 M620 320 H1140 M830 590 V840"/>
</g><g font-family="Arial,sans-serif" text-anchor="middle" fill="#273c32">
<text x="340" y="280" font-size="34">LIVING 14' x 18'</text><text x="880" y="175" font-size="28">BEDROOM</text><text x="880" y="220" font-size="24">12' x 14'</text>
<text x="880" y="450" font-size="28">KITCHEN</text><text x="440" y="720" font-size="28">DINING</text><text x="980" y="720" font-size="28">BATH</text>
<text x="600" y="880" font-size="18">SYNTHETIC SAMPLE FLOOR PLAN · PropertyLens</text></g>
<g stroke="#6ca0ac" stroke-width="13"><path d="M180 60H460 M760 60H1000 M1140 370V500"/></g>
<g stroke="white" stroke-width="15"><path d="M590 590H680 M620 210V280 M830 660V730"/></g></svg>`;
await sharp(Buffer.from(svg))
  .png()
  .toFile(
    fileURLToPath(new URL("../fixtures/sample-floorplan.png", import.meta.url)),
  );
console.log("Generated synthetic sample-floorplan.png");
