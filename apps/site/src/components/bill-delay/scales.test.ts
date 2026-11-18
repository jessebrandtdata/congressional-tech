import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandScale, cardNumber, dateTicks, dayName, fmt, fmtShort, isoDay, linearScale, ruleLabels, stepArea, stepPath, tickStep,
} from './scales.ts';

test('tickStep picks 1, 2 or 5 times a power of ten', () => {
  assert.equal(tickStep(10, 5), 2);
  assert.equal(tickStep(1234, 6), 500);
  assert.equal(tickStep(0.9, 4), 0.5);
  assert.equal(tickStep(0, 5), 1);
});

test('linearScale rounds the top up to a whole tick and maps zero to the range start', () => {
  const y = linearScale(1234, [300, 0], 6);
  assert.equal(y.top, 1500);
  assert.deepEqual(y.ticks, [0, 500, 1000, 1500]);
  assert.equal(y(0), 300);
  assert.equal(y(1500), 0);
  assert.equal(y(750), 150);
});

test('linearScale over a share keeps 0 to 1 exactly', () => {
  const y = linearScale(1, [100, 0], 4, false);
  assert.equal(y.top, 1);
  assert.deepEqual(y.ticks, [0, 0.5, 1]);
});

test('bandScale spaces equal bands with padding at both ends', () => {
  const x = bandScale(['a', 'b'], [0, 210], 0.1);
  assert.equal(Math.round(x.step), 100);
  assert.equal(Math.round(x.bandwidth), 90);
  assert.equal(Math.round(x('a')), 10);
  assert.equal(Math.round(x('b')), 110);
  assert.equal(Math.round(x('b') + x.bandwidth + x.step * x.padding), 210);
});

test('date ticks: every second month over a Congress, years over a longer span', () => {
  const short = dateTicks('2025-01-03', '2025-08-20').map((t) => t.label);
  assert.deepEqual(short, ['Mar 2025', 'May 2025', 'Jul 2025']);
  const long = dateTicks('2003-01-07', '2026-11-08').map((t) => t.label);
  assert.equal(long[0], '2004');
  assert.ok(long.length <= 12);
  assert.ok(long.every((l, i) => i === 0 || Number(l) - Number(long[i - 1]) === 3));
});

test('day arithmetic and labels are in UTC', () => {
  assert.equal(isoDay('1970-01-02'), 1);
  assert.equal(isoDay('2025-01-31') - isoDay('2025-01-01'), 30);
  assert.equal(dayName('2025-03-09'), '9 Mar 2025');
});

test('number formats', () => {
  assert.equal(fmt(1234567.4), '1,234,567');
  assert.equal(fmt(null), '–');
  assert.equal(fmtShort(164_700_000), '165M');
  assert.equal(cardNumber(9_999_999), '9,999,999');
  assert.equal(cardNumber(1_460_000_000), '1.46B');
});

test('step paths run flat to the next point, and the area closes on the lower line', () => {
  assert.equal(stepPath([[0, 10], [5, 6], [9, 2]]), 'M0,10H5V6H9V2');
  assert.equal(stepPath([]), '');
  assert.equal(stepArea([0, 5], [6, 2], [10, 8]), 'M0,6H5V2V8H5V10H0Z');
});

test('ruleLabels labels each line on its own side when both fit', () => {
  // median left of its line, mean right of its line: the two cannot cross however close the lines are
  assert.deepEqual(ruleLabels([[392, 'median 116d'], [529, 'mean 178d']], 56, 904), [
    { x: 388, text: 'median 116d', anchor: 'end' },
    { x: 533, text: 'mean 178d', anchor: 'start' },
  ]);
  assert.deepEqual(ruleLabels([[500, 'median 29d'], [514, 'mean 51d']], 56, 904), [
    { x: 496, text: 'median 29d', anchor: 'end' },
    { x: 518, text: 'mean 51d', anchor: 'start' },
  ]);
});

test('ruleLabels joins the labels when the left one would cross the y-axis or the right one the plot edge', () => {
  assert.deepEqual(ruleLabels([[104, 'mean 51d'], [90, 'median 29d']], 56, 904), [{ x: 108, text: 'median 29d, mean 51d', anchor: 'start' }]);
  assert.deepEqual(ruleLabels([[860, 'median 900d'], [890, 'mean 950d']], 56, 904), [{ x: 856, text: 'median 900d, mean 950d', anchor: 'end' }]);
});

test('ruleLabels puts a lone line\'s label left of it unless the y-axis is in the way', () => {
  assert.deepEqual(ruleLabels([[600, 'median 300d']], 56, 904), [{ x: 596, text: 'median 300d', anchor: 'end' }]);
  assert.deepEqual(ruleLabels([[70, 'median 3d']], 56, 904), [{ x: 74, text: 'median 3d', anchor: 'start' }]);
});
