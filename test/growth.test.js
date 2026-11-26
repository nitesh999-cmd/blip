'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { growthAt, plantShape } = require('../renderer/growth');

const at = (hours, minutes = 0) => new Date(2026, 10, 25, hours, minutes);

test('growth starts at 6 am and is complete at 6 pm', () => {
  assert.equal(growthAt(at(6)), 0);
  assert.equal(growthAt(at(12)), 0.5);
  assert.equal(growthAt(at(18)), 1);
});

test('the plant stays in bloom through the evening', () => {
  assert.equal(growthAt(at(21, 30)), 1);
  assert.equal(growthAt(at(23, 59)), 1);
});

test('after midnight and before 6 am it is a fresh shoot again', () => {
  assert.equal(growthAt(at(0, 1)), 0);
  assert.equal(growthAt(at(5, 59)), 0);
});

test('a fresh shoot has a short stem and nothing else', () => {
  assert.deepEqual(plantShape(0), { stem: 6, lowerLeaves: 0, upperLeaves: 0, bud: 0, bloom: 0 });
});

test('full bloom has every part at full size', () => {
  assert.deepEqual(plantShape(1), { stem: 46, lowerLeaves: 1, upperLeaves: 1, bud: 1, bloom: 1 });
});

test('parts appear in order as the day goes on', () => {
  const morning = plantShape(growthAt(at(8)));
  const midday = plantShape(growthAt(at(12)));
  const afternoon = plantShape(growthAt(at(15)));
  const evening = plantShape(growthAt(at(17)));
  assert.ok(morning.lowerLeaves > 0 && morning.upperLeaves === 0);
  assert.ok(midday.upperLeaves > 0 && midday.bud === 0);
  assert.ok(afternoon.bud > 0 && afternoon.bloom === 0);
  assert.ok(evening.bloom > 0);
  assert.ok(morning.stem < midday.stem && midday.stem < afternoon.stem);
});

test('out-of-range growth values are clamped', () => {
  assert.deepEqual(plantShape(-1), plantShape(0));
  assert.deepEqual(plantShape(5), plantShape(1));
});
