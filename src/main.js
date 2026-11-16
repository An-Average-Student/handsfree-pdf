import * as pdfjsLib from 'pdfjs-dist';
// "?url" tells Vite to give us the file's address instead of running it.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fileKind, unsupportedMessage, ACCEPT } from './filetypes.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const viewer = document.getElementById('viewer');
const pagesEl = document.getElementById('pages');
const emptyEl = document.getElementById('empty');
const zoomLabel = document.getElementById('zoom-label');
const pageLabel = document.getElementById('page-label');

const BASE_SCALE = 1.3; // zoom 1 (= "100%") draws a page at 1.3x its natural PDF size
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;

let pdf = null;     // set when a PDF is open
let domDoc = null;  // set when a Word / PowerPoint file is open: { count }
let zoom = 1; // 1 = 100%
let fitMode = 'width'; // 'width' | 'page' | null (null = user zoomed manually)
let renderToken = 0; // lets us cancel an old render if the zoom changes again

// ---- Loading ---------------------------------------------------------------
const pageCount = () => pdf?.numPages ?? domDoc?.count ?? 0;
const pageEls = () => pagesEl.querySelectorAll('[data-page]');

async function loadPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  pdf = doc; domDoc = null;
  pagesEl.style.zoom = '';
}

// Word / PowerPoint: drawn as normal web page content, one element per page / slide.
async function loadDom(kind, file) {
  const { renderDocx, renderPptx } = await import('./formats.js'); // loaded only when needed
  const { holder, pages } = await (kind === 'docx' ? renderDocx(file) : renderPptx(file));
  pages.forEach((el, i) => { el.dataset.page = i + 1; });
  pagesEl.style.zoom = '';
  pagesEl.replaceChildren(holder);
  domDoc = { count: pages.length };
  pdf = null;
}

async function loadFile(file) {
  const kind = fileKind(file);
  if (kind !== 'pdf' && kind !== 'docx' && kind !== 'pptx') {
    showToast(unsupportedMessage(kind), 4500);
    return;
  }
  showToast(`Opening ${file.name}\u2026`, 60000);
  try {
    await (kind === 'pdf' ? loadPdf(file) : loadDom(kind, file));
    emptyEl.hidden = true;
    viewer.scrollTop = 0;
    fitMode = 'width'; // a sensible starting size for every new file
    await applyFit();
    await renderAll();
    hideToast();
  } catch (err) {
    console.error(err);
    showToast(`Couldn\u2019t open that file. ${err?.message ?? ''}`.trim(), 5000);
  }
}

// ---- Fit to screen ---------------------------------------------------------
// Works out the zoom that makes the first page fill the width (or the whole
// screen) and stores it in `zoom`. Rendering happens separately in renderAll().
async function applyFit() {
  if (!pageCount() || !fitMode) return;
  const availW = viewer.clientWidth - 32;  // 16px padding each side
  const availH = viewer.clientHeight - 32;
  const wanted = (w, h) => (fitMode === 'width' ? availW / w : Math.min(availW / w, availH / h));

  if (domDoc) {
    // Word / PowerPoint pages don't scale perfectly smoothly (text re-wraps at some zoom
    // levels), so measure the page as actually drawn. Keep correcting, and in the end
    // choose the largest zoom we saw that still fits: never one that gets cut off.
    let best = null;
    for (let i = 0; i < 8; i++) {
      pagesEl.style.zoom = String(zoom * BASE_SCALE);
      const r = pageEls()[0].getBoundingClientRect();
      const f = wanted(r.width, r.height); // <1 means "too big", >1 means "room to grow"
      const fits = f >= 0.996;
      if (fits && (best === null || zoom > best)) best = zoom;
      if (fits && f < 1.005) break; // close enough
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * f));
    }
    zoom = best ?? Math.max(MIN_ZOOM, zoom * 0.9);
    pagesEl.style.zoom = String(zoom * BASE_SCALE);
    return;
  }
  const v = (await pdf.getPage(1)).getViewport({ scale: 1 });
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, wanted(v.width, v.height) / BASE_SCALE));
}

async function fitTo(mode) {
  fitMode = mode;
  await applyFit();
  await renderAll();
}

