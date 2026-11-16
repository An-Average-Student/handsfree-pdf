# Handsfree PDF

Present a PDF without touching your keyboard or mouse. Use your webcam and hand
gestures to scroll, change pages and zoom. Runs entirely in your browser, so
your video never leaves your device.

> Status: early development. The PDF viewer works; gesture control is next.

## Try it online

https://an-average-student.github.io/handsfree-pdf/

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL, then drop a PDF onto the page.

## How to use

1. Click **Start camera** and allow access.
2. Hold a **peace sign** (index + middle finger up) for 1 second to switch gesture control ON. Do it again to switch OFF.
3. Open **⚙ Gestures** to choose which gesture does what. Your choices are saved in your browser.

| Action | Choices |
|---|---|
| Scroll | Open palm up/down (default) · Thumbs up/down · Open palm "joystick" · Off |
| Change page | Open palm swipe (default) · Index-finger swipe · Off |
| Zoom | Pinch + move up/down (default) · L-shape spread/close · Off |

✊ A fist is always the "rest" pose: nothing happens. The small bar under the camera
preview shows what the app currently sees, which helps when a gesture isn't picked up.

## Presenting

- **⛶ Present** (or press `F`): fullscreen, toolbar hidden, one page fitted to the screen. `Esc` exits.
- **Fit width / Fit page** buttons size the PDF to your screen. New PDFs open fit-to-width.
- A short message appears on the slide when a gesture fires (e.g. "➡ Page 2 / 10"). Turn it off in **⚙ Gestures**.
- Several cameras? A dropdown appears next to **Start camera**. Your choice is remembered.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `F` | Start / stop presentation mode |
| `C` | Start / stop camera |
| ← / → (or Page Up / Down) | Previous / next page |
| ↑ / ↓ | Scroll |
| `+` / `-` | Zoom |

## Adding a new gesture option

1. Add an entry to `OPTIONS` in `src/settings.js`. It appears in the panel automatically.
2. Add the behaviour for its `id` in `src/gestures.js` (and a pose in `classify()` if it needs one).
3. Add a test in `tests/gestures.test.js` and run `npm test`.

## Built with

[PDF.js](https://github.com/mozilla/pdf.js), [MediaPipe Hands](https://github.com/google-ai-edge/mediapipe) (coming soon) and [Vite](https://vitejs.dev).

## License

MIT
