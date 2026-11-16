import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, createController } from '../src/gestures.js';
import { DEFAULT_SETTINGS } from '../src/settings.js';

// Build a fake hand (21 points) pointing up, with chosen fingers straight or curled.
function makeHand({ index = false, middle = false, ring = false, pinky = false, pinch = false, thumb = 'out', thumbTip = null, x = 0.5, y = 0 } = {}) {
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
  const tips = { out: { x: 0.28, y: 0.6 }, tuck: { x: 0.47, y: 0.64 }, up: { x: 0.36, y: 0.45 }, down: { x: 0.38, y: 0.92 } };
  h[4] = thumbTip ?? (pinch ? { x: h[8].x + 0.01, y: h[8].y + 0.01 } : tips[thumb]);
  return h.map((p) => ({ x: p.x + (x - 0.5), y: p.y + y }));
}

test('classifies the basic poses', () => {
  assert.equal(classify(makeHand({ index: 1, middle: 1, ring: 1, pinky: 1 })), 'open');
  assert.equal(classify(makeHand({})), 'fist');
  assert.equal(classify(makeHand({ index: 1, middle: 1 })), 'peace');
  assert.equal(classify(makeHand({ index: 1, middle: 1, ring: 1, pinky: 1, pinch: true })), 'pinch');
});

function setup(overrides = {}) {
  const calls = [];
  const actions = {
    scrollBy: (d) => calls.push(['scroll', d]),
    nextPage: () => calls.push(['next']),
    prevPage: () => calls.push(['prev']),
    zoomBy: (f) => calls.push(['zoom', f]),
  };
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  return { calls, c: createController({ actions, getSettings: () => settings }) };
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

test('classifies the new poses', () => {
  assert.equal(classify(makeHand({ thumb: 'up' })), 'thumbup');
  assert.equal(classify(makeHand({ thumb: 'down' })), 'thumbdown');
  assert.equal(classify(makeHand({ thumb: 'out' })), 'fist');
  assert.equal(classify(makeHand({ index: 1, thumb: 'out' })), 'lshape');
  assert.equal(classify(makeHand({ index: 1, thumb: 'tuck' })), 'point');
});

test('thumbs mode: 👍 scrolls up, 👎 scrolls down, palm does not scroll', () => {
  const { calls, c } = setup({ scroll: 'thumbs' });
  let t = turnOn(c);
  for (let i = 0; i < 6; i++, t += 33) c.update(makeHand({ thumb: 'up' }), t);
  let s = calls.filter((x) => x[0] === 'scroll');
  assert.ok(s.length > 0 && s.every((x) => x[1] < 0));
  calls.length = 0;
  for (let i = 0; i < 6; i++, t += 33) c.update(makeHand({ thumb: 'down' }), t);
  s = calls.filter((x) => x[0] === 'scroll');
  assert.ok(s.length > 0 && s.every((x) => x[1] > 0));
  calls.length = 0;
  for (let i = 0; i < 8; i++, t += 33) c.update(open({ y: i * 0.02 }), t);
  assert.equal(calls.filter((x) => x[0] === 'scroll').length, 0);
});

test('joystick mode: palm lowered from start scrolls down, held still does nothing', () => {
  const { calls, c } = setup({ scroll: 'joystick' });
  let t = turnOn(c);
  for (let i = 0; i < 10; i++, t += 33) c.update(open(), t);
  assert.equal(calls.filter((x) => x[0] === 'scroll').length, 0);
  for (let i = 0; i < 12; i++, t += 33) c.update(open({ y: 0.15 }), t);
  const s = calls.filter((x) => x[0] === 'scroll');
  assert.ok(s.length > 0 && s.every((x) => x[1] > 0));
});

const lHand = (gap) => makeHand({ index: 1, thumbTip: { x: 0.45 - gap, y: 0.4 } });

test('L-shape: opening thumb + index zooms in, closing zooms out', () => {
  const { calls, c } = setup({ zoom: 'l-spread' });
  let t = turnOn(c);
  for (let i = 0; i < 8; i++, t += 33) c.update(lHand(0.1 + i * 0.015), t);
  let z = calls.filter((x) => x[0] === 'zoom');
  assert.ok(z.length > 0 && z.every((x) => x[1] > 1));
  for (let i = 0; i < 6; i++, t += 33) c.update(lHand(0.205), t); // hold still: smoothing settles
  calls.length = 0;
  for (let i = 1; i <= 8; i++, t += 33) c.update(lHand(0.205 - i * 0.012), t);
  z = calls.filter((x) => x[0] === 'zoom');
  assert.ok(z.length > 0 && z.every((x) => x[1] < 1), JSON.stringify(z));
});

test('point-swipe changes page with index finger, not with open palm', () => {
  const { calls, c } = setup({ page: 'point-swipe' });
  let t = turnOn(c);
  for (let i = 0; i < 8; i++, t += 33) c.update(open({ x: 0.3 + i * 0.05 }), t);
  assert.equal(calls.filter((x) => x[0] === 'next').length, 0);
  c.update(null, t); t += 33; // hand leaves the frame, then comes back
  for (let i = 0; i < 8; i++, t += 33) c.update(makeHand({ index: 1, thumb: 'tuck', x: 0.3 + i * 0.05 }), t);
  assert.equal(calls.filter((x) => x[0] === 'next').length, 1, JSON.stringify(calls));
});

test('"off" disables an action', () => {
  const { calls, c } = setup({ scroll: 'off', page: 'off', zoom: 'off' });
  let t = turnOn(c);
  for (let i = 0; i < 8; i++, t += 33) c.update(open({ y: i * 0.02, x: 0.3 + i * 0.05 }), t);
  for (let i = 0; i < 6; i++, t += 33) c.update(open({ pinch: true, y: -i * 0.02 }), t);
  assert.equal(calls.length, 0);
});

test('sensitivity scales scroll distance', () => {
  const run = (sensitivity) => {
    const { calls, c } = setup({ sensitivity });
    let t = turnOn(c);
    for (let i = 0; i < 8; i++, t += 33) c.update(open({ y: i * 0.02 }), t);
    return calls.filter((x) => x[0] === 'scroll').reduce((n, x) => n + x[1], 0);
  };
  assert.ok(run(2) > run(1) * 1.8);
});
