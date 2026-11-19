import test from 'node:test';
import assert from 'node:assert/strict';
import { BackendClient } from '../src/lib/backend-client.ts';
import { parseMetrics, parseSessionMetrics, parseHistoryPage, parseHistoryDetail, parseHistoryPreview, parseHistoryMetadata, parseHistoryOriginalMessage, deleteHistory } from '../src/lib/backend-observability.ts';
const id='00000000-0000-4000-8000-000000000001';
const totals={runs:1,succeededRuns:1,failedRuns:0,cancelledRuns:0,runningRuns:0,interruptedRuns:0,modelCalls:2,functionCalls:1,inputTokens:3,outputTokens:4,totalTokens:7,inputKnownCalls:1,outputKnownCalls:1,usageKnownCalls:1};
const summary={id,agentId:null,sessionId:id,providerId:null,transport:'SYNC',status:'COMPLETED',startedAt:'2026-10-14T00:00:00Z',finishedAt:'2026-10-14T00:01:00Z',metadata:{usage:{inputTokens:3,outputTokens:4,totalTokens:7},finishReason:'STOP'}};
const overview=()=>({from:'2026-10-13T00:00:00Z',to:'2026-10-15T00:00:00Z',timeZone:'UTC',collectionEnabled:false,lastPersistedAt:null,summary:totals,trend:[{day:'2026-10-14',totals}],models:[{modelName:'fake',totals}],capabilities:{functionCalls:1,mcpToolCalls:null,skillLoads:null,skillExecutions:null},health:{pendingRuns:0}});
const page=()=>({items:[summary],total:1,visibleTotal:1,limit:1000,page:0,size:20,hasNext:false,recordingEnabled:true});
test('session metrics validate identity and preserve unknown usage and saved totals when collection is off', () => {
  const value = { sessionId: id, collectionEnabled: false, lastPersistedAt: '2026-10-22T00:00:00Z',
    summary: { ...totals, inputTokens: null, inputKnownCalls: 0 } };
  assert.deepEqual(parseSessionMetrics(value, id).summary, { ...value.summary, mcpToolCalls: 0 });
  assert.equal(parseSessionMetrics(value).collectionEnabled, false);
  for (const patch of [{ sessionId: 'bad' }, { collectionEnabled: 0 }, { lastPersistedAt: 'bad' },
    { summary: { ...totals, usageKnownCalls: 3 } }, { summary: { ...totals, totalTokens: -1 } }]) {
    assert.throws(() => parseSessionMetrics({ ...value, ...patch }), { code: 'invalid-response' });
  }
  assert.throws(() => parseSessionMetrics(value, '00000000-0000-4000-8000-000000000002'), { code: 'invalid-response' });
});
test('metrics preserve partial coverage, unknown values and disabled collection',()=>{
  const v=overview();v.summary={...totals,inputTokens:null,inputKnownCalls:0};
  const data=parseMetrics(v);assert.equal(data.summary.inputTokens,null);assert.equal(data.capabilities.mcpToolCalls,null);assert.equal(data.collectionEnabled,false);
  for(const patch of [{timeZone:'local'},{summary:{...totals,usageKnownCalls:3}},{trend:[{day:'bad',totals}]},{summary:{...totals,totalTokens:NaN}}])assert.throws(()=>parseMetrics({...overview(),...patch}),{code:'invalid-response'});
});
test('history parser enforces size, browse cap, IDs and unique rows',()=>{
  assert.deepEqual(parseHistoryPage(page()).items[0],{...Object.fromEntries(Object.entries(summary).filter(([key])=>key!=='metadata')),totalTokens:null,finishReason:null});
  for(const patch of [{items:[summary,summary]},{limit:999},{page:50},{size:0},{hasNext:true},{items:[{...summary,id:'bad'}]},{visibleTotal:2000}])assert.throws(()=>parseHistoryPage({...page(),...patch}),{code:'invalid-response'});
});
test('details preserve raw message and metadata JSON, including future message fields',()=>{
  const v={...summary,ownerId:null,memoryId:id,requestId:null,invocationId:null,schemaVersion:1,messages:[
    {type:'USER',contents:[{type:'TEXT',text:'<script>alert(1)</script>'}]},
    {type:'AI',text:'answer',toolExecutionRequests:[{id:'t1',name:'lookup',arguments:'{}'}]},
    {type:'FUTURE_MESSAGE',custom:{nested:[1,null,true]}}
  ]};
  assert.deepEqual(parseHistoryDetail(v),v);
  assert.throws(()=>parseHistoryDetail({...v,messages:'[]'}),{code:'invalid-response'});
  assert.throws(()=>parseHistoryDetail({...v,messages:[{type:4}]}),{code:'invalid-response'});
});
test('history lists retain only scalar fields, with no metadata or message payload',()=>{
  const value=page();
  value.items=[{...summary,totalTokens:7,finishReason:'STOP',metadata:{partial:{answer:'😀'.repeat(300)}}}];
  const result=parseHistoryPage(value).items[0];
  assert.equal(result.totalTokens,7);assert.equal(result.finishReason,'STOP');
  assert.equal(Object.hasOwn(result,'metadata'),false);assert.equal(Object.hasOwn(result,'messages'),false);
  for(const patch of [{totalTokens:-1},{totalTokens:'7'},{finishReason:[]}])assert.throws(()=>parseHistoryPage({...page(),items:[{...summary,...patch}]}),{code:'invalid-response'});
});
test('preview and lazy JSON reads validate identity and preserve the explicit original message',()=>{
 const preview={id,agentId:null,sessionId:id,providerId:null,status:'COMPLETED',startedAt:summary.startedAt,finishedAt:summary.finishedAt,messages:[{index:0,type:'USER',text:'short…',thinking:'',toolCalls:[],truncated:true}],partial:{answer:'',thinking:'',truncated:false}};
 assert.deepEqual(parseHistoryPreview(preview),preview);
 for(const patch of [{messages:[{...preview.messages[0],index:1}]},{messages:[{...preview.messages[0],truncated:'true'}]},{partial:null}])assert.throws(()=>parseHistoryPreview({...preview,...patch}),{code:'invalid-response'});
 const metadata={partial:{answer:'original'}};
 assert.deepEqual(parseHistoryMetadata({id,metadata},id),metadata);
 assert.throws(()=>parseHistoryMetadata({id,metadata},'00000000-0000-4000-8000-000000000002'),{code:'invalid-response'});
 const message={type:'FUTURE_MESSAGE',custom:{body:'😀'.repeat(8000)}};
 assert.deepEqual(parseHistoryOriginalMessage({id,index:0,message},id,0),message);
 assert.throws(()=>parseHistoryOriginalMessage({id,index:1,message},id,0),{code:'invalid-response'});
 assert.throws(()=>parseHistoryOriginalMessage({id,index:0,message:{}},id,0),{code:'invalid-response'});
});
test('delete preserves backend prefix, requires UUID, and uses one DELETE',async()=>{
  const requests=[];
  const client=new BackendClient('http://localhost:8080/prefix/',{fetch:async(url,options)=>{requests.push({url,...options});return new Response(null,{status:204});}});
  await deleteHistory(client,id,new AbortController().signal);
  assert.equal(requests[0].url,`http://localhost:8080/prefix/api/history/${id}`);assert.equal(requests[0].method,'DELETE');assert.equal(requests[0].body,undefined);
  await assert.rejects(deleteHistory(client,'invalid',new AbortController().signal),{code:'invalid-request'});assert.equal(requests.length,1);
});
test('disposing an old backend cancels its archive read',async()=>{
  const client=new BackendClient('http://localhost:8080/',{fetch:async(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))});
  const request=client.request('api/history');client.dispose();await assert.rejects(request,{code:'cancelled'});
});

test('metrics accept integrated MCP counts and reject invalid counts',()=>{
 const value=overview();value.capabilities.mcpToolCalls=3;value.summary={...totals,mcpToolCalls:3};
 assert.equal(parseMetrics(value).capabilities.mcpToolCalls,3);assert.equal(parseMetrics(value).summary.mcpToolCalls,3);
 value.capabilities.mcpToolCalls=-1;assert.throws(()=>parseMetrics(value),{code:'invalid-response'});
});
