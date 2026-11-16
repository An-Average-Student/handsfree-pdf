// MediaPipe needs its WebAssembly engine files served from our own site.
// This copies them from node_modules into public/wasm before dev/build.
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('public/wasm', { recursive: true });
cpSync('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
console.log('Copied MediaPipe wasm files to public/wasm');
