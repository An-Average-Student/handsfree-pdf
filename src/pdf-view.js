// Draws a PDF into the page area, but only the pages near the screen.
//
// Every page gets an empty white "placeholder" of the right size (so scrolling and
// page numbers work for a 500-page file), and a canvas exists only for pages within
// about 1.5 screens of what you can see. Pages that scroll far away are freed.
// A 300-page PDF used to need ~1.9 GB of canvas memory; now it needs a handful of pages.

export const MAX_CANVAS_PIXELS = 16_000_000; // browsers refuse canvases much bigger than this
const MAX_CONCURRENT_RENDERS = 2;
const SETTLE_MS = 150; // after a zoom change, wait this long before re-drawing sharply

/**
 * Pure helper: given where each page is on screen, decide what to draw and what to free.
 * tops/bottoms: each page's top/bottom edge (same coordinate system as viewTop/viewBottom).
 * Returns { render: page indexes to have drawn (nearest first), release: indexes to free }.
 */
export function planPages(tops, bottoms, viewTop, viewBottom, renderMargin, keepMargin) {
  const render = [];
  const release = [];
  const centre = (viewTop + viewBottom) / 2;
  for (let i = 0; i < tops.length; i++) {
    const gap = Math.max(viewTop - bottoms[i], tops[i] - viewBottom, 0); // 0 = on screen
    if (gap <= renderMargin) render.push({ i, d: Math.abs((tops[i] + bottoms[i]) / 2 - centre) });
    else if (gap > keepMargin) release.push(i);
  }
  render.sort((a, b) => a.d - b.d);
  return { render: render.map((r) => r.i), release };
}

export function createPdfView({ viewer, pagesEl }) {
  let pdf = null;
  let natural = { w: 612, h: 792 }; // page 1 at scale 1: used to size placeholders
  let scale = 1;                    // CSS pixels per PDF point
  let pages = [];                   // { el, canvas, scaleDrawn, busy, task }
  let generation = 0;               // bumps when a new document opens: stale work is dropped
  let frame = 0;
  let settleTimer = 0;
  let active = 0;

  const free = (st) => {
    st.task?.cancel?.();
    if (st.canvas) { st.canvas.width = 0; st.canvas.height = 0; } // release GPU/RAM promptly
    st.el.replaceChildren();
    st.canvas = null;
    st.scaleDrawn = null;
  };

  function sizePlaceholders() {
    const w = `${natural.w * scale}px`;
    const h = `${natural.h * scale}px`;
    for (const st of pages) {
      st.el.style.width = w;
      st.el.style.height = h;
    }
  }

  function schedule() {
    if (frame || !pdf) return;
    frame = requestAnimationFrame(() => { frame = 0; update(); });
  }

  function update() {
    if (!pdf) return;
    const vr = viewer.getBoundingClientRect();
    const rects = pages.map((p) => p.el.getBoundingClientRect());
    const plan = planPages(
      rects.map((r) => r.top), rects.map((r) => r.bottom),
      vr.top, vr.bottom, viewer.clientHeight * 1.5, viewer.clientHeight * 3,
    );
    for (const i of plan.release) if (pages[i].canvas || pages[i].task) free(pages[i]);
    for (const i of plan.render) {
      if (active >= MAX_CONCURRENT_RENDERS) break;
      const st = pages[i];
      if (!st.busy && st.scaleDrawn !== scale) draw(i);
    }
  }

  async function draw(i) {
    const st = pages[i];
    const gen = generation;
    const wanted = scale;
    st.busy = true;
    active++;
    try {
      const page = await pdf.getPage(i + 1);
      if (gen !== generation || wanted !== scale) return; // zoomed again / new file: skip
      const dpr = window.devicePixelRatio || 1;
      let k = wanted * dpr;
      let vp = page.getViewport({ scale: k });
      const px = vp.width * vp.height;
      if (px > MAX_CANVAS_PIXELS) { // too big for the browser: draw a little softer instead of failing
        k *= Math.sqrt(MAX_CANVAS_PIXELS / px);
        vp = page.getViewport({ scale: k });
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      canvas.style.cssText = 'display:block;width:100%;height:100%';
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      st.task = task;
      await task.promise;
      if (gen !== generation || wanted !== scale) return;
      const css = page.getViewport({ scale: wanted }); // the page's true size (may differ from page 1)
      st.el.style.width = `${css.width}px`;
      st.el.style.height = `${css.height}px`;
      st.el.replaceChildren(canvas);
      st.canvas = canvas;
      st.scaleDrawn = wanted;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.error(err);
    } finally {
      st.busy = false;
      st.task = null;
      active--;
      schedule();
    }
  }

  viewer.addEventListener('scroll', schedule, { passive: true });

  return {
    /** Show a new PDF. `firstPage` is page 1's viewport at scale 1. */
    open(doc, firstPage, cssScale) {
      this.close();
      pdf = doc;
      generation++;
      natural = { w: firstPage.width, h: firstPage.height };
      scale = cssScale;
      pages = Array.from({ length: doc.numPages }, (_, i) => {
        const el = document.createElement('div');
        el.className = 'pdf-page';
        el.dataset.page = i + 1;
        return { el, canvas: null, scaleDrawn: null, busy: false, task: null };
      });
      sizePlaceholders();
      pagesEl.replaceChildren(...pages.map((p) => p.el));
      schedule();
    },
    /** Change zoom. Old pictures are stretched at once; sharp ones follow when zooming settles. */
    setScale(cssScale) {
      if (!pdf || cssScale === scale) return;
      scale = cssScale;
      sizePlaceholders();
      for (const st of pages) if (st.canvas) st.scaleDrawn = null; // now out of date (but still shown)
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, SETTLE_MS);
    },
    /** Stop everything and free memory (used when switching to another file). */
    close() {
      generation++;
      clearTimeout(settleTimer);
      cancelAnimationFrame(frame);
      frame = 0;
      for (const st of pages) free(st);
      pages = [];
      pdf = null;
      active = 0;
    },
    /** Re-check what should be drawn (e.g. after the window changed size). */
    refresh: schedule,
    /** For tests / diagnostics. */
    stats: () => ({ pages: pages.length, drawn: pages.filter((p) => p.canvas).length }),
  };
}
