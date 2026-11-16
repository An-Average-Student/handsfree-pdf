// Custom gestures: record your own hand pose and choose what it does.
// Pure logic (no camera, no DOM) so it can be unit-tested in Node.
//
// A pose is turned into a "fingerprint" (the 21 hand points, moved so the wrist is the
// origin, scaled by palm size and rotated upright). It therefore ignores WHERE your hand
// is, HOW BIG it looks and how it is tilted, and only keeps the SHAPE.

export const CUSTOM_ACTIONS = [
  { id: 'next', label: 'Next page' },
  { id: 'prev', label: 'Previous page' },
  { id: 'first', label: 'First page' },
  { id: 'last', label: 'Last page' },
  { id: 'present', label: 'Start / stop presentation mode' },
  { id: 'toggle', label: 'Turn gestures on / off' },
];

/** Friendly names of the built-in poses, used when a recording is rejected for looking like one. */
export const BUILTIN_NAMES = {
  open: 'open palm', fist: 'fist', peace: 'peace sign', pinch: 'pinch',
  thumbup: 'thumbs up', thumbdown: 'thumbs down', lshape: 'L-shape', point: 'pointing finger',
};

export const CUSTOM_LIMITS = {
  maxGestures: 8,
  samplesPerGesture: 10,   // fingerprints stored per gesture
  minFrames: 12,           // frames needed while recording (2 s at even 6 frames/s)
  maxSpread: 0.12,         // how much the pose may wobble while recording (palm-size units)
  threshold: 0.16,         // how close a live pose must be to a recording to count as a match
  margin: 0.05,            // the best match must beat the runner-up by this much
  minSeparation: 0.25,     // a new recording must differ from existing ones by this much
  holdMs: 450,             // pose must be held this long before it triggers
  cooldownMs: 1000,        // pause between triggers
  builtinShare: 0.6,       // if this share of frames looks like a built-in pose, it is rejected
  nameMax: 24,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 42 numbers describing the hand's shape. See the top of the file. */
export function featureVector(h) {
  const w = h[0];
  const m = h[9];
  const size = dist(w, m) || 1;
  const rot = -Math.PI / 2 - Math.atan2(m.y - w.y, m.x - w.x); // turn wrist→middle-knuckle to point up
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const out = [];
  for (const p of h) {
    const x = (p.x - w.x) / size;
    const y = (p.y - w.y) / size;
    out.push(x * cos - y * sin, x * sin + y * cos);
  }
  return out;
}

/**
 * How different two hand shapes are, in palm sizes. 0 = identical.
 * Root-mean-square of the per-point gaps: one finger in a different position stands out
 * clearly (about 0.4), while the same pose held a bit shakily stays small (under 0.1).
 * (A plain average hid single-finger differences, so a peace sign looked like "three fingers".)
 */
export function vectorDistance(a, b) {
  let sum = 0;
  for (let i = 1; i < 21; i++) { // skip the wrist: it is always the origin
    const dx = a[2 * i] - b[2 * i];
    const dy = a[2 * i + 1] - b[2 * i + 1];
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / 20);
}

const nearest = (vec, samples) => samples.reduce((best, s) => Math.min(best, vectorDistance(vec, s)), Infinity);

/**
 * Which saved gesture (if any) does this fingerprint match?
 * templates: [{ id, name, action, samples: [vector, ...] }]
 * Returns the template, or null if nothing matches clearly (unknown, or ambiguous between two).
 */
export function matchGesture(vec, templates, { threshold = CUSTOM_LIMITS.threshold, margin = CUSTOM_LIMITS.margin } = {}) {
  let best = null;
  let bestD = Infinity;
  let second = Infinity;
  for (const t of templates) {
    const d = nearest(vec, t.samples);
    if (d < bestD) { second = bestD; bestD = d; best = t; } else if (d < second) second = d;
  }
  if (!best || bestD > threshold || second - bestD < margin) return null;
  return best;
}

const round3 = (v) => v.map((n) => Math.round(n * 1000) / 1000);

/**
 * Turns the frames captured while recording into a saved gesture, or explains why not.
 * hands: array of landmark arrays (nulls allowed, they are skipped).
 * poseOf(hand): the built-in classifier's answer ('open', 'fist', 'other', ...).
 * existing: already-saved gestures, to avoid near-duplicates.
 * Returns { ok: true, samples } or { ok: false, message }.
 */
export function buildTemplate(hands, poseOf, existing = [], builtinNames = {}) {
  const L = CUSTOM_LIMITS;
  const seen = hands.filter(Boolean);
  if (seen.length < L.minFrames) {
    return { ok: false, message: 'I couldn’t see your hand clearly. Keep it in view and try again.' };
  }

  // 1) Does it look like a pose the app already uses?
  const counts = {};
  for (const h of seen) { const p = poseOf(h); counts[p] = (counts[p] ?? 0) + 1; }
  for (const [pose, n] of Object.entries(counts)) {
    if (pose !== 'other' && n / seen.length >= L.builtinShare) {
      const name = builtinNames[pose] ?? pose;
      return { ok: false, message: `That looks like the built-in “${name}” pose. Try a different shape, like three fingers up.` };
    }
  }

  // 2) Was it held steady?
  const vecs = seen.map(featureVector);
  const mean = vecs[0].map((_, i) => vecs.reduce((s, v) => s + v[i], 0) / vecs.length);
  const spread = vecs.reduce((s, v) => s + vectorDistance(v, mean), 0) / vecs.length;
  if (spread > L.maxSpread) {
    return { ok: false, message: 'Your hand moved too much. Hold the pose still and try again.' };
  }

  // 3) Keep a handful of evenly spaced fingerprints.
  const n = Math.min(L.samplesPerGesture, vecs.length);
  const samples = Array.from({ length: n }, (_, i) => round3(vecs[Math.floor((i * vecs.length) / n)]));

  // 4) Different enough from what is already saved?
  for (const g of existing) {
    if (nearest(mean, g.samples) < L.minSeparation) {
      return { ok: false, message: `Too similar to your gesture “${g.name}”. Pick a clearly different shape.` };
    }
  }
  return { ok: true, samples };
}

// ---- Saving / loading (browser storage), with strict validation ---------------------

const KEY = 'handsfree-pdf-custom-v1';
const ACTION_IDS = new Set(CUSTOM_ACTIONS.map((a) => a.id));
const isVector = (v) => Array.isArray(v) && v.length === 42 && v.every((n) => Number.isFinite(n) && Math.abs(n) < 20);

/** Keeps only well-formed gestures. Anything odd (corrupt or tampered data) is dropped. */
export function validateCustom(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const g of list.slice(0, CUSTOM_LIMITS.maxGestures)) {
    if (!g || typeof g !== 'object') continue;
    const { id, name, action, samples } = g;
    if (typeof id !== 'string' || id.length === 0 || id.length > 40) continue;
    if (typeof name !== 'string' || name.length === 0 || name.length > CUSTOM_LIMITS.nameMax) continue;
    if (!ACTION_IDS.has(action)) continue;
    if (!Array.isArray(samples) || samples.length < 1 || samples.length > 16 || !samples.every(isVector)) continue;
    out.push({ id, name, action, samples });
  }
  return out;
}

export function loadCustom() {
  try { return validateCustom(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]')); } catch { return []; }
}

export function saveCustom(list) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
