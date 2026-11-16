# Handsfree PDF

Present a PDF without touching your keyboard or mouse. Use your webcam and hand
gestures to scroll, change pages and zoom. Runs entirely in your browser, so
your video never leaves your device.

> Status: early development. The PDF viewer works; gesture control is next.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL, then drop a PDF onto the page.

## How to use

1. Click **Start camera** and allow access.
2. Hold a **peace sign** (index + middle finger up) for 1 second to switch gesture control ON. Do it again to switch OFF.
3. While ON:

| Gesture | Action |
|---|---|
| Open palm, move up / down | Scroll |
| Open palm, quick swipe left / right | Previous / next page |
| Pinch (thumb + index), move up / down | Zoom in / out |
| Fist | Rest (nothing happens) |

The small bar under the camera preview shows what the app currently sees.

Keyboard fallback: arrow keys (pages / scroll) and `+` / `-` (zoom).

Run the logic tests with `npm test`.

## Built with

[PDF.js](https://github.com/mozilla/pdf.js), [MediaPipe Hands](https://github.com/google-ai-edge/mediapipe) (coming soon) and [Vite](https://vitejs.dev).

## License

MIT
