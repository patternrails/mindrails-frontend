import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeFileDefaults, knowledgeFileError, maxKnowledgeFileBytes } from '../src/lib/knowledge-upload.ts';

test('upload suggestions preserve the original title and simplify the filename for the backend key', () => {
  const draft = knowledgeFileDefaults('Release Plan (Final) 2026.PDF');
  assert.equal(draft.title, 'Release Plan (Final) 2026.PDF');
  assert.equal(draft.key, 'release-plan-final-2026');
  assert.deepEqual(draft.tags, ['pdf', 'document', 'release', 'plan', 'final']);
  assert.equal(knowledgeFileDefaults('Café — Runbook.md').key, 'cafe-runbook');
});

test('non-Latin and long filenames generate stable keys and bounded tag suggestions', () => {
  const chinese = knowledgeFileDefaults('项目计划.pdf');
  assert.equal(chinese.title, '项目计划.pdf');
  assert.match(chinese.key, /^[a-z0-9][a-z0-9._-]{0,127}$/);
  assert.equal(chinese.key, knowledgeFileDefaults('项目计划.pdf').key);
  assert.notEqual(chinese.key, knowledgeFileDefaults('用户手册.pdf').key);
  assert.ok(chinese.tags.includes('项目计划'));
  const long = knowledgeFileDefaults(`${'Document-'.repeat(40)}a.pptx`);
  assert.match(long.key, /^[a-z0-9][a-z0-9._-]{0,127}$/);
  assert.ok(long.tags.length <= 6 && long.tags.every(tag => tag.length <= 64));
  assert.ok(long.tags.includes('slides'));
});

test('file chooser and drop validation enforce supported formats and the upload size limit', () => {
  for (const name of ['test.TXT', 'test.md', 'deck.HTML', 'page.htm', 'test.pdf', 'test.docx', 'test.pptx']) {
    assert.equal(knowledgeFileError({ name, size: maxKnowledgeFileBytes }), null);
  }
  assert.equal(knowledgeFileError({ name: 'image.png', size: 100 }), 'format');
  assert.equal(knowledgeFileError({ name: 'archive.pdf.exe', size: 100 }), 'format');
  assert.equal(knowledgeFileError({ name: 'large.pdf', size: maxKnowledgeFileBytes + 1 }), 'size');
});
