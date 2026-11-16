# Security

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's private reporting:
**Security tab → "Report a vulnerability"** on this repository. I'll acknowledge it as soon as I can.

## How this app protects you

Handsfree PDF has **no server**. Everything runs in your browser:

- **Your video never leaves your device.** Hand tracking runs locally (MediaPipe, WebAssembly). Nothing is recorded or uploaded.
- **Your files never leave your device.** PDFs, Word and PowerPoint files are read and drawn locally.
- **No accounts, no analytics, no cookies, no third-party requests.** The hand-tracking model and engine are served from the same site.
- **Strict Content-Security-Policy** (see `vite.config.js`). The browser refuses inline scripts, `eval`, scripts from other sites, remote images, frames and any network request to another origin, so even a malicious document could not send data out.
- **Documents are treated as untrusted.** Word/PowerPoint output is sanitised (scripts, frames, inline handlers, `javascript:`/`data:` links and remote images removed), and PDF.js runs with `eval` and XFA forms disabled.
- **Size limit:** files over 150 MB are refused.
- **Saved settings** (in your browser's localStorage) are validated on load; invalid data is ignored.
- **Supply chain:** dependencies are audited in CI (`npm audit`, deploy fails on high severity), updated by Dependabot, and GitHub Actions are pinned to exact commits.

## Known limits

- GitHub Pages can't send HTTP security headers, so the policy is a `<meta>` tag. That means `frame-ancestors` (anti-embedding) can't be enforced.
- Word and PowerPoint files are redrawn by third-party libraries (`docx-preview`, `pptx-preview`). They are sandboxed by the measures above, but treat files from untrusted sources with the same care you would anywhere.
- `package.json` pins `echarts` and `uuid` via `overrides` to fix advisories in `pptx-preview`'s dependencies; re-run `npm audit` before changing them.
