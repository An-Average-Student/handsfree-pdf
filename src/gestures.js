// Turns raw hand landmarks into PDF actions.
// Pure logic (no camera, no DOM) so it can be unit-tested in Node.
//
// MediaPipe landmark numbers:
//   0 wrist | thumb 1-4 | index 5-8 | middle 9-12 | ring 13-16 | pinky 17-20
//   each finger: base joint, middle joint (pip), upper joint, fingertip
//   x,y are 0..1 across the camera frame (y grows downward).

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Tunable numbers live here so they are easy to find and change.
export const CONFIG = {
  holdToToggleMs: 1000,   // hold ✌️ this long to switch control on/off
  pinchRatio: 0.3,        // thumb-index gap, relative to hand size, that counts as a pinch
  scrollGain: 2500,       // px scrolled per 1.0 of vertical hand movement
  scrollDeadzone: 0.003,  // ignore tiny movements (hand shake)
  zoomGain: 3,            // how fast pinch + move zooms
  swipeDistance: 0.2,     // horizontal travel (fraction of frame width) to count as a swipe
  swipeWindowMs: 300,     // ...within this time
  swipeCooldownMs: 900,   // pause after a swipe so one swipe = one page
  smoothing: 0.5,         // 0..1, higher = follows the hand faster but jitters more
};

const FINGERS = { index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20] };

/** Which of the four fingers are straight? Orientation-independent. */
export function extendedFingers(h) {
  const wrist = h[0];
  const out = {};
  for (const [name, [, pip, tip]] of Object.entries(FINGERS)) {
    out[name] = dist(h[tip], wrist) > dist(h[pip], wrist) * 1.05;
  }
  return out;
}

/** Returns 'pinch' | 'peace' | 'open' | 'fist' | 'other'. */
export function classify(h) {
  const f = extendedFingers(h);
  const handSize = dist(h[0], h[9]);
  const othersUp = [f.middle, f.ring, f.pinky].filter(Boolean).length;
  const pinching = dist(h[4], h[8]) < CONFIG.pinchRatio * handSize;

  if (pinching && othersUp >= 2) return 'pinch';
  if (f.index && f.middle && !f.ring && !f.pinky) return 'peace';
  if (f.index && f.middle && f.ring && f.pinky) return 'open';
  if (!f.index && !f.middle && !f.ring && !f.pinky) return 'fist';
  return 'other';
}

/**
 * Create a controller. Feed it one hand per camera frame via update().
 * actions: { scrollBy(px), nextPage(), prevPage(), zoomBy(factor) }
 * onState({ active, gesture, holdProgress }) is called every frame for the on-screen HUD.
 */
export function createController({ actions, onState = () => {} }) {
  let active = false;
  let holdStart = null;
  let toggledThisHold = false;
  let pos = null;         // smoothed palm position
  let prevGesture = null;
  let history = [];       // recent palm positions, for swipe detection
  let lastSwipe = -Infinity;

  function emit(gesture, holdProgress = 0) {
    onState({ active, gesture, holdProgress });
  }

  function update(hand, t = performance.now()) {
    if (!hand) {
      holdStart = null; toggledThisHold = false; pos = null; prevGesture = null; history = [];
      emit('none');
      return;
    }

    const gesture = classify(hand);
    const raw = hand[9]; // middle-finger base: a steady "palm centre"
    const a = CONFIG.smoothing;
    const prev = pos;
    pos = prev ? { x: prev.x + (raw.x - prev.x) * a, y: prev.y + (raw.y - prev.y) * a } : { x: raw.x, y: raw.y };

    // 1) Turn control on/off with a held peace sign.
    let holdProgress = 0;
    if (gesture === 'peace') {
      holdStart ??= t;
      holdProgress = Math.min(1, (t - holdStart) / CONFIG.holdToToggleMs);
      if (holdProgress >= 1 && !toggledThisHold) {
        active = !active;
        toggledThisHold = true;
      }
    } else {
      holdStart = null;
      toggledThisHold = false;
    }

    // 2) While ON, turn movement into actions.
    const sameGesture = gesture === prevGesture && prev;
    if (active && sameGesture) {
      const dx = pos.x - prev.x;
      const dy = pos.y - prev.y;

      if (gesture === 'open') {
        history.push({ t, x: pos.x, y: pos.y });
        history = history.filter((p) => t - p.t <= CONFIG.swipeWindowMs);

        const first = history[0];
        const sx = pos.x - first.x;
        const sy = pos.y - first.y;
        const cooled = t - lastSwipe > CONFIG.swipeCooldownMs;

        if (cooled && Math.abs(sx) > CONFIG.swipeDistance && Math.abs(sx) > 2 * Math.abs(sy)) {
          // Camera image is mirrored vs. the user: user's left = bigger x.
          (sx > 0 ? actions.nextPage : actions.prevPage)();
          lastSwipe = t;
          history = [];
        } else if (t - lastSwipe > 400 && Math.abs(dy) > CONFIG.scrollDeadzone && Math.abs(dy) > Math.abs(dx)) {
          actions.scrollBy(dy * CONFIG.scrollGain);
        }
      } else if (gesture === 'pinch') {
        if (Math.abs(dy) > CONFIG.scrollDeadzone * 0.5) {
          actions.zoomBy(Math.exp(-dy * CONFIG.zoomGain)); // hand up = zoom in
        }
      }
    }
    if (gesture !== 'open') history = [];

    prevGesture = gesture;
    emit(gesture, holdProgress);
  }

  return { update, isActive: () => active };
}
