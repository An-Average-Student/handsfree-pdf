import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, createController } from '../src/gestures.js';

// Build a fake hand (21 points) pointing up, with chosen fingers straight or curled.
function makeHand({ index = false, middle = false, ring = false, pinky = false, pinch = false, x = 0.5, y = 0 } = {}) {
  const h = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
  h[0] = { x: 0.5, y: 0.8 };
  const cols = { index: [5, 0.45, index], middle: [9, 0.5, middle], ring: [13, 0.55, ring], pinky: [17, 0.6, pinky] };
  for (const [, [base, cx, up]] of Object.entries(cols)) {
    h[base] = { x: cx, y: 0.62 };
    h[base + 1] = { x: cx, y: up ? 0.52 : 0.55 };
    h[base + 2] = { x: cx, y: up ? 0.46 : 0.62 };
    h[base + 3] = { x: cx, y: up ? 0.4 : 0.66 };
  }
  h[1] = { x: 0.42, y: 0.74 }; h[2] = { x: 0.38, y: 0.68 }; h[3] = { x: 0.33, y: 0.64 };
  h[4] = pinch ? { x: h[8].x + 0.01, y: h[8].y + 0.01 } : { x: 0.28, y: 0.6 };
  return h.map((p) => ({ x: p.x + (x - 0.5), y: p.y + y }));
}

test('classifies the basic poses', () => {
  assert.equal(classify(makeHand({ index: 1, middle: 1, ring: 1, pinky: 1 })), 'open');
  assert.equal(classify(makeHand({})), 'fist');
  assert.equal(classify(makeHand({ index: 1, middle: 1 })), 'peace');
  assert.equal(classify(makeHand({ index: 1, middle: 1, ring: 1, pinky: 1, pinch: true })), 'pinch');
});

function setup() {
  const calls = [];
  const actions = {
    scrollBy: (d) => calls.push(['scroll', d]),
    nextPage: () => calls.push(['next']),
    prevPage: () => calls.push(['prev']),
    zoomBy: (f) => calls.push(['zoom', f]),
  };
  return { calls, c: createController({ actions }) };
}
const peace = () => makeHand({ index: 1, middle: 1 });
const open = (o) => makeHand({ index: 1, middle: 1, ring: 1, pinky: 1, ...o });

test('does nothing while OFF', () => {
  const { calls, c } = setup();
  for (let i = 0; i < 10; i++) c.update(open({ y: i * 0.02 }), i * 33);
  assert.equal(calls.length, 0);
});

test('peace sign held 1s turns control on, a quick flash does not', () => {
  const { c } = setup();
  for (let t = 0; t < 500; t += 33) c.update(peace(), t);
  assert.equal(c.isActive(), false);
  c.update(open(), 600);
  for (let t = 1000; t < 2200; t += 33) c.update(peace(), t);
  assert.equal(c.isActive(), true);
});

function turnOn(c) {
  for (let t = 0; t < 1200; t += 33) c.update(peace(), t);
  assert.equal(c.isActive(), true);
  return 1300;
}

test('open palm moving down scrolls down', () => {
  const { calls, c } = setup();
  let t = turnOn(c);
  for (let i = 0; i < 8; i++, t += 33) c.update(open({ y: i * 0.02 }), t);
  const scrolls = calls.filter((x) => x[0] === 'scroll');
  assert.ok(scrolls.length > 0 && scrolls.every((s) => s[1] > 0));
});

test('fast sideways swipe changes page once', () => {
  const { calls, c } = setup();
  let t = turnOn(c);
  for (let i = 0; i < 8; i++, t += 33) c.update(open({ x: 0.3 + i * 0.05 }), t); // x grows = user's left
  assert.equal(calls.filter((x) => x[0] === 'next').length, 1);
});

test('pinch + hand up zooms in', () => {
  const { calls, c } = setup();
  let t = turnOn(c);
  for (let i = 0; i < 6; i++, t += 33) c.update(open({ pinch: true, y: -i * 0.02 }), t);
  const zooms = calls.filter((x) => x[0] === 'zoom');
  assert.ok(zooms.length > 0 && zooms.every((z) => z[1] > 1));
});
