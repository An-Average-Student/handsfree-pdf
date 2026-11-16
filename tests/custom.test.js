import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  featureVector, vectorDistance, matchGesture, buildTemplate, validateCustom,
  CUSTOM_LIMITS, BUILTIN_NAMES,
} from '../src/custom-gestures.js';
import { classify, createController } from '../src/gestures.js';

// A fake hand (21 points) pointing up, with chosen fingers straight or curled.
function makeHand({ index = 0, middle = 0, ring = 0, pinky = 0, thumb = 'tuck' } = {}) {
  const h = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
  const cols = { index: [5, 0.45, index], middle: [9, 0.5, middle], ring: [13, 0.55, ring], pinky: [17, 0.6, pinky] };
  for (const [, [base, cx, up]] of Object.entries(cols)) {
    h[base] = { x: cx, y: 0.62 };
    h[base + 1] = { x: cx, y: up ? 0.52 : 0.55 };
    h[base + 2] = { x: cx, y: up ? 0.46 : 0.62 };
    h[base + 3] = { x: cx, y: up ? 0.4 : 0.66 };
  }
  h[1] = { x: 0.42, y: 0.74 }; h[2] = { x: 0.38, y: 0.68 }; h[3] = { x: 0.33, y: 0.64 };
  h[4] = thumb === 'out' ? { x: 0.28, y: 0.6 } : { x: 0.47, y: 0.64 };
  return h;
}
// Same hand moved, resized and tilted (what happens when you shift or lean).
function transform(h, { dx = 0, dy = 0, scale = 1, rotate = 0 } = {}) {
  const c = Math.cos(rotate), s = Math.sin(rotate);
  return h.map((p) => {
    const x = (p.x - 0.5) * scale, y = (p.y - 0.8) * scale;
    return { x: 0.5 + dx + x * c - y * s, y: 0.8 + dy + x * s + y * c };
  });
}
// Deterministic tremble so tests never flake.
const jitter = (h, amount, seed) => {
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5;
  return h.map((p) => ({ x: p.x + r() * amount, y: p.y + r() * amount }));
};

const three = () => makeHand({ index: 1, middle: 1, ring: 1 });           // three fingers up
const rock = () => makeHand({ index: 1, pinky: 1 });                        // index + pinky
const frames = (hand, n, amount = 0.004) => Array.from({ length: n }, (_, i) => jitter(hand, amount, 100 + i));

test('the fingerprint ignores position, size and tilt of the hand', () => {
  const base = featureVector(three());
  const moved = featureVector(transform(three(), { dx: 0.1, dy: -0.15, scale: 1.4, rotate: 0.4 }));
  assert.ok(vectorDistance(base, moved) < 0.02, `distance ${vectorDistance(base, moved)}`);
});

test('different shapes are far apart', () => {
  const a = featureVector(three()), b = featureVector(rock()), c = featureVector(makeHand({}));
  assert.ok(vectorDistance(a, b) > 0.25);
  assert.ok(vectorDistance(a, c) > 0.25);
});

test('matching picks the right gesture, even when moved or tilted', () => {
  const T = [
    { id: 'a', name: 'Three', action: 'next', samples: [featureVector(three())] },
    { id: 'b', name: 'Rock', action: 'prev', samples: [featureVector(rock())] },
  ];
  assert.equal(matchGesture(featureVector(transform(three(), { dx: 0.1, scale: 1.2, rotate: 0.3 })), T)?.id, 'a');
  assert.equal(matchGesture(featureVector(jitter(rock(), 0.006, 5)), T)?.id, 'b');
});

test('REGRESSION: a pose one finger away does not match (peace sign is not "three fingers")', () => {
  const T = [{ id: 'a', name: 'Three', action: 'next', samples: [featureVector(three())] }];
  assert.equal(matchGesture(featureVector(makeHand({ index: 1, middle: 1 })), T), null);                      // one finger fewer
  assert.equal(matchGesture(featureVector(makeHand({ index: 1, middle: 1, ring: 1, pinky: 1 })), T), null); // one finger more
  assert.equal(matchGesture(featureVector(makeHand({ index: 1, middle: 1, ring: 1, thumb: 'out' })), T), null); // thumb moved
  assert.ok(matchGesture(featureVector(jitter(three(), 0.02, 9)), T), 'a shaky repeat of the same pose must still match');
});

test('an unknown pose matches nothing, and ambiguous poses are refused', () => {
  const T = [{ id: 'a', name: 'Three', action: 'next', samples: [featureVector(three())] }];
  assert.equal(matchGesture(featureVector(makeHand({})), T), null); // a fist is not "three fingers"
  const twins = [...T, { id: 'b', name: 'Three again', action: 'prev', samples: [featureVector(three())] }];
  assert.equal(matchGesture(featureVector(three()), twins), null); // cannot tell them apart: do nothing
});

// ---- Recording ---------------------------------------------------------------
const rec = (hands, existing = []) => buildTemplate(hands, classify, existing, BUILTIN_NAMES);

test('a steady, unusual pose is accepted and stored compactly', () => {
  const r = rec(frames(three(), 40));
  assert.equal(r.ok, true);
  assert.ok(r.samples.length <= CUSTOM_LIMITS.samplesPerGesture && r.samples.every((v) => v.length === 42));
});

test('too few frames (hand not seen) is refused', () => {
  const r = rec([...frames(three(), 5), null, null, null]);
  assert.equal(r.ok, false);
  assert.match(r.message, /couldn.t see your hand/i);
});

