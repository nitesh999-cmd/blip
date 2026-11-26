'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../src/logic');

test('cleanLines strips numbering, bullets, quotes, preambles and long lines', () => {
  const text = [
    'Here are four lines:',
    '1. You are doing great.',
    '- "Small steps still count."',
    '• Keep going!',
    'You are doing great.',
    'This line is far far far far far far far far far far far far far far far far far far far far too long',
    '',
  ].join('\n');
  assert.deepEqual(logic.cleanLines(text), ['You are doing great.', 'Small steps still count.', 'Keep going!']);
});

test('partOfDay buckets the hour', () => {
  assert.equal(logic.partOfDay(new Date(2026, 10, 25, 9)), 'morning');
  assert.equal(logic.partOfDay(new Date(2026, 10, 25, 15)), 'afternoon');
  assert.equal(logic.partOfDay(new Date(2026, 10, 25, 19)), 'evening');
  assert.equal(logic.partOfDay(new Date(2026, 10, 25, 2)), 'late at night');
});
