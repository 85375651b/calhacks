import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMeasurementText } from '../src/product-size.ts';

test('SALTMYRAN: excludes armrest, seat, under-furniture and packaging dimensions', () => {
    const size = parseMeasurementText('MeasurementsArmrest height18 1/2 "Armrest width4 3/4 "Depth31 1/8 "Height under furniture5 1/2 "Backrest height26 "Height including back cushions30 3/8 "Seat depth20 1/2 "Seat height16 7/8 "Seat width46 1/2 "Width57 7/8 "Packaging1 × SALTMYRANLoveseat806.185.31Width: 25 ¼ "Height: 12 ¼ "Length: 58 ¾ "Weight: 83 lb 2 oz');
    assert.deepEqual([size.width, size.length, size.height, size.unit], [57.875, 31.125, 30.375, 'in']);
    assert.equal(size.size, '57.875 × 31.125 × 30.375 in');
    assert.deepEqual(size.dimensions, ['Width: 57.875 in', 'Length: 31.125 in', 'Height: 30.375 in']);
    assert.deepEqual([size.widthIn, size.depthIn, size.heightIn], [57.875, 31.125, 30.375]);
});

test('unicode fractions and quote variants', () => {
    const size = parseMeasurementText('Width: 57⅞ ″ Length: 31 ⅛ ” Height: 30⅜ "');
    assert.deepEqual([size.width, size.length, size.height], [57.875, 31.125, 30.375]);
});

test('metric measurements normalize to inches, including decimal comma', () => {
    const size = parseMeasurementText('Measurements Width: 127 cm Depth: 63,5 cm Height: 0.762 m');
    assert.deepEqual([size.width, size.length, size.height], [50, 25, 30]);
});

test('overall Height wins over cushion height regardless of order', () => {
    assert.equal(parseMeasurementText('Height including back cushions30 "Height28 "').height, 28);
});

test('missing overall dimensions stay null instead of using component or package sizes', () => {
    const size = parseMeasurementText('MeasurementsSeat width40 "Seat height18 "Armrest height25 "Height under furniture5 "PackagingWidth: 60 "Length: 40 "Height: 30 "');
    assert.deepEqual([size.width, size.length, size.height, size.size], [null, null, null, null]);
});

test('partial and unitless measurements are not invented', () => {
    const size = parseMeasurementText('Measurements Width80 cm Height40 Packaging Length: 30 in');
    assert.equal(size.width, 31.496);
    assert.equal(size.height, null);
    assert.equal(size.length, null);
    assert.equal(size.size, null);
});

test('invalid fraction is discarded', () => {
    assert.equal(parseMeasurementText('Width 1/0 in').width, null);
});
