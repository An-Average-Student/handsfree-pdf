import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileKind, unsupportedMessage } from '../src/filetypes.js';

test('detects supported types by extension, any letter case', () => {
  assert.equal(fileKind({ name: 'deck.pptx' }), 'pptx');
  assert.equal(fileKind({ name: 'Report.DOCX' }), 'docx');
  assert.equal(fileKind({ name: 'a.b.c.PDF' }), 'pdf');
});

test('falls back to the MIME type when the name has no useful extension', () => {
  assert.equal(fileKind({ name: 'download', type: 'application/pdf' }), 'pdf');
  assert.equal(fileKind({ name: 'x', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'pptx');
});

test('old Office formats are flagged as legacy, with a helpful message', () => {
  assert.equal(fileKind({ name: 'old.doc' }), 'legacy');
  assert.equal(fileKind({ name: 'old.ppt' }), 'legacy');
  assert.match(unsupportedMessage('legacy'), /docx.*pptx|pptx.*docx/);
});

test('unknown files return null', () => {
  assert.equal(fileKind({ name: 'photo.png', type: 'image/png' }), null);
  assert.equal(fileKind({ name: 'noextension' }), null);
  assert.equal(fileKind(null), null);
  assert.match(unsupportedMessage(null), /PDF/);
});
