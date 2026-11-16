# Handsfree PDF

Present a PDF, Word document or PowerPoint deck without touching your keyboard or mouse. Use your webcam and hand
gestures to scroll, change pages and zoom. Runs entirely in your browser, so
your video never leaves your device.

> Status: early development. The PDF viewer works; gesture control is next.

## Try it online

https://an-average-student.github.io/handsfree-pdf/

## What it opens

| Type | Notes |
|---|---|
| **PDF** | Best fidelity. |
| **Word (.docx)** | Drawn in the browser, one page per Word page. |
| **PowerPoint (.pptx)** | Drawn in the browser, one slide per page, any slide shape (4:3, 16:9...). |

Drop a file on the page or click **Open file**. Everything happens on your device; files are never uploaded.

**Good to know about Word and PowerPoint:** these are redrawn in the browser, so they won't look
*identical* to the real app. Expect substituted fonts if yours aren't installed, no slide
animations, transitions or embedded video, and charts that may not draw fully. If a file has to
look exactly right, export it to PDF first. Old `.doc` / `.ppt` files aren't supported (save as
`.docx` / `.pptx`). A Word file with no page breaks shows as one long page, and "next page"
then scrolls a screenful.

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
| Laser pointer | ☝️ Point with your index finger (default) · Off |

**Faster scrolling on long PDFs:** a quicker hand scrolls disproportionately further, holding 👍/👎 speeds up the longer you hold it, and **Scroll speed** in ⚙ Gestures scales it all (0.5× to 4×).

**Zoom safety:** L-shape zoom only counts while your index finger is straight and the L has been held for a moment, and changes are discarded if you close your hand into a fist.

**Laser pointer:** with gestures ON, point with your index finger (thumb tucked in) and a red dot follows your fingertip. It hides about 0.2 s after you stop pointing. Only the middle of the camera view is used, so you don't have to stretch your arm to reach the screen edges; **Pointer speed** in ⚙ Gestures adjusts that. The dot is smoothed with a [One Euro filter](https://gery.casiez.net/1euro/) so it doesn't shake. Pointing is also the pose for the optional index-finger page swipe, so pick one of the two.

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

[PDF.js](https://github.com/mozilla/pdf.js) (PDF), [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) (Word), [pptx-preview](https://www.npmjs.com/package/pptx-preview) (PowerPoint), [MediaPipe Hands](https://github.com/google-ai-edge/mediapipe) (hand tracking) and [Vite](https://vitejs.dev).

## License

MIT

## Developer note

`package.json` pins `echarts` and `uuid` through `overrides`. `pptx-preview` depends on older versions with
known moderate security advisories, and a malicious .pptx is exactly the input that could reach them.
If you update `pptx-preview`, run `npm audit` and re-test a deck that contains a chart before removing the overrides.
