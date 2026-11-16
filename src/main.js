import * as pdfjsLib from 'pdfjs-dist';
// "?url" tells Vite to give us the file's address instead of running it.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const viewer = document.getElementById('viewer');
const pagesEl = document.getElementById('pages');
const emptyEl = document.getElementById('empty');
const zoomLabel = document.getElementById('zoom-label');
const pageLabel = document.getElementById('page-label');

let pdf = null;
let zoom = 1; // 1 = 100%
let renderToken = 0; // lets us cancel an old render if the zoom changes again

// ---- Loading ---------------------------------------------------------------
async function loadFile(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  pdf = await pdfjsLib.getDocument({ data }).promise;
  emptyEl.hidden = true;
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
    const viewport = page.getViewport({ scale: zoom * 1.3 * dpr });
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
    zoom = Math.min(4, Math.max(0.3, zoom * factor));
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

const camBtn = document.getElementById('camera-toggle');
const camStatus = document.getElementById('camera-status');
const camBox = document.getElementById('cam');
let stopTracking = null;

const hud = document.getElementById('cam-hud');
const LABELS = { open: '🖐 open palm', fist: '✊ fist (resting)', peace: '✌️ peace', pinch: '👌 pinch', other: '… unrecognised', none: 'no hand seen' };
const controller = createController({
  actions,
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
