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

## Controls today (keyboard fallback)

| Key | Action |
|---|---|
| ← / → | Previous / next page |
| ↑ / ↓ | Scroll |
| + / − | Zoom |

## Planned gestures

- Open palm moving up/down: scroll
- Swipe left/right: change page
- Pinch in/out: zoom
- Raised palm for 1 second: turn gesture control on/off

## Built with

[PDF.js](https://github.com/mozilla/pdf.js), [MediaPipe Hands](https://github.com/google-ai-edge/mediapipe) (coming soon) and [Vite](https://vitejs.dev).

## License

MIT
