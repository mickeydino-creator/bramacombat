import test from 'node:test';
import assert from 'node:assert/strict';
import { NetController, InputDelay } from '../../src/net/NetController.js';
import { sanitizeInput, normalizeCode, isValidCode, sanitizeName } from '../../shared/protocol.js';

const msg = (n, extra = {}) => ({ sid: 'a', n, m: 0, j: 0, b: 0, a: [], ...extra });

test('NetController: a tap is handed to the fighter exactly once, duplicates and old messages are ignored', () => {
  const c = new NetController(1);
  assert.equal(c.receive(msg(1, { a: ['punch'] })), true);
  assert.equal(c.receive(msg(1, { a: ['punch'] })), false); // same counter again (duplicated packet)
  assert.equal(c.receive(msg(0, { a: ['kick'] })), false); // older than the last one
  assert.deepEqual(c.getInput().actions, ['punch']);
  assert.deepEqual(c.getInput().actions, []); // consumed
  assert.equal(c.receive(msg(2, { a: ['kick', 'strong'] })), true);
  assert.deepEqual(c.getInput().actions, ['kick', 'strong']);
});

test('NetController: held buttons are a state, a tiny jump tap still jumps, a reloaded page resets the counter', () => {
  const c = new NetController(2);
  c.receive(msg(5, { m: -1, b: 1 }));
  assert.deepEqual({ ...c.getInput(), actions: 0 }, { move: -1, jump: false, block: true, actions: 0 });
  c.receive(msg(6, { m: 1, j: 1 })); c.receive(msg(7, { m: 1, j: 0 })); // pressed and released between two game steps
  assert.equal(c.getInput().jump, true);
  assert.equal(c.getInput().jump, false);
  c.receive({ ...msg(1, { m: 0 }), sid: 'reloaded' }); // new page load -> counter starts again
  assert.equal(c.lastN, 1);
});

test('NetController: a dropped player stands still; reset() keeps held buttons but forgets pending taps', () => {
  const c = new NetController(1);
  c.receive(msg(1, { m: 1, a: ['punch'] }));
  c.reset();
  assert.deepEqual(c.getInput(), { move: 1, jump: false, block: false, actions: [] });
  c.neutralize();
  assert.deepEqual(c.getInput(), { move: 0, jump: false, block: false, actions: [] });
});

test('InputDelay: delays by N frames and never loses a tap, even when the delay shrinks', () => {
  const d = new InputDelay();
  d.setDelay(3);
  const frame = (actions = []) => d.push({ move: 0, jump: false, block: false, actions });
  const out = [frame(['punch']), frame(), frame(), frame(['kick'])];
  assert.deepEqual(out.map((o) => o.actions), [[], [], [], ['punch']]);
  d.setDelay(0);
  const merged = frame(['strong']);
  assert.deepEqual(merged.actions.sort(), ['kick', 'strong']); // the queued kick is merged, not dropped
});

test('protocol helpers', () => {
  assert.equal(normalizeCode(' ab-c1 xyz '), 'ABC1');
  assert.equal(isValidCode('ABCD'), true);
  assert.equal(isValidCode('AB0D'), false); // no look-alike 0
  assert.equal(sanitizeName('<b>Bob</b>', 'X'), 'bBobb'); // markup characters are stripped
  assert.equal(sanitizeName('', 'FALLBACK'), 'FALLBACK');
  assert.equal(sanitizeInput({ n: 1, m: 5, a: ['punch', 'x'] }).m, 1);
  assert.equal(sanitizeInput({ n: -1 }), null);
});
