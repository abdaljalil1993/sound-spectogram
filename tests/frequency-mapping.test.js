const test = require('node:test');
const assert = require('node:assert/strict');

const { getFrequencyBinDirection, mapRawRowToScreen, mapScreenYToRawRow } = require('../src/public/js/frequency-mapping.js');

test('ascending bins map low frequencies to the bottom and high frequencies to the top', () => {
  const bins = [100, 120, 140, 160];

  assert.equal(getFrequencyBinDirection(bins), 'ascending');
  assert.equal(mapRawRowToScreen(0, bins, bins.length), 3);
  assert.equal(mapRawRowToScreen(3, bins, bins.length), 0);
  assert.equal(mapScreenYToRawRow(0, bins, bins.length), 3);
  assert.equal(mapScreenYToRawRow(3, bins, bins.length), 0);
});

test('descending bins keep the original vertical order', () => {
  const bins = [160, 140, 120, 100];

  assert.equal(getFrequencyBinDirection(bins), 'descending');
  assert.equal(mapRawRowToScreen(0, bins, bins.length), 0);
  assert.equal(mapRawRowToScreen(3, bins, bins.length), 3);
  assert.equal(mapScreenYToRawRow(0, bins, bins.length), 0);
  assert.equal(mapScreenYToRawRow(3, bins, bins.length), 3);
});
