import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionDeliverables, outputHref } from '../src/lib/session-deliverables.ts';
const id='00000000-0000-4000-8000-000000000010', session='00000000-0000-4000-8000-000000000020';
const file={id,name:'报告.csv',path:'reports/报告.csv',bytes:128,updatedAt:'2026-10-21T00:00:00Z',downloadUrl:`/api/asset-storage/sessions/${session}/deliverables/${id}/download`};
test('output cards retain the session download identity and support backend deployment prefixes',()=>{
 assert.deepEqual(parseSessionDeliverables([file],session),[file]);
 assert.equal(outputHref('https://example.test/mindrails/',file.downloadUrl),`https://example.test/mindrails${file.downloadUrl}`);
 assert.equal(outputHref('https://example.test/', 'https://openai.com/'),'https://openai.com/');
 assert.equal(outputHref(undefined,'#citation-F1'),'#citation-F1');
});
test('output cards reject cross-session results, duplicate IDs and malformed metadata',()=>{
 assert.throws(()=>parseSessionDeliverables([file],id));
 assert.throws(()=>parseSessionDeliverables([file,file],session));
 assert.throws(()=>parseSessionDeliverables([{...file,downloadUrl:'file:///tmp/report.csv'}],session));
 assert.throws(()=>parseSessionDeliverables([{...file,bytes:-1}],session));
 assert.throws(()=>parseSessionDeliverables([{...file,updatedAt:'invalid'}],session));
});