// ---- Rendering -------------------------------------------------------------
// Remember how far down the document we are, as a fraction, so zooming or fitting
// keeps you at the same place instead of jumping.
const readingPosition = () => (viewer.scrollHeight ? viewer.scrollTop / viewer.scrollHeight : 0);
const restorePosition = (p) => { viewer.scrollTop = p * viewer.scrollHeight; };

async function renderAll() {
  if (domDoc) { // Word / PowerPoint: just scale the page content, no re-drawing needed
    const pos = readingPosition();
    pagesEl.style.zoom = String(zoom * BASE_SCALE);
    restorePosition(pos);
    updateLabels();
    return;
  }
  if (!pdf) return;
  const pos = readingPosition();
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
  restorePosition(pos);
  for (const { page, canvas, viewport } of canvases) {
    if (token !== renderToken) return;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  updateLabels();
}

function updateLabels() {
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  pageLabel.textContent = pageCount() ? `Page ${currentPage()} / ${pageCount()}` : '';
}

function currentPage() {
  // Positions are measured on screen, so this works with any page type and any zoom.
  const mid = viewer.getBoundingClientRect().top + viewer.clientHeight / 2;
  let best = 1;
  for (const el of pageEls()) {
    if (el.getBoundingClientRect().top <= mid) best = Number(el.dataset.page);
  }
  return best;
}

// ---- Actions (gestures will call these later) ------------------------------
export const actions = {
  scrollBy: (dy) => viewer.scrollBy({ top: dy }),
  nextPage: () => step(1),
  prevPage: () => step(-1),
  zoomBy: (factor) => {
    fitMode = null; // manual zoom overrides fit
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    clearTimeout(actions._t);
    actions._t = setTimeout(renderAll, 150); // wait until zooming settles
  },
};

function goToPage(n) {
  const count = pageCount();
  if (!count) return;
  const target = pagesEl.querySelector(`[data-page="${Math.min(count, Math.max(1, n))}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Next / previous page. A Word file with no page breaks comes out as ONE very tall
// page, so in that case move by (nearly) a screenful instead.
function step(dir) {
  if (domDoc && domDoc.count === 1) {
    viewer.scrollBy({ top: dir * viewer.clientHeight * 0.9, behavior: 'smooth' });
  } else {
    goToPage(currentPage() + dir);
  }
}

// ---- Mouse / keyboard (our fallback controls) ------------------------------
document.getElementById('file-input').accept = ACCEPT;
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
  if (document.getElementById('settings').open) return; // don't act while the panel is open
  if (e.key === 'f' || e.key === 'F') togglePresenting();
  else if (e.key === 'c' || e.key === 'C') document.getElementById('camera-toggle').click();
  else if (e.key === 'Escape' && isPresenting()) leavePresenting(); // fallback when fullscreen isn't available
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') actions.nextPage();
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
  if (f) loadFile(f);
});

// ---- Small on-screen messages ----------------------------------------------
const toastEl = document.getElementById('toast');
let toastTimer;
export function showToast(text, ms = 1600) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

export function hideToast() {
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
}

// ---- Presentation mode -----------------------------------------------------
// Hides the toolbar, goes fullscreen and fits one page on screen.
// If the browser refuses fullscreen (e.g. iPhone Safari) we still hide the toolbar.
let fitBeforePresenting = null;

function isPresenting() {
  return document.body.classList.contains('presenting');
}

async function enterPresenting() {
  fitBeforePresenting = fitMode;
  document.body.classList.add('presenting');
  try { await document.documentElement.requestFullscreen(); } catch { /* not supported: fine */ }
  await fitTo('page');
  showToast('Press Esc to exit', 2500);
}

async function leavePresenting() {
  if (!isPresenting()) return;
  document.body.classList.remove('presenting');
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* ignore */ } }
  if (fitBeforePresenting) await fitTo(fitBeforePresenting);
}

const togglePresenting = () => (isPresenting() ? leavePresenting() : enterPresenting());
document.getElementById('present').onclick = togglePresenting;
// The browser's own Esc handling exits fullscreen; keep our state in sync.
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) leavePresenting(); });

// ---- Camera + hand tracking ------------------------------------------------
import { startHandTracking, listCameras, friendlyCameraError } from './hands.js';
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
// The same actions, plus a short on-screen message so you (and the audience)
// can see that a gesture was understood.
let lastScrollToast = 0;
const say = (text, ms) => { if (settings.feedback) showToast(text, ms); };
export const feedbackActions = {
  scrollBy: (dy) => {
    actions.scrollBy(dy);
    const now = performance.now();
    if (now - lastScrollToast > 800) { say(dy > 0 ? '⬇ Scrolling' : '⬆ Scrolling', 900); lastScrollToast = now; }
  },
  nextPage: () => {
    if (pageCount()) say(`➡ Page ${Math.min(pageCount(), currentPage() + 1)} / ${pageCount()}`);
    actions.nextPage();
  },
  prevPage: () => {
    if (pageCount()) say(`⬅ Page ${Math.max(1, currentPage() - 1)} / ${pageCount()}`);
    actions.prevPage();
  },
  zoomBy: (factor) => {
    actions.zoomBy(factor);
    say(`🔍 Zoom ${Math.round(zoom * 100)}%`, 900);
  },
};

let wasActive = false;
const laser = document.getElementById('laser');
function movePointer(p) {
  if (!p) { laser.hidden = true; return; }
  laser.hidden = false;
  laser.style.left = `${p.x * 100}vw`;
  laser.style.top = `${p.y * 100}vh`;
}

export const controller = createController({
  actions: feedbackActions,
  onPointer: movePointer,
  getSettings: () => settings,
  onState: ({ active, gesture, holdProgress }) => {
    if (active !== wasActive) {
      wasActive = active;
      say(active ? '✋ Gestures ON' : '✊ Gestures OFF', 1400);
    }
    const state = active ? 'ON' : 'OFF';
    const hold = holdProgress > 0 && holdProgress < 1 ? ` · hold ${Math.round(holdProgress * 100)}%` : '';
    hud.textContent = `${state} · ${LABELS[gesture]}${hold}`;
    hud.className = active ? 'on' : '';
  },
});

const camSelect = document.getElementById('camera-select');

// Fill the dropdown with the available cameras (only shown if there is a choice).
async function fillCameraList(currentId) {
  try {
    const cams = await listCameras();
    camSelect.replaceChildren(...cams.map((c, i) => {
      const o = document.createElement('option');
      o.value = c.deviceId;
      o.textContent = c.label || `Camera ${i + 1}`;
      return o;
    }));
    if (cams.some((c) => c.deviceId === currentId)) camSelect.value = currentId;
    camSelect.hidden = cams.length < 2;
  } catch { camSelect.hidden = true; }
}

function stopCamera() {
  stopTracking?.();
  stopTracking = null;
  camBox.classList.remove('on');
  camBtn.textContent = 'Start camera';
  camStatus.textContent = '';
  camSelect.hidden = true;
  movePointer(null);
}

async function startCamera() {
  camBtn.disabled = true;
  try {
    camBox.classList.add('on');
    const tracking = await startHandTracking({
      video: document.getElementById('cam-video'),
      overlay: document.getElementById('cam-overlay'),
      deviceId: settings.cameraId,
      onStatus: (s) => (camStatus.textContent = s),
      onFrame: (hand) => controller.update(hand),
    });
    stopTracking = tracking.stop;
    settings.cameraId = tracking.deviceId; // remember which camera worked
    saveSettings(settings);
    camBtn.textContent = 'Stop camera';
    await fillCameraList(tracking.deviceId);
  } catch (err) {
    console.error(err);
    camBox.classList.remove('on');
    camStatus.textContent = friendlyCameraError(err);
  } finally {
    camBtn.disabled = false;
  }
}

camBtn.onclick = () => (stopTracking ? stopCamera() : startCamera());

// Switching camera = restart tracking on the new one.
camSelect.onchange = async () => {
  settings.cameraId = camSelect.value;
  saveSettings(settings);
  stopCamera();
  await startCamera();
};

// A camera was plugged in or removed.
navigator.mediaDevices?.addEventListener?.('devicechange', () => {
  if (stopTracking) fillCameraList(settings.cameraId);
});