test('a pose that looks like a built-in gesture is refused, naming it', () => {
  const open = frames(makeHand({ index: 1, middle: 1, ring: 1, pinky: 1, thumb: 'out' }), 40);
  const r = rec(open);
  assert.equal(r.ok, false);
  assert.match(r.message, /open palm/);
  assert.match(rec(frames(makeHand({ index: 1, middle: 1 }), 40)).message, /peace sign/);
});

test('a wobbling hand is refused', () => {
  const wobble = Array.from({ length: 40 }, (_, i) => (i % 2 ? three() : rock()));
  const r = rec(wobble);
  assert.equal(r.ok, false);
  assert.match(r.message, /moved too much/i);
});

test('a pose too similar to an existing gesture is refused', () => {
  const first = rec(frames(three(), 40));
  const existing = [{ id: 'a', name: 'Mine', action: 'next', samples: first.samples }];
  const r = rec(frames(transform(three(), { dx: 0.05 }), 40), existing);
  assert.equal(r.ok, false);
  assert.match(r.message, /Too similar.*Mine/);
  assert.equal(rec(frames(rock(), 40), existing).ok, true); // a different pose is fine
});

// ---- Loading saved data ------------------------------------------------------
test('validation keeps good gestures and drops anything malformed', () => {
  const vec = Array(42).fill(0.1);
  const good = { id: 'g1', name: 'Mine', action: 'next', samples: [vec] };
  const bad = [
    null, 'text', 5,
    { ...good, id: '' }, { ...good, id: 'x'.repeat(41) },
    { ...good, name: '' }, { ...good, name: 'n'.repeat(25) },
    { ...good, action: 'delete-everything' },
    { ...good, samples: [] }, { ...good, samples: [[1, 2, 3]] },
    { ...good, samples: [Array(42).fill(NaN)] }, { ...good, samples: [Array(42).fill(1e9)] },
    { ...good, samples: Array(20).fill(vec) },
  ];
  assert.deepEqual(validateCustom([good, ...bad]), [good]);
  assert.deepEqual(validateCustom('nope'), []);
  assert.equal(validateCustom(Array(50).fill(good)).length, CUSTOM_LIMITS.maxGestures);
});

// ---- Triggering through the controller --------------------------------------
function setup(saved, settings = {}) {
  const calls = [];
  const states = [];
  const push = (n) => () => calls.push(n);
  const actions = { scrollBy() {}, zoomBy() {}, nextPage: push('next'), prevPage: push('prev'), firstPage: push('first'), lastPage: push('last'), togglePresent: push('present') };
  const c = createController({ actions, getSettings: () => ({ scroll: 'off', page: 'off', zoom: 'off', pointer: 'off', sensitivity: 1, scrollSpeed: 1, ...settings }), getCustom: () => saved, onState: (s) => states.push(s) });
  return { calls, states, c };
}
const gest = (action, hand = three) => ({ id: action, name: `G-${action}`, action, samples: [featureVector(hand())] });
const peace = () => makeHand({ index: 1, middle: 1 });
function turnOn(c) { let t = 0; for (; t < 1200; t += 33) c.update(peace(), t); assert.equal(c.isActive(), true); return t + 100; }
const hold = (c, hand, ms, t) => { const end = t + ms; for (; t < end; t += 33) c.update(hand(), t); return t; };

test('holding a custom pose triggers its action once, after the hold time', () => {
  const { calls, c } = setup([gest('next')]);
  let t = turnOn(c);
  t = hold(c, three, 300, t);                 // not long enough yet
  assert.equal(calls.length, 0);
  t = hold(c, three, 600, t);                 // now held long enough
  assert.deepEqual(calls, ['next']);
  t = hold(c, three, 3000, t);                // still holding: must NOT fire again
  assert.deepEqual(calls, ['next']);
});

test('it needs a release (and the cooldown) before it can fire again', () => {
  const { calls, c } = setup([gest('next')]);
  let t = turnOn(c);
  t = hold(c, three, 800, t);
  t = hold(c, () => makeHand({}), 300, t);    // let go (fist)
  t = hold(c, three, 800, t);                 // again
  assert.deepEqual(calls, ['next', 'next']);
});

test('a quick flash of the pose does nothing', () => {
  const { calls, c } = setup([gest('next')]);
  let t = turnOn(c);
  t = hold(c, three, 200, t); t = hold(c, () => makeHand({}), 600, t);
  assert.equal(calls.length, 0);
});

test('custom actions do nothing while gestures are OFF, except the on/off one', () => {
  let r = setup([gest('next')]);
  let t = 0; t = hold(r.c, three, 1500, t);
  assert.equal(r.calls.length, 0);
  r = setup([gest('toggle')]);
  assert.equal(r.c.isActive(), false);
  hold(r.c, three, 1000, 0);
  assert.equal(r.c.isActive(), true); // turned ON by the custom pose
});

test('each action runs its own page command', () => {
  for (const action of ['next', 'prev', 'first', 'last', 'present']) {
    const { calls, c } = setup([gest(action)]);
    const t = turnOn(c);
    hold(c, three, 800, t);
    assert.deepEqual(calls, [action], action);
  }
});

test('the HUD is told which custom gesture is recognised', () => {
  const { states, c } = setup([gest('next')]);
  let t = turnOn(c);
  hold(c, three, 200, t);
  assert.equal(states.at(-1).custom, 'G-next');
  hold(c, () => makeHand({}), 200, t + 300);
  assert.equal(states.at(-1).custom, null);
});

test('with no saved gestures nothing changes', () => {
  const { calls, c } = setup([]);
  const t = turnOn(c);
  hold(c, three, 1500, t);
  assert.equal(calls.length, 0);
});
