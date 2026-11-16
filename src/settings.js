// What the user can choose. This list drives BOTH the settings panel and the
// cheat sheet, so adding a new gesture option here makes it show up in the UI.
// (The behaviour for each id lives in gestures.js.)

export const OPTIONS = {
  scroll: {
    label: 'Scroll',
    choices: [
      { id: 'palm-move', icon: '🖐', title: 'Open palm, move up / down', hint: 'Hand follows the page. Simple, but moves your whole arm.' },
      { id: 'thumbs', icon: '👍', title: 'Thumbs up / down', hint: '👍 scrolls up, 👎 scrolls down while you hold it. Almost no arm movement.' },
      { id: 'joystick', icon: '🕹', title: 'Open palm, joystick', hint: 'Raise or lower your palm from where you started; further = faster.' },
      { id: 'off', icon: '⛔', title: 'Off', hint: 'No gesture scrolling (keyboard still works).' },
    ],
  },
  page: {
    label: 'Change page',
    choices: [
      { id: 'palm-swipe', icon: '🖐', title: 'Open palm, quick swipe', hint: 'Swipe to your left for next page, to your right for previous.' },
      { id: 'point-swipe', icon: '☝️', title: 'Point with index finger, quick swipe', hint: 'Same swipe, but with only your index finger up and thumb tucked.' },
      { id: 'off', icon: '⛔', title: 'Off', hint: 'No gesture page changes.' },
    ],
  },
  zoom: {
    label: 'Zoom',
    choices: [
      { id: 'pinch-move', icon: '👌', title: 'Pinch, move up / down', hint: 'Pinch thumb + index, then raise your hand to zoom in, lower to zoom out.' },
      { id: 'l-spread', icon: '🤏', title: 'L-shape, spread / close', hint: 'Thumb + index out like an "L" (other fingers curled). Open wider = zoom in, close = zoom out.' },
      { id: 'off', icon: '⛔', title: 'Off', hint: 'No gesture zoom.' },
    ],
  },
};

export const DEFAULT_SETTINGS = { scroll: 'palm-move', page: 'palm-swipe', zoom: 'pinch-move', sensitivity: 1, feedback: true, cameraId: '' };

const KEY = 'handsfree-pdf-settings-v1';

/** Load saved choices, ignoring anything invalid. Never throws. */
export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null');
    if (saved) {
      for (const action of Object.keys(OPTIONS)) {
        if (OPTIONS[action].choices.some((c) => c.id === saved[action])) s[action] = saved[action];
      }
      if (typeof saved.sensitivity === 'number' && saved.sensitivity >= 0.5 && saved.sensitivity <= 2) {
        s.sensitivity = saved.sensitivity;
      }
      if (typeof saved.feedback === 'boolean') s.feedback = saved.feedback;
      if (typeof saved.cameraId === 'string') s.cameraId = saved.cameraId;
    }
  } catch { /* private mode or corrupt data: just use defaults */ }
  return s;
}

export function saveSettings(settings) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
