import { defineConfig } from 'vite';

// base './' makes the built site work from any sub-path,
// which is what GitHub Pages needs (e.g. user.github.io/handsfree-pdf/).
export default defineConfig({
  base: './',
});
