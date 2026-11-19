import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlySourceTitle, sourceExcerpt, groupChatSources, sourceLocationLabel, sourceDownloadUrl } from '../src/lib/source-presentation.ts';
import { parseBinding, parseAssignmentPage } from '../src/lib/backend-knowledge.ts';
const id='00000000-0000-4000-8000-000000000001';
test('source keys are readable while human titles and citation labels remain intact',()=>{
 assert.equal(friendlySourceTitle('project.mindrails.skills.password-generator'),'Password generator');
 assert.equal(friendlySourceTitle('K1 · Guide · page 2'),'K1 · Guide');
 assert.equal(friendlySourceTitle('中文文档'),'中文文档');
 assert.equal(friendlySourceTitle('K2 · project.mindrails.skills.password-generator · line 2'),'K2 · Password generator');
 assert.equal(sourceExcerpt('[K1] Guide — page 2\nBody text').text,'Body text');
 assert.deepEqual(sourceExcerpt('  a\n b  ',10),{text:'a b',truncated:false});
 assert.deepEqual(sourceExcerpt('😀😀😀',2),{text:'😀😀…',truncated:true});
});
test('many-to-many binding contract requires explicit IDs and validates assignment rows',()=>{
 assert.deepEqual(parseBinding({agentId:id,knowledgeBaseIds:[id],agentVersion:2}).knowledgeBaseIds,[id]);
 assert.throws(()=>parseBinding({agentId:id,knowledgeBaseId:id,agentVersion:2}));
 assert.throws(()=>parseBinding({agentId:id,knowledgeBaseIds:['bad'],agentVersion:2}));
 const row={agentId:id,name:'Research',assigned:true,agentVersion:2};
 assert.deepEqual(parseAssignmentPage({items:[row],total:1,page:0,size:20,hasNext:false}).items,[row]);
 assert.throws(()=>parseAssignmentPage({items:[{...row,assigned:'true'}],total:1,page:0,size:20,hasNext:false}));
});

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const assetSource = (paragraph, version = 1, extraction = 2) => ({
 sourceId: uuid(paragraph + 20), title: `F${paragraph} · 周末游乐园_中英双语.html · HTML / 中文版Chinese / Paragraph ${paragraph}`,
 excerpt: `Paragraph content ${paragraph}`, url: `/api/asset-storage/versions/${uuid(version)}/extractions/${uuid(extraction)}/blocks/${uuid(paragraph + 20)}`,
});
test('thirteen paragraphs of one immutable document become one reference with all locators intact', () => {
 const sources = Array.from({length: 13}, (_, i) => assetSource(i + 1));
 const groups = groupChatSources(sources);
 assert.equal(groups.length, 1);
 assert.equal(groups[0].title, '周末游乐园_中英双语.html');
 assert.deepEqual(groups[0].sources, sources);
 assert.equal(sourceLocationLabel(groups[0].sources[12]), '[F13] · Paragraph 13');
 assert.equal(sourceDownloadUrl(groups[0].sources[0]), `/api/asset-storage/versions/${uuid(1)}/download`);
});
test('same filenames in different versions remain separate; extraction locators and first appearance are preserved', () => {
 const first = assetSource(1), otherVersion = assetSource(2, 3), otherExtraction = assetSource(3, 1, 4), sameDocument = assetSource(4);
 const groups = groupChatSources([first, otherVersion, otherExtraction, sameDocument, first]);
 assert.equal(groups.length, 2);
 assert.deepEqual(groups[0].sources, [first, otherExtraction, sameDocument]);
 assert.deepEqual(groups[1].sources, [otherVersion]);
 assert.deepEqual(groupChatSources([]), []);
});
test('asset download references share the version identity of their paragraph references', () => {
 const first = assetSource(1), download = {...assetSource(2), url: sourceDownloadUrl(first)};
 assert.deepEqual(groupChatSources([first, download])[0].sources, [first, download]);
 assert.equal(groupChatSources([first, download]).length, 1);
});
test('knowledge passages group by base, document and version rather than their titles or chunk IDs', () => {
 const source = n => ({ sourceId: uuid(n), title: `K${n} · Guide · page ${n}`, excerpt: 'body',
  url: `/api/knowledge-bases/${uuid(1)}/documents/${uuid(2)}/versions/${uuid(3)}/download` });
 const a = source(1), b = {...source(2), url: source(2).url.replace('/download', '/chunks')};
 const otherDocument = {...source(3), url: a.url.replace(`/documents/${uuid(2)}`, `/documents/${uuid(4)}`)};
 const otherVersion = {...source(4), url: a.url.replace(`/versions/${uuid(3)}`, `/versions/${uuid(5)}`)};
 const otherBase = {...source(5), url: a.url.replace(`/knowledge-bases/${uuid(1)}`, `/knowledge-bases/${uuid(6)}`)};
 const groups = groupChatSources([a, b, otherDocument, otherVersion, otherBase]);
 assert.equal(groups.length, 4);
 assert.deepEqual(groups[0].sources, [a, b]);
 assert.equal(groups[0].title, 'Guide');
 assert.equal(sourceLocationLabel(b), '[K2] · page 2');
 assert.equal(sourceDownloadUrl(b), a.url);
});
test('unversioned knowledge routes group, while memory entries without document identity remain separate', () => {
 const url = `/api/knowledge-bases/${uuid(1)}/documents/${uuid(2)}/download`;
 const sources = [{sourceId:uuid(3),title:'K1 · Guide · page 1',excerpt:'one',url},
  {sourceId:uuid(4),title:'K2 · Guide · page 2',excerpt:'two',url},
  {sourceId:uuid(5),title:'project.mindrails.memory.preferences',excerpt:'three',url:null},
  {sourceId:uuid(6),title:'project.mindrails.memory.preferences',excerpt:'four',url:null}];
 const groups = groupChatSources(sources);
 assert.equal(groups.length, 3);
 assert.equal(groups[1].title, 'Preferences');
 assert.equal(sourceDownloadUrl(sources[2]), null);
 assert.equal(sourceLocationLabel(sources[2]), 'Preferences');
});
