import test from 'node:test';
import assert from 'node:assert/strict';
import { BackendClient } from '../src/lib/backend-client.ts';
import { parseChatSources, sessionWrite } from '../src/lib/backend-sessions.ts';
import { parseKnowledgeBase, parseKnowledgeConfig, knowledgePath, downloadFilename } from '../src/lib/backend-knowledge.ts';
import { backendSession } from './fixtures/backend-session.mjs';
const id='00000000-0000-4000-8000-000000000001';
test('knowledge parser preserves index identity and rejects invalid profile metadata',()=>{
 const base={id,ownerId:id,name:'Docs',description:'',state:'ACTIVE',version:0,pendingProfile:null,profile:{provider:'qwen',fingerprint:'v1',dimensions:1024,collection:'knowledge_test',generation:id,chunkChars:1200,overlap:160}};
 assert.equal(parseKnowledgeBase(base).profile.dimensions,1024);
 assert.throws(()=>parseKnowledgeBase({...base,profile:{...base.profile,generation:'wrong'}}));
 assert.equal(parseKnowledgeConfig({enabled:true,providers:[],defaultEmbeddingProvider:'qwen'}).defaultEmbeddingProvider,'qwen');
 assert.throws(()=>knowledgePath('../../other'));
});
test('multipart transport preserves form data without JSON content type and exposes download headers',async()=>{
 const body=new FormData();body.set('title','Docs');let request;
 const client=new BackendClient('http://localhost:8080/',{fetch:async(url,init)=>{request=init;return new Response('original',{headers:{'Content-Disposition':"attachment; filename*=UTF-8''manual.md"}});}});
 await client.request('api/knowledge-bases',{method:'POST',body,responseType:'text'});
 assert.equal(request.body,body);assert.equal(request.headers.get('Content-Type'),null);
 const result=await client.request('api/source',{responseType:'download'});assert.equal(await result.blob.text(),'original');assert.ok(result.disposition.includes('manual.md'));
});
test('downloads preserve RFC5987 filenames and discard path/control characters',()=>{
 assert.equal(downloadFilename("attachment; filename*=UTF-8''%E6%89%8B%E5%86%8C.pdf",'fallback'),'手册.pdf');
 assert.equal(downloadFilename('attachment; filename="../../manual.docx"','fallback'),'manual.docx');
 assert.equal(downloadFilename("attachment; filename*=UTF-8''%ZZ",'fallback.txt'),'fallback.txt');
});
test('Session edits preserve readonly resource identity without writing Agent knowledge bindings',()=>{
 const session=backendSession();assert.equal(Object.hasOwn(sessionWrite(session,session.provider.id,null),'knowledgeBaseId'),false);
 assert.equal(sessionWrite(session,session.provider.id,null,'Name').name,'Name');
});
test('event and history sources retain validated links and reject foreign origins',()=>{
 const source={sourceId:id,title:'K1 · Manual',excerpt:'Text',url:`/api/knowledge-bases/${id}/documents/${id}/download`};
 assert.deepEqual(parseChatSources([source]),[source]);
 assert.throws(()=>parseChatSources([{...source,url:'https://other.invalid'}]),{code:'invalid-response'});
});
