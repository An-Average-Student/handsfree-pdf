// Loaders for Word (.docx) and PowerPoint (.pptx).
// Loaded on demand (dynamic import) so people who only open PDFs never download
// these larger libraries.
//
// Each loader draws into a hidden "stage" first and resolves to
//   { holder, pages }   holder = element to show, pages = one element per page / slide
// If anything fails the visible viewer is left untouched.

// ---- Safety: documents come from anywhere, so treat what they render as untrusted ------
const BLOCKED_TAGS = 'script, iframe, frame, frameset, object, embed, applet, link, meta, base, form, foreignObject, audio, video, source, track, portal';
const SAFE_LINK = /^(https?:|mailto:|tel:|#)/i;
const REMOTE_URL = /^\s*(https?:)?\/\//i;

/**
 * Removes anything executable or "phone-home" from rendered document content:
 * scripts, frames, embeds, inline event handlers, javascript: links and remote images.
 * (The Content-Security-Policy is the second layer; this keeps the page itself clean.)
 */
export function sanitize(root) {
  root.querySelectorAll(BLOCKED_TAGS).forEach((n) => n.remove());
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') el.removeAttribute(attr.name);
    }
    if (el.matches('a, area')) {
      for (const name of ['href', 'xlink:href']) {
        const v = el.getAttribute(name);
        if (v === null) continue;
        if (!SAFE_LINK.test(v.trim())) el.removeAttribute(name);
      }
      if (el.hasAttribute('href') && !el.getAttribute('href').startsWith('#')) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }
    for (const name of ['src', 'srcset', 'poster', 'background', 'xlink:href', 'href']) {
      if (el.matches('a, area')) continue;
      const v = el.getAttribute(name);
      if (v !== null && (REMOTE_URL.test(v) || /^\s*javascript:/i.test(v))) el.removeAttribute(name);
    }
  }
  return root;
}

function makeStage() {
  const stage = document.createElement('div');
  // Off-screen but still laid out, so the libraries can measure things.
  stage.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;';
  document.body.append(stage);
  return stage;
}

/** Word document -> one element per page. */
export async function renderDocx(file) {
  const { renderAsync } = await import('docx-preview');
  const stage = makeStage();
  try {
    const holder = document.createElement('div');
    const styles = document.createElement('div'); // docx-preview puts its <style> tags here
    holder.append(styles);
    stage.append(holder);
    await renderAsync(await file.arrayBuffer(), holder, styles, {
      className: 'docx',
      breakPages: true,   // split on page breaks into separate "pages"
      inWrapper: true,
    });
    const pages = [...holder.querySelectorAll('section.docx')];
    if (!pages.length) throw new Error('No pages found in that Word document.');
    return { holder: sanitize(holder), pages };
  } finally {
    stage.remove(); // `holder` stays intact; the caller moves it into the viewer
  }
}

/** Reads the slide size (in CSS pixels) from a .pptx so the aspect ratio is right. */
async function slideSize(buffer) {
  try {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('ppt/presentation.xml').async('string');
    const tag = xml.match(/<p:sldSz\b[^>]*>/)?.[0] ?? '';
    const cx = Number(tag.match(/\bcx="(\d+)"/)?.[1]);
    const cy = Number(tag.match(/\bcy="(\d+)"/)?.[1]);
    // EMU -> CSS px (914400 EMU per inch, 96 px per inch)
    if (cx > 0 && cy > 0) return { width: Math.round(cx / 9525), height: Math.round(cy / 9525) };
  } catch { /* fall through to the default */ }
  return { width: 960, height: 540 };
}

/** PowerPoint presentation -> one element per slide. */
export async function renderPptx(file) {
  const { init } = await import('pptx-preview');
  const buffer = await file.arrayBuffer();
  const { width, height } = await slideSize(buffer);
  const stage = makeStage();
  try {
    const holder = document.createElement('div');
    stage.append(holder);
    const previewer = init(holder, { width, height });
    await previewer.preview(buffer);
    const pages = [...holder.querySelectorAll('.pptx-preview-slide-wrapper')];
    if (!pages.length) throw new Error('No slides found in that PowerPoint file.');
    return { holder: sanitize(holder), pages };
  } finally {
    stage.remove();
  }
}
