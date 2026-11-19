import test from 'node:test';
import assert from 'node:assert/strict';
import { csvPreview, formatJsonText, fileResource, fileViewHref, parseFilePreview, previewableFilename } from '../src/lib/file-preview.ts';
import { safeReturnTo } from '../src/lib/auth-return-to.ts';

const id = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
test('stable file URLs accept only supported resources and preserve backend deployment prefixes', () => {
  assert.equal(fileResource(['assets', id]), `/api/asset-storage/versions/${id}`);
  assert.equal(fileResource(['sessions', id, 'deliverables', other]), `/api/asset-storage/sessions/${id}/deliverables/${other}`);
  assert.equal(fileResource(['task-executions', id, 'deliverables', other]), `/api/asset-storage/task-executions/${id}/deliverables/${other}`);
  for (const segments of [['assets', '../etc'], ['assets', id, 'extra'], ['sessions', id, 'files', other]]) assert.equal(fileResource(segments), null);
  const path = `/api/asset-storage/versions/${id}/download`;
  assert.equal(fileViewHref('https://backend.test/prefix/', `https://backend.test/prefix${path}`), `/files/assets/${id}`);
  assert.equal(fileViewHref('https://backend.test/prefix/', `https://other.test${path}`), null);
  assert.equal(fileViewHref(undefined, `/api/knowledge-bases/${id}/documents/${id}/download`), null);
});

test('login return-to rejects external, encoded and authentication-loop destinations', () => {
  assert.equal(safeReturnTo(`/files/assets/${id}`), `/files/assets/${id}`);
  for (const value of ['//evil.test', 'https://evil.test', '/login', '/files/../login', '/files/assets/%2f%2fevil.test', `/files/assets/${id}?next=//evil`, `/files/assets/${id}#token`, undefined])
    assert.equal(safeReturnTo(value), '/workspace');
});

test('JSON formatting preserves large integers, decimals, duplicate keys and string escapes', () => {
  const input = '{"n":9007199254740993,"decimal":1.2300,"e":1e+99,"s":"escaped \\\" : [ ]","n":2}';
  const formatted = formatJsonText(input);
  assert.ok(formatted.includes('9007199254740993'));
  assert.ok(formatted.includes('1.2300'));
  assert.ok(formatted.includes('1e+99'));
  assert.equal(formatted.match(/"n"/g).length, 2);
  assert.deepEqual(JSON.parse(formatted), JSON.parse(input));
  assert.equal(formatJsonText('{bad json}'), null);
  assert.equal(formatJsonText('['.repeat(129) + '0' + ']'.repeat(129)), null);
});

test('CSV supports multiline quoted fields, escaped quotes, CRLF and empty trailing cells', () => {
  const result = csvPreview('name,notes,total\r\n"a,b","line 1\r\nline 2 ""quoted""",12\r\nx,,\r\n');
  assert.equal(result.error, false);
  assert.deepEqual(result.rows, [['name','notes','total'], ['a,b','line 1\r\nline 2 "quoted"','12'], ['x','','']]);
  assert.deepEqual(csvPreview('').rows, []);
  assert.deepEqual(csvPreview('""').rows, [['']]);
  for (const malformed of ['"unclosed', 'a"b,c', '"a"b,c']) assert.equal(csvPreview(malformed).error, true);
});

test('CSV rendering bounds all dimensions and validates records beyond the visible limit', () => {
  const result = csvPreview('a,b,c\nlong,2,3\nx,4,5', 2, 2, 3);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.rows, [['a','b'], ['lon','2']]);
  assert.equal(csvPreview('a\nb\n"bad', 1).error, true);
});

test('preview parsing enforces the content contract', () => {
  assert.equal(previewableFilename('report.HTML'), true);
  assert.equal(previewableFilename('report.svg'), false);
  assert.equal(parseFilePreview({filename:'x.txt',kind:'text',bytes:0,content:'',renderedHtml:null}).content, '');
  assert.throws(() => parseFilePreview({filename:'x.html',kind:'html',bytes:1,content:'x'}));
  assert.throws(() => parseFilePreview({filename:'x.exe',kind:'binary',bytes:1,content:'x',renderedHtml:null}));
});

test('raster image files open the standard viewer and require a verified safe media type', () => {
  for(const name of ['a.png','a.JPG','a.jpeg','a.webp','a.gif','a.bmp','a.avif']) assert.equal(previewableFilename(name),true);
  const image={filename:'a.png',kind:'image',bytes:200,content:'',renderedHtml:null,mediaType:'image/png'};
  assert.deepEqual(parseFilePreview(image),image);
  assert.throws(()=>parseFilePreview({...image,mediaType:'image/svg+xml'}));
  assert.throws(()=>parseFilePreview({...image,mediaType:null}));
});
