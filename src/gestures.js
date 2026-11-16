// Turns raw hand landmarks into PDF actions.
// Pure logic (no camera, no DOM) so it can be unit-tested in Node.
//
// MediaPipe landmark numbers:
//   0 wrist | thumb 1-4 | index 5-8 | middle 9-12 | ring 13-16 | pinky 17-20
//   each finger: base joint, middle joint (pip), upper joint, fingertip
//   x,y are 0..1 across the camera frame (y grows downward).

import { DEFAULT_SETTINGS } from './settings.js';

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
  thumbScrollSpeed: 700,  // px per second while 👍/👎 is held
  joystickDeadzone: 0.05, // how far the palm must move from its start before scrolling
  joystickGain: 6000,     // px per second for each 1.0 of distance beyond the deadzone
  lZoomDeadzone: 0.01,    // ignore tiny changes in thumb-index gap
  lZoomPower: 2,          // how strongly a gap change becomes a zoom change
  scrollBoostRef: 0.015,  // palm speed (fraction of frame per frame) at which scrolling gets +1x faster
  scrollBoostMax: 3,      // ...up to this much extra, so a quick sweep covers a long PDF
  thumbRampPerSec: 2.5,   // 👍/👎 scrolling gets this much faster for every second it is held
  thumbRampMax: 4,        // ...up to this much extra
  joystickBoost: 12,      // pushing the palm further makes the scrolling disproportionately faster
  indexStraightMin: 0.9,  // L-shape zoom only counts while the index finger is this straight (1 = ruler)
  zoomArmMs: 200,         // the pose must be held this long before zooming starts
  zoomDelayMs: 120,       // zoom changes wait this long and are dropped if the pose changes (fist closing)
  zoomMaxStep: 0.15,      // a thumb-index gap change bigger than this in ONE frame is a pose change, not a zoom
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

/** How straight is the index finger? ~1 = fully straight, lower = bent. */
export function indexStraightness(h) {
  const path = dist(h[5], h[6]) + dist(h[6], h[7]) + dist(h[7], h[8]);
  return path === 0 ? 0 : dist(h[5], h[8]) / path;
}

/**
 * Returns 'pinch' | 'peace' | 'open' | 'thumbup' | 'thumbdown' | 'lshape' | 'point' | 'fist' | 'other'.
 */
export function classify(h) {
  const f = extendedFingers(h);
  const handSize = dist(h[0], h[9]);
  const othersUp = [f.middle, f.ring, f.pinky].filter(Boolean).length;
  const pinching = dist(h[4], h[8]) < CONFIG.pinchRatio * handSize;

  if (pinching && othersUp >= 2) return 'pinch';
  if (f.index && f.middle && !f.ring && !f.pinky) return 'peace';
  if (f.index && f.middle && f.ring && f.pinky) return 'open';

  if (!f.index && !f.middle && !f.ring && !f.pinky) {
    // Closed hand: is the thumb sticking clearly up or down?
    const thumbLength = dist(h[4], h[2]);
    const rise = h[2].y - h[4].y; // positive = thumb tip above its base
    if (thumbLength > 0.7 * handSize && rise > 0.6 * handSize) return 'thumbup';
    if (thumbLength > 0.7 * handSize && -rise > 0.6 * handSize) return 'thumbdown';
    return 'fist';
  }

  if (f.index && !f.middle && !f.ring && !f.pinky) {
    // Index only: thumb out = "L" shape, thumb tucked in = pointing.
    return dist(h[4], h[5]) > 0.5 * handSize ? 'lshape' : 'point';
  }
  return 'other';
}

/**
 * Create a controller. Feed it one hand per camera frame via update().
 * actions: { scrollBy(px), nextPage(), prevPage(), zoomBy(factor) }
 * getSettings(): current choices (see settings.js); read every frame so changes apply instantly.
 * onState({ active, gesture, holdProgress }) is called every frame for the on-screen HUD.
 */
