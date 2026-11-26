'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PRIORITY, emptyQueue, pushBubble, finishBubble } = require('../renderer/bubble-queue');

const chatter = (id) => ({ id, priority: PRIORITY.chatter });
const email = (id) => ({ id, priority: PRIORITY.email });
const meeting = (id) => ({ id, priority: PRIORITY.meeting });

test('first bubble shows straight away', () => {
  const { state, show } = pushBubble(emptyQueue(), chatter('a'));
  assert.equal(show.id, 'a');
  assert.equal(state.current.id, 'a');
});

test('new chatter replaces old chatter (thinking dots -> real line)', () => {
  const first = pushBubble(emptyQueue(), chatter('thinking'));
  const { state, show } = pushBubble(first.state, chatter('line'));
  assert.equal(show.id, 'line');
  assert.deepEqual(state.waiting, []);
});

test('a meeting interrupts an email, and the email comes back afterwards', () => {
  const one = pushBubble(emptyQueue(), email('mail'));
  const two = pushBubble(one.state, meeting('meet'));
  assert.equal(two.show.id, 'meet');
  const three = finishBubble(two.state);
  assert.equal(three.show.id, 'mail');
});

test('chatter never interrupts an alert and is dropped', () => {
  const one = pushBubble(emptyQueue(), meeting('meet'));
  const two = pushBubble(one.state, chatter('joke'));
  assert.equal(two.show, null);
  assert.equal(finishBubble(two.state).show, null);
});

test('an email arriving during a meeting bubble waits its turn', () => {
  const one = pushBubble(emptyQueue(), meeting('meet'));
  const two = pushBubble(one.state, email('mail'));
  assert.equal(two.show, null);
  assert.equal(finishBubble(two.state).show.id, 'mail');
});

test('waiting bubbles come out highest priority first', () => {
  let { state } = pushBubble(emptyQueue(), meeting('m1'));
  ({ state } = pushBubble(state, email('e1')));
  ({ state } = pushBubble(state, meeting('m2')));
  const next = finishBubble(state);
  assert.equal(next.show.id, 'm2');
  assert.equal(finishBubble(next.state).show.id, 'e1');
});

test('pushBubble does not mutate the previous state', () => {
  const start = emptyQueue();
  pushBubble(start, chatter('a'));
  assert.deepEqual(start, { current: null, waiting: [] });
});
