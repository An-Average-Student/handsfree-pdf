// Decides what kind of file we were given. Pure and tiny, so it is loaded
// up front (the heavy Word / PowerPoint libraries are only loaded on demand).

export const ACCEPT = '.pdf,.docx,.pptx,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export const SUPPORTED_TEXT = 'PDF, Word (.docx) or PowerPoint (.pptx)';

const BY_EXTENSION = {
  pdf: 'pdf',
  docx: 'docx',
  pptx: 'pptx',
  // Old binary Office formats cannot be read in the browser.
  doc: 'legacy',
  ppt: 'legacy',
};

const BY_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/msword': 'legacy',
  'application/vnd.ms-powerpoint': 'legacy',
};

/** Returns 'pdf' | 'docx' | 'pptx' | 'legacy' | null for a File (or {name, type}). */
export function fileKind(file) {
  const ext = String(file?.name ?? '').split('.').pop().toLowerCase();
  return BY_EXTENSION[ext] ?? BY_MIME[file?.type] ?? null;
}

/** A human-friendly reason for files we cannot open. */
export function unsupportedMessage(kind) {
  return kind === 'legacy'
    ? 'Old .doc / .ppt files can’t be opened. Save as .docx / .pptx or PDF first.'
    : `That file type isn’t supported. Open a ${SUPPORTED_TEXT} file.`;
}