export function createController({ actions, getSettings = () => DEFAULT_SETTINGS, onState = () => {} }) {
  let active = false;
  let holdStart = null;
  let toggledThisHold = false;
  let pos = null;         // smoothed palm position
  let prevGesture = null;
  let history = [];       // recent palm positions, for swipe detection
  let lastSwipe = -Infinity;
  let lastT = null;
  let anchorY = null;     // where the palm started, for joystick scrolling
  let lastGap = null;     // smoothed thumb-index gap, for L-shape zoom
  let pendingZoom = [];   // zoom changes waiting out the safety delay
  let gestureSince = 0;   // when the current pose began
  let thumbSince = 0;     // when 👍/👎 scrolling began

  function emit(gesture, holdProgress = 0) {
    onState({ active, gesture, holdProgress });
  }

  function update(hand, t = performance.now()) {
    const dt = lastT == null ? 0 : Math.min(0.1, (t - lastT) / 1000);
    lastT = t;

    if (!hand) {
      holdStart = null; toggledThisHold = false; pos = null; prevGesture = null;
      history = []; anchorY = null; lastGap = null; pendingZoom = [];
      emit('none');
      return;
    }

    const settings = getSettings();
    const k = settings.sensitivity ?? 1;
    const ks = k * (settings.scrollSpeed ?? 1); // scroll has its own extra speed setting
    const gesture = classify(hand);
    if (gesture !== prevGesture) gestureSince = t;
    const stableMs = t - gestureSince;
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

    // Keep per-pose state clean when the pose changes.
    if (gesture !== 'open') anchorY = null;
    if (gesture !== 'lshape') { lastGap = null; pendingZoom = []; }

    // 2) While ON, turn movement into actions.
    const same = gesture === prevGesture && prev;
    const dx = same ? pos.x - prev.x : 0;
    const dy = same ? pos.y - prev.y : 0;
    const swipeQuiet = t - lastSwipe > 400; // don't scroll right after a page swipe

    if (active) {
      // ---- Scroll ----
      if (settings.scroll === 'palm-move') {
        if (gesture === 'open' && swipeQuiet && Math.abs(dy) > CONFIG.scrollDeadzone && Math.abs(dy) > Math.abs(dx)) {
          // Faster hand = disproportionately more scroll, so long PDFs are quick to cross.
          const boost = 1 + Math.min(CONFIG.scrollBoostMax, Math.abs(dy) / CONFIG.scrollBoostRef);
          actions.scrollBy(dy * CONFIG.scrollGain * ks * boost);
        }
      } else if (settings.scroll === 'thumbs') {
        if (gesture === 'thumbup' || gesture === 'thumbdown') {
          if (stableMs === 0) thumbSince = t;
          const held = (t - thumbSince) / 1000;
          const ramp = 1 + Math.min(CONFIG.thumbRampMax, held * CONFIG.thumbRampPerSec); // longer hold = faster
          const dir = gesture === 'thumbup' ? -1 : 1;
          actions.scrollBy(dir * CONFIG.thumbScrollSpeed * ks * ramp * dt);
        }
      } else if (settings.scroll === 'joystick') {
        if (gesture === 'open') {
          anchorY ??= pos.y;
          const off = pos.y - anchorY;
          if (swipeQuiet && Math.abs(off) > CONFIG.joystickDeadzone) {
            const beyond = Math.abs(off) - CONFIG.joystickDeadzone;
            const curve = 1 + beyond * CONFIG.joystickBoost;
            actions.scrollBy(Math.sign(off) * beyond * CONFIG.joystickGain * ks * curve * dt);
          }
        }
      }

      // ---- Page change (quick sideways swipe) ----
      const swipePose = settings.page === 'palm-swipe' ? 'open' : settings.page === 'point-swipe' ? 'point' : null;
      if (swipePose && gesture === swipePose) {
        history.push({ t, x: pos.x, y: pos.y });
        history = history.filter((p) => t - p.t <= CONFIG.swipeWindowMs);
        const first = history[0];
        const sx = pos.x - first.x;
        const sy = pos.y - first.y;
        if (t - lastSwipe > CONFIG.swipeCooldownMs && Math.abs(sx) > CONFIG.swipeDistance && Math.abs(sx) > 2 * Math.abs(sy)) {
          // Camera image is mirrored vs. the user: user's left = bigger x.
          (sx > 0 ? actions.nextPage : actions.prevPage)();
          lastSwipe = t;
          history = [];
        }
      } else {
        history = [];
      }

      // ---- Zoom ----
      if (settings.zoom === 'pinch-move') {
        if (gesture === 'pinch' && stableMs >= CONFIG.zoomArmMs && Math.abs(dy) > CONFIG.scrollDeadzone * 0.5) {
          actions.zoomBy(Math.exp(-dy * CONFIG.zoomGain * k)); // hand up = zoom in
        }
      } else if (settings.zoom === 'l-spread') {
        // Only a held, clearly straight-index "L" counts. Closing the hand into a fist
        // squeezes thumb and index together for a few frames; those changes wait in
        // `pendingZoom` and are thrown away when the pose changes.
        if (gesture === 'lshape' && indexStraightness(hand) >= CONFIG.indexStraightMin) {
          const gap = dist(hand[4], hand[8]) / dist(hand[0], hand[9]);
          const smooth = lastGap == null ? gap : lastGap + (gap - lastGap) * 0.5;
          if (lastGap != null && stableMs >= CONFIG.zoomArmMs) {
            const ratio = smooth / lastGap;
            const step = Math.abs(ratio - 1);
            if (step > CONFIG.zoomMaxStep) pendingZoom = []; // abrupt: a pose change, not a zoom
            else if (step > CONFIG.lZoomDeadzone) pendingZoom.push({ t, f: Math.pow(ratio, CONFIG.lZoomPower * k) });
          }
          lastGap = smooth;
          while (pendingZoom.length && t - pendingZoom[0].t >= CONFIG.zoomDelayMs) {
            actions.zoomBy(pendingZoom.shift().f);
          }
        } else {
          lastGap = null;
          pendingZoom = [];
        }
      }
    } else {
      history = [];
    }

    prevGesture = gesture;
    emit(gesture, holdProgress);
  }

  return { update, isActive: () => active };
}
