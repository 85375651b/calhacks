/** Overall product dimensions, normalized to inches. Missing axes stay null. */
export interface ProductSize {
    width: number | null;
    length: number | null;
    height: number | null;
    unit: 'in';
    widthIn: number | null;
    depthIn: number | null;
    heightIn: number | null;
    size: string | null;
    dimensions: string[];
}

export function parseMeasurementText(raw: string): ProductSize {
    const fractions: Record<string, string> = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅓': '1/3', '⅔': '2/3' };
    let text = raw.replace(/[¼½¾⅛⅜⅝⅞⅓⅔]/g, (fraction) => ` ${fractions[fraction]}`)
        .replace(/[″“”]/g, '"').replace(/\u2044/g, '/').replace(/\s+/g, ' ').trim();
    // Packaging uses the same Width/Height/Length labels as the furniture.
    text = text.split(/Packaging|Package details/i)[0]!;
    const heading = Math.max(text.toLowerCase().lastIndexOf('measurements'), text.toLowerCase().lastIndexOf('product dimensions'));
    if (heading >= 0) text = text.slice(heading).replace(/^(?:Measurements|Product dimensions)\s*/i, '');
    const values = new Map<string, number>();
    // Capture the WHOLE label so "Seat width" cannot become "Width".
    const pattern = /([a-z][a-z -]*?)\s*:?\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(inches\b|inch\b|in\b|cm\b|mm\b|ft\b|m\b|")/gi;
    for (const match of text.matchAll(pattern)) {
        const label = match[1]!.trim().toLowerCase();
        if (!['width', 'depth', 'length', 'height', 'height including back cushions', 'height including cushions'].includes(label)) continue;
        const amount = match[2]!.replace(',', '.').trim();
        const fraction = amount.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
        const number = fraction ? Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3]) : Number(amount);
        const unit = match[3]!.toLowerCase();
        const factor = unit === 'cm' ? 1 / 2.54 : unit === 'mm' ? 1 / 25.4 : unit === 'm' ? 100 / 2.54 : unit === 'ft' ? 12 : 1;
        const inches = Math.round(number * factor * 1000) / 1000;
        if (Number.isFinite(inches) && inches > 0 && !values.has(label)) values.set(label, inches);
    }
    const width = values.get('width') ?? null;
    // IKEA uses Depth for a sofa's front-to-back length, Length for beds/tables.
    const length = values.get('length') ?? values.get('depth') ?? null;
    const height = values.get('height') ?? values.get('height including back cushions') ?? values.get('height including cushions') ?? null;
    const dimensions = [width === null ? null : `Width: ${width} in`, length === null ? null : `Length: ${length} in`, height === null ? null : `Height: ${height} in`].filter((s): s is string => s !== null);
    return {
        width, length, height, unit: 'in',
        widthIn: width, depthIn: values.get('depth') ?? length, heightIn: height,
        size: width !== null && length !== null && height !== null ? `${width} × ${length} × ${height} in` : null,
        dimensions,
    };
}
