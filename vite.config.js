import { defineConfig } from 'vite';

// Content-Security-Policy: the browser refuses to run or load anything not listed here.
// GitHub Pages can't send security headers, so we ship it as a <meta> tag (build only;
// in dev it would block Vite's hot-reload).
//
//  - script-src 'self' + 'wasm-unsafe-eval': only our own scripts, plus WebAssembly (hand tracking).
//    No inline scripts, no eval, nothing from other sites.
//  - connect-src 'self': the page cannot send data anywhere else. Even if something
//    malicious got in, it could not upload your video or documents.
//  - img-src has no http(s): remote images (tracking pixels) inside a Word/PowerPoint file are blocked.
//  - style-src 'unsafe-inline': needed because the Word/PowerPoint renderers inject <style> tags.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const cspPlugin = () => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// base './' makes the built site work from any sub-path,
// which is what GitHub Pages needs (e.g. user.github.io/handsfree-pdf/).
export default defineConfig({
  base: './',
  plugins: [cspPlugin()],
});
