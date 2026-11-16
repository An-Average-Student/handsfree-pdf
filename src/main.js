import * as pdfjsLib from 'pdfjs-dist';
// "?url" tells Vite to give us the file's address instead of running it.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const viewer = document.getElementById('viewer');
const pagesEl = document.getElementById('pages');
const emptyEl = document.getElementById('empty');
const zoomLabel = document.getElementById('zoom-label');
const pageLabel = document.getElementById('page-label');

const BASE_SCALE = 1.3; // zoom 1 (= "100%") draws a page at 1.3x its natural PDF size
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;

let pdf = null;
let zoom = 1; // 1 = 100%
let fitMode = 'width'; // 'width' | 'page' | null (null = user zoomed manually)
let renderToken = 0; // lets us cancel an old render if the zoom changes again

// ---- Loading ---------------------------------------------------------------
async function loadFile(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  pdf = await pdfjsLib.getDocument({ data }).promise;
  emptyEl.hidden = true;
  fitMode = 'width'; // a sensible starting size for every new PDF
  await applyFit();
  await renderAll();
}

// ---- Fit to screen ---------------------------------------------------------
// Works out the zoom that makes the first page fill the width (or the whole
// screen) and stores it in `zoom`. Rendering happens separately in renderAll().
async function applyFit() {
  if (!pdf || !fitMode) return;
  const page = await pdf.getPage(1);
  const natural = page.getViewport({ scale: 1 });
  const availW = viewer.clientWidth - 32;  // 16px padding each side
  const availH = viewer.clientHeight - 32;
  const scale = fitMode === 'width'
    ? availW / natural.width
    : Math.min(availW / natural.width, availH / natural.height);
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale / BASE_SCALE));
}

async function fitTo(mode) {
  fitMode = mode;
  await applyFit();
  await renderAll();
}

// ---- Rendering -------------------------------------------------------------
async function renderAll() {
  if (!pdf) return;
  const token = ++renderToken;
  const dpr = window.devicePixelRatio || 1;
  const frag = document.createDocumentFragment();
  const canvases = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    if (token !== renderToken) return; // zoom changed; abandon this render
    const viewport = page.getViewport({ scale: zoom * BASE_SCALE * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / dpr}px`;
    canvas.style.height = `${viewport.height / dpr}px`;
    canvas.dataset.page = n;
    frag.appendChild(canvas);
    canvases.push({ page, canvas, viewport });
  }
  pagesEl.replaceChildren(frag);
  for (const { page, canvas, viewport } of canvases) {
    if (token !== renderToken) return;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  updateLabels();
}

function updateLabels() {
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  pageLabel.textContent = pdf ? `Page ${currentPage()} / ${pdf.numPages}` : '';
}

function currentPage() {
  const mid = viewer.scrollTop + viewer.clientHeight / 2;
  let best = 1;
  for (const c of pagesEl.children) {
    if (c.offsetTop <= mid) best = Number(c.dataset.page);
  }
  return best;
}

// ---- Actions (gestures will call these later) ------------------------------
export const actions = {
  scrollBy: (dy) => viewer.scrollBy({ top: dy }),
  nextPage: () => goToPage(currentPage() + 1),
  prevPage: () => goToPage(currentPage() - 1),
  zoomBy: (factor) => {
    fitMode = null; // manual zoom overrides fit
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    clearTimeout(actions._t);
    actions._t = setTimeout(renderAll, 150); // wait until zooming settles
  },
};

function goToPage(n) {
  if (!pdf) return;
  const target = pagesEl.querySelector(`canvas[data-page="${Math.min(pdf.numPages, Math.max(1, n))}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Mouse / keyboard (our fallback controls) ------------------------------
document.getElementById('file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
});
document.getElementById('zoom-in').onclick = () => actions.zoomBy(1.2);
document.getElementById('zoom-out').onclick = () => actions.zoomBy(1 / 1.2);
document.getElementById('fit-width').onclick = () => fitTo('width');
document.getElementById('fit-page').onclick = () => fitTo('page');

// Keep the fit when the window is resized (e.g. entering fullscreen).
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => { if (fitMode) await fitTo(fitMode); }, 200);
});
viewer.addEventListener('scroll', updateLabels);

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown') actions.nextPage();
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') actions.prevPage();
  else if (e.key === 'ArrowDown') actions.scrollBy(120);
  else if (e.key === 'ArrowUp') actions.scrollBy(-120);
  else if (e.key === '+' || e.key === '=') actions.zoomBy(1.2);
  else if (e.key === '-') actions.zoomBy(1 / 1.2);
});

// Drag and drop
['dragenter', 'dragover'].forEach((t) =>
  viewer.addEventListener(t, (e) => { e.preventDefault(); viewer.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((t) =>
  viewer.addEventListener(t, (e) => { e.preventDefault(); viewer.classList.remove('dragging'); }));
viewer.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') loadFile(f);
});

// ---- Camera + hand tracking ------------------------------------------------
import { startHandTracking } from './hands.js';
import { createController } from './gestures.js';
import { loadSettings, saveSettings } from './settings.js';
import { initSettingsUI } from './settings-ui.js';

const settings = loadSettings();
initSettingsUI({ settings, onChange: () => saveSettings(settings) });

const camBtn = document.getElementById('camera-toggle');
const camStatus = document.getElementById('camera-status');
const camBox = document.getElementById('cam');
let stopTracking = null;

const hud = document.getElementById('cam-hud');
const LABELS = {
  open: '🖐 open palm', fist: '✊ fist (resting)', peace: '✌️ peace', pinch: '👌 pinch',
  thumbup: '👍 thumb up', thumbdown: '👎 thumb down', lshape: '🤏 L-shape', point: '☝️ pointing',
  other: '… unrecognised', none: 'no hand seen',
};
const controller = createController({
  actions,
  getSettings: () => settings,
  onState: ({ active, gesture, holdProgress }) => {
    const state = active ? 'ON' : 'OFF';
    const hold = holdProgress > 0 && holdProgress < 1 ? ` · hold ${Math.round(holdProgress * 100)}%` : '';
    hud.textContent = `${state} · ${LABELS[gesture]}${hold}`;
    hud.className = active ? 'on' : '';
  },
});

camBtn.onclick = async () => {
  if (stopTracking) {
    stopTracking();
    stopTracking = null;
    camBox.classList.remove('on');
    camBtn.textContent = 'Start camera';
    camStatus.textContent = '';
    return;
  }
  camBtn.disabled = true;
  try {
    camBox.classList.add('on');
    stopTracking = await startHandTracking({
      video: document.getElementById('cam-video'),
      overlay: document.getElementById('cam-overlay'),
      onStatus: (s) => (camStatus.textContent = s),
      onFrame: (hand) => controller.update(hand),
    });
    camBtn.textContent = 'Stop camera';
  } catch (err) {
    console.error(err);
    camBox.classList.remove('on');
    camStatus.textContent = `Camera error: ${err.message}`;
  } finally {
    camBtn.disabled = false;
  }
};
